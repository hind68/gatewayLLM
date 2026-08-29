export const ADMIN_NAV_ITEMS = [
  { id: 'overview', label: "Vue d'ensemble", icon: 'bentoGrid' },
  { id: 'security', label: 'Sécurité', icon: 'shieldCheck' },
  { id: 'models', label: 'Modèles', icon: 'chatSpark' },
  { id: 'users', label: 'Utilisateurs', icon: 'peopleGroup' },
  { id: 'roles', label: 'Rôles', icon: 'keyRing' },
  { id: 'audit', label: "Journal d'audit", icon: 'docSearch' },
]

export function formatKicker(value) {
  const text = String(value || '').trim().toLocaleLowerCase('fr-FR')
  if (!text) return ''
  const sentence = text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1)
  return sentence.replace(/\bdlp\b/gi, 'DLP').replace(/\bapi\b/gi, 'API')
}

export function formatAction(value) {
  const labels = { ADD: 'Ajout', CREATE: 'Création', DELETE: 'Suppression', UPDATE: 'Modification', UPDATE_ROLES: 'Modification des rôles', ENABLE: 'Activation', DISABLE: 'Désactivation', BLOCKED: 'Bloqué', REDACTED: 'Masqué', MASKED: 'Masqué' }
  return labels[String(value || '').toUpperCase()] || String(value || 'Événement').replaceAll('_', ' ').toLowerCase()
}

export function formatEntity(value) {
  const labels = {
    GlobalBannedWord: 'Mot banni global',
    GLOBAL_BANNED_WORD: 'Mot banni global',
    UserBannedWord: 'Mot banni utilisateur',
    USER_BANNED_WORD: 'Mot banni utilisateur',
    ROLE_BANNED_WORD: 'Mot banni par rôle',
    UserLlmRestriction: 'Restriction de modèle utilisateur',
    USER_LLM_RESTRICTION: 'Restriction de modèle utilisateur',
    ROLE_LLM_RESTRICTION: 'Restriction de modèle par rôle',
    DLP_PATTERN: 'Pattern DLP',
    LLM_PROVIDER: 'Fournisseur LLM',
    PROVIDER: 'Fournisseur LLM',
    LLM_MODEL: 'Modèle LLM',
    KEYCLOAK_USER: 'Compte utilisateur',
  }
  return labels[value] || String(value || 'Ressource').replaceAll('_', ' ')
}

export function restrictionModelOptions(models) {
  return (Array.isArray(models) ? models : [])
    .filter((model) => model.statut === 'ACTIF' && model.providerStatus === 'ACTIF')
    .map((model) => ({
      alias: model.aliasInterne || model.alias,
      displayName: model.nomAffichage || model.displayName || model.aliasInterne || model.alias,
    }))
    .filter((model) => Boolean(model.alias))
}

export function canManageUserSettings(actorIsSuperAdmin, targetRoles) {
  const roles = new Set((targetRoles || []).map((role) => String(role).toUpperCase()))
  if (roles.has('SUPER_ADMIN')) return false
  return !roles.has('ADMIN') || actorIsSuperAdmin
}

export function editablePermissionRoles(roles, actorIsSuperAdmin) {
  return (roles || []).filter((role) => {
    const name = String(role?.name || role).toUpperCase()
    return name !== 'SUPER_ADMIN' && (name !== 'ADMIN' || actorIsSuperAdmin)
  })
}

export function assignableUserRoles(roles) {
  return (roles || []).filter((role) => String(role?.name || role).toUpperCase() !== 'SUPER_ADMIN')
}

export function userDirectoryName(user, mode = 'full-name') {
  const fullName = String(user?.fullName || '').trim()
  const username = String(user?.username || '').trim()
  const fallback = String(user?.nomAffichage || user?.email || 'Utilisateur').trim()
  return mode === 'username' ? (username || fullName || fallback) : (fullName || username || fallback)
}

export function formatDateFilterValue(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : ''
}

export function formatDateFilterDigits(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/')
}

export function parseDateFilterValue(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || ''))
  if (!match) return ''
  const [, day, month, year] = match
  const candidate = new Date(Number(year), Number(month) - 1, Number(day))
  return candidate.getFullYear() === Number(year)
    && candidate.getMonth() === Number(month) - 1
    && candidate.getDate() === Number(day)
    ? `${year}-${month}-${day}`
    : ''
}
