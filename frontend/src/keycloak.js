import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://127.0.0.1:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'synapse',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'synapse-client',
})

export default keycloak
