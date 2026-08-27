import { useEffect, useState } from 'react'
import { fetchConversations } from '../../../api/conversationsApi'
import ModelFilterDropdown from '../../models/components/ModelFilterDropdown'
import ArchiveTabs from './ArchiveTabs'
import { cleanModelName, displayConversationTitle } from '../../../utils/modelMetadata'

export default function SearchModal({
  inputRef,
  models,
  onClose,
  openConversation,
}) {
  const [search, setSearch] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [searchConversations, setSearchConversations] = useState([])
  const [isLoadingResults, setIsLoadingResults] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setIsLoadingResults(true)
      setLoadError('')
    })

    fetchConversations({ modelFilter, search, showArchived })
      .then((data) => {
        if (cancelled) return
        const content = Array.isArray(data)
          ? data
          : Array.isArray(data?.content)
            ? data.content
            : []
        setSearchConversations(content)
      })
      .catch(() => {
        if (!cancelled) {
          setSearchConversations([])
          setLoadError('Impossible de charger les conversations.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingResults(false)
      })

    return () => {
      cancelled = true
    }
  }, [modelFilter, search, showArchived])

  return (
    <div className="modal-overlay search-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="search-modal-header">
          <h2 id="search-modal-title">Rechercher</h2>
          <button type="button" aria-label="Fermer la recherche" onClick={onClose}>
            <span className="close-icon" aria-hidden="true"></span>
          </button>
        </div>
        <input
          ref={inputRef}
          className="search-modal-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault()
          }}
          placeholder="Rechercher une conversation"
        />
        <div className="search-modal-filters">
          <ArchiveTabs showArchived={showArchived} setShowArchived={setShowArchived} />
          <ModelFilterDropdown modelFilter={modelFilter} models={models} setModelFilter={setModelFilter} />
        </div>
        <div className="search-results" role="listbox" aria-label="Résultats de recherche">
          {isLoadingResults && <div className="search-result-empty">Recherche...</div>}
          {!isLoadingResults && loadError && (
            <div className="search-result-empty">{loadError}</div>
          )}
          {!isLoadingResults && !loadError && searchConversations.length === 0 && (
            <div className="search-result-empty">Aucune conversation trouvée</div>
          )}
          {!isLoadingResults && !loadError && searchConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className="search-result-row"
              role="option"
              onClick={async () => {
                await openConversation(conversation)
                onClose()
              }}
            >
              <span>{displayConversationTitle(conversation.title)}</span>
              <small>{cleanModelName(conversation.modelDisplayName, conversation.modelAlias)}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
