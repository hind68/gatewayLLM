package com.example.backend.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.anyMap;

import com.example.backend.integration.keycloak.KeycloakAdminClient;
import com.example.backend.repository.AuditLogRepository;
import com.example.backend.security.AdminTargetPolicy;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class KeycloakAdminControllerTest {
    @Mock KeycloakAdminClient keycloak;
    @Mock AuditLogRepository auditLogs;
    @Mock AdminTargetPolicy targetPolicy;
    private KeycloakAdminController controller;

    @BeforeEach
    void setUp() {
        controller = new KeycloakAdminController(keycloak, auditLogs, targetPolicy);
    }

    @Test
    void refusesToDisableASuperAdministrator() {
        org.mockito.Mockito.doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "immutable"))
                .when(targetPolicy).requireUserSettingsAccess("super-1", null);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.setEnabled("super-1", false, null));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verify(keycloak, never()).setEnabled("super-1", false);
    }

    @Test
    void refusesToDemoteASuperAdministrator() {
        org.mockito.Mockito.doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "immutable"))
                .when(targetPolicy).requireUserSettingsAccess("super-1", null);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.setRoles("super-1", Map.of("roles", List.of("ADMIN")), null));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verify(keycloak, never()).setRealmRoles("super-1", List.of("ADMIN"));
    }

    @Test
    void createsAUserAndAssignsTheValidatedRole() {
        JwtAuthenticationToken auth = authentication("ROLE_ADMIN");
        when(targetPolicy.requireAssignableRole("INTERN", auth)).thenReturn("INTERN");
        when(keycloak.createUser(anyMap())).thenReturn("new-user-id");

        controller.createUser(Map.of(
                "username", "new.user",
                "firstName", "New",
                "lastName", "User",
                "email", "new.user@test.com",
                "password", "password123",
                "role", "INTERN",
                "temporaryPassword", false
        ), auth);

        verify(keycloak).setRealmRoles("new-user-id", List.of("INTERN"));
        verify(auditLogs).save(org.mockito.ArgumentMatchers.any());
    }

    private JwtAuthenticationToken authentication(String authority) {
        Jwt jwt = Jwt.withTokenValue("token").header("alg", "none")
                .subject("123e4567-e89b-12d3-a456-426614174000").build();
        return new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority(authority)));
    }
}
