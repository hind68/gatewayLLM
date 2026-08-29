import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { RolesSection } from './AdminDashboard'
import { formatDateFilterDigits, formatDateFilterValue, parseDateFilterValue } from './AdminUtils'

const baseProps = {
  errorFor: () => '',
  roles: ['EXTERN'],
  rolesLoading: false,
  rolesError: '',
  onRetryRoles: vi.fn(),
  role: 'EXTERN',
  setRole: vi.fn(),
  restrictions: [],
  bannedWords: [],
  models: [],
  selectedModel: '',
  setSelectedModel: vi.fn(),
  word: '',
  setWord: vi.fn(),
  onAddRestriction: vi.fn(),
  onRemoveRestriction: vi.fn(),
  onAddWord: vi.fn(),
  onRemoveWord: vi.fn(),
}

describe('RolesSection', () => {
  it('shows role controls after role details finish loading', () => {
    const html = renderToStaticMarkup(<RolesSection {...baseProps} loading={false} />)

    expect(html).toContain('Modèles restreints')
    expect(html).toContain('Mots bannis')
    expect(html).not.toContain('admin-skeleton-list')
  })

  it('keeps the drawer visually quiet while role details are loading', () => {
    const html = renderToStaticMarkup(<RolesSection {...baseProps} loading />)

    expect(html).toContain('admin-quiet-loading')
    expect(html).not.toContain('admin-skeleton-list')
  })

  it('keeps the role directory visually quiet during its initial load', () => {
    const html = renderToStaticMarkup(<RolesSection {...baseProps} loading={false} rolesLoading />)

    expect(html).toContain('admin-quiet-loading')
    expect(html).not.toContain('admin-skeleton-list')
  })
})

describe('audit date filter formatting', () => {
  it('always presents ISO dates as dd/mm/yyyy', () => {
    expect(formatDateFilterValue('2026-08-29')).toBe('29/08/2026')
  })

  it('adds separators while the user types', () => {
    expect(formatDateFilterDigits('29082026')).toBe('29/08/2026')
  })

  it('accepts valid dates and rejects impossible ones', () => {
    expect(parseDateFilterValue('29/08/2026')).toBe('2026-08-29')
    expect(parseDateFilterValue('31/02/2026')).toBe('')
  })
})
