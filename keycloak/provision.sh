#!/bin/sh
set -eu

SERVER="http://keycloak:8080"
REALM="${KEYCLOAK_ADMIN_REALM:-synapse}"
KCADM="/opt/keycloak/bin/kcadm.sh"
KCADM_CONFIG="/tmp/kcadm-provision.config"

kcadm() {
  command="$1"
  shift
  "$KCADM" "$command" --config "$KCADM_CONFIG" "$@"
}

echo "Waiting for Keycloak realm ${REALM}..."
while :; do
  rm -f "$KCADM_CONFIG"
  if timeout 15 "$KCADM" config credentials --config "$KCADM_CONFIG" \
    --server "$SERVER" \
    --realm master \
    --user "$KEYCLOAK_ADMIN_USERNAME" \
    --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1 \
    && timeout 15 "$KCADM" get --config "$KCADM_CONFIG" "realms/${REALM}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

kcadm update "realms/${REALM}" \
  -s loginTheme=synapse \
  -s internationalizationEnabled=true \
  -s defaultLocale=fr \
  -s 'supportedLocales=["fr"]' \
  -s rememberMe=true \
  -s ssoSessionIdleTimeoutRememberMe=2592000 \
  -s ssoSessionMaxLifespanRememberMe=2592000

ensure_role() {
  role_name="$1"
  role_description="$2"
  if ! kcadm get "roles/${role_name}" -r "$REALM" >/dev/null 2>&1; then
    kcadm create roles -r "$REALM" -s name="$role_name" -s description="$role_description"
  fi
}

ensure_role INTERN "Internal Synapse user"
ensure_role EXTERN "External Synapse user"
ensure_role ADMIN "Gateway administrator"
ensure_role SUPER_ADMIN "Protected Synapse super administrator"

# SUPER_ADMIN inherits every ADMIN permission while remaining distinguishable
# for protected identity-management operations.
kcadm add-roles -r "$REALM" --rname SUPER_ADMIN --rolename ADMIN

# Guarantee one explicitly named, recoverable bootstrap account without
# changing its password. Refuse ambiguous matches instead of granting the
# highest privilege to multiple accounts.
super_admin_username="${KEYCLOAK_SUPER_ADMIN_USERNAME:-admin}"
super_admin_ids="$(kcadm get users -r "$REALM" -q username="$super_admin_username" -q exact=true --fields id --format csv --noquotes | tr -d '\r')"
super_admin_count=0
for super_admin_id in $super_admin_ids; do
  super_admin_count=$((super_admin_count + 1))
done
if [ "$super_admin_count" -ne 1 ]; then
  echo "Expected exactly one Keycloak user named ${super_admin_username}; found ${super_admin_count}. SUPER_ADMIN was not assigned." >&2
  exit 1
fi
kcadm add-roles -r "$REALM" --uid "$super_admin_ids" --rolename SUPER_ADMIN

ensure_user_profile() {
  username="$1"
  first_name="$2"
  last_name="$3"
  user_id="$(kcadm get users -r "$REALM" -q username="$username" --fields id --format csv --noquotes | head -n 1 | tr -d '\r')"
  if [ -n "$user_id" ]; then
    kcadm update "users/${user_id}" -r "$REALM" \
      -s firstName="$first_name" \
      -s lastName="$last_name" \
      -s emailVerified=true
  fi
}

ensure_user_profile admin Synapse Admin
ensure_user_profile user Synapse User

synapse_client_id="$(kcadm get clients -r "$REALM" -q clientId=synapse-client --fields id --format csv --noquotes | head -n 1 | tr -d '\r')"
if [ -n "$synapse_client_id" ]; then
  kcadm update "clients/${synapse_client_id}" -r "$REALM" \
    -s 'redirectUris=["http://localhost:5173/","http://localhost:5173/*","http://127.0.0.1:5173/","http://127.0.0.1:5173/*"]' \
    -s 'webOrigins=["http://localhost:5173","http://127.0.0.1:5173"]'
fi

client_id="$(kcadm get clients -r "$REALM" -q clientId=gateway-admin --fields id --format csv --noquotes 2>/dev/null | head -n 1 | tr -d '\r')"
if [ -z "$client_id" ]; then
  kcadm create clients -r "$REALM" \
    -s clientId=gateway-admin \
    -s name="Synapse backend administration" \
    -s enabled=true \
    -s publicClient=false \
    -s serviceAccountsEnabled=true \
    -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false \
    -s clientAuthenticatorType=client-secret \
    -s secret="$GATEWAY_ADMIN_CLIENT_SECRET"
  client_id="$(kcadm get clients -r "$REALM" -q clientId=gateway-admin --fields id --format csv --noquotes | head -n 1 | tr -d '\r')"
else
  kcadm update "clients/${client_id}" -r "$REALM" \
    -s enabled=true \
    -s publicClient=false \
    -s serviceAccountsEnabled=true \
    -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false \
    -s clientAuthenticatorType=client-secret \
    -s secret="$GATEWAY_ADMIN_CLIENT_SECRET"
fi

for role_name in query-users view-users manage-users view-realm; do
  kcadm add-roles -r "$REALM" \
    --uusername service-account-gateway-admin \
    --cclientid realm-management \
    --rolename "$role_name"
done

# Keycloak 26 adds a wildcard post-logout redirect to clients when an omitted
# attribute is imported. The live development realm has no such redirect on
# these clients, so remove the generated default after both fresh imports and
# ordinary restarts.
for logout_client in admin-cli broker gateway-admin; do
  logout_client_id="$(kcadm get clients -r "$REALM" -q clientId="$logout_client" --fields id --format csv --noquotes | head -n 1 | tr -d '\r')"
  if [ -n "$logout_client_id" ]; then
    kcadm update "clients/${logout_client_id}" -r "$REALM" \
      -s 'attributes."post.logout.redirect.uris"=null'
  fi
done

echo "Keycloak realm ${REALM} provisioned."
