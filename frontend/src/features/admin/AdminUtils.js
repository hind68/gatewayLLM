export const ADMIN_NAV_ITEMS = [
  { id: 'overview', label: "Vue d'ensemble", icon: 'bentoGrid', iconPng: '/assets/admin-icons/overview.png' },
  { id: 'security', label: 'Sécurité', icon: 'shieldCheck', iconPng: '/assets/admin-icons/security.png' },
  { id: 'models', label: 'Modèles', icon: 'chatSpark', iconPng: '/assets/admin-icons/models.png' },
  { id: 'users', label: 'Utilisateurs', icon: 'peopleGroup', iconPng: '/assets/admin-icons/users.png' },
  { id: 'roles', label: 'Rôles', icon: 'keyRing', iconPng: '/assets/admin-icons/roles.png' },
  { id: 'audit', label: "Journal d'audit", icon: 'docSearch', iconPng: '/assets/admin-icons/audit.png' },
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
  const labels = { UserLlmRestriction: 'Restriction de modèle', USER_LLM_RESTRICTION: 'Restriction de modèle', USER_BANNED_WORD: 'Mot banni utilisateur', GLOBAL_BANNED_WORD: 'Mot banni global', LLM_MODEL: 'Modèle', PROVIDER: 'Fournisseur', DLP_PATTERN: 'Pattern DLP' }
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
