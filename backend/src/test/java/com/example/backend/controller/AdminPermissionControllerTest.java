package com.example.backend.controller;

import com.example.backend.entity.Utilisateur;
import com.example.backend.repository.AuditLogRepository;
import com.example.backend.repository.GlobalBannedWordRepository;
import com.example.backend.repository.UserBannedWordRepository;
import com.example.backend.repository.UserLlmRestrictionRepository;
import com.example.backend.repository.UtilisateurRepository;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminPermissionControllerTest {

    private static final UUID ADMIN_ID = UUID.fromString("123e4567-e89b-12d3-a456-426614174000");
    private static final UUID TARGET_USER_ID = UUID.fromString("00000000-0000-0000-0000-0000000000aa");

    @Mock GlobalBannedWordRepository globalBannedWordRepo;
    @Mock UserLlmRestrictionRepository userLlmRestrictionRepo;
    @Mock UserBannedWordRepository userBannedWordRepo;
    @Mock UtilisateurRepository utilisateurRepository;
    @Mock AuditLogRepository auditLogRepository;

    private AdminPermissionController controller;
    private JwtAuthenticationToken auth;

    private void setUp() {
        controller = new AdminPermissionController(
                globalBannedWordRepo, userLlmRestrictionRepo, userBannedWordRepo, utilisateurRepository, auditLogRepository);
        Jwt jwt = Jwt.withTokenValue("token").header("alg", "none").subject(ADMIN_ID.toString()).build();
        auth = new JwtAuthenticationToken(jwt);
    }

    @Test
    void addLlmRestrictionRejectsUnknownTargetUser() {
        setUp();
        when(utilisateurRepository.findByExternalId(TARGET_USER_ID.toString())).thenReturn(Optional.empty());
        Map<String, String> payload = Map.of("userId", TARGET_USER_ID.toString(), "llmModelAlias", "secure-groq");

        assertThatThrownBy(() -> controller.addLlmRestriction(payload, auth))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("User not found");

        verify(userLlmRestrictionRepo, never()).save(org.mockito.ArgumentMatchers.any());
        verify(auditLogRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void addLlmRestrictionSucceedsForExistingTargetUser() {
        setUp();
        when(utilisateurRepository.findByExternalId(TARGET_USER_ID.toString()))
                .thenReturn(Optional.of(mock(Utilisateur.class)));
        when(userLlmRestrictionRepo.save(org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        Map<String, String> payload = Map.of("userId", TARGET_USER_ID.toString(), "llmModelAlias", "secure-groq");

        var saved = controller.addLlmRestriction(payload, auth);

        assertThat(saved.getUserKeycloakId()).isEqualTo(TARGET_USER_ID);
        assertThat(saved.getLlmModelAlias()).isEqualTo("secure-groq");
    }

    @Test
    void addUserBannedWordRejectsUnknownTargetUser() {
        setUp();
        when(utilisateurRepository.findByExternalId(TARGET_USER_ID.toString())).thenReturn(Optional.empty());
        Map<String, String> payload = Map.of("userId", TARGET_USER_ID.toString(), "word", "secret");

        assertThatThrownBy(() -> controller.addUserBannedWord(payload, auth))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("User not found");

        verify(userBannedWordRepo, never()).save(org.mockito.ArgumentMatchers.any());
        verify(auditLogRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void addUserBannedWordSucceedsForExistingTargetUser() {
        setUp();
        when(utilisateurRepository.findByExternalId(TARGET_USER_ID.toString()))
                .thenReturn(Optional.of(mock(Utilisateur.class)));
        when(userBannedWordRepo.save(org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        Map<String, String> payload = Map.of("userId", TARGET_USER_ID.toString(), "word", "Secret");

        var saved = controller.addUserBannedWord(payload, auth);

        assertThat(saved.getUserKeycloakId()).isEqualTo(TARGET_USER_ID);
        assertThat(saved.getWord()).isEqualTo("secret");
    }
}
