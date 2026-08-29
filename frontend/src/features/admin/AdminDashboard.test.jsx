import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { RolesSection } from './AdminDashboard'
import { assignableUserRoles, canManageUserSettings, editablePermissionRoles, formatDateFilterDigits, formatDateFilterValue, formatEntity, parseDateFilterValue, restrictionModelOptions, userDirectoryName } from './AdminUtils'

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

describe('restrictionModelOptions', () => {
  it('uses the full active admin catalog regardless of the current user catalog', () => {
    expect(restrictionModelOptions([
      { aliasInterne: 'secure-gpt', nomAffichage: 'OpenAI GPT-4o mini', statut: 'ACTIF', providerStatus: 'ACTIF' },
      { aliasInterne: 'secure-claude', nomAffichage: 'Claude', statut: 'INACTIF', providerStatus: 'ACTIF' },
      { aliasInterne: 'secure-old', nomAffichage: 'Old', statut: 'ACTIF', providerStatus: 'INACTIF' },
    ])).toEqual([{ alias: 'secure-gpt', displayName: 'OpenAI GPT-4o mini' }])
  })
})

describe('audit entity labels', () => {
  it('formats every managed permission entity consistently', () => {
    expect(formatEntity('ROLE_LLM_RESTRICTION')).toBe('Restriction de modèle par rôle')
    expect(formatEntity('ROLE_BANNED_WORD')).toBe('Mot banni par rôle')
    expect(formatEntity('UserBannedWord')).toBe('Mot banni utilisateur')
    expect(formatEntity('KEYCLOAK_USER')).toBe('Compte utilisateur')
  })
})

describe('admin target permissions', () => {
  it('never allows super administrator settings to be changed', () => {
    expect(canManageUserSettings(true, ['SUPER_ADMIN'])).toBe(false)
    expect(canManageUserSettings(false, ['SUPER_ADMIN'])).toBe(false)
  })

  it('only allows a super administrator to change administrator settings', () => {
    expect(canManageUserSettings(false, ['ADMIN'])).toBe(false)
    expect(canManageUserSettings(true, ['ADMIN'])).toBe(true)
    expect(canManageUserSettings(false, ['INTERN'])).toBe(true)
  })

  it('hides protected roles from administrators', () => {
    const roles = [{ name: 'SUPER_ADMIN' }, { name: 'ADMIN' }, { name: 'INTERN' }]
    expect(editablePermissionRoles(roles, false).map((role) => role.name)).toEqual(['INTERN'])
    expect(editablePermissionRoles(roles, true).map((role) => role.name)).toEqual(['ADMIN', 'INTERN'])
  })

  it('lets an administrator assign admin but never super admin', () => {
    const roles = [{ name: 'SUPER_ADMIN' }, { name: 'ADMIN' }, { name: 'INTERN' }, { name: 'EXTERN' }]
    expect(assignableUserRoles(roles).map((role) => role.name)).toEqual(['ADMIN', 'INTERN', 'EXTERN'])
  })
})

describe('user directory names', () => {
  const user = { fullName: 'Hamza Fatih', username: 'hfatih', email: 'hamza@example.com' }

  it('shows full names by default and usernames on request', () => {
    expect(userDirectoryName(user)).toBe('Hamza Fatih')
    expect(userDirectoryName(user, 'username')).toBe('hfatih')
  })

  it('falls back cleanly when one representation is missing', () => {
    expect(userDirectoryName({ username: 'admin' }, 'full-name')).toBe('admin')
    expect(userDirectoryName({ fullName: 'Synapse Admin' }, 'username')).toBe('Synapse Admin')
  })
})

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
