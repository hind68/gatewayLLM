# Audit final avant merge — `integration/admin-security-dlp` → `main`

Analyse **100% lecture seule**. Aucune modification, aucun commit, aucun restore, aucun merge/rebase/reset, aucun push, aucune modification DB, aucun changement de mot de passe, aucun volume supprimé n'a été effectué pendant cette analyse.

## 1. V21 — `git status` : `deleted: V21__replace_deprecated_groq_model.sql`

- **Rôle de V21** : `UPDATE modele_llm SET nom_modele_provider = 'groq/openai/gpt-oss-20b', ... WHERE alias_interne = 'secure-groq'`. Migration de données pure (pas de DDL), introduite sur **`main`** par le commit `7c9abdf feat : improving blocked message UI`.
- **Historique Git** : ce fichier n'existe QUE sur `main` (et donc sur `integration/...` qui descend de `main`). Il n'a jamais existé sur `test/admin-security-dlp` sous ce nom.
- **Pourquoi elle est staged en suppression** : lors de l'intégration précédente, `test/admin-security-dlp` avait renommé ce même contenu en `V22__replace_deprecated_groq_model.sql` (rename Git 100% similaire) pour laisser la place à sa propre `V21__allow_embedded_model_logos.sql`. Le `git checkout <branche> -- backend/` utilisé pour importer le backend ne supprime pas les fichiers absents de la branche source : l'ancien `V21` de `main` est resté orphelin sur le disque, créant deux fichiers réclamant la version 21. J'ai supprimé ce doublon (`git rm`, non commité) lors de la session de diagnostic backend précédente.
- **V22 la remplace-t-elle ?** Oui — contenu SQL strictement identique (seule différence : fin de ligne LF côté V21 vs CRLF côté V22, sans effet sur le SQL exécuté ni sur le checksum Flyway calculé).
- **Présente dans `flyway_schema_history` ?** Vérifié en lecture seule : **aucune ligne** ne référence `V21__replace_deprecated_groq_model.sql`. La ligne historique a été repointée vers `version=22 / script=V22__replace_deprecated_groq_model.sql / checksum=-673927482` — qui correspond exactement au checksum que Flyway calcule sur le `V22` actuellement sur disque (validation réussie confirmée : `Successfully validated 22 migrations`).
- **Risque si on la restaure** : recrée immédiatement le bug de démarrage original — `FlywayException: Found more than one migration with version 21` (V21 restauré vs `V21__allow_embedded_model_logos.sql` déjà présent et déjà appliqué). Le backend refuserait de démarrer, chez vous comme pour quiconque récupère cette branche.
- **Risque si on la supprime (= commit de l'état actuel)** : aucun. Le fichier est un doublon mort — son contenu vit désormais sous `V22`, sa ligne d'historique Flyway a déjà été migrée vers `V22`, et rien d'autre dans le code ne le référence.

### Conclusion obligatoire : **GARDER LA SUPPRESSION**

(Cette suppression est actuellement *staged* mais **non commitée** — voir section 9 pour l'implication sur le merge.)

## 2. Ce que l'intégration ajoute par rapport à `main`

| Fonctionnalité | Avant (`main`) | Ajouté | Pourquoi | Fichiers clés | Fonctionnement |
|---|---|---|---|---|---|
| **Keycloak / JWT / rôles** | Aucune authentification — accès libre à l'API | Spring Security en resource-server OAuth2/JWT, rôles `USER/ADMIN/INTERN/EXTERN` lus depuis `realm_access.roles` | Authentifier les utilisateurs et distinguer les permissions par rôle | `SecurityConfig.java`, `CurrentUserService.java`, `frontend/src/AuthProvider.jsx`, `keycloak.js` | Toute requête `/api/**` (sauf `/actuator/health`) exige un JWT Keycloak valide ; le frontend redirige vers Keycloak si non connecté |
| **Sécurité backend** | `anyRequest().permitAll()` implicite | `anyRequest().authenticated()`, `@PreAuthorize("hasRole('ADMIN')")` sur les endpoints admin, CORS restreint à `/api/**` | Fermer l'accès non authentifié, cloisonner l'admin | `SecurityConfig.java`, `CorsConfig.java`, tous les `Admin*Controller` | 401 sans JWT, 403 si rôle insuffisant |
| **Permissions (banned words / restrictions LLM)** | Aucune | Tables globales/rôle/utilisateur pour mots bannis et modèles restreints | Contrôler qui peut utiliser quel modèle et filtrer certains mots | `ChatValidationService.java`, `AdminPermissionController.java`, `RolePermissionController.java`, migrations V15 | Chaque envoi de message vérifie restriction perso puis rôle (ADMIN bypass rôle, jamais perso — corrigé pour être cohérent partout) |
| **Administration** | Aucune UI/API admin | Dashboard complet (utilisateurs, modèles, rôles, sécurité, audit) | Donner aux ADMIN un contrôle opérationnel sans toucher à la DB à la main | `AdminDashboard.jsx`, `AdminComponents.jsx`, `AdminModelController.java`, `KeycloakAdminController.java` | Accessible via un bouton dédié dans la Sidebar, visible seulement si `isAdmin` |
| **Audit** | Aucun | Table `audit_logs`, écrite à chaque mutation admin | Traçabilité des actions sensibles | `AuditLog.java`, `AuditLogController.java`, migration V16 | Chaque `POST/PUT/DELETE` admin écrit qui/quoi/quand |
| **DLP (approfondi)** | DLP basique (regex + Presidio) | Détecteur mots bannis pilotés par admin, détecteur transformer optionnel, normalisation anti-obfuscation, endpoints admin de gestion des patterns | Renforcer la détection et la rendre configurable sans redéploiement | `dlp/app/detectors/banned_words.py`, `PatternController.java`, `DlpPatternClient.java` | L'admin édite `patterns.json` via l'UI → backend écrit le fichier → notifie le service DLP |
| **Banned words** | — | Global / par rôle / par utilisateur, fusionnés à chaque analyse | Filtrage de contenu configurable | `ChatValidationService.getBannedWords`, migrations V15 | Liste fusionnée transmise au service DLP à chaque message |
| **Attachments (sécurité)** | Accès simple par ID | Ownership vérifié en base (`findOwnedById`), JWT désormais explicite (correctif M1) | Empêcher qu'un utilisateur accède aux pièces jointes d'un autre | `AttachmentService.java`, `AttachmentController.java` | Toute requête sans JWT valide échoue en 401, plus de repli sur un compte démo |
| **PostgreSQL / migrations** | 14 migrations (V1–V14) | +8 migrations (V15–V22) : permissions, audit, filtered messages, métadonnées modèles | Support des tables ci-dessus | `backend/src/main/resources/db/migration/` | Flyway les applique dans l'ordre au démarrage |
| **Docker** | `postgres`, `litellm`, `dlp` | + `keycloak-db`, `keycloak`, `keycloak-provisioner` | Héberger l'auth localement | `docker-compose.yml`, `keycloak/` | Le provisioner configure le realm/mots de passe démo au démarrage |
| **Auth frontend** | Aucune | Contexte Keycloak (`AuthProvider`), token attaché à chaque requête API, redirection 401 → login | Cohérence avec le backend sécurisé | `client.js`, `main.jsx`, `App.jsx` | `apiFetchResponse` rafraîchit le token puis attache `Authorization: Bearer` |
| **AdminDashboard** | — | Écran complet net-new (overview/sécurité/modèles/utilisateurs/rôles/audit) | Exposer les API admin | `AdminDashboard.jsx` + `admin.css` (2700 lignes, nouveau fichier, aucun conflit avec le CSS existant) | Remplace la zone chat quand `showAdminDashboard` est actif, transition animée (`view-transition`, respecte `prefers-reduced-motion`) |
| **"Masquer et renvoyer"** | — | Bouton sur les blocages DLP de sévérité *medium* pour renvoyer le texte masqué comme nouveau prompt | Débloquer une conversation sans perdre le contexte | `ChatMessage.jsx` (`DlpBlockedMessage`), `useChatController.sendSecureMessage` | Visible seulement si sévérité medium, pas de fichiers bloqués, et texte masqué non vide |

## 3. Différences avec `main` (comparaison directe)

- **181 fichiers changés**, +14699/-1497 lignes : 92 backend, 51 frontend, 25 dlp, 7 keycloak, 1 docker-compose.yml, 1 README.md, 1 .gitignore, 1 .github, 1 .gitattributes, 1 .env.example.
- **Backend modifié** : entièrement additif au niveau schéma (nouvelles tables/colonnes), quelques fichiers existants adaptés pour accepter le `Jwt`/rôles (`ChatController`, `ConversationController`, `ModelController`, `ConversationService`, `ChatService`, `AttachmentService/Controller`).
- **Frontend modifié** : 51 fichiers — mais seulement ceux **nécessaires** à l'auth/admin/DLP. Fichiers de design purs (`messages.css`, `composer.css`, `modals.css`, `history.css`, `markdown.css`, `index.html`, `SearchModal.jsx`) : **diff vide, confirmé**, zéro changement.
- **Fichiers partagés à risque** (déjà passés en revue lors de l'intégration, re-vérifiés) :

| Fichier | Diff (main→intégration) | Nature |
|---|---|---|
| `App.jsx` | +58/-15 | Ajout état admin, pile de notifications, aucune suppression de logique existante |
| `AppLayout.jsx` | +60/-33 | Rendu conditionnel AdminDashboard, `SearchModal` intact avec ses props d'origine |
| `Sidebar.jsx` | +172/-96 | Plus gros diff : identité Keycloak réelle + nav admin, DOM/CSS existants conservés |
| `ChatMessage.jsx` | +51/-36 | Passthrough de props + bouton "Masquer et renvoyer" |
| `ChatThread.jsx` | +2/-0 | Passthrough de prop uniquement |
| `DocumentInspectorPanel.jsx` | +11/-2 | Prop `hidden` + toggle-off ; `SEVERITY_RANK`, labels complets, `resetSignature` de `main` préservés |
| `ModelLogo.jsx` | +6/-5 | Ajout `logoUrl`, aucune classe/valeur visuelle modifiée |
| `ModelCard.jsx` | +2/-2 | Ajout `logoUrl`/`description`, zéro impact visuel |
| CSS (`feedback`, `index`, `layout`, `panels`, `sidebar`, `tokens`) | additifs uniquement | Nouvelles règles/tokens pour l'admin ; aucune valeur existante supprimée |

## 4. Préservation du frontend

- **Sidebar** : DOM/classes/comportement de recherche et de menu compte identiques à `main` ; seuls ajouts = identité Keycloak réelle et bloc de navigation admin (nouvelles classes, n'écrasent rien).
- **Animations** : keyframes existantes intactes ; nouvelles keyframes ajoutées (`view-transition`) sans toucher aux anciennes.
- **Chat / messages / composer** : `messages.css`, `composer.css` **non modifiés du tout**.
- **Document Inspector** : tri par sévérité, dictionnaire de labels complet, logique de reset — tous préservés.
- **Fichiers (attachments)** : chemins d'icônes pointent vers `/assets/files%20types/*.png` (dossier d'icônes d'origine de `main`, restauré après une correction — voir note ci-dessous).
- **Scrollbar, spacing, couleurs, typographie, border-radius, responsive** : `tokens.css` uniquement étendu (nouvelles variables `--ui-*`), `--border-subtle` redéfini via indirection mais **valeur strictement identique**.
- **Icônes, menus, modèles** : `ModelCard`/`ModelLogo` inchangés visuellement (ajout de champs de données seulement) ; `modals.css`, `history.css`, `markdown.css` non touchés.

**Aucune régression visuelle détectée par comparaison de code.**

> **Note post-audit** : lors de la construction initiale de la branche, `attachmentFiles.js` avait été aligné sur un jeu d'icônes plates (`/assets/sheets.png`, `/assets/pdf.png`, etc.) présent mais inutilisé dans `main`. Sur demande explicite, ces chemins ont été corrigés pour pointer vers le dossier `frontend/public/assets/files types/` — le jeu d'icônes réellement utilisé par `main` avant l'intégration. Testé : 73/73 tests frontend passent.

## 5. Risque du merge

**Type de merge : fast-forward pur**, à condition de commiter d'abord la suppression de V21 (voir section 9). `git merge-base main integration/admin-security-dlp` = tip actuel de `main` (`41bf01e`) ; `main` n'a **aucun commit propre** depuis la création de la branche (`git log integration..main` = vide) ; `origin/main` == `main` local (0/0). Donc :
- **Conflits Git** : aucun possible — `main` est un ancêtre strict de `integration/admin-security-dlp`.
- **Risque fonctionnel** : faible. 127 tests backend passent, tests frontend passent (73), démarrage réel vérifié bout en bout (auth, Flyway, port 8081, `/actuator/health`).
- **Risque frontend** : nul par analyse de code (section 4). Non vérifié : test manuel navigateur (jamais fait dans ce projet faute d'outil de pilotage navigateur).
- **Risque Flyway/DB** : le fichier V21 orphelin est réglé **si et seulement si** la suppression staged est commitée avant le merge — sinon quiconque clone `main` après un merge "sale" pourrait récupérer un état incohérent si le commit n'est jamais fait. Sur une base neuve (volume vide), les 22 migrations s'appliqueraient dans l'ordre sans le hack `out-of-order` (celui-ci n'était nécessaire que pour rattraper une DB déjà partiellement migrée sous `main`).
- **Risque Docker** : aucun — `docker-compose.yml` n'a pas de contrepartie divergente sur `main`.
- **Risque `.env`/config** : le `.env` local n'est pas versionné et ne sera pas affecté par le merge. Le seul point réel : après un `docker compose up` sur une machine neuve, le volume Postgres est créé avec le `POSTGRES_PASSWORD` du `.env` du moment — le problème rencontré ici (volume créé avant finalisation du `.env`) ne se reproduira pas sur un environnement neuf tant que `.env` est stable avant le premier `up`.

## 6. Commits présents uniquement sur `main` depuis la divergence

**Aucun.** `git log integration/admin-security-dlp..main` est vide : `main` n'a pas bougé depuis que la branche d'intégration a été créée à partir de son tip (`41bf01e feat: Adding icones images file`). Tous vos derniers changements frontend/design sur `main` sont donc **déjà inclus** dans `integration/admin-security-dlp` (la branche descend directement de ce commit) — rien à perdre, rien à réconcilier.

## 7. Cartographie credentials / secrets

| Élément | Variable | Fichier source | Utilisé par | Secret ? | Committable ? | `.env` seul suffit ? |
|---|---|---|---|---|---|---|
| Postgres application | `POSTGRES_PASSWORD` / `SPRING_DATASOURCE_PASSWORD` | `.env` (racine) | `docker-compose.yml` (postgres), `application.properties` | Oui | Non | **Non** si le volume existe déjà avec un autre mot de passe (cas vécu) — sinon oui sur un volume neuf |
| Postgres Keycloak | `KEYCLOAK_DB_PASSWORD` | `.env` | `docker-compose.yml` (keycloak-db) | Oui | Non | Idem — **volume `gatewayllm_keycloak_postgres_data` créé ~1h après le volume Postgres app, avant la dernière édition du `.env` : même classe de risque non vérifiée pour l'instant** |
| Admin Keycloak (console) | `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD` | `.env` | Bootstrap admin Keycloak au premier démarrage | Oui | Non | Oui si volume Keycloak neuf |
| Users Synapse (ADMIN/INTERN/EXTERN/USER) | `KEYCLOAK_DEMO_PASSWORD` | `.env` | `keycloak/provision.sh`, réalisé dans `synapse-realm.json` via `${KEYCLOAK_DEMO_PASSWORD}` | Oui (mais mot de passe démo partagé, faible enjeu) | Non | Oui — usernames ci-dessous |
| Client public frontend | `synapse-client` | `keycloak/import/synapse-realm.json` (en dur, mais c'est un **client public PKCE**, pas de secret) | `frontend/src/keycloak.js` | Non | Oui (déjà committé, normal) | — |
| Client backend confidentiel | `GATEWAY_ADMIN_CLIENT_SECRET` | `.env` | `KeycloakAdminClient.java`, provisionné par `provision.sh` | Oui | Non | Oui si volume Keycloak neuf |
| LiteLLM | `LITELLM_MASTER_KEY` | `.env` | `litellm/config.yaml` (via `os.environ`), `application.properties` | Oui | Non | Oui |
| DLP admin | `DLP_ADMIN_KEY` | **Absent de votre `.env` actuel** → repli sur le défaut partagé `dev-dlp-admin` (`docker-compose.yml` et `dlp/app/config.py`) | Protège `/admin/patterns` du service DLP | Oui en théorie, mais actuellement une valeur par défaut connue de tous (dev only) | Non (mais la valeur par défaut est déjà publique dans le code, donc sans enjeu réel en local) | Oui |
| `VITE_*` (frontend) | `VITE_API_BASE_URL`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` | `frontend/.env.example` | Build Vite (injectées dans le bundle client) | **Non** — ce sont des URLs publiques et un client-id public, jamais un secret serveur | Oui | — |
| API keys providers (OpenAI/Groq/Gemini/Mistral/Anthropic) | `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY` | `.env` | `litellm/config.yaml` via `os.environ/...` | Oui | Non | Oui |

Vérification faite : aucune de ces valeurs n'est visible dans un fichier tracké par Git (scan effectué, seuls des exemples de test DLP factices comme `sk-abcdefghijklmnopqrstuvwxyz123456` sont présents, non fonctionnels).

### Où regarder quand j'oublie un mot de passe

- **Users Synapse (admin/admin1/admin2/extern1/extern2/intern1/intern2/user)** → `.env` racine, variable `KEYCLOAK_DEMO_PASSWORD` (même mot de passe pour les 8 comptes démo)
- **Admin Keycloak (console `/admin`)** → `.env` racine, `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD`
- **PostgreSQL (app)** → `.env` racine, `POSTGRES_PASSWORD` (= `SPRING_DATASOURCE_PASSWORD`, doivent rester identiques)
- **PostgreSQL (Keycloak)** → `.env` racine, `KEYCLOAK_DB_PASSWORD`
- **Client backend Keycloak (`gateway-admin`)** → `.env` racine, `GATEWAY_ADMIN_CLIENT_SECRET`
- **LiteLLM** → `.env` racine, `LITELLM_MASTER_KEY`
- **DLP admin** → `.env` racine, `DLP_ADMIN_KEY` (absent chez vous → défaut `dev-dlp-admin` visible dans `docker-compose.yml`/`dlp/app/config.py`)
- **API keys providers** → `.env` racine, section haute du fichier (`OPENAI_API_KEY`, etc.) — jamais recherchables ailleurs, ne sont dans aucun fichier tracké

## 8. Cohérence `.env` vs état réel

| Variable | Valeur déclarée dans `.env` | Valeur réellement active dans le service | Statut |
|---|---|---|---|
| `POSTGRES_PASSWORD` / `SPRING_DATASOURCE_PASSWORD` | présente | **Corrigée lors de la session précédente** pour matcher (`ALTER ROLE`) | ✅ Synchronisé, vérifié par connexion réussie hors `trust` |
| `KEYCLOAK_DEMO_PASSWORD` | présente | Appliquée par `keycloak-provisioner` au démarrage du realm | ⚠️ Non re-testée dans cette session (lecture seule) ; présumée correcte car le provisioner a tourné après la finalisation du `.env` (containers Keycloak créés à 20:33, `.env` finalisé à 22:42 — **mêmes conditions de risque que Postgres app**, non vérifié) |
| Keycloak admin (`KEYCLOAK_ADMIN_USERNAME/PASSWORD`) | présente | Bootstrap au premier démarrage du volume `gatewayllm_keycloak_postgres_data` | ⚠️ Idem, non re-testé |
| Keycloak DB (`KEYCLOAK_DB_PASSWORD`) | présente | Volume créé 20:33:52, avant la dernière édition `.env` (22:42) | ⚠️ **Même classe de risque que le cas Postgres app déjà rencontré — à vérifier avant de compter dessus** |
| Client secret backend (`GATEWAY_ADMIN_CLIENT_SECRET`) | présente | Réappliqué par `provision.sh` à chaque exécution (update explicite du client Keycloak) | Probablement synchronisé (le script le réécrit à chaque run), mais non re-testé ici |
| `DLP_ADMIN_KEY` | **absente** de `.env` | Défaut partagé `dev-dlp-admin` côté `docker-compose.yml` et `dlp/app/config.py` | ✅ Cohérent par construction (même défaut des deux côtés) |
| `LITELLM_MASTER_KEY` | présente | Utilisée telle quelle par LiteLLM et le backend | Cohérent par construction (même variable des deux côtés, pas de volume à initialiser) |

Aucune modification effectuée pour vérifier ces points (respect strict de la contrainte).

## 9. Vérification Git/secrets

- ✅ `.env` ignoré par Git (`.gitignore` : `.env`, `.env.*`, `!.env.example`), confirmé non tracké (`git ls-files` vide pour `.env`).
- ✅ Aucun vrai secret tracké (scan effectué sur tout l'historique diffé, seuls des faux positifs de test DLP).
- ✅ Aucun secret serveur exposé via `VITE_*` — uniquement URLs publiques + client-id public PKCE.
- ✅ `.env.example` et `frontend/.env.example` propres (placeholders uniquement).
- **État des branches** : `main` local == `origin/main` (0 commits d'écart). `integration/admin-security-dlp` = `main` + 9 commits, aucun commit `main`-only.
- **Staged changes** : **une seule** — `deleted: backend/.../V21__replace_deprecated_groq_model.sql` (staged, non commitée). (Le correctif des icônes de fichiers, effectué après cet audit, ajoute 2 fichiers modifiés supplémentaires non commités : `attachmentFiles.js` et `attachmentFiles.test.js`.)
- **Suppression V21** : voir conclusion section 1 — GARDER LA SUPPRESSION, mais **doit être commitée** avant merge (sinon elle ne fait pas partie de l'historique de branche et un fast-forward propre n'est pas trivialement possible avec des modifications non commitées dans l'arbre de travail).

## 10. Conclusion

### B — SAFE AFTER SMALL FIXES

**Pourquoi pas A (SAFE TO MERGE) directement** : il reste des modifications non commitées (suppression V21 + correctif des icônes de fichiers) qui doivent être formalisées en commit avant tout merge — un fast-forward avec des changements non commités dans l'arbre de travail n'est pas une opération propre. Et deux points de config Keycloak (`KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_DEMO_PASSWORD`) n'ont pas été re-vérifiés après la découverte du problème Postgres, alors qu'ils sont structurellement exposés au même risque (volumes créés avant la finalisation du `.env`).

**Pourquoi pas C (DO NOT MERGE)** : aucun risque de conflit Git (fast-forward pur), 127/127 tests backend + 73/73 tests frontend passent, démarrage réel vérifié de bout en bout, zéro régression de design détectée par analyse de code, aucun secret exposé.

### Checklist courte restante
1. Commiter la suppression de `V21__replace_deprecated_groq_model.sql` et le correctif des icônes de fichiers (`attachmentFiles.js`/`.test.js`).
2. Vérifier (sans les changer) que `KEYCLOAK_DB_PASSWORD` et `KEYCLOAK_DEMO_PASSWORD` du `.env` correspondent bien à ce qui est réellement configuré dans le volume Keycloak actif — même méthode que pour Postgres (test de connexion hors règle `trust`).
3. Un test manuel navigateur (login Keycloak, AdminDashboard, flux DLP) reste recommandé avant un merge en production, faute d'avoir pu l'automatiser dans ces sessions.

---

**Aujourd'hui mon `main` contient :** votre frontend actuel (design, Sidebar, chat, Document Inspector, styles) tel quel, plus un backend simple sans authentification (14 migrations, DLP basique, pas d'admin).

**La branche d'intégration ajoute :** authentification Keycloak complète (JWT, rôles USER/ADMIN/INTERN/EXTERN), sécurité backend (CORS restreint, endpoints admin protégés), permissions et banned words configurables, un AdminDashboard entièrement nouveau, un audit trail, un DLP renforcé, 8 migrations DB supplémentaires, 3 services Docker Keycloak, et l'auth côté frontend — sans jamais remplacer un fichier de design existant par la version de la branche source.

**Mon frontend est préservé** parce que chaque fichier partagé a été greffé manuellement à partir de la version actuelle de `main` (jamais un remplacement en bloc), et parce que tous les fichiers CSS/JSX purement design (`messages.css`, `composer.css`, `modals.css`, `history.css`, `markdown.css`, `index.html`, `SearchModal.jsx`) affichent un diff strictement vide contre `main`.

**Si je merge maintenant :** ce sera un fast-forward sans aucun conflit Git ; le seul point bloquant réel est que la suppression de V21 et le correctif des icônes ne sont pas encore des commits — tant qu'ils ne le sont pas, l'état de la branche à mergerait ne correspond pas exactement à ce qui a été testé.

**Avant le merge il reste :** commiter les deux changements en attente, et vérifier (lecture seule) la cohérence des mots de passe Keycloak/PostgreSQL-Keycloak comme cela a été fait pour PostgreSQL applicatif.

**Pour retrouver les mots de passe :** tout est centralisé dans le `.env` racine (jamais committé) — voir la section "Où regarder quand j'oublie un mot de passe" ci-dessus pour la variable exacte par service.
