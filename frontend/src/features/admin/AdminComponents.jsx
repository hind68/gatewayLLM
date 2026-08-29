import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { CheckIcon, CopyIcon } from '../../components/common/icons'

let scrollLockCount = 0
let previousBodyOverflow = ''

function renderPortal(content) {
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}

export function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.3 8.6-8 10-4.7-1.4-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.3 2.3 4.8-5" /></>,
    spark: <><path d="m12 3-1.3 5.7L5 10l5.7 1.3L12 17l1.3-5.7L19 10l-5.7-1.3L12 3Z" /><path d="m19 16-.6 2.4L16 19l2.4.6L19 22l.6-2.4L22 19l-2.4-.6L19 16Z" /></>,
    users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" /><circle cx="9.5" cy="7" r="3.5" /><path d="M17 4.5a3.5 3.5 0 0 1 0 6.8M21 20v-1.5a4 4 0 0 0-2.5-3.7" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-2 2 2 2m-5 1 2 2" /></>,
    activity: <path d="M3 12h4l2-7 4 14 2-7h6" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    edit: <><path d="m4 16-.8 4.8L8 20l10.8-10.8a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    power: <><path d="M12 3v9" /><path d="M6.6 5.8a8 8 0 1 0 10.8 0" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-5" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    filter: <path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8Z" />,
    shieldCheck: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>,
    bentoGrid: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
    chatSpark: <><path d="M12 6V2H8" /><path d="M15 11v2" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M20 16a2 2 0 0 1-2 2H8.83a2 2 0 0 0-1.42.59l-2.2 2.2A.71.71 0 0 1 4 20.29V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" /><path d="M9 11v2" /></>,
    keyRing: <><path d="M2.59 17.41A2 2 0 0 0 2 18.83V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.17a2 2 0 0 0 1.42-.59l.81-.81a6.5 6.5 0 1 0-4-4z" /><circle cx="16.5" cy="7.5" r=".5" fill="currentColor" stroke="none" /></>,
    docSearch: <><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.7.71l3.59 3.59A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><circle cx="11.5" cy="14.5" r="2.5" /><path d="m13.3 16.3 1.7 1.7" /></>,
    peopleGroup: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.74" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></>,
    messageLines: <><path d="M22 17a2 2 0 0 1-2 2H6.83a2 2 0 0 0-1.42.59l-2.2 2.2A.71.71 0 0 1 2 21.29V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" /><path d="M8 10h6" /><path d="M8 14h8" /></>,
  }
  return <svg {...common}>{paths[name] || paths.grid}</svg>
}

export function AdminShell({ children }) {
  return <div className="admin-shell admin-shell-embedded"><main className="admin-main-panel">{children}</main></div>
}

export function AdminPageHeader({ title, description, actions }) {
  return <header className="admin-page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="admin-page-actions">{actions}</div>}</header>
}

export function AdminToolbar({ children }) {
  return <div className="admin-toolbar">{children}</div>
}

export function AdminTabs({ value, onChange, tabs, label }) {
  return (
    <div className="admin-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} className={value === tab.value ? 'active' : ''} onClick={() => onChange(tab.value)}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function StatCard({ icon, label, value, context, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return <Tag type={onClick ? 'button' : undefined} className="admin-stat-card" onClick={onClick}><span className="admin-stat-icon"><Icon name={icon} size={22} strokeWidth={1.4} /></span><span className="admin-stat-copy"><span>{label}</span><strong>{value}</strong><small>{context}</small></span></Tag>
}

export function StatusBadge({ status, label, className = '' }) {
  const normalized = String(status || '').toLowerCase()
  const isCritical = normalized.includes('error') || normalized.includes('block') || normalized.includes('critical') || normalized.includes('delete') || normalized === 'high'
  const isWarning = normalized.includes('warn') || normalized === 'medium' || normalized.includes('mask') || normalized.includes('redact')
  const isSuccess = normalized.includes('success') || normalized === 'ok' || normalized.includes('connected') || normalized.includes('enable')
  const isAccent = normalized.includes('update') || normalized.includes('modif')
  const isNeutral = normalized === 'low' || normalized.includes('inact') || normalized.includes('disable') || normalized.includes('unavailable') || normalized.includes('archive') || normalized.includes('untested') || normalized.includes('recorded')
  const tone = isCritical ? 'danger' : isWarning ? 'warning' : isSuccess ? 'success' : isAccent ? 'accent' : isNeutral ? 'neutral' : 'info'
  return <span className={`status-badge ${tone} ${className}`.trim()}><span className="status-dot" aria-hidden="true" />{label || status || 'Inconnu'}</span>
}

export function EmptyState({ icon = 'grid', title, description, action }) {
  return <div className="admin-state"><span className="admin-state-icon"><Icon name={icon} size={22} /></span><strong>{title}</strong>{description && <p>{description}</p>}{action}</div>
}

export function ErrorState({ message, onRetry }) {
  return <div className="admin-state admin-state-error"><span className="admin-state-icon">!</span><strong>Impossible de charger ces données</strong><p>{message || 'Un problème est survenu.'}</p>{onRetry && <button type="button" className="admin-button secondary" onClick={onRetry}>Réessayer</button>}</div>
}

export function Skeleton({ rows = 3 }) {
  return <div className="admin-skeleton-list" aria-label="Chargement"><span className="sr-only">Chargement en cours</span>{Array.from({ length: rows }, (_, index) => <div key={index} className="admin-skeleton-row"><i /><span /><b /></div>)}</div>
}

function useFloatingLayer(open, onClose, triggerRef, layerRef) {
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return undefined
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const layer = layerRef.current?.getBoundingClientRect()
      if (!trigger) return
      const width = layer?.width || 208
      const height = layer?.height || 180
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, trigger.right - width))
      const below = trigger.bottom + 6
      const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, trigger.top - height - 6)
      setPosition({ top, left })
    }
    const frame = window.requestAnimationFrame(place)
    const onPointerDown = (event) => {
      if (!triggerRef.current?.contains(event.target) && !layerRef.current?.contains(event.target)) onClose(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose(true)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, layerRef, onClose, triggerRef])

  return position
}

export function OverflowMenu({ label = 'Plus d’actions', items }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])
  const position = useFloatingLayer(open, close, triggerRef, menuRef)

  return (
    <>
      <button ref={triggerRef} type="button" className="admin-icon-button admin-overflow-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen((current) => !current) }}><span className="dots-icon" aria-hidden="true"><span /><span /><span /></span></button>
      {open && renderPortal(
        <div ref={menuRef} className="admin-overflow-menu" role="menu" style={position}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className={item.danger ? 'danger' : ''} disabled={item.disabled} onClick={(event) => { event.stopPropagation(); close(true); item.onSelect?.() }}>
              {item.icon && <Icon name={item.icon} size={15} />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
      )}
    </>
  )
}

export function FilterPopover({ activeCount = 0, children }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])
  const position = useFloatingLayer(open, close, triggerRef, panelRef)

  return (
    <>
      <button ref={triggerRef} type="button" className={`admin-button secondary filter-button ${activeCount ? 'active' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}><Icon name="filter" size={15} />Filtres{activeCount > 0 && <span>{activeCount}</span>}</button>
      {open && renderPortal(<div ref={panelRef} className="admin-filter-popover" role="dialog" aria-label="Filtres avancés" style={position}>{children}</div>)}
    </>
  )
}

function lockPageScroll() {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLockCount += 1
  return () => {
    scrollLockCount = Math.max(0, scrollLockCount - 1)
    if (scrollLockCount === 0) document.body.style.overflow = previousBodyOverflow
  }
}

function useDialogLayer(onClose, surfaceRef, initialFocusRef) {
  const restoreFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    restoreFocusRef.current = document.activeElement
    const unlock = lockPageScroll()
    initialFocusRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(surfaceRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      unlock()
      restoreFocusRef.current?.focus?.()
    }
  }, [initialFocusRef, surfaceRef])
}

export function Modal({ title, description, children, onClose, size = 'medium' }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const surfaceRef = useRef(null)
  useDialogLayer(onClose, surfaceRef, closeRef)

  return renderPortal(
    <div className="admin-modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={surfaceRef} className={`admin-modal ${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="admin-modal-header"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button ref={closeRef} type="button" className="admin-icon-button" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button></div>
        {children}
      </section>
    </div>,
  )
}

export function DetailDrawer({ title, description, children, onClose, header }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const surfaceRef = useRef(null)
  useDialogLayer(onClose, surfaceRef, closeRef)

  return renderPortal(
    <div className="admin-drawer-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside ref={surfaceRef} className="admin-drawer" role="dialog" aria-modal="true" aria-label={header ? title : undefined} aria-labelledby={header ? undefined : titleId}>
        <div className="admin-drawer-top"><div>{header || <><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</>}</div><button ref={closeRef} type="button" className="admin-icon-button" onClick={onClose} aria-label="Fermer les détails"><Icon name="close" size={19} /></button></div>
        <div className="admin-drawer-body">{children}</div>
      </aside>
    </div>,
  )
}

export function CollapsibleSection({ title, summary, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  return (
    <section className={`admin-collapsible ${open ? 'open' : ''}`}>
      <button type="button" className="admin-collapsible-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((current) => !current)}>
        <span><strong>{title}</strong>{summary && <small>{summary}</small>}</span>
        <span className="admin-collapsible-meta">{count != null && <b>{count}</b>}<Icon name="chevron" size={16} /></span>
      </button>
      {open && <div id={panelId} className="admin-collapsible-panel">{children}</div>}
    </section>
  )
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmer', onCancel, onConfirm, busy = false }) {
  return <Modal title={title} onClose={onCancel} size="small"><p className="admin-confirm-copy">{message}</p><div className="admin-modal-actions"><button type="button" className="admin-button secondary" onClick={onCancel} disabled={busy}>Annuler</button><button type="button" className="admin-button danger" onClick={onConfirm} disabled={busy}>{busy ? 'En cours…' : confirmLabel}</button></div></Modal>
}

export function CopyButton({ value, label = 'Copier', onCopied, onCopyError }) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef(null)
  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Le presse-papiers n’est pas disponible dans ce navigateur.')
      await navigator.clipboard.writeText(String(value || ''))
      setCopied(true)
      window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => setCopied(false), 1800)
      onCopied?.()
    } catch (error) {
      onCopyError?.(error)
    }
  }

  const accessibleLabel = copied ? 'Copié' : label
  return <button type="button" className={`admin-copy-button ${copied ? 'copied' : ''}`} title={accessibleLabel} aria-label={accessibleLabel} onClick={copy}>{copied ? <CheckIcon /> : <CopyIcon />}</button>
}

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  return <div className="admin-pagination"><button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>Précédente</button><span>Page {page + 1} sur {totalPages}</span><button type="button" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)}>Suivante</button></div>
}
