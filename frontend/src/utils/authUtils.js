export function getRealmRoles(token) {
  if (!token) return []
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(atob(base64).split('').map((character) => (
      `%${(`00${character.charCodeAt(0).toString(16)}`).slice(-2)}`
    )).join(''))
    const roles = JSON.parse(jsonPayload)?.realm_access?.roles
    return Array.isArray(roles) ? roles.map((role) => String(role).toUpperCase()) : []
  } catch {
    return []
  }
}

export function hasAdminRole(token) {
  const roles = getRealmRoles(token)
  return roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')
}

export function hasSuperAdminRole(token) {
  return getRealmRoles(token).includes('SUPER_ADMIN')
}

export function getRoleLabel(token) {
  const roles = getRealmRoles(token)
  if (roles.includes('SUPER_ADMIN')) return 'Super administrateur'
  if (roles.includes('ADMIN')) return 'Administrateur'
  if (roles.includes('INTERN')) return 'Interne'
  if (roles.includes('EXTERN')) return 'Externe'
  return 'Utilisateur'
}
export function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}
