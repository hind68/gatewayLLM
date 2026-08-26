package com.example.backend.service;

import com.example.backend.entity.Utilisateur;
import com.example.backend.repository.UtilisateurRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CurrentUserServiceTest {

    @Mock
    private UtilisateurRepository utilisateurRepository;

    @InjectMocks
    private CurrentUserService currentUserService;

    private static final String SUBJECT_123 = "00000000-0000-0000-0000-000000000123";
    private static final String SUBJECT_456 = "00000000-0000-0000-0000-000000000456";
    private static final String SUBJECT_789 = "00000000-0000-0000-0000-000000000789";
    private static final String SUBJECT_999 = "00000000-0000-0000-0000-000000000999";

    @Test
    void resolveReturnsExistingUserForJwtSubject() {
        Jwt jwt = jwt(SUBJECT_123, "Alice");
        Utilisateur existing = new Utilisateur(SUBJECT_123, "Alice");
        when(utilisateurRepository.findByExternalId(SUBJECT_123)).thenReturn(Optional.of(existing));

        assertThat(currentUserService.resolve(jwt)).isSameAs(existing);
        verify(utilisateurRepository).findByExternalId(SUBJECT_123);
    }

    @Test
    void resolveCreatesUserUsingDisplayNameClaimWhenSubjectIsNew() {
        Jwt jwt = jwt(SUBJECT_456, "Bob");
        when(utilisateurRepository.findByExternalId(SUBJECT_456)).thenReturn(Optional.empty());
        when(utilisateurRepository.save(any(Utilisateur.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Utilisateur resolved = currentUserService.resolve(jwt);

        assertThat(resolved.getExternalId()).isEqualTo(SUBJECT_456);
        assertThat(resolved.getNomAffichage()).isEqualTo("Bob");
        verify(utilisateurRepository).save(any(Utilisateur.class));
    }

    @Test
    void resolveFallsBackToPreferredUsernameThenDefaultDisplayName() {
        Jwt preferredUsernameJwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject(SUBJECT_789)
                .claim("preferred_username", "charlie")
                .build();
        when(utilisateurRepository.findByExternalId(SUBJECT_789)).thenReturn(Optional.empty());
        when(utilisateurRepository.save(any(Utilisateur.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Utilisateur preferred = currentUserService.resolve(preferredUsernameJwt);

        assertThat(preferred.getNomAffichage()).isEqualTo("charlie");

        Jwt defaultJwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject(SUBJECT_999)
                .build();
        when(utilisateurRepository.findByExternalId(SUBJECT_999)).thenReturn(Optional.empty());

        Utilisateur fallback = currentUserService.resolve(defaultJwt);

        assertThat(fallback.getNomAffichage()).isEqualTo("Utilisateur");
    }

    @Test
    void resolveRejectsMissingOrNonUuidSubjectJustLikeKeycloakId() {
        Jwt invalid = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject("not-a-uuid")
                .build();

        assertThatThrownBy(() -> currentUserService.resolve(invalid))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Authenticated user identity is invalid");
        assertThatThrownBy(() -> currentUserService.resolve(null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Authenticated user identity is missing");
    }

    @Test
    void resolveUsesIndependentWriteTransactionForReadOnlyCallers() throws NoSuchMethodException {
        Transactional transactional = CurrentUserService.class
                .getMethod("resolve", Jwt.class)
                .getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.propagation()).isEqualTo(Propagation.REQUIRES_NEW);
    }

    @Test
    void keycloakIdReturnsUuidSubject() {
        String subject = "123e4567-e89b-12d3-a456-426614174000";

        assertThat(currentUserService.keycloakId(jwt(subject, "Alice")))
                .isEqualTo(java.util.UUID.fromString(subject));
    }

    @Test
    void keycloakIdRejectsMissingOrNonUuidSubject() {
        Jwt invalid = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject("not-a-uuid")
                .build();

        assertThatThrownBy(() -> currentUserService.keycloakId(invalid))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Authenticated user identity is invalid");
        assertThatThrownBy(() -> currentUserService.keycloakId(null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Authenticated user identity is missing");
    }

    private Jwt jwt(String subject, String name) {
        return Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject(subject)
                .claim("name", name)
                .build();
    }
}
