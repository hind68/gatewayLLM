package com.example.backend.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.backend.integration.keycloak.KeycloakAdminClient;
import com.example.backend.repository.AuditLogRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class KeycloakAdminControllerTest {
    @Mock KeycloakAdminClient keycloak;
    @Mock AuditLogRepository auditLogs;
    private KeycloakAdminController controller;

    @BeforeEach
    void setUp() {
        controller = new KeycloakAdminController(keycloak, auditLogs);
    }

    @Test
    void refusesToDisableTheFinalSuperAdministrator() {
        when(keycloak.userRealmRoles("super-1")).thenReturn(List.of(Map.of("name", "SUPER_ADMIN")));
        when(keycloak.countUsersWithRealmRole("SUPER_ADMIN")).thenReturn(1L);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.setEnabled("super-1", false, null));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(keycloak, never()).setEnabled("super-1", false);
    }

    @Test
    void refusesToDemoteTheFinalSuperAdministrator() {
        when(keycloak.userRealmRoles("super-1")).thenReturn(List.of(Map.of("name", "SUPER_ADMIN")));
        when(keycloak.countUsersWithRealmRole("SUPER_ADMIN")).thenReturn(1L);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.setRoles("super-1", Map.of("roles", List.of("ADMIN")), null));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(keycloak, never()).setRealmRoles("super-1", List.of("ADMIN"));
    }
}
