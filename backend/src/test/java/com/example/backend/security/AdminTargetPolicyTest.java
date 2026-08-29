package com.example.backend.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.example.backend.integration.keycloak.KeycloakAdminClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class AdminTargetPolicyTest {
    @Mock KeycloakAdminClient keycloak;
    private AdminTargetPolicy policy;

    @BeforeEach
    void setUp() {
        policy = new AdminTargetPolicy(keycloak);
    }

    @Test
    void nobodyCanModifyASuperAdministrator() {
        when(keycloak.userRealmRoles("super-1")).thenReturn(List.of(Map.of("name", "SUPER_ADMIN")));

        assertThatThrownBy(() -> policy.requireUserSettingsAccess("super-1", authentication("ROLE_SUPER_ADMIN")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("cannot be changed");
    }

    @Test
    void ordinaryAdminCannotModifyAnotherAdmin() {
        when(keycloak.userRealmRoles("admin-2")).thenReturn(List.of(Map.of("name", "ADMIN")));

        assertThatThrownBy(() -> policy.requireUserSettingsAccess("admin-2", authentication("ROLE_ADMIN")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Only a super administrator");
    }

    @Test
    void superAdminCanModifyAnOrdinaryAdmin() {
        when(keycloak.userRealmRoles("admin-2")).thenReturn(List.of(Map.of("name", "ADMIN")));

        assertThatCode(() -> policy.requireUserSettingsAccess("admin-2", authentication("ROLE_SUPER_ADMIN")))
                .doesNotThrowAnyException();
    }

    @Test
    void ordinaryAdminCanModifyAnOrdinaryUser() {
        when(keycloak.userRealmRoles("user-1")).thenReturn(List.of(Map.of("name", "INTERN")));

        assertThatCode(() -> policy.requireUserSettingsAccess("user-1", authentication("ROLE_ADMIN")))
                .doesNotThrowAnyException();
    }

    @Test
    void superAdminRolePermissionsAreAlwaysImmutable() {
        assertThatThrownBy(() -> policy.requireRoleSettingsAccess("SUPER_ADMIN", authentication("ROLE_SUPER_ADMIN")))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void onlySuperAdminCanModifyAdminRolePermissions() {
        assertThatThrownBy(() -> policy.requireRoleSettingsAccess("ADMIN", authentication("ROLE_ADMIN")))
                .isInstanceOf(ResponseStatusException.class);
        assertThatCode(() -> policy.requireRoleSettingsAccess("ADMIN", authentication("ROLE_SUPER_ADMIN")))
                .doesNotThrowAnyException();
    }

    @Test
    void ordinaryAdminCanAssignOrdinaryRoles() {
        assertThatCode(() -> policy.requireAssignableRole("INTERN", authentication("ROLE_ADMIN")))
                .doesNotThrowAnyException();
        assertThatCode(() -> policy.requireAssignableRole("extern", authentication("ROLE_ADMIN")))
                .doesNotThrowAnyException();
    }

    @Test
    void ordinaryAdminCanPromoteAnOrdinaryUserToAdmin() {
        assertThatCode(() -> policy.requireAssignableRole("ADMIN", authentication("ROLE_ADMIN")))
                .doesNotThrowAnyException();
        assertThatCode(() -> policy.requireAssignableRole("ADMIN", authentication("ROLE_SUPER_ADMIN")))
                .doesNotThrowAnyException();
    }

    @Test
    void superAdminRoleCannotBeAssignedThroughAccountManagement() {
        assertThatThrownBy(() -> policy.requireAssignableRole("SUPER_ADMIN", authentication("ROLE_SUPER_ADMIN")))
                .isInstanceOf(ResponseStatusException.class);
    }

    private JwtAuthenticationToken authentication(String authority) {
        Jwt jwt = Jwt.withTokenValue("token").header("alg", "none").subject("123e4567-e89b-12d3-a456-426614174000").build();
        return new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority(authority)));
    }
}
