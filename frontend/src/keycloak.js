import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  // Must match the hostname Spring Security expects in the JWT `iss` claim
  // (spring.security.oauth2.resourceserver.jwt.issuer-uri / KEYCLOAK_ISSUER_URI).
  // Docker Compose pins that to "localhost", so this has to too - browsing via
  // 127.0.0.1 instead would get a token whose issuer never matches the
  // backend's expectation, causing every API call to 401 forever.
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'synapse',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'synapse-client',
})

export default keycloak
