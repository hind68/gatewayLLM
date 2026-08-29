package com.example.backend.controller;

import com.example.backend.entity.AuditLog;
import com.example.backend.entity.GlobalBannedWord;
import com.example.backend.entity.UserBannedWord;
import com.example.backend.entity.UserLlmRestriction;
import com.example.backend.entity.Utilisateur;
import com.example.backend.integration.keycloak.KeycloakAdminClient;
import com.example.backend.repository.AuditLogRepository;
import com.example.backend.repository.GlobalBannedWordRepository;
import com.example.backend.repository.UserBannedWordRepository;
import com.example.backend.repository.UserLlmRestrictionRepository;
import com.example.backend.repository.UtilisateurRepository;
import com.example.backend.security.AdminTargetPolicy;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/permissions")
@PreAuthorize("hasRole('ADMIN')")
public class AdminPermissionController {

    private final GlobalBannedWordRepository globalBannedWordRepo;
    private final UserLlmRestrictionRepository userLlmRestrictionRepo;
    private final UserBannedWordRepository userBannedWordRepo;
    private final UtilisateurRepository utilisateurRepository;
    private final AuditLogRepository auditLogRepository;
    private final KeycloakAdminClient keycloakAdminClient;
    private final AdminTargetPolicy targetPolicy;

    public AdminPermissionController(
            GlobalBannedWordRepository globalBannedWordRepo,
            UserLlmRestrictionRepository userLlmRestrictionRepo,
            UserBannedWordRepository userBannedWordRepo,
            UtilisateurRepository utilisateurRepository,
            AuditLogRepository auditLogRepository,
            KeycloakAdminClient keycloakAdminClient,
            AdminTargetPolicy targetPolicy) {
        this.globalBannedWordRepo = globalBannedWordRepo;
        this.userLlmRestrictionRepo = userLlmRestrictionRepo;
        this.userBannedWordRepo = userBannedWordRepo;
        this.utilisateurRepository = utilisateurRepository;
        this.auditLogRepository = auditLogRepository;
        this.keycloakAdminClient = keycloakAdminClient;
        this.targetPolicy = targetPolicy;
    }

    @GetMapping("/users")
    public List<Utilisateur> getAllUsers(@AuthenticationPrincipal Jwt jwt) {
        return utilisateurRepository.findAll();
    }

    @GetMapping("/banned-words/global")
    public List<GlobalBannedWord> listGlobalBannedWords(@AuthenticationPrincipal Jwt jwt) {
        return globalBannedWordRepo.findAll();
    }

    @PostMapping("/banned-words/global")
    @Transactional
    public GlobalBannedWord addGlobalBannedWord(@RequestBody Map<String, String> payload, JwtAuthenticationToken auth) {
        UUID adminId = UUID.fromString(auth.getToken().getSubject());
        GlobalBannedWord saved = globalBannedWordRepo.save(new GlobalBannedWord(payload.get("word").trim(), adminId));
        auditLogRepository.save(new AuditLog("ADD", "GlobalBannedWord", saved.getWord(), adminId));
        return saved;
    }

    @DeleteMapping("/banned-words/global/{id}")
    @Transactional
    public void removeGlobalBannedWord(@PathVariable Long id, JwtAuthenticationToken auth) {
        GlobalBannedWord bannedWord = globalBannedWordRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Banned word not found"));
        UUID adminId = UUID.fromString(auth.getToken().getSubject());
        globalBannedWordRepo.delete(bannedWord);
        auditLogRepository.save(new AuditLog("DELETE", "GlobalBannedWord", bannedWord.getWord(), adminId));
    }

    @GetMapping("/llm-restrictions/{userKeycloakId}")
    public List<UserLlmRestriction> listUserRestrictions(@PathVariable UUID userKeycloakId, @AuthenticationPrincipal Jwt jwt) {
        return userLlmRestrictionRepo.findByUserKeycloakId(userKeycloakId);
    }

    @PostMapping("/llm-restrictions")
    @Transactional
    public UserLlmRestriction addLlmRestriction(@RequestBody Map<String, String> payload, JwtAuthenticationToken auth) {
        UUID adminId = UUID.fromString(auth.getToken().getSubject());
        UUID targetUserId = UUID.fromString(payload.get("userId"));
        requireExistingUser(targetUserId);
        targetPolicy.requireUserSettingsAccess(targetUserId.toString(), auth);
        UserLlmRestriction restriction = new UserLlmRestriction();
        restriction.setUserKeycloakId(targetUserId);
        restriction.setLlmModelAlias(payload.get("llmModelAlias"));
        restriction.setCreatedBy(adminId);
        UserLlmRestriction saved = userLlmRestrictionRepo.save(restriction);
        auditLogRepository.save(new AuditLog("ADD", "UserLlmRestriction", auditTarget(targetUserId, saved.getLlmModelAlias()), adminId));
        return saved;
    }

    @DeleteMapping("/llm-restrictions/{id}")
    @Transactional
    public void removeLlmRestriction(@PathVariable Long id, JwtAuthenticationToken auth) {
        UserLlmRestriction restriction = userLlmRestrictionRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Restriction not found"));
        targetPolicy.requireUserSettingsAccess(restriction.getUserKeycloakId().toString(), auth);
        UUID adminId = UUID.fromString(auth.getToken().getSubject());
        userLlmRestrictionRepo.deleteById(id);
        auditLogRepository.save(new AuditLog("DELETE", "UserLlmRestriction", auditTarget(restriction.getUserKeycloakId(), restriction.getLlmModelAlias()), adminId));
    }

    @GetMapping("/banned-words/user/{userKeycloakId}")
    public List<UserBannedWord> listUserBannedWords(@PathVariable UUID userKeycloakId, @AuthenticationPrincipal Jwt jwt) {
        return userBannedWordRepo.findByUserKeycloakId(userKeycloakId);
    }

    @PostMapping("/banned-words/user")
    @Transactional
    public UserBannedWord addUserBannedWord(@RequestBody Map<String, String> payload, JwtAuthenticationToken auth) {
        UUID targetUserId = UUID.fromString(payload.get("userId"));
        requireExistingUser(targetUserId);
        targetPolicy.requireUserSettingsAccess(targetUserId.toString(), auth);
        String word = payload.get("word").trim().toLowerCase();
        UUID adminId = UUID.fromString(auth.getToken().getSubject());
        UserBannedWord saved = userBannedWordRepo.save(new UserBannedWord(targetUserId, word, adminId));
        auditLogRepository.save(new AuditLog("ADD", "UserBannedWord", auditTarget(targetUserId, word), adminId));
        return saved;
    }

    @DeleteMapping("/banned-words/user/{id}")
    @Transactional
    public void removeUserBannedWord(@PathVariable Long id, JwtAuthenticationToken auth) {
        UserBannedWord bannedWord = userBannedWordRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Banned word not found"));
        targetPolicy.requireUserSettingsAccess(bannedWord.getUserKeycloakId().toString(), auth);
        UUID adminId = UUID.fromString(auth.getToken().getSubject());
        userBannedWordRepo.deleteById(id);
        auditLogRepository.save(new AuditLog("DELETE", "UserBannedWord", auditTarget(bannedWord.getUserKeycloakId(), bannedWord.getWord()), adminId));
    }

    private String auditTarget(UUID userId, String value) {
        return userId + " · " + value;
    }
    private void requireExistingUser(UUID userKeycloakId) {
        if (utilisateurRepository.findByExternalId(userKeycloakId.toString()).isEmpty()
                && !keycloakAdminClient.userExists(userKeycloakId.toString())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found: " + userKeycloakId);
        }
    }
}
