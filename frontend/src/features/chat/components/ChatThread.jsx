import { DownArrowIcon } from '../../../components/common/icons'
import ChatMessage from './ChatMessage'

export default function ChatThread({
  activeModelName,
  activeModelAlias,
  bottomRef,
  copiedKey,
  goToBottom,
  hasActiveMessages,
  isComposerTransitioning,
  isGenerating,
  isLastBlockVisible,
  messages,
  messagesRef,
  onCopy,
  onInspectDocument,
  onMessagesScroll,
  setCopiedKey,
  welcomeComposer,
}) {
  return (
    <>
      <section
        className="messages"
        ref={messagesRef}
        onScroll={onMessagesScroll}
        aria-live="polite"
      >
        {(!hasActiveMessages || isComposerTransitioning) && (
          <div className={`welcome-stack ${hasActiveMessages ? 'leaving' : ''}`}>
            <div className="empty-state">
              <h2>Comment puis-je vous aider ?</h2>
            </div>
            {!hasActiveMessages && welcomeComposer}
          </div>
        )}

        {messages.map((item) => (
          <ChatMessage
            copiedKey={copiedKey}
            fallbackModelAlias={activeModelAlias}
            fallbackModelName={activeModelName || activeModelAlias}
            key={item.id}
            message={item}
            onCopy={onCopy}
            onInspectDocument={onInspectDocument}
            setCopiedKey={setCopiedKey}
          />
        ))}
        <div ref={bottomRef} className="bottom-anchor" />
      </section>

      {hasActiveMessages && (
        <button
          className={`go-bottom-button ${isLastBlockVisible ? '' : 'is-visible'} ${isGenerating ? 'is-generating' : ''}`}
          type="button"
          aria-label="Défiler vers le bas"
          aria-hidden={isLastBlockVisible}
          tabIndex={isLastBlockVisible ? -1 : 0}
          onClick={goToBottom}
        >
          {isGenerating ? (
            <span className="go-bottom-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          ) : (
            <DownArrowIcon />
          )}
        </button>
      )}
    </>
  )
}
