import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { AdminTabs, CollapsibleSection, DetailDrawer, StatusBadge } from './AdminComponents'

describe('administration primitives', () => {
  it('uses neutral styling for normal and inactive states, and red only for critical states', () => {
    const active = renderToStaticMarkup(<StatusBadge status="active" label="Actif" />)
    const inactive = renderToStaticMarkup(<StatusBadge status="inactive" label="Inactif" />)
    const blocked = renderToStaticMarkup(<StatusBadge status="blocked" label="Bloqué" />)
    const success = renderToStaticMarkup(<StatusBadge status="success" label="Connecté" />)

    expect(active).toContain('status-badge info')
    expect(inactive).toContain('status-badge neutral')
    expect(inactive).not.toContain('danger')
    expect(blocked).toContain('status-badge danger')
    expect(success).toContain('status-badge success')
    expect(renderToStaticMarkup(<StatusBadge status="UPDATE" />)).toContain('status-badge accent')
    expect(renderToStaticMarkup(<StatusBadge status="recorded" />)).toContain('status-badge neutral')
    expect(renderToStaticMarkup(<StatusBadge status="low" label="Faible" />)).toContain('status-badge neutral')
    expect(renderToStaticMarkup(<StatusBadge status="medium" label="Moyenne" />)).toContain('status-badge warning')
    expect(renderToStaticMarkup(<StatusBadge status="high" label="Élevée" />)).toContain('status-badge danger')
  })

  it('marks the selected segmented-control tab accessibly', () => {
    const html = renderToStaticMarkup(
      <AdminTabs
        value="patterns"
        onChange={vi.fn()}
        label="Gestion de la sécurité"
        tabs={[
          { value: 'patterns', label: 'Patterns DLP' },
          { value: 'words', label: 'Mots bannis' },
        ]}
      />,
    )

    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('Patterns DLP')
    expect(html).toContain('Mots bannis')
  })

  it('renders drawer and collapsible-section accessibility metadata', () => {
    const html = renderToStaticMarkup(
      <DetailDrawer title="Compte utilisateur" onClose={vi.fn()}>
        <CollapsibleSection title="Modèles restreints" summary="2 modèles" count={2} defaultOpen>
          <p>Contenu</p>
        </CollapsibleSection>
      </DetailDrawer>,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Modèles restreints')
  })
})
