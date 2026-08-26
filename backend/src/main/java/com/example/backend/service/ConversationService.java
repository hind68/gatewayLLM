package com.example.backend.service;

import com.example.backend.dto.ChangeConversationModelRequest;
import com.example.backend.dto.ConversationPageResponse;
import com.example.backend.dto.ConversationResponse;
import com.example.backend.dto.CreateConversationRequest;
import com.example.backend.dto.MessageResponse;
import com.example.backend.dto.SendMessageRequest;
import com.example.backend.dto.UpdateConversationRequest;
import com.example.backend.entity.Conversation;
import com.example.backend.entity.Message;
import com.example.backend.entity.ModeleLlm;
import com.example.backend.enums.RoleMessage;
import com.example.backend.enums.StatutConversation;
import com.example.backend.enums.StatutMessage;
import com.example.backend.enums.StatutModeleLlm;
import com.example.backend.exceptions.DlpAnalysisException;
import com.example.backend.exceptions.DlpBlockedException;
import com.example.backend.exceptions.DlpUnavailableException;
import com.example.backend.integration.dlp.DlpPublicMatch;
import com.example.backend.integration.litellm.LiteLlmMessage;
import com.example.backend.integration.litellm.LiteLlmService;
import com.example.backend.entity.Utilisateur;
import com.example.backend.repository.ConversationRepository;
import com.example.backend.repository.MessageRepository;
import com.example.backend.repository.ModeleLlmRepository;
import org.springframework.security.oauth2.jwt.Jwt;
import jakarta.validation.Valid;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
/**
 * Coordonne le cycle de vie du chat pour la passerelle de démonstration :
 * propriété des conversations, validation DLP, persistance des messages,
 * streaming LiteLLM et diffusion SSE.
 *
 * <p>Le service traite volontairement le DLP comme une barrière stricte avant
 * tout appel au modèle. Si la couche DLP bloque le contenu ou devient
 * indisponible, l'entrée utilisateur n'est pas envoyée à LiteLLM.</p>
 */
public class ConversationService {

    private static final Logger log = LoggerFactory.getLogger(ConversationService.class);
    private static final Set<RoleMessage> CONTEXT_ROLES = Set.of(RoleMessage.USER, RoleMessage.ASSISTANT);
    public static final int MAX_ATTACHMENTS_PER_MESSAGE = 10;
    public static final String MAX_ATTACHMENTS_MESSAGE = "Vous pouvez joindre jusqu'à 10 fichiers par message. Supprimez un fichier avant d'en ajouter un autre.";

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final ModeleLlmRepository modeleLlmRepository;
    private final CurrentUserService currentUserService;
    private final LiteLlmService liteLlmService;
    private final DlpService dlpService;
    private final MessagePersistenceService messagePersistenceService;
    private final ChatValidationService chatValidationService;
    private final AttachmentService attachmentService;
    private final ObjectMapper objectMapper;
    private final int maxContextMessages;
    private boolean legacyModelLookup;

    @Autowired
    public ConversationService(
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            ModeleLlmRepository modeleLlmRepository,
            CurrentUserService currentUserService,
            LiteLlmService liteLlmService,
            DlpService dlpService,
            MessagePersistenceService messagePersistenceService,
            ChatValidationService chatValidationService,
            AttachmentService attachmentService,
            ObjectMapper objectMapper,
            @Value("${gateway.context.max-messages:20}") int maxContextMessages
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.modeleLlmRepository = modeleLlmRepository;
        this.currentUserService = currentUserService;
        this.liteLlmService = liteLlmService;
        this.dlpService = dlpService;
        this.messagePersistenceService = messagePersistenceService;
        this.chatValidationService = chatValidationService;
        this.attachmentService = attachmentService;
        this.objectMapper = objectMapper;
        this.maxContextMessages = maxContextMessages;
        this.legacyModelLookup = false;
    }

    /** Backward-compatible constructor retained for existing unit tests and integrations. */
    public ConversationService(
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            ModeleLlmRepository modeleLlmRepository,
            CurrentUserService currentUserService,
            LiteLlmService liteLlmService,
            DlpService dlpService,
            MessagePersistenceService messagePersistenceService,
            ChatValidationService chatValidationService,
            int maxContextMessages
    ) {
        this(conversationRepository, messageRepository, modeleLlmRepository, currentUserService,
                liteLlmService, dlpService, messagePersistenceService, chatValidationService,
                null, new ObjectMapper(), maxContextMessages);
        this.legacyModelLookup = true;
    }

    @Transactional
    public ConversationResponse create(@Valid CreateConversationRequest request, Jwt jwt) {
        Utilisateur user = currentUserService.resolve(jwt);
        ModeleLlm model = activeModel(request.modelAlias());
        chatValidationService.validateLlmAccess(currentUserService.keycloakId(jwt), model.getAliasInterne(), currentUserService.roles(jwt));
        String title = normalizeTitle(request.title(), "Nouvelle conversation");
        Conversation conversation = conversationRepository.save(new Conversation(user, model, title));
        return toConversationResponse(conversation);
    }

    @Transactional(readOnly = true)
    public ConversationPageResponse list(String modelAlias, String search, boolean archived, int page, int size, Jwt jwt) {
        Utilisateur user = currentUserService.resolve(jwt);
        StatutConversation status = archived ? StatutConversation.ARCHIVEE : StatutConversation.ACTIVE;
        PageRequest pageRequest = PageRequest.of(
                Math.max(page, 0),
                Math.min(Math.max(size, 1), 50),
                Sort.by(Sort.Direction.DESC, "dernierMessageAt")
        );
        Page<ConversationResponse> result = conversationRepository.search(
                user,
                status,
                blankToNull(modelAlias),
                searchPattern(search),
                pageRequest
        ).map(this::toConversationResponse);
        return new ConversationPageResponse(
                result.getContent(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages()
        );
    }

    @Transactional(readOnly = true)
    public ConversationResponse get(Long id, Jwt jwt) {
        return toConversationResponse(ownedConversation(id, jwt));
    }

    @Transactional
    public ConversationResponse update(Long id, UpdateConversationRequest request, Jwt jwt) {
        Conversation conversation = ownedConversation(id, jwt);
        conversation.rename(normalizeTitle(request.title(), conversation.getTitre()));
        return toConversationResponse(conversation);
    }

    @Transactional
    public ConversationResponse changeModel(Long id, ChangeConversationModelRequest request, Jwt jwt) {
        Conversation conversation = ownedConversation(id, jwt);
        ModeleLlm model = activeModel(request.modelAlias());
        chatValidationService.validateLlmAccess(currentUserService.keycloakId(jwt), model.getAliasInterne(), currentUserService.roles(jwt));
        conversation.changeModel(model);
        return toConversationResponse(conversation);
    }

    @Transactional
    public void archive(Long id, Jwt jwt) {
        ownedConversation(id, jwt).archive();
    }

    @Transactional
    public ConversationResponse restore(Long id, Jwt jwt) {
        Conversation conversation = ownedConversation(id, jwt);
        conversation.restore();
        return toConversationResponse(conversation);
    }

    @Transactional
    public void deletePermanent(Long id, Jwt jwt) {
        Conversation conversation = ownedConversation(id, jwt);
        Long conversationId = id;
        Utilisateur user = conversation.getUtilisateur();
        if (attachmentService != null) {
            attachmentService.deleteFilesForConversation(conversation);
        }
        messageRepository.clearResponseLinksByConversationId(conversationId);
        messageRepository.deleteAllByConversationId(conversationId);
        messageRepository.flush();
        int deleted = conversationRepository.deleteOwnedById(conversationId, user);
        if (deleted == 0) {
            throw new ResponseStatusException(NOT_FOUND, "Conversation not found");
        }
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> messages(Long conversationId, Jwt jwt) {
        Conversation conversation = ownedConversation(conversationId, jwt);
        return messageRepository.findByConversationOrderByOrdreAsc(conversation)
                .stream().map(this::toMessageResponse).toList();
    }

    @Transactional
    /**
     * Prépare une paire de messages utilisateur/assistant pour le streaming.
     *
     * <p>Cette méthode persiste d'abord le message utilisateur sécurisé, crée
     * un message assistant en cours, puis retourne le contexte exact qui peut
     * être envoyé à LiteLLM. Le contenu sensible est soit masqué par le DLP,
     * soit bloqué avant la fin de cette préparation.</p>
     */
    public StreamPreparation prepareStream(Long conversationId, SendMessageRequest request, Jwt jwt) {
        String content = request.content() == null ? "" : request.content().trim();
        if (content.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "Message content must not be blank");
        }

        UUID userId = currentUserService.keycloakId(jwt);

        Conversation conversation = ownedConversation(conversationId, jwt);
        if (conversation.getStatut() != StatutConversation.ACTIVE) {
            throw new ResponseStatusException(BAD_REQUEST, "Conversation is archived");
        }

        ModeleLlm generationModel = conversation.getModele();
        List<String> roles = currentUserService.roles(jwt);
        chatValidationService.validateLlmAccess(userId, generationModel.getAliasInterne(), roles);
        List<String> bannedWords = chatValidationService.getBannedWords(userId, roles);

        String safeContent = dlpService.safeUserMessage(content, userId, userId.toString(), bannedWords);
        int nextOrder = messageRepository.findMaxOrdre(conversation) + 1;
        Message userMessage = messageRepository.save(new Message(
                conversation,
                RoleMessage.USER,
                nextOrder,
                StatutMessage.TERMINE,
                content,
                null
        ));

        if ("Nouvelle conversation".equals(conversation.getTitre())) {
            conversation.rename(titleFrom(content));
        }

        Message assistantMessage = messageRepository.save(new Message(
                conversation,
                RoleMessage.ASSISTANT,
                nextOrder + 1,
                StatutMessage.EN_COURS,
                "",
                userMessage,
                generationModel
        ));
        conversation.touchLastMessageAt(Instant.now());

        List<LiteLlmMessage> context = buildContext(conversation, userMessage, safeContent, bannedWords);
        return new StreamPreparation(
                generationModel.getAliasInterne(),
                assistantMessage.getId(),
                toMessageResponse(userMessage),
                toMessageResponse(assistantMessage),
                context
        );
    }

    @Transactional
    /**
     * Diffuse une réponse au frontend via SSE et persiste l'état final de
     * l'assistant séparément lorsque LiteLLM termine ou échoue.
     */
    public SseEmitter streamMessage(Long conversationId, SendMessageRequest request, Jwt jwt) {
        SseEmitter emitter = new SseEmitter(0L);
        StreamPreparation preparation;
        try {
            preparation = prepareStream(conversationId, request, jwt);
        } catch (DlpAnalysisException exception) {
            if (exception instanceof DlpBlockedException blockedException) {
                try {
                    MessageResponse blockedMessage = persistBlockedText(conversationId, request.content(), blockedException, jwt);
                    trySend(emitter, "message", blockedMessage);
                    trySend(emitter, "error", streamError(blockedException, blockedMessage));
                } catch (RuntimeException persistenceException) {
                    trySend(emitter, "error", streamError(exception));
                }
            } else {
                trySend(emitter, "error", streamError(exception));
            }
            emitter.complete();
            return emitter;
        }

        StringBuilder answer = new StringBuilder();

        trySend(emitter, "message", preparation.userMessage());
        trySend(emitter, "message", preparation.assistantMessage());

        liteLlmService.streamChat(
                preparation.modelAlias(),
                preparation.context(),
                token -> {
                    answer.append(token);
                    trySend(emitter, "token", token);
                },
                () -> {
                    // Le callback de stream s'exécute après le retour de cette
                    // méthode, donc la persistance a sa propre transaction. Un
                    // échec de persistance ne doit jamais empêcher l'émetteur
                    // SSE de se terminer, sinon le client reste bloqué (pas de
                    // timeout sur cet émetteur).
                    try {
                        messagePersistenceService.completeAssistantMessage(preparation.assistantMessageId(), answer.toString());
                    } catch (RuntimeException persistenceError) {
                        log.warn("Failed to persist completed assistant message {}", preparation.assistantMessageId(), persistenceError);
                    }
                    trySend(emitter, "done", new StreamDoneResponse(preparation.assistantMessageId(), answer.toString()));
                    emitter.complete();
                },
                error -> {
                    String fallback = answer.isEmpty() ? "Erreur pendant le streaming LiteLLM." : answer.toString();
                    try {
                        messagePersistenceService.failAssistantMessage(preparation.assistantMessageId(), fallback);
                    } catch (RuntimeException persistenceError) {
                        log.warn("Failed to persist failed assistant message {}", preparation.assistantMessageId(), persistenceError);
                    }
                    trySend(emitter, "error", "Erreur pendant le streaming LiteLLM.");
                    emitter.complete();
                }
        );

        return emitter;
    }

    @Transactional
    public SseEmitter streamMessageWithFiles(Long conversationId, String content, List<MultipartFile> files, Jwt jwt) {
        SseEmitter emitter = new SseEmitter(0L);
        List<MultipartFile> safeFiles = files == null ? List.of() : files.stream()
                .filter(file -> file != null && !file.isEmpty())
                .toList();
        if (safeFiles.size() > MAX_ATTACHMENTS_PER_MESSAGE) {
            throw new AttachmentLimitExceededException(MAX_ATTACHMENTS_PER_MESSAGE, safeFiles.size());
        }
        try {
            Conversation conversation = ownedConversation(conversationId, jwt);
            UUID userId = currentUserService.keycloakId(jwt);
            List<String> roles = currentUserService.roles(jwt);
            chatValidationService.validateLlmAccess(userId, conversation.getModele().getAliasInterne(), roles);
            List<String> bannedWords = chatValidationService.getBannedWords(userId, roles);
            DlpSafeMessage safeMessage = dlpService.safeMessageForLlm(content, safeFiles, userId, userId.toString(), bannedWords);
            StreamPreparation preparation = prepareStreamWithSafeContent(conversationId, content, safeMessage, bannedWords, jwt);
            Message userMessage = messageRepository.findById(preparation.userMessage().id()).orElseThrow();
            List<AttachmentMetadata> attachments = attachmentService.store(userMessage, safeFiles, safeMessage.attachments());
            userMessage.setAttachmentMetadataJson(serializeAttachmentMetadata(attachments));
            MessageResponse userResponse = withAttachments(preparation.userMessage(), attachments);
            trySend(emitter, "message", userResponse);
            trySend(emitter, "message", preparation.assistantMessage());
            streamPrepared(emitter, preparation);
        } catch (DlpBlockedException exception) {
            try {
                BlockedUploadResult blocked = persistBlockedUpload(conversationId, content, safeFiles, exception, jwt);
                trySend(emitter, "error", streamError(exception, blocked));
            } catch (RuntimeException persistenceException) {
                trySend(emitter, "error", streamError(exception));
            }
            emitter.complete();
        } catch (DlpAnalysisException exception) {
            trySend(emitter, "error", streamError(exception));
            emitter.complete();
        } catch (RuntimeException exception) {
            trySend(emitter, "error", exception.getMessage() == null ? "File processing failed" : exception.getMessage());
            emitter.complete();
        }
        return emitter;
    }

    private BlockedUploadResult persistBlockedUpload(Long conversationId, String content, List<MultipartFile> files, DlpBlockedException exception, Jwt jwt) {
        Conversation conversation = ownedConversation(conversationId, jwt);
        if (conversation.getStatut() != StatutConversation.ACTIVE) throw new ResponseStatusException(BAD_REQUEST, "Conversation is archived");
        String persistedContent = content == null || content.isBlank() ? "Pieces jointes bloquees par le controle DLP" : content.trim();
        int nextOrder = messageRepository.findMaxOrdre(conversation) + 1;
        Message userMessage = messageRepository.save(new Message(conversation, RoleMessage.USER, nextOrder, StatutMessage.DLP_BLOCKED, persistedContent, null));
        userMessage.blockByDlp(exception.getHighestSeverity(), serializeDetectedTypes(exception.getDetectedTypes()), serializeDlpMatches(exception.getMatches()), exception.getMaskedText());
        if ("Nouvelle conversation".equals(conversation.getTitre())) conversation.rename(titleFrom(persistedContent));
        conversation.touchLastMessageAt(Instant.now());
        List<AttachmentMetadata> metadata = attachmentService.store(userMessage, files, exception.getAttachments());
        userMessage.setAttachmentMetadataJson(serializeAttachmentMetadata(metadata));
        List<DlpPublicMatch> matches = enrichMatchesWithAttachmentIds(exception.getMatches(), metadata);
        return new BlockedUploadResult(withBlockedDlp(toMessageResponse(userMessage), matches, metadata), matches, blockedAttachments(exception.getAttachments(), metadata));
    }

    @Transactional
    private MessageResponse persistBlockedText(Long conversationId, String content, DlpBlockedException exception, Jwt jwt) {
        Conversation conversation = ownedConversation(conversationId, jwt);
        if (conversation.getStatut() != StatutConversation.ACTIVE) {
            throw new ResponseStatusException(BAD_REQUEST, "Conversation is archived");
        }
        String persistedContent = content == null ? "" : content.trim();
        int nextOrder = messageRepository.findMaxOrdre(conversation) + 1;
        Message userMessage = messageRepository.save(new Message(
                conversation,
                RoleMessage.USER,
                nextOrder,
                StatutMessage.DLP_BLOCKED,
                persistedContent,
                null
        ));
        userMessage.blockByDlp(
                exception.getHighestSeverity(),
                serializeDetectedTypes(exception.getDetectedTypes()),
                serializeDlpMatches(exception.getMatches()),
                exception.getMaskedText()
        );
        if ("Nouvelle conversation".equals(conversation.getTitre())) {
            conversation.rename(titleFrom(persistedContent));
        }
        conversation.touchLastMessageAt(Instant.now());
        return withBlockedDlp(toMessageResponse(userMessage), exception.getMatches(), List.of());
    }

    @Transactional
    private StreamPreparation prepareStreamWithSafeContent(
            Long conversationId,
            String originalContent,
            DlpSafeMessage safeMessage,
            List<String> bannedWords,
            Jwt jwt
    ) {
        Conversation conversation = ownedConversation(conversationId, jwt);
        if (conversation.getStatut() != StatutConversation.ACTIVE) throw new ResponseStatusException(BAD_REQUEST, "Conversation is archived");
        ModeleLlm generationModel = conversation.getModele();
        String persistedContent = originalContent == null || originalContent.isBlank() ? safeMessage.persistedContent() : originalContent.trim();
        int nextOrder = messageRepository.findMaxOrdre(conversation) + 1;
        Message userMessage = messageRepository.save(new Message(conversation, RoleMessage.USER, nextOrder, StatutMessage.TERMINE, persistedContent, null));
        if ("Nouvelle conversation".equals(conversation.getTitre())) conversation.rename(titleFrom(persistedContent));
        Message assistantMessage = messageRepository.save(new Message(conversation, RoleMessage.ASSISTANT, nextOrder + 1, StatutMessage.EN_COURS, "", userMessage, generationModel));
        conversation.touchLastMessageAt(Instant.now());
        List<LiteLlmMessage> context = buildContext(conversation, userMessage, safeMessage.safePrompt(), bannedWords);
        return new StreamPreparation(generationModel.getAliasInterne(), assistantMessage.getId(), toMessageResponse(userMessage), toMessageResponse(assistantMessage), context);
    }

    private void streamPrepared(SseEmitter emitter, StreamPreparation preparation) {
        StringBuilder answer = new StringBuilder();
        liteLlmService.streamChat(preparation.modelAlias(), preparation.context(), token -> {
            answer.append(token);
            trySend(emitter, "token", token);
        }, () -> {
            try {
                messagePersistenceService.completeAssistantMessage(preparation.assistantMessageId(), answer.toString());
            } catch (RuntimeException persistenceError) {
                log.warn("Failed to persist completed assistant message {}", preparation.assistantMessageId(), persistenceError);
            }
            trySend(emitter, "done", new StreamDoneResponse(preparation.assistantMessageId(), answer.toString()));
            emitter.complete();
        }, error -> {
            String fallback = answer.isEmpty() ? "Erreur pendant le streaming LiteLLM." : answer.toString();
            try {
                messagePersistenceService.failAssistantMessage(preparation.assistantMessageId(), fallback);
            } catch (RuntimeException persistenceError) {
                log.warn("Failed to persist failed assistant message {}", preparation.assistantMessageId(), persistenceError);
            }
            trySend(emitter, "error", "Erreur pendant le streaming LiteLLM.");
            emitter.complete();
        });
    }

    private MessageResponse withAttachments(MessageResponse message, List<AttachmentMetadata> attachments) {
        return new MessageResponse(message.id(), message.role(), message.order(), message.status(), message.content(),
                message.responseToMessageId(), message.modelAlias(), message.modelDisplayName(), message.dlpHighestSeverity(),
                message.dlpDetectedTypes(), message.dlpMatches(), message.dlpMaskedText(), attachments,
                message.createdAt(), message.updatedAt());
    }

    private MessageResponse withBlockedDlp(MessageResponse message, List<DlpPublicMatch> matches, List<AttachmentMetadata> attachments) {
        List<String> detectedTypes = matches == null ? List.of() : matches.stream()
                .map(DlpPublicMatch::type)
                .filter(type -> type != null && !type.isBlank())
                .distinct()
                .toList();
        return new MessageResponse(message.id(), message.role(), message.order(), message.status(), message.content(),
                message.responseToMessageId(), message.modelAlias(), message.modelDisplayName(), message.dlpHighestSeverity(),
                detectedTypes, matches == null ? List.of() : matches, message.dlpMaskedText(), attachments,
                message.createdAt(), message.updatedAt());
    }

    private String serializeAttachmentMetadata(List<AttachmentMetadata> attachments) {
        return serializeAttachments(attachments);
    }

    private List<DlpPublicMatch> enrichMatchesWithAttachmentIds(List<DlpPublicMatch> matches, List<AttachmentMetadata> attachments) {
        if (matches == null || matches.isEmpty()) {
            return List.of();
        }
        return matches.stream()
                .map(match -> new DlpPublicMatch(
                        attachmentIdForSource(match, attachments),
                        match.source(),
                        match.id(),
                        match.type(),
                        match.start(),
                        match.end(),
                        match.lineNumber(),
                        match.severity(),
                        match.placeholder()
                ))
                .toList();
    }

    private Long attachmentIdForSource(DlpPublicMatch match, List<AttachmentMetadata> attachments) {
        if (match == null || attachments == null || attachments.isEmpty() || match.source() == null || "message".equals(match.source())) {
            return null;
        }
        return attachments.stream()
                .filter(attachment -> attachment.filename().equals(match.source()))
                .map(AttachmentMetadata::id)
                .findFirst()
                .orElse(null);
    }

    private List<BlockedAttachmentResponse> blockedAttachments(List<DlpAttachmentAnalysis> analyses, List<AttachmentMetadata> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return List.of();
        }
        List<BlockedAttachmentResponse> values = new ArrayList<>();
        for (AttachmentMetadata item : metadata) {
            DlpAttachmentAnalysis analysis = analyses == null ? null : analyses.stream()
                    .filter(candidate -> candidate.filename().equals(item.filename()))
                    .findFirst()
                    .orElse(null);
            List<DlpPublicMatch> matches = analysis == null || analysis.matches() == null ? List.of() : analysis.matches().stream()
                    .map(match -> new DlpPublicMatch(item.id(), item.filename(), match.id(), match.type(), match.start(), match.end(), match.lineNumber(), match.severity(), match.placeholder()))
                    .toList();
            values.add(new BlockedAttachmentResponse(
                    item.id(),
                    item.filename(),
                    item.mimeType(),
                    item.size(),
                    item.decision(),
                    item.safeCharacters(),
                    item.estimatedTokens(),
                    item.extractionStatus(),
                    analysis == null ? "" : analysis.extractedText(),
                    analysis == null ? "" : analysis.maskedText(),
                    matches
            ));
        }
        return values;
    }

    @Transactional(readOnly = true)
    public SseEmitter streamSecureAttachment(Long conversationId, Long attachmentId, Jwt jwt) {
        SseEmitter emitter = new SseEmitter(0L);
        try {
            String maskedText = attachmentService.maskedTextForConversationAttachment(attachmentId, conversationId, jwt);
            if (maskedText == null || maskedText.isBlank()) {
                throw new ResponseStatusException(BAD_REQUEST, "Secure attachment content is empty");
            }
            trySend(emitter, "token", maskedText);
            trySend(emitter, "done", maskedText);
        } catch (RuntimeException exception) {
            trySend(emitter, "error", exception.getMessage());
        }
        emitter.complete();
        return emitter;
    }

    private List<LiteLlmMessage> buildContext(Conversation conversation, Message safeMessage, String safeContent, List<String> bannedWords) {
        List<Message> finishedMessages = messageRepository.findByConversationAndStatutAndRoleInOrderByOrdreAsc(
                conversation,
                StatutMessage.TERMINE,
                CONTEXT_ROLES
        );
        int fromIndex = Math.max(0, finishedMessages.size() - maxContextMessages);
        List<LiteLlmMessage> context = new ArrayList<>();
        for (Message message : finishedMessages.subList(fromIndex, finishedMessages.size())) {
            String content = safeContextContent(message, safeMessage, safeContent, bannedWords);
            context.add(new LiteLlmMessage(message.getRole().name().toLowerCase(), content));
        }
        return context;
    }

    private String safeContextContent(Message message, Message currentUserMessage, String currentSafeContent, List<String> bannedWords) {
        if (isSameMessage(message, currentUserMessage)) {
            return currentSafeContent;
        }
        // Repasser l'historique stocké par le DLP avant de construire le
        // contexte empêche les anciens contenus de contourner la politique.
        return dlpService.safeTextForLlm(
                message.getContenu(),
                message.getConversation().getUtilisateur().getExternalId(),
                bannedWords
        );
    }

    private boolean isSameMessage(Message candidate, Message reference) {
        if (candidate == reference) {
            return true;
        }
        return candidate.getId() != null && candidate.getId().equals(reference.getId());
    }

    private Conversation ownedConversation(Long id, Jwt jwt) {
        return conversationRepository.findOwnedById(id, currentUserService.resolve(jwt))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Conversation not found"));
    }

    private ModeleLlm activeModel(String modelAlias) {
        if (legacyModelLookup) {
            return modeleLlmRepository.findByAliasInterneAndStatut(modelAlias, StatutModeleLlm.ACTIF)
                    .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "Unknown or inactive model: " + modelAlias));
        }
        return modeleLlmRepository.findByAliasInterneAndStatutAndFournisseur_Statut(modelAlias, StatutModeleLlm.ACTIF, com.example.backend.enums.StatutFournisseurLlm.ACTIF)
                .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "Unknown or inactive model: " + modelAlias));
    }

    private ConversationResponse toConversationResponse(Conversation conversation) {
        return new ConversationResponse(
                conversation.getId(),
                conversation.getTitre(),
                conversation.getModele().getAliasInterne(),
                conversation.getModele().getNomAffichage(),
                conversation.getStatut().name(),
                conversation.getCreatedAt(),
                conversation.getUpdatedAt(),
                conversation.getDernierMessageAt()
        );
    }

    private MessageResponse toMessageResponse(Message message) {
        Long responseToId = message.getReponseA() == null ? null : message.getReponseA().getId();
        String modelAlias = message.getModele() == null ? null : message.getModele().getAliasInterne();
        String modelDisplayName = message.getModele() == null ? null : message.getModele().getNomAffichage();
        return new MessageResponse(
                message.getId(),
                message.getRole().name(),
                message.getOrdre(),
                message.getStatut().name(),
                message.getContenu(),
                responseToId,
                modelAlias,
                modelDisplayName,
                message.getDlpHighestSeverity(),
                parseDetectedTypes(message.getDlpDetectedTypes()),
                parseDlpMatches(message.getDlpMatches()),
                message.getDlpMaskedText(),
                parseAttachments(message.getAttachmentMetadataJson()),
                message.getCreatedAt(),
                message.getUpdatedAt()
        );
    }

    private String serializeDetectedTypes(Set<String> detectedTypes) {
        if (detectedTypes == null || detectedTypes.isEmpty()) {
            return "";
        }
        return detectedTypes.stream()
                .filter(type -> type != null && !type.isBlank())
                .sorted(Comparator.naturalOrder())
                .collect(Collectors.joining(","));
    }

    private List<String> parseDetectedTypes(String detectedTypes) {
        if (detectedTypes == null || detectedTypes.isBlank()) {
            return List.of();
        }
        return Arrays.stream(detectedTypes.split(","))
                .map(String::trim)
                .filter(type -> !type.isBlank())
                .toList();
    }

    private String serializeDlpMatches(List<DlpPublicMatch> matches) {
        if (matches == null || matches.isEmpty()) {
            return "";
        }
        return matches.stream()
                .map(match -> valueOrEmptyLong(match.attachmentId()) + "\t"
                        + encodeMatchField(match.source()) + "\t"
                        + encodeMatchField(match.id()) + "\t"
                        + encodeMatchField(match.type()) + "\t"
                        + valueOrEmpty(match.start()) + "\t"
                        + valueOrEmpty(match.end()) + "\t"
                        + valueOrEmpty(match.lineNumber()) + "\t"
                        + encodeMatchField(match.severity()) + "\t"
                        + encodeMatchField(match.placeholder()))
                .collect(Collectors.joining("\n"));
    }

    private static final TypeReference<List<AttachmentMetadata>> ATTACHMENT_METADATA_LIST_TYPE = new TypeReference<>() {
    };

    private String serializeAttachments(List<AttachmentMetadata> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return "";
        }
        return objectMapper.writeValueAsString(attachments);
    }

    private List<AttachmentMetadata> parseAttachments(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        if (!value.stripLeading().startsWith("[")) {
            return Arrays.stream(value.split("\\R"))
                    .map(this::parseLegacyAttachment)
                    .filter(attachment -> attachment != null)
                    .toList();
        }
        try {
            return objectMapper.readValue(value, ATTACHMENT_METADATA_LIST_TYPE);
        } catch (JacksonException exception) {
            log.warn("Unable to parse stored attachment metadata; returning empty list", exception);
            return List.of();
        }
    }

    private AttachmentMetadata parseLegacyAttachment(String line) {
        String[] parts = line.split("\\t", -1);
        if (parts.length == 7) {
            return new AttachmentMetadata(
                    null,
                    parts[0],
                    parts[1],
                    parseLong(parts[2]),
                    parts[3],
                    parseInteger(parts[4]) == null ? 0 : parseInteger(parts[4]),
                    parseInteger(parts[5]) == null ? 0 : parseInteger(parts[5]),
                    parts[6]
            );
        }
        if (parts.length != 8) {
            return null;
        }
        return new AttachmentMetadata(
                parseLongObject(parts[0]),
                parts[1],
                parts[2],
                parseLong(parts[3]),
                parts[4],
                parseInteger(parts[5]) == null ? 0 : parseInteger(parts[5]),
                parseInteger(parts[6]) == null ? 0 : parseInteger(parts[6]),
                parts[7]
        );
    }

    private List<DlpPublicMatch> parseDlpMatches(String matches) {
        if (matches == null || matches.isBlank()) {
            return List.of();
        }
        return Arrays.stream(matches.split("\\R"))
                .map(this::parseDlpMatch)
                .filter(match -> match != null)
                .toList();
    }

    private DlpPublicMatch parseDlpMatch(String line) {
        if (line.indexOf('\t') < 0 && line.indexOf('|') >= 0) {
            String[] legacy = line.split("\\|", -1);
            if (legacy.length == 6) {
                return new DlpPublicMatch(
                        null,
                        legacy[0],
                        legacy[1],
                        legacy[2],
                        parseInteger(legacy[3]),
                        parseInteger(legacy[4]),
                        null,
                        legacy[5],
                        null
                );
            }
        }
        String[] parts = line.split("\\t", -1);
        if (parts.length == 5) {
            return new DlpPublicMatch(
                    null,
                    null,
                    null,
                    decodeMatchField(parts[0]),
                    parseInteger(parts[1]),
                    parseInteger(parts[2]),
                    parseInteger(parts[3]),
                    null,
                    decodeMatchField(parts[4])
            );
        }
        if (parts.length == 7) {
            return new DlpPublicMatch(
                    parseLongObject(parts[0]),
                    decodeMatchField(parts[1]),
                    null,
                    decodeMatchField(parts[2]),
                    parseInteger(parts[3]),
                    parseInteger(parts[4]),
                    parseInteger(parts[5]),
                    null,
                    decodeMatchField(parts[6])
            );
        }
        if (parts.length == 8) {
            return new DlpPublicMatch(
                    parseLongObject(parts[0]),
                    decodeMatchField(parts[1]),
                    null,
                    decodeMatchField(parts[2]),
                    parseInteger(parts[3]),
                    parseInteger(parts[4]),
                    parseInteger(parts[5]),
                    decodeMatchField(parts[6]),
                    decodeMatchField(parts[7])
            );
        }
        if (parts.length != 9) {
            return null;
        }
        return new DlpPublicMatch(
                parseLongObject(parts[0]),
                decodeMatchField(parts[1]),
                decodeMatchField(parts[2]),
                decodeMatchField(parts[3]),
                parseInteger(parts[4]),
                parseInteger(parts[5]),
                parseInteger(parts[6]),
                decodeMatchField(parts[7]),
                decodeMatchField(parts[8])
        );
    }

    private String encodeMatchField(String value) {
        // Les métadonnées DLP restent dans des colonnes texte pour rester
        // compatibles avec les migrations existantes ; l'échappement évite que
        // les tabulations et retours ligne cassent le parsing.
        return value == null ? "" : value.replace("%", "%25").replace("\t", "%09").replace("\n", "%0A").replace("\r", "%0D");
    }

    private String decodeMatchField(String value) {
        return value.replace("%0D", "\r").replace("%0A", "\n").replace("%09", "\t").replace("%25", "%");
    }

    private String valueOrEmpty(Integer value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String valueOrEmptyLong(Long value) {
        return value == null ? "" : String.valueOf(value);
    }

    private Integer parseInteger(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Integer.valueOf(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return 0L;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return 0L;
        }
    }

    private Long parseLongObject(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private void trySend(SseEmitter emitter, String event, Object value) {
        try {
            emitter.send(SseEmitter.event().name(event).data(value));
        } catch (IOException ignored) {
            // Les déconnexions navigateur sont normales en SSE ; terminer
            // l'emitter suffit car le callback LiteLLM gère la persistance.
            emitter.complete();
        }
    }

    private StreamErrorResponse streamError(DlpAnalysisException exception) {
        if (exception instanceof DlpBlockedException blockedException) {
            return new StreamErrorResponse(
                    "DLP_BLOCKED",
                    "Votre message contient une donnée sensible et ne peut pas être envoyé.",
                    blockedException.getDetectedTypes(),
                    blockedException.getHighestSeverity()
            );
        }
        if (exception instanceof DlpUnavailableException) {
            return new StreamErrorResponse(
                    "DLP_UNAVAILABLE",
                    exception.getMessage(),
                    Set.of(),
                    null
            );
        }
        return new StreamErrorResponse(
                "DLP_ERROR",
                "Le controle de securite n'a pas pu analyser le message. Le message n'a pas ete envoye au modele.",
                Set.of(),
                null
        );
    }

    private StreamErrorResponse streamError(DlpBlockedException blockedException, BlockedUploadResult blockedUpload) {
        List<DlpPublicMatch> matches = blockedUpload == null ? blockedException.getMatches() : blockedUpload.matches();
        List<BlockedAttachmentResponse> attachments = blockedUpload == null ? blockedAttachments(blockedException.getAttachments(), List.of()) : blockedUpload.attachments();
        return new StreamErrorResponse(
                "DLP_BLOCKED",
                "Votre message contient une donnee sensible et ne peut pas etre envoye.",
                blockedException.getDetectedTypes(),
                blockedException.getHighestSeverity(),
                blockedException.getMaskedText(),
                matches,
                attachments,
                blockedUpload == null ? null : blockedUpload.message()
        );
    }

    private StreamErrorResponse streamError(DlpBlockedException blockedException, MessageResponse blockedMessage) {
        return new StreamErrorResponse(
                "DLP_BLOCKED",
                "Votre message contient une donnée sensible et ne peut pas être envoyé.",
                blockedException.getDetectedTypes(),
                blockedException.getHighestSeverity(),
                blockedException.getMaskedText(),
                blockedException.getMatches(),
                List.of(),
                blockedMessage
        );
    }

    private String normalizeTitle(String title, String fallback) {
        String value = title == null || title.isBlank() ? fallback : title.trim();
        return value.length() > 160 ? value.substring(0, 160) : value;
    }

    private String titleFrom(String content) {
        String compact = content.replaceAll("\\s+", " ").trim();
        String[] words = compact.split("\\s+");
        List<String> meaningfulWords = new ArrayList<>();
        for (String word : words) {
            String cleaned = word.replaceAll("[^\\p{L}\\p{N}]", "");
            if (cleaned.length() >= 4) {
                meaningfulWords.add(cleaned);
            }
            if (meaningfulWords.size() == 6) {
                break;
            }
        }
        if (!meaningfulWords.isEmpty()) {
            return "Discussion: " + String.join(" ", meaningfulWords);
        }
        if (compact.length() <= 48) {
            return "Discussion: " + compact;
        }
        return "Discussion: " + compact.substring(0, 45) + "...";
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String searchPattern(String value) {
        String normalized = blankToNull(value);
        return normalized == null ? null : "%" + normalized.toLowerCase() + "%";
    }

    private String valueOrEmpty(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    public record StreamPreparation(
            String modelAlias,
            Long assistantMessageId,
            MessageResponse userMessage,
            MessageResponse assistantMessage,
            List<LiteLlmMessage> context
    ) {
    }

    public record StreamDoneResponse(
            Long messageId,
            String content
    ) {
    }

    public record StreamErrorResponse(
            String code,
            String message,
            Set<String> detectedTypes,
            String highestSeverity,
            String maskedText,
            List<DlpPublicMatch> matches,
            List<BlockedAttachmentResponse> attachments,
            MessageResponse blockedMessage
    ) {
        public StreamErrorResponse(String code, String message, Set<String> detectedTypes, String highestSeverity) {
            this(code, message, detectedTypes, highestSeverity, null, List.of(), List.of(), null);
        }
    }

    public record BlockedUploadResult(
            MessageResponse message,
            List<DlpPublicMatch> matches,
            List<BlockedAttachmentResponse> attachments
    ) {
    }

    public record BlockedAttachmentResponse(
            Long id,
            String filename,
            String mimeType,
            long size,
            String decision,
            int safeCharacters,
            int estimatedTokens,
            String extractionStatus,
            String extractedText,
            String maskedText,
            List<DlpPublicMatch> matches
    ) {
    }
}
