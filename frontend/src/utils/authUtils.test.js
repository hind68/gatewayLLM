import { describe, expect, it } from 'vitest'
import { getRealmRoles, getRoleLabel, getUserAvatarColor, hasAdminRole } from './authUtils'

function tokenWithRoles(roles) {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'none' })}.${encode({ realm_access: { roles } })}.signature`
}

describe('auth utilities', () => {
  it('recognizes Keycloak ADMIN realm roles case-insensitively', () => {
    expect(hasAdminRole(tokenWithRoles(['ADMIN', 'USER']))).toBe(true)
    expect(hasAdminRole(tokenWithRoles(['admin']))).toBe(true)
    expect(hasAdminRole(tokenWithRoles(['SUPER_ADMIN']))).toBe(true)
  })

  it('does not grant administration to regular users or malformed tokens', () => {
    expect(hasAdminRole(tokenWithRoles(['USER']))).toBe(false)
    expect(hasAdminRole('not-a-token')).toBe(false)
  })

  it('shows the correct managed Keycloak role label', () => {
    expect(getRoleLabel(tokenWithRoles(['SUPER_ADMIN', 'ADMIN']))).toBe('Super administrateur')
    expect(getRoleLabel(tokenWithRoles(['INTERN']))).toBe('Interne')
    expect(getRoleLabel(tokenWithRoles(['EXTERN']))).toBe('Externe')
    expect(getRoleLabel(tokenWithRoles(['ADMIN', 'INTERN']))).toBe('Administrateur')
  })

  it('falls back safely for missing or malformed role data', () => {
    expect(getRealmRoles('not-a-token')).toEqual([])
    expect(getRoleLabel(tokenWithRoles(['USER']))).toBe('Utilisateur')
  })
})

describe('getUserAvatarColor', () => {
  it('returns the same palette color for the same Keycloak identity', () => {
    expect(getUserAvatarColor('user-id-1')).toBe(getUserAvatarColor('user-id-1'))
    expect(getUserAvatarColor('user-id-1')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
