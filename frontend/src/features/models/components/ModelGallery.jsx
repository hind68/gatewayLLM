import ModelCard from './ModelCard'

const SKELETON_COUNT = 8

export default function ModelGallery({ disabled, isLoading, models, onClose, onSelect }) {
  return (
    <div className="modal-overlay model-gallery-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="model-gallery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-gallery-title"
        data-menu-root
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="model-gallery-header">
          <div>
            <span>Catalogue</span>
            <h2 id="model-gallery-title">Explorer les modèles</h2>
          </div>
          <button className="close-button" type="button" aria-label="Fermer l’explorateur" onClick={onClose}>
            <span className="close-icon" aria-hidden="true"></span>
          </button>
        </div>

        <div className="model-card-grid">
          {isLoading
            ? Array.from({ length: SKELETON_COUNT }).map((_, index) => <ModelCardSkeleton key={index} />)
            : models.map((model) => (
              <ModelCard
                disabled={disabled}
                key={model.alias}
                model={model}
                onSelect={(alias) => {
                  onSelect(alias)
                  onClose()
                }}
              />
            ))}
        </div>
      </section>
    </div>
  )
}

function ModelCardSkeleton() {
  return (
    <div className="model-card model-card-skeleton" aria-hidden="true">
      <div className="model-card-visual">
        <span className="skeleton-block skeleton-logo" />
      </div>
      <div className="model-card-copy">
        <span className="skeleton-block skeleton-line skeleton-line-title" />
        <span className="skeleton-block skeleton-line" />
        <span className="skeleton-block skeleton-line skeleton-line-short" />
      </div>
    </div>
  )
}
