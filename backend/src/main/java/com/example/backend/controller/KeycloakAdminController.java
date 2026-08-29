package com.example.backend.controller;

import com.example.backend.entity.AuditLog;
import com.example.backend.integration.keycloak.KeycloakAdminClient;
import com.example.backend.repository.AuditLogRepository;
import com.example.backend.security.AdminTargetPolicy;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/keycloak")
@PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
public class KeycloakAdminController {
    private final KeycloakAdminClient keycloak;
    private final AuditLogRepository auditLogs;
    private final AdminTargetPolicy targetPolicy;

    public KeycloakAdminController(KeycloakAdminClient keycloak, AuditLogRepository auditLogs, AdminTargetPolicy targetPolicy) {
        this.keycloak = keycloak;
        this.auditLogs = auditLogs;
        this.targetPolicy = targetPolicy;
    }

    @GetMapping("/users")
    public List<Map<String, Object>> users(@RequestParam(required = false) String search) {
        return keycloak.users(search);
    }

    @PostMapping("/users")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public void createUser(@RequestBody Map<String, Object> payload, JwtAuthenticationToken auth) {
        String username = requiredText(payload, "username");
        String email = requiredText(payload, "email");
        String password = requiredText(payload, "password");
        String role = targetPolicy.requireAssignableRole(requiredText(payload, "role"), auth);
        boolean temporaryPassword = !Boolean.FALSE.equals(payload.get("temporaryPassword"));
        Map<String, Object> keycloakUser = new java.util.HashMap<>();
        keycloakUser.put("username", username);
        keycloakUser.put("email", email);
        keycloakUser.put("firstName", optionalText(payload, "firstName"));
        keycloakUser.put("lastName", optionalText(payload, "lastName"));
        keycloakUser.put("enabled", true);
        keycloakUser.put("emailVerified", false);
        keycloakUser.put("credentials", List.of(Map.of("type", "password", "value", password, "temporary", temporaryPassword)));
        String userId = keycloak.createUser(keycloakUser);
        try {
            keycloak.setRealmRoles(userId, List.of(role));
        } catch (RuntimeException exception) {
            keycloak.deleteUser(userId);
            throw exception;
        }
        audit("CREATE", "KEYCLOAK_USER", username, auth);
    }

    @PatchMapping("/users/{id}/enabled")
    public void setEnabled(@PathVariable String id, @RequestParam boolean enabled, JwtAuthenticationToken auth) {
        targetPolicy.requireUserSettingsAccess(id, auth);
        keycloak.setEnabled(id, enabled);
        audit(enabled ? "ENABLE" : "DISABLE", "KEYCLOAK_USER", id, auth);
    }

    @GetMapping("/roles")
    public List<Map<String, Object>> roles() { return keycloak.roles(); }

    @GetMapping("/users/{id}/roles")
    public List<Map<String, Object>> userRoles(@PathVariable String id) { return keycloak.userRealmRoles(id); }

    @PutMapping("/users/{id}/roles")
    public void setRoles(@PathVariable String id, @RequestBody Map<String, List<String>> payload, JwtAuthenticationToken auth) {
        List<String> roles = payload.getOrDefault("roles", List.of());
        if (roles.size() != 1 || roles.get(0) == null || roles.get(0).isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Exactly one managed role is required");
        }
        targetPolicy.requireUserSettingsAccess(id, auth);
        String role = targetPolicy.requireAssignableRole(roles.get(0), auth);
        keycloak.setRealmRoles(id, List.of(role));
        audit("UPDATE_ROLES", "KEYCLOAK_USER", id, auth);
    }

    private void audit(String action, String entity, String id, JwtAuthenticationToken auth) {
        auditLogs.save(new AuditLog(action, entity, id, UUID.fromString(auth.getToken().getSubject())));
    }

    private String requiredText(Map<String, Object> payload, String field) {
        String value = optionalText(payload, field);
        if (value.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required");
        return value;
    }

    private String optionalText(Map<String, Object> payload, String field) {
        Object value = payload.get(field);
        return value == null ? "" : String.valueOf(value).trim();
    }
}
