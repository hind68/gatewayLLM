import { modelProviderName } from '../../../utils/modelMetadata'

export default function ModelSelector({ activeModel, disabled, isOpen, models, onToggle, onSelect }) {
  return (
    <div className="model-switcher" data-menu-root>
      <button
        className="model-button"
        type="button"
        onClick={onToggle}
        disabled={disabled}
      >
        <span>{activeModel?.displayName || 'Modèle'}</span>
        <span className="model-arrow" aria-hidden="true"></span>
      </button>
      {isOpen && (
        <div className="model-menu" role="menu">
          {models.map((model) => {
            const isActive = activeModel?.alias === model.alias
            return (
              <button
                key={model.alias}
                type="button"
                role="menuitem"
                className={isActive ? 'selected' : ''}
                aria-current={isActive || undefined}
                onClick={() => onSelect(model.alias)}
              >
                <strong>{model.displayName}</strong>
                <span>{modelProviderName(model.alias)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
