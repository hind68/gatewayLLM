# Secure LLM Gateway

Secure LLM Gateway is a local, security-focused chat platform. Users authenticate with Keycloak, messages and attachments are checked by a DLP service, the Spring Boot gateway applies user and role policy, and approved content is sent to model providers through LiteLLM.

## What is included

- A React 19/Vite frontend for chat, conversation history, model selection, attachment inspection, secure resend, and administration.
- A Spring Boot 4 backend exposing authenticated REST and SSE APIs.
- Keycloak authentication with realm roles and an included local `synapse` realm.
- An administration area for users, roles, model providers, model access restrictions, banned words, DLP patterns, filtered-message incidents, metrics, and audit logs.
- A FastAPI DLP service for text, images, PDF, Office documents, CSV/XLSX, source/config files, and protected ZIP processing.
- LiteLLM as the single provider-facing model proxy.
- PostgreSQL databases for application data and Keycloak data.
- Flyway-managed application schema migrations and CI checks for backend, frontend, DLP, and Docker Compose.

No real secret should be committed. Local credentials belong in the ignored root `.env` file.

## Architecture

```text
Browser
  |
  +--> Keycloak (login, JWT, realm roles)
  |
  v
React/Vite frontend
  |
  | Bearer JWT
  v
Spring Boot gateway
  |       |          |
  |       |          +--> PostgreSQL (users, conversations, messages,
  |       |               attachments, policies, incidents, audit logs)
  |       |
  |       +--> Keycloak Admin API (admin-only user and role management)
  |
  +--> FastAPI DLP service --> allow / mask / block
  |
  +--> LiteLLM --> OpenAI / Groq / Gemini / Mistral
```

The backend is the trust boundary. All `/api/**` routes require a valid Keycloak JWT. Admin routes additionally require the `ADMIN` realm role. Only `/actuator/health` is public.

## Local service URLs

| Service | Default URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend | `http://127.0.0.1:8081` |
| Public backend health | `http://127.0.0.1:8081/actuator/health` |
| Keycloak | `http://127.0.0.1:8080` |
| DLP service | `http://127.0.0.1:8000` |
| LiteLLM | `http://127.0.0.1:4000` |
| Application PostgreSQL | `localhost:5433` |

## Prerequisites

- Git
- Docker Desktop with Docker Compose
- Java 17
- Node.js 22 and npm (the same major version used by CI)
- Python 3.11 only when running the DLP service outside Docker
- At least one provider API key for live model requests

## Model configuration

The tracked LiteLLM configuration currently defines:

| Gateway alias | LiteLLM provider model | Environment variable |
| --- | --- | --- |
| `secure-gpt` | `openai/gpt-4o-mini` | `OPENAI_API_KEY` |
| `secure-groq` | `groq/openai/gpt-oss-20b` | `GROQ_API_KEY` |
| `secure-gemini` | `gemini/gemini-3.6-flash` | `GEMINI_API_KEY` |
| `secure-mistral` | `mistral/mistral-small-latest` | `MISTRAL_API_KEY` |

An Anthropic example is commented out in `litellm/config.yaml`. Provider secret values are injected into LiteLLM and are not stored in PostgreSQL or returned by the admin API. The database stores only the environment-variable reference and non-secret model metadata.

## Quick start

### 1. Configure local environment

From the repository root:

```powershell
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env
```

Replace every `change_me_...` value in `.env`. Add the provider keys you intend to use. Important settings include:

- `LITELLM_MASTER_KEY`: shared by LiteLLM and the backend.
- `DLP_ADMIN_KEY`: protects the DLP pattern-management endpoint.
- `KEYCLOAK_DB_PASSWORD`: password for the Keycloak database.
- `KEYCLOAK_ADMIN_PASSWORD`: local Keycloak console administrator password.
- `KEYCLOAK_DEMO_PASSWORD`: local-only password assigned to the imported development users.
- `GATEWAY_ADMIN_CLIENT_SECRET`: secret for the backend's Keycloak service account.
- `POSTGRES_HOST_PORT`: defaults to `5433` to avoid a common local `5432` collision.

The frontend defaults in `frontend/.env.example` point to the local backend and Keycloak realm. Change them when using different hosts, ports, realm, or client ID.

### 2. Start infrastructure

```powershell
docker compose up -d postgres litellm dlp-service keycloak-db keycloak keycloak-provisioner
docker compose ps
```

The one-shot `keycloak-provisioner` waits for the imported realm, applies the configured demo password, and aligns the frontend and backend clients. It is expected to exit successfully after provisioning.

Useful logs:

```powershell
docker compose logs -f keycloak
docker compose logs -f dlp-service
docker compose logs -f litellm
```

### 3. Start the backend

```powershell
cd backend
cmd /c mvnw.cmd spring-boot:run
```

The backend imports the ignored root `.env` automatically when started from either the repository root or `backend/`. Flyway applies schema migrations on startup, and Hibernate uses `ddl-auto=validate`; schema changes must therefore be implemented as Flyway migrations.

If Java resolves `localhost` incorrectly on Windows, run this before starting the backend:

```powershell
$env:JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true"
```

### 4. Start the frontend

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Keycloak redirects unauthenticated users to the `synapse` login page.

## Development users

On a fresh realm import, the development users receive the local value of
`KEYCLOAK_DEMO_PASSWORD`. Later provisioning runs preserve passwords already
stored in Keycloak, including passwords changed by individual users or an
administrator.

| Username | Realm roles |
| --- | --- |
| `admin`, `admin1`, `admin2` | `ADMIN` (the `admin` account also has `USER`) |
| `intern1`, `intern2` | `INTERN` |
| `extern1`, `extern2` | `EXTERN` |
| `user` | `USER` |

These accounts and their shared password are for local development only.

## Security and DLP behavior

1. The frontend obtains a Keycloak access token and sends it with API requests.
2. The backend resolves the application user strictly from the JWT UUID subject; missing or malformed identities fail with `401`.
3. Model access is checked against user and role restrictions. A personal restriction applies even to an administrator; `ADMIN` bypasses only role-level restrictions.
4. Global, user, and role banned-word policies are combined for the request.
5. Text and attachments are sent to the DLP service. The current policy allows clean content, masks low/medium findings, and blocks high-severity findings or analysis failures.
6. Only safe content is sent to LiteLLM. Blocked attempts and security-relevant actions are persisted for admin review.
7. Attachment reads and secure resend operations verify ownership using the authenticated JWT and do not fall back to a demo user.

The DLP implementation combines Presidio, French and English spaCy models, Moroccan recognizers, structured regex validation, optional transformer detection, normalization, deduplication, and archive/file safety limits. See `dlp/README.md` for detector details and limitations.

## Main API areas

All routes below require `Authorization: Bearer <token>` unless stated otherwise.

- Health: `GET /actuator/health` (public), `GET /api/health` (authenticated).
- Models: `GET /api/models`, `GET /api/models/details`.
- Conversations: create, list, open, rename, change model, archive, restore, permanently delete, list messages, and SSE message streaming under `/api/conversations`.
- Attachments: metadata, original content, inspection, masked content, masked download, and secure resend under `/api/attachments` and `/api/conversations/{id}/attachments`.
- Admin models/providers: `/api/admin/models`.
- Admin users and roles: `/api/admin/keycloak`.
- Admin policy: `/api/admin/permissions`, including global/user/role banned words, model restrictions, and patterns.
- Admin monitoring: `/api/admin/metrics/security`, `/api/admin/filtered-messages`, and `/api/admin/audit`.

The DLP service exposes `/health`, `/ready`, `/analyse`, `/analyse-message`, `/analyse-file`, `/analyse-image`, and `/analyse-pdf`. Its `/admin/patterns` route is protected by `DLP_ADMIN_KEY` and is called by the backend rather than the browser.

## Repository layout

```text
backend/                 Spring Boot gateway, Flyway migrations, and tests
dlp/                     FastAPI DLP service, detectors, evaluation corpus, and tests
frontend/                React/Vite application and tests
keycloak/import/         Local synapse realm import
keycloak/themes/         Custom Synapse login theme
keycloak/provision.sh    Idempotent local client/user provisioning
litellm/config.yaml      Provider aliases and LiteLLM settings
docker-compose.yml       Local infrastructure
```

Runtime attachment files default to `backend/storage/attachments` when the backend is launched from `backend/`. Attachment metadata is stored in PostgreSQL; the binary/original files remain on local storage.

## Verification before opening or merging a pull request

Run the same checks represented in CI.

Backend:

```powershell
cd backend
cmd /c mvnw.cmd -B test
```

Frontend:

```powershell
cd frontend
npm ci
npm run lint
npm test
npm run build
```

DLP (requires the dependencies and declared spaCy models from `dlp/README.md`):

```powershell
cd dlp
python -m pytest -q
```

Compose configuration:

```powershell
docker compose config
```

## Common problems

- **Frontend redirects repeatedly or stays blank:** confirm Keycloak is running, provisioning completed, and `frontend/.env` matches the `synapse` realm and `synapse-client`.
- **Backend returns `401`:** the API is intentionally authenticated; use the frontend or send a valid Keycloak bearer token.
- **Backend cannot validate tokens:** verify `KEYCLOAK_ISSUER_URI` and prefer the same host spelling (`127.0.0.1` by default) used by the token issuer.
- **Backend cannot call Keycloak admin endpoints:** verify `GATEWAY_ADMIN_CLIENT_SECRET`, then rerun `docker compose run --rm keycloak-provisioner`.
- **DLP requests fail closed:** check `http://127.0.0.1:8000/ready` and `docker compose logs dlp-service`.
- **LiteLLM authentication fails:** ensure the backend and LiteLLM use the same `LITELLM_MASTER_KEY`.
- **A provider rejects a request:** verify its API key and the provider model name in `litellm/config.yaml`.
- **PostgreSQL port conflict:** change both `POSTGRES_HOST_PORT` and `SPRING_DATASOURCE_URL`.

## Stop or reset local services

Stop the stack without deleting data:

```powershell
docker compose down
```

`docker compose down -v` deletes both application and Keycloak database volumes. Use it only when all local data can be discarded.

Keycloak skips realm import when the `synapse` realm already exists. After changing provisioning settings, rerun:

```powershell
docker compose run --rm keycloak-provisioner
```
