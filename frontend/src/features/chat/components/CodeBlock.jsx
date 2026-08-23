import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { CopyIcon } from '../../../components/common/icons'
import { detectCodeLanguage, formatLanguageName, hashText } from '../utils/markdown'
import SyntaxHighlighter from '../config/syntaxHighlighter'

export default function CodeBlock({ code, copiedKey, isStreaming, language, onCopy, setCopiedKey }) {
  const detectedLanguage = detectCodeLanguage(code, language)
  const copyKey = `code-${hashText(`${detectedLanguage}:${code}`)}`
  const isCopied = copiedKey === copyKey

  async function copyCode() {
    markCopied(copyKey, setCopiedKey)
    const success = await onCopy(code)
    if (!success) setCopiedKey((current) => (current === copyKey ? '' : current))
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{formatLanguageName(detectedLanguage)}</span>
        <button
          className={`code-copy-button ${isCopied ? 'is-copied' : ''}`}
          type="button"
          aria-label={isCopied ? 'Copié' : 'Copier le code'}
          title={isCopied ? 'Copié' : 'Copier le code'}
          onClick={copyCode}
        >
          {isCopied ? <span className="code-copy-label">Copié</span> : <CopyIcon tone="light" />}
        </button>
      </div>
      <SyntaxHighlighter
        CodeTag="code"
        PreTag="div"
        customStyle={{
          background: '#0b1020',
          margin: 0,
          padding: '15px 16px',
        }}
        language={detectedLanguage}
        lineNumberStyle={{
          color: 'rgba(203, 213, 225, 0.38)',
          paddingRight: '1em',
        }}
        lineProps={{ className: 'code-line' }}
        showLineNumbers={!isStreaming && code.split('\n').length > 15}
        style={oneDark}
        wrapLongLines={false}
        wrapLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

function markCopied(copyKey, setCopiedKey) {
  setCopiedKey(copyKey)
  window.setTimeout(() => setCopiedKey((current) => (current === copyKey ? '' : current)), 1500)
}
