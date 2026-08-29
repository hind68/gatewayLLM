package com.example.backend.security;

import com.example.backend.integration.keycloak.KeycloakAdminClient;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class AdminTargetPolicy {
    private final KeycloakAdminClient keycloak;

    public AdminTargetPolicy(KeycloakAdminClient keycloak) {
        this.keycloak = keycloak;
    }

    public void requireUserSettingsAccess(String userId, JwtAuthenticationToken actor) {
        var targetRoles = keycloak.userRealmRoles(userId).stream()
                .map(role -> normalize(String.valueOf(role.get("name"))))
                .toList();
        if (targetRoles.contains("SUPER_ADMIN")) {
            throw forbidden("Super administrator settings cannot be changed");
        }
        if (targetRoles.contains("ADMIN") && !isSuperAdmin(actor)) {
            throw forbidden("Only a super administrator can change administrator settings");
        }
    }

    public void requireRoleSettingsAccess(String roleName, JwtAuthenticationToken actor) {
        String targetRole = normalize(roleName);
        if ("SUPER_ADMIN".equals(targetRole)) {
            throw forbidden("Super administrator settings cannot be changed");
        }
        if ("ADMIN".equals(targetRole) && !isSuperAdmin(actor)) {
            throw forbidden("Only a super administrator can change administrator permissions");
        }
    }

    public String requireAssignableRole(String roleName, JwtAuthenticationToken actor) {
        String targetRole = normalize(roleName);
        if ("SUPER_ADMIN".equals(targetRole)) {
            throw forbidden("The super administrator role cannot be assigned from the administration interface");
        }
        if (!java.util.Set.of("ADMIN", "INTERN", "EXTERN").contains(targetRole)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid managed role is required");
        }
        return targetRole;
    }

    public boolean isSuperAdmin(JwtAuthenticationToken actor) {
        return actor != null && actor.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_SUPER_ADMIN".equals(authority.getAuthority()));
    }

    private String normalize(String roleName) {
        return roleName == null ? "" : roleName.trim().toUpperCase(Locale.ROOT);
    }

    private ResponseStatusException forbidden(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }
}
