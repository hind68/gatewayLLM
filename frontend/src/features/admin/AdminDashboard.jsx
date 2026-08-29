import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AuthContext } from '../../AuthProvider'
import { getInitials, getUserAvatarColor, hasSuperAdminRole } from '../../utils/authUtils'
import {
  addGlobalBannedWord,
  addLlmRestriction,
  addPattern,
  addRoleBannedWord,
  addRoleLlmRestriction,
  addUserBannedWord,
  createAdminModel,
  createAdminProvider,
  createKeycloakUser,
  deleteAdminModel,
  deleteAdminProvider,
  fetchAdminModels,
  fetchAdminProviders,
  fetchAuditLogs,
  fetchFilteredMessages,
  fetchGlobalBannedWords,
  fetchKeycloakRoles,
  fetchKeycloakUserRoles,
  fetchKeycloakUsers,
  fetchPatterns,
  fetchRoleBannedWords,
  fetchRoleRestrictions,
  fetchSecurityMetrics,
  fetchUserBannedWords,
  fetchUserRestrictions,
  fetchUsers,
  removeGlobalBannedWord,
  removeLlmRestriction,
  removePattern,
  removeRoleBannedWord,
  removeRoleLlmRestriction,
  removeUserBannedWord,
  setAdminModelStatus,
  setKeycloakUserEnabled,
  setKeycloakUserRoles,
  testAdminModel,
  updateAdminModel,
  updateAdminProvider,
  updatePattern,
} from '../../api/adminApi'
import { fetchModelDetails } from '../../api/modelsApi'
import ModelLogo from '../models/components/ModelLogo'
import SelectDropdown from '../../components/common/SelectDropdown'
import { modelCardMeta, modelProviderName } from '../../utils/modelMetadata'
import {
  AdminPageHeader,
  AdminShell,
  AdminTabs,
  AdminToolbar,
  CollapsibleSection,
  ConfirmDialog,
  CopyButton,
  DetailDrawer,
  EmptyState,
  ErrorState,
  FilterPopover,
  Icon,
  Modal,
  OverflowMenu,
  Pagination,
  StatCard,
  StatusBadge,
} from './AdminComponents'
import { assignableUserRoles, canManageUserSettings, editablePermissionRoles, formatAction, formatDateFilterDigits, formatDateFilterValue, formatEntity, parseDateFilterValue, restrictionModelOptions, userDirectoryName } from './AdminUtils'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (value) => UUID_PATTERN.test(String(value || ''))
const blankPattern = { name: '', type: 'custom', pattern: '', severity: 'medium', action: 'MASK', enabled: true, validator: '', capture_group: '' }
const blankProvider = { code: '', name: '', status: 'ACTIF', apiKeyEnvVar: '' }
const blankModel = { providerId: '', alias: '', providerModel: '', displayName: '', description: '', logoUrl: '', status: 'ACTIF' }
const blankUser = { username: '', firstName: '', lastName: '', email: '', password: '', role: 'INTERN', temporaryPassword: true }
const MODEL_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_MODEL_LOGO_BYTES = 512 * 1024
const MANAGED_KEYCLOAK_ROLES = ['SUPER_ADMIN', 'ADMIN', 'INTERN', 'EXTERN']
const ROLE_LABELS = { SUPER_ADMIN: 'Super administrateur', ADMIN: 'Administrateur', INTERN: 'Interne', EXTERN: 'Externe' }

function roleLabel(role) {
  return ROLE_LABELS[String(role || '').toUpperCase()] || role || 'Aucun rôle'
}

function UserAvatar({ user, large = false, label: requestedLabel }) {
  const label = String(requestedLabel || user.nomAffichage || user.username || user.email || '?')
  const colorKey = String(user.externalId || user.id || user.email || label)
  const backgroundColor = getUserAvatarColor(colorKey)
  return <span className={`user-mark${large ? ' large' : ''}`} style={{ backgroundColor }} aria-hidden="true">{getInitials(label)}</span>
}

const STATUS_OPTIONS = [
  { value: 'ACTIF', label: 'Actif' },
  { value: 'INACTIF', label: 'Inactif' },
]

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Faible' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Élevée' },
]

const DLP_ACTION_OPTIONS = [
  { value: 'MASK', label: 'Masquer' },
  { value: 'BLOCK', label: 'Bloquer' },
]

const PATTERN_SORT_OPTIONS = [
  { value: 'name-asc', label: 'Nom A–Z' },
  { value: 'name-desc', label: 'Nom Z–A' },
  { value: 'severity-desc', label: 'Sévérité décroissante' },
  { value: 'severity-asc', label: 'Sévérité croissante' },
  { value: 'action-asc', label: 'Action A–Z' },
  { value: 'status-desc', label: 'Actifs en premier' },
  { value: 'status-asc', label: 'Inactifs en premier' },
]

function managedKeycloakRoles(roles) {
  const rolesByName = new Map((roles || []).map((role) => [String(role?.name || '').toUpperCase(), role]))
  return MANAGED_KEYCLOAK_ROLES.map((name) => rolesByName.get(name)).filter(Boolean)
}

function managedKeycloakRoleNames(roles) {
  const allowed = new Set(MANAGED_KEYCLOAK_ROLES)
  return (roles || []).map((role) => String(role?.name || '').toUpperCase()).filter((name) => allowed.has(name)).slice(0, 1)
}

export default function AdminDashboard({ activeSection: controlledActiveSection, onSectionChange, onError, onNotice, onModelsChanged, onBackToChat }) {
  const keycloak = useContext(AuthContext)
  const token = keycloak?.token
  const [internalActiveSection, setInternalActiveSection] = useState(() => window.localStorage.getItem('synapse-admin-section') || 'overview')
  const activeSection = controlledActiveSection ?? internalActiveSection
  const setActiveSection = useCallback((section) => {
    if (controlledActiveSection == null) setInternalActiveSection(section)
    onSectionChange?.(section)
  }, [controlledActiveSection, onSectionChange])
  const [requestState, setRequestState] = useState({})
  const [confirmation, setConfirmation] = useState(null)
  const [busyAction, setBusyAction] = useState('')

  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [userSearch, setUserSearch] = useState('')
  const [userNameMode, setUserNameMode] = useState(() => window.localStorage.getItem('synapse-user-name-mode') || 'full-name')
  const [selectedKeycloakRoles, setSelectedKeycloakRoles] = useState([])
  const [keycloakRoles, setKeycloakRoles] = useState([])
  const [userRestrictions, setUserRestrictions] = useState([])
  const [userBannedWords, setUserBannedWords] = useState([])
  const [availableModels, setAvailableModels] = useState([])
  const [userModel, setUserModel] = useState('')
  const [userWord, setUserWord] = useState('')
  const [userModal, setUserModal] = useState(null)

  const [globalWords, setGlobalWords] = useState([])
  const [patterns, setPatterns] = useState([])
  const [patternSearch, setPatternSearch] = useState('')
  const [wordSearch, setWordSearch] = useState('')
  const [patternModal, setPatternModal] = useState(null)

  const [adminProviders, setAdminProviders] = useState([])
  const [adminModels, setAdminModels] = useState([])
  const [providerSearch, setProviderSearch] = useState('')
  const [modelSearch, setModelSearch] = useState('')
  const [providerModal, setProviderModal] = useState(null)
  const [modelModal, setModelModal] = useState(null)
  const [modelTestResults, setModelTestResults] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('synapse-model-test-results') || '{}') }
    catch { return {} }
  })

  const [selectedRole, setSelectedRole] = useState('')
  const [roleRestrictions, setRoleRestrictions] = useState([])
  const [roleBannedWords, setRoleBannedWords] = useState([])
  const [roleModel, setRoleModel] = useState('')
  const [roleWord, setRoleWord] = useState('')
  const [roleCounts, setRoleCounts] = useState({})

  const [securityMetrics, setSecurityMetrics] = useState(null)
  const [overviewMessages, setOverviewMessages] = useState([])
  const [auditView, setAuditView] = useState('permissions')
  const [auditLogs, setAuditLogs] = useState([])
  const [filteredMessages, setFilteredMessages] = useState([])
  const [auditSearch, setAuditSearch] = useState('')
  const [auditAction, setAuditAction] = useState('')
  const [auditEntity, setAuditEntity] = useState('')
  const [auditDate, setAuditDate] = useState('')
  const [auditPage, setAuditPage] = useState(0)
  const [auditTotalPages, setAuditTotalPages] = useState(0)
  const [filteredSearch, setFilteredSearch] = useState('')
  const [filteredAction, setFilteredAction] = useState('')
  const [filteredUserId, setFilteredUserId] = useState('')
  const [filteredDate, setFilteredDate] = useState('')
  const [filteredPage, setFilteredPage] = useState(0)
  const [filteredTotalPages, setFilteredTotalPages] = useState(0)
  const [expandedAuditId, setExpandedAuditId] = useState(null)

  const setStatus = useCallback((key, status, error = '') => setRequestState((current) => ({ ...current, [key]: { status, error } })), [])
  const loading = (key) => requestState[key]?.status === 'loading'
  const errorFor = (key) => requestState[key]?.error || ''
  const notify = useCallback((message) => { onNotice?.(message) }, [onNotice])
  const fail = useCallback((error) => { const message = error?.message || String(error || 'Une erreur est survenue.'); onError?.(message) }, [onError])

  useEffect(() => {
    window.localStorage.setItem('synapse-admin-section', activeSection)
  }, [activeSection])
  useEffect(() => {
    window.localStorage.setItem('synapse-model-test-results', JSON.stringify(modelTestResults))
  }, [modelTestResults])
  useEffect(() => {
    window.localStorage.setItem('synapse-user-name-mode', userNameMode)
  }, [userNameMode])
  useEffect(() => {
    if (!token) return
    void loadInitialData()
    // Initial admin reads intentionally share one lifecycle per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  useEffect(() => {
    if (token && activeSection === 'roles' && selectedRole) void loadRoleData(selectedRole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeSection, selectedRole])
  useEffect(() => {
    if (!token || activeSection !== 'audit') return
    if (auditView === 'permissions') void loadAuditLogs()
    else void loadFilteredMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeSection, auditView, auditPage, auditSearch, auditAction, auditEntity, auditDate, filteredPage, filteredSearch, filteredAction, filteredUserId, filteredDate])

  async function loadInitialData() {
    await Promise.allSettled([loadUsers(), loadSecurityData(), loadGlobalWords(), loadPatterns(), loadModels(), loadAdminProviders(), loadAdminModels(), loadKeycloakRoles(), loadOverviewMessages()])
  }
  async function loadUsers() {
    setStatus('users', 'loading')
    try {
      let data
      try {
        const keycloakUsers = await fetchKeycloakUsers(token)
        data = (keycloakUsers || []).map((user) => {
          const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
          return { id: user.id, externalId: user.id, username: user.username || '', fullName, nomAffichage: fullName || user.username || user.email || 'Utilisateur', email: user.email, enabled: user.enabled !== false, roles: user.realmRoles || user.roles || [], keycloakManaged: true }
        })
      } catch {
        data = await fetchUsers(token)
      }
      setUsers(data || [])
      setSelectedUser((current) => {
        if (!current) return null
        const refreshed = (data || []).find((user) => user.id === current.id)
        return refreshed ? { ...refreshed, resolvedRoles: current.resolvedRoles } : null
      })
      setStatus('users', 'success')
    } catch (error) { setStatus('users', 'error', error.message); fail(error) }
  }
  async function selectUser(user) {
    if (!user) {
      setSelectedUser(null)
      setSelectedKeycloakRoles([])
      setUserRestrictions([])
      setUserBannedWords([])
      setStatus('userDetails', 'idle')
      return
    }
    setSelectedUser(user)
    setSelectedKeycloakRoles([])
    setUserRestrictions([])
    setUserBannedWords([])
    setStatus('userDetails', 'loading')
    try {
      let resolvedRoles = user?.roles || user?.realmRoles || []
      if (user?.keycloakManaged) {
        resolvedRoles = managedKeycloakRoleNames(await fetchKeycloakUserRoles(user.externalId, token))
        setSelectedKeycloakRoles(resolvedRoles)
      }
      setSelectedUser((current) => current?.id === user?.id ? { ...current, resolvedRoles } : current)
      if (!isUuid(user?.externalId)) { setStatus('userDetails', 'success'); return }
      const [restrictions, words] = await Promise.all([fetchUserRestrictions(user.externalId, token), fetchUserBannedWords(user.externalId, token)])
      setUserRestrictions(restrictions || [])
      setUserBannedWords(words || [])
      setStatus('userDetails', 'success')
    } catch (error) { setStatus('userDetails', 'error', error.message); fail(error) }
  }
  async function loadSecurityData() {
    setStatus('security', 'loading')
    try { setSecurityMetrics(await fetchSecurityMetrics(token)); setStatus('security', 'success') } catch (error) { setStatus('security', 'error', error.message); fail(error) }
  }
  async function loadOverviewMessages() {
    setStatus('overview', 'loading')
    try { const data = await fetchFilteredMessages(token, { page: 0, size: 100, search: '', action: '', userId: '' }); setOverviewMessages(data?.content || []); setStatus('overview', 'success') } catch (error) { setOverviewMessages([]); setStatus('overview', 'error', error.message) }
  }
  async function loadPatterns() {
    setStatus('patterns', 'loading')
    try { setPatterns(await fetchPatterns(token) || []); setStatus('patterns', 'success') } catch (error) { setStatus('patterns', 'error', error.message); fail(error) }
  }
  async function loadGlobalWords() {
    setStatus('globalWords', 'loading')
    try { setGlobalWords(await fetchGlobalBannedWords(token) || []); setStatus('globalWords', 'success') } catch (error) { setStatus('globalWords', 'error', error.message); fail(error) }
  }
  async function loadModels() {
    setStatus('catalog', 'loading')
    try { setAvailableModels(await fetchModelDetails(token) || []); setStatus('catalog', 'success') } catch (error) { setStatus('catalog', 'error', error.message); fail(error) }
  }
  async function loadAdminProviders() {
    setStatus('providers', 'loading')
    try { setAdminProviders(await fetchAdminProviders(token) || []); setStatus('providers', 'success') } catch (error) { setStatus('providers', 'error', error.message); fail(error) }
  }
  async function loadAdminModels() {
    setStatus('models', 'loading')
    try { setAdminModels(await fetchAdminModels(token) || []); setStatus('models', 'success') } catch (error) { setStatus('models', 'error', error.message); fail(error) }
  }
  async function loadKeycloakRoles() {
    setStatus('keycloakRoles', 'loading')
    try {
      const roles = managedKeycloakRoles(await fetchKeycloakRoles(token))
      setKeycloakRoles(roles)
      setSelectedRole((current) => current && roles.some((role) => role.name === current) ? current : '')
      const summaries = await Promise.all(roles.map(async (role) => {
        try {
          const [restrictions, words] = await Promise.all([fetchRoleRestrictions(role.name, token), fetchRoleBannedWords(role.name, token)])
          return [role.name, { restrictions: restrictions?.length || 0, words: words?.length || 0 }]
        } catch {
          return [role.name, { restrictions: null, words: null }]
        }
      }))
      setRoleCounts(Object.fromEntries(summaries))
      setStatus('keycloakRoles', 'success')
    } catch (error) {
      setKeycloakRoles([])
      setSelectedRole('')
      setStatus('keycloakRoles', 'error', error.message)
    }
  }
  async function loadRoleData(role) {
    setStatus('roles', 'loading')
    try { const [restrictions, words] = await Promise.all([fetchRoleRestrictions(role, token), fetchRoleBannedWords(role, token)]); setRoleRestrictions(restrictions || []); setRoleBannedWords(words || []); setRoleCounts((current) => ({ ...current, [role]: { restrictions: restrictions?.length || 0, words: words?.length || 0 } })); setStatus('roles', 'success') } catch (error) { setStatus('roles', 'error', error.message); fail(error) }
  }
  async function loadAuditLogs() {
    setStatus('audit', 'loading')
    try { const data = await fetchAuditLogs(token, { page: auditPage, size: 10, search: auditSearch, action: auditAction, entityName: auditEntity, ...dateRange(auditDate) }); setAuditLogs(data?.content || []); setAuditTotalPages(data?.totalPages || 0); setStatus('audit', 'success') } catch (error) { setStatus('audit', 'error', error.message); fail(error) }
  }
  async function refreshModelViews() {
    await Promise.allSettled([
      loadAdminModels(),
      loadModels(),
      onModelsChanged?.(),
    ])
  }
  async function loadFilteredMessages() {
    setStatus('audit', 'loading')
    try { const data = await fetchFilteredMessages(token, { page: filteredPage, size: 10, search: filteredSearch, action: filteredAction, userId: filteredUserId, ...dateRange(filteredDate) }); setFilteredMessages(data?.content || []); setFilteredTotalPages(data?.totalPages || 0); setStatus('audit', 'success') } catch (error) { setStatus('audit', 'error', error.message); fail(error) }
  }
  async function mutate(key, operation, successMessage, reload) {
    if (busyAction) { notify('Une autre action est en cours, veuillez patienter…'); return false }
    setBusyAction(key)
    try { await operation(); notify(successMessage); if (reload) await reload(); return true } catch (error) { fail(error); return false } finally { setBusyAction('') }
  }
  async function testModel(model) {
    if (busyAction) return
    const testedAt = new Date().toISOString()
    setBusyAction(`test-model-${model.id}`)
    setModelTestResults((current) => ({ ...current, [model.id]: { state: 'testing', testedAt } }))
    try {
      const result = await testAdminModel(model.id, token)
      setModelTestResults((current) => ({ ...current, [model.id]: { ...result, state: 'complete', testedAt: new Date().toISOString() } }))
      notify('Test du modèle terminé')
    } catch (error) {
      setModelTestResults((current) => ({ ...current, [model.id]: { state: 'failed', status: 'FAILED', testedAt: new Date().toISOString() } }))
      fail(error)
    } finally { setBusyAction('') }
  }
  async function saveProviderFromModal(data) {
    if (busyAction) return
    setBusyAction('provider')
    try { await (data.id ? updateAdminProvider(data.id, data, token) : createAdminProvider(data, token)); notify(data.id ? 'Fournisseur mis à jour' : 'Fournisseur ajouté'); setProviderModal(null); await loadAdminProviders() } catch (error) { fail(error) } finally { setBusyAction('') }
  }
  async function saveModelFromModal(data) {
    if (busyAction) return
    setBusyAction('model')
    try { await (data.id ? updateAdminModel(data.id, data, token) : createAdminModel(data, token)); notify(data.id ? 'Modèle mis à jour' : 'Modèle ajouté'); setModelModal(null); await refreshModelViews() } catch (error) { fail(error) } finally { setBusyAction('') }
  }
  async function saveUserFromModal(data) {
    if (busyAction) return
    setBusyAction('create-user')
    try {
      await createKeycloakUser(data, token)
      notify('Utilisateur créé')
      setUserModal(null)
      await loadUsers()
    } catch (error) { fail(error) } finally { setBusyAction('') }
  }
  function askConfirmation(config) { setConfirmation(config) }

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) => [user.fullName, user.username, user.nomAffichage, user.email, user.externalId, user.id].some((value) => String(value || '').toLowerCase().includes(query)))
  }, [users, userSearch])
  const filteredPatterns = useMemo(() => patterns.filter((item) => `${item.name} ${item.type} ${item.pattern}`.toLowerCase().includes(patternSearch.toLowerCase())), [patterns, patternSearch])
  const filteredWords = useMemo(() => globalWords.filter((item) => String(item.word || item).toLowerCase().includes(wordSearch.toLowerCase())), [globalWords, wordSearch])
  const filteredProviders = useMemo(() => adminProviders.filter((provider) => `${provider.nom || provider.name || ''} ${provider.code || ''}`.toLowerCase().includes(providerSearch.toLowerCase())), [adminProviders, providerSearch])
  const filteredAdminModels = useMemo(() => adminModels.filter((model) => `${model.nomAffichage || ''} ${model.aliasInterne || model.alias || ''} ${model.nomModeleProvider || ''}`.toLowerCase().includes(modelSearch.toLowerCase())), [adminModels, modelSearch])
  const permissionModels = useMemo(() => restrictionModelOptions(adminModels), [adminModels])
  const editableRoles = useMemo(() => editablePermissionRoles(keycloakRoles, hasSuperAdminRole(token)), [keycloakRoles, token])
  const chartData = useMemo(() => buildOverviewData(overviewMessages), [overviewMessages])
  const activeModels = adminModels.filter((model) => model.statut === 'ACTIF').length
  const activePatterns = patterns.filter((pattern) => pattern.enabled !== false).length

  return (
    <AdminShell activeSection={activeSection} onSectionChange={setActiveSection} onBackToChat={onBackToChat} keycloak={keycloak}>
      <div className="admin-content">
        <AdminPageHeader title={sectionTitle(activeSection)} description={sectionDescription(activeSection)} />
        {activeSection === 'overview' && <OverviewSection loading={loading} errors={errorFor} users={users} activeModels={activeModels} adminModels={adminModels} patterns={patterns} activePatterns={activePatterns} globalWords={globalWords} securityMetrics={securityMetrics} chartData={chartData} overviewMessages={overviewMessages} onSectionChange={setActiveSection} />}
        {activeSection === 'security' && <SecuritySection loading={loading} errorFor={errorFor} globalWords={filteredWords} wordSearch={wordSearch} setWordSearch={setWordSearch} onAddWord={(value) => mutate('global-word', () => addGlobalBannedWord(value, token), 'Mot banni ajouté', loadGlobalWords)} onDeleteWord={(id, word) => askConfirmation({ title: 'Supprimer ce mot banni ?', message: `« ${word} » sera supprimé des règles globales.`, onConfirm: () => mutate('delete-word', () => removeGlobalBannedWord(id, token), 'Mot banni supprimé', loadGlobalWords) })} patterns={filteredPatterns} patternSearch={patternSearch} setPatternSearch={setPatternSearch} onCreatePattern={() => setPatternModal({ ...blankPattern, mode: 'create' })} onEditPattern={(pattern) => setPatternModal({ ...blankPattern, ...pattern, mode: 'edit' })} onTogglePattern={(pattern) => mutate(`pattern-${pattern.name}`, () => updatePattern(pattern.name, { ...pattern, enabled: pattern.enabled === false }, token), pattern.enabled === false ? 'Pattern activé' : 'Pattern désactivé', loadPatterns)} onDeletePattern={(name) => askConfirmation({ title: 'Supprimer ce pattern ?', message: 'Cette règle DLP sera supprimée définitivement.', onConfirm: () => mutate('delete-pattern', () => removePattern(name, token), 'Pattern supprimé', loadPatterns) })} onCopyExpression={() => notify('Expression copiée')} onCopyError={fail} />}
        {activeSection === 'models' && <ModelsSection loading={loading} errorFor={errorFor} providers={filteredProviders} allProviders={adminProviders} models={filteredAdminModels} allModels={adminModels} availableModels={availableModels} providerSearch={providerSearch} setProviderSearch={setProviderSearch} modelSearch={modelSearch} setModelSearch={setModelSearch} onCreateProvider={() => setProviderModal({ ...blankProvider, mode: 'create' })} onEditProvider={(provider) => setProviderModal({ code: provider.code || '', name: provider.nom || provider.name || '', status: provider.statut || 'ACTIF', apiKeyEnvVar: provider.apiKeyEnvVar || '', id: provider.id, mode: 'edit' })} onToggleProvider={(provider) => mutate(`provider-status-${provider.id}`, () => updateAdminProvider(provider.id, { status: provider.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF' }, token), provider.statut === 'ACTIF' ? 'Fournisseur désactivé' : 'Fournisseur activé', async () => { await loadAdminProviders(); await refreshModelViews() })} onDeleteProvider={(provider) => askConfirmation({ title: 'Supprimer ce fournisseur ?', message: 'La suppression est refusée si des modèles y sont encore associés.', onConfirm: () => mutate('delete-provider', () => deleteAdminProvider(provider.id, token), 'Fournisseur supprimé', loadAdminProviders) })} onCreateModel={() => setModelModal({ ...blankModel, mode: 'create' })} onEditModel={(model) => setModelModal({ providerId: String(model.providerId || ''), alias: model.aliasInterne || model.alias || '', providerModel: model.nomModeleProvider || '', displayName: model.nomAffichage || '', description: model.description || '', logoUrl: model.logoUrl || '', status: model.statut || 'ACTIF', id: model.id, mode: 'edit' })} onToggleModel={(model) => mutate(`model-status-${model.id}`, () => setAdminModelStatus(model.id, model.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF', token), model.statut === 'ACTIF' ? 'Modèle désactivé' : 'Modèle activé', async () => { await refreshModelViews(); await loadSecurityData() })} onDeleteModel={(model) => askConfirmation({ title: 'Supprimer ce modèle ?', message: 'La suppression est refusée si des conversations ou restrictions le référencent.', onConfirm: () => mutate('delete-model', () => deleteAdminModel(model.id, token), 'Modèle supprimé', refreshModelViews) })} onTestModel={testModel} modelTestResults={modelTestResults} busyAction={busyAction} />}
        {activeSection === 'users' && <UsersSection loading={loading} errorFor={errorFor} busyAction={busyAction} users={filteredUsers} allUsers={users} search={userSearch} setSearch={setUserSearch} nameMode={userNameMode} setNameMode={setUserNameMode} onCreateUser={() => setUserModal({ ...blankUser })} selectedUser={selectedUser} onSelectUser={selectUser} keycloakRoles={keycloakRoles} keycloakRolesError={errorFor('keycloakRoles')} onRetryKeycloakRoles={loadKeycloakRoles} selectedRoles={selectedKeycloakRoles} setSelectedRoles={setSelectedKeycloakRoles} onSaveRoles={() => mutate('user-roles', () => setKeycloakUserRoles(selectedUser.externalId, selectedKeycloakRoles, token), 'Rôles mis à jour')} restrictions={userRestrictions} bannedWords={userBannedWords} models={permissionModels} selectedModel={userModel} setSelectedModel={setUserModel} userWord={userWord} setUserWord={setUserWord} onAddRestriction={() => mutate('user-restriction', () => addLlmRestriction(selectedUser.externalId, userModel, token), 'Restriction ajoutée', () => selectUser(selectedUser))} onRemoveRestriction={(item) => askConfirmation({ title: 'Supprimer cette restriction ?', message: `La restriction « ${item.llmModelAlias} » sera supprimée.`, onConfirm: () => mutate('delete-user-restriction', () => removeLlmRestriction(item.id, token), 'Restriction supprimée', () => selectUser(selectedUser)) })} onAddWord={() => mutate('user-word', () => addUserBannedWord(selectedUser.externalId, userWord, token), 'Mot banni ajouté', () => { setUserWord(''); return selectUser(selectedUser) })} onRemoveWord={(item) => askConfirmation({ title: 'Supprimer ce mot ?', message: `« ${item.word} » sera supprimé pour cet utilisateur.`, onConfirm: () => mutate('delete-user-word', () => removeUserBannedWord(item.id, token), 'Mot banni supprimé', () => selectUser(selectedUser)) })} onToggleUser={(user) => mutate('user-status', () => setKeycloakUserEnabled(user.externalId, !user.enabled, token), user.enabled ? 'Utilisateur désactivé' : 'Utilisateur activé', loadUsers)} />}
        {activeSection === 'roles' && <RolesSection loading={loading('roles')} errorFor={errorFor} roles={editableRoles.map((item) => item.name).filter(Boolean)} roleCounts={roleCounts} rolesLoading={loading('keycloakRoles')} rolesError={errorFor('keycloakRoles')} onRetryRoles={() => selectedRole ? loadRoleData(selectedRole) : loadKeycloakRoles()} role={editableRoles.some((item) => item.name === selectedRole) ? selectedRole : ''} setRole={setSelectedRole} restrictions={roleRestrictions} bannedWords={roleBannedWords} models={permissionModels} selectedModel={roleModel} setSelectedModel={setRoleModel} word={roleWord} setWord={setRoleWord} onAddRestriction={() => mutate('role-restriction', () => addRoleLlmRestriction(selectedRole, roleModel, token), 'Restriction ajoutée', () => loadRoleData(selectedRole))} onRemoveRestriction={(item) => askConfirmation({ title: 'Supprimer la restriction ?', message: 'La restriction sera supprimée pour ce rôle.', onConfirm: () => mutate('delete-role-restriction', () => removeRoleLlmRestriction(item.id, token), 'Restriction supprimée', () => loadRoleData(selectedRole)) })} onAddWord={() => mutate('role-word', () => addRoleBannedWord(selectedRole, roleWord, token), 'Mot banni ajouté', () => { setRoleWord(''); return loadRoleData(selectedRole) })} onRemoveWord={(item) => askConfirmation({ title: 'Supprimer ce mot banni ?', message: 'Ce mot sera supprimé pour le rôle sélectionné.', onConfirm: () => mutate('delete-role-word', () => removeRoleBannedWord(item.id, token), 'Mot banni supprimé', () => loadRoleData(selectedRole)) })} />}
        {activeSection === 'audit' && <AuditSection loading={loading('audit')} error={errorFor('audit')} view={auditView} setView={(view) => { setAuditView(view); setExpandedAuditId(null) }} logs={auditLogs} messages={filteredMessages} users={users} search={auditSearch} setSearch={(value) => { setAuditSearch(value); setAuditPage(0) }} action={auditAction} setAction={(value) => { setAuditAction(value); setAuditPage(0) }} entity={auditEntity} setEntity={(value) => { setAuditEntity(value); setAuditPage(0) }} date={auditDate} setDate={(value) => { setAuditDate(value); setAuditPage(0) }} filteredSearch={filteredSearch} setFilteredSearch={(value) => { setFilteredSearch(value); setFilteredPage(0) }} filteredAction={filteredAction} setFilteredAction={(value) => { setFilteredAction(value); setFilteredPage(0) }} filteredUserId={filteredUserId} setFilteredUserId={(value) => { setFilteredUserId(value); setFilteredPage(0) }} filteredDate={filteredDate} setFilteredDate={(value) => { setFilteredDate(value); setFilteredPage(0) }} expandedId={expandedAuditId} setExpandedId={setExpandedAuditId} page={auditView === 'permissions' ? auditPage : filteredPage} totalPages={auditView === 'permissions' ? auditTotalPages : filteredTotalPages} onPageChange={auditView === 'permissions' ? setAuditPage : setFilteredPage} />}
      </div>
      {patternModal && <PatternModal data={patternModal} busy={busyAction === 'pattern'} onClose={() => setPatternModal(null)} onSave={(data) => mutate('pattern', () => data.mode === 'edit' ? updatePattern(data.name, data, token) : addPattern(data, token), data.mode === 'edit' ? 'Pattern mis à jour' : 'Pattern ajouté', async () => { setPatternModal(null); await loadPatterns() })} />}
      {providerModal && <ProviderModal data={providerModal} busy={busyAction === 'provider'} onClose={() => setProviderModal(null)} onSave={saveProviderFromModal} />}
      {modelModal && <ModelModal data={modelModal} providers={adminProviders} busy={busyAction === 'model'} onClose={() => setModelModal(null)} onSave={saveModelFromModal} />}
      {userModal && <UserModal data={userModal} roles={editableRoles} busy={busyAction === 'create-user'} onClose={() => setUserModal(null)} onSave={saveUserFromModal} />}
      {confirmation && <ConfirmDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={async () => { setConfirmation(null); await confirmation.onConfirm() }} />}
    </AdminShell>
  )
}

function sectionTitle(section) { return { overview: "Vue d'ensemble", security: 'Sécurité', models: 'Modèles', users: 'Utilisateurs', roles: 'Rôles', audit: "Journal d'audit" }[section] || 'Administration' }
function sectionDescription(section) { return { overview: 'Un aperçu compact de la configuration et de la protection DLP de Synapse.', security: 'Gérez les règles globales et les patterns qui protègent les échanges.', models: 'Séparez les fournisseurs des modèles configurés et gardez le catalogue lisible.', users: 'Consultez les comptes et leurs autorisations sans exposer les détails techniques.', roles: 'Gérez les restrictions héritées par rôle avec un suivi clair des règles.', audit: 'Suivez les changements d’autorisation et les messages filtrés, en toute sécurité.' }[section] }
function Metric({ value, isLoading, error }) { return isLoading ? <span className="metric-placeholder">—</span> : error ? <span className="metric-placeholder">!</span> : value }
function buildOverviewData(messages) {
  const now = new Date(); const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); return { date, label: date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''), count: 0 } })
  const categories = new Map()
  messages.forEach((message) => { const date = new Date(message?.timestamp); if (Number.isNaN(date.getTime())) return; const day = days.find((item) => item.date.toDateString() === date.toDateString()); if (day) day.count += 1; String(message.detectedTypes || '').split(/[|,;]+/).map((item) => item.trim()).filter(Boolean).forEach((item) => categories.set(item, (categories.get(item) || 0) + 1)) })
  const categoryRows = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }))
  return { days, max: Math.max(1, ...days.map((day) => day.count)), categories: categoryRows, categoryMax: Math.max(1, ...categoryRows.map((item) => item.count)) }
}

function OverviewSection({ loading, errors, users, activeModels, adminModels, patterns, activePatterns, securityMetrics, chartData, overviewMessages, onSectionChange }) {
  const [selectedIncident, setSelectedIncident] = useState(null)
  const recentIncidents = useMemo(
    () => [...overviewMessages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5),
    [overviewMessages],
  )
  const userNamesById = useMemo(() => new Map(users.flatMap((user) => {
    const id = user.externalId || user.id
    const name = user.nomAffichage || user.username || user.email
    return id && name ? [[String(id), name]] : []
  })), [users])
  const incidentUserName = (incident) => userNamesById.get(String(incident?.userKeycloakId || '')) || 'Utilisateur Synapse'
  const blockedToday = securityMetrics?.today?.blocked ?? overviewMessages.filter((item) => String(item.action || item.requestStatus).toUpperCase().includes('BLOCK')).length

  return (
    <>
      <div className="admin-stat-grid">
        <StatCard icon="peopleGroup" label="Utilisateurs" value={<Metric isLoading={loading('users')} error={errors('users')} value={users.length} />} context="Comptes connus" onClick={() => onSectionChange('users')} />
        <StatCard icon="chatSpark" label="Modèles actifs" value={<Metric isLoading={loading('models')} error={errors('models')} value={activeModels} />} context={`${adminModels.length} configurés`} onClick={() => onSectionChange('models')} />
        <StatCard icon="shieldCheck" label="Patterns DLP" value={<Metric isLoading={loading('patterns')} error={errors('patterns')} value={patterns.length} />} context={`${activePatterns} actifs`} onClick={() => onSectionChange('security')} />
        <StatCard icon="docSearch" label="Messages filtrés" value={<Metric isLoading={loading('overview')} error={errors('overview')} value={overviewMessages.length} />} context={blockedToday ? `${blockedToday} bloqués aujourd’hui` : 'Aucun blocage aujourd’hui'} onClick={() => onSectionChange('audit')} />
      </div>

      <div className="admin-overview-grid">
        <section className="admin-card admin-trend-card">
          <SectionHeading title="Incidents DLP · 7 derniers jours" context={`${overviewMessages.length} événements`} />
          {loading('overview') ? <QuietLoading /> : errors('overview') ? <ErrorState message={errors('overview')} /> : (
            <div className="admin-bar-chart" aria-label="Incidents DLP sur les sept derniers jours">
              {chartData.days.map((day) => <div className="admin-bar-column" key={day.date.toISOString()}><strong>{day.count}</strong><div className="admin-bar-track"><i style={{ height: `${Math.max(4, (day.count / chartData.max) * 100)}%` }} /></div><span>{day.label}</span></div>)}
            </div>
          )}
        </section>

        <section className="admin-card">
          <SectionHeading title="Catégories détectées" />
          {chartData.categories.length ? (
            <div className="admin-category-chart">
              {chartData.categories.map((item) => <div className="admin-category-row" key={item.name}><div><span>{item.name}</span><strong>{item.count}</strong></div><i style={{ width: `${(item.count / chartData.categoryMax) * 100}%` }} /></div>)}
            </div>
          ) : <EmptyState icon="activity" title="Aucune catégorie récente" description="Les catégories apparaîtront avec les prochains événements DLP." />}
        </section>

        <section className="admin-card admin-recent-card">
          <SectionHeading title="Incidents récents" context={recentIncidents.length ? `${recentIncidents.length} affichés` : undefined} />
          {loading('overview') ? <QuietLoading /> : errors('overview') ? <ErrorState message={errors('overview')} /> : recentIncidents.length ? (
            <div className="admin-compact-list">
              {recentIncidents.map((incident) => {
                const id = incident.id || incident.timestamp
                const label = incident.reason || incident.detectedTypes || 'Événement DLP'
                const status = incident.requestStatus || incident.action
                return (
                  <div key={id} className="admin-compact-row interactive" role="button" tabIndex="0" onClick={() => setSelectedIncident(incident)} onKeyDown={(event) => handleRowKey(event, () => setSelectedIncident(incident))}>
                    <span className="row-icon"><Icon name="shield" size={17} /></span>
                    <span className="row-main"><strong>{label}</strong><small>{incidentUserName(incident)} · {formatDate(incident.timestamp)}</small></span>
                    <StatusBadge status={status} label={formatAction(status)} />
                    <Icon name="chevron" size={16} />
                  </div>
                )
              })}
            </div>
          ) : <EmptyState icon="activity" title="Aucun incident récent" description="La protection DLP ne signale aucun événement récent." />}
        </section>
      </div>

      {selectedIncident && (
        <DetailDrawer title="Détail de l’incident" description={formatDate(selectedIncident.timestamp)} onClose={() => setSelectedIncident(null)}>
          <div className="admin-detail-grid">
            <DetailValue label="Événement" value={selectedIncident.reason || 'Événement DLP'} />
            <DetailValue label="Statut" value={<StatusBadge status={selectedIncident.requestStatus || selectedIncident.action} label={formatAction(selectedIncident.requestStatus || selectedIncident.action)} />} />
            <DetailValue label="Utilisateur" value={incidentUserName(selectedIncident)} />
            <DetailValue label="Détections" value={selectedIncident.detectionCount ?? 0} />
            <DetailValue label="Catégories" value={selectedIncident.detectedTypes || 'Non précisées'} wide />
          </div>
          <SafeContent value={selectedIncident.redactedContent} />
        </DetailDrawer>
      )}
    </>
  )
}

function SectionHeading({ title, context, action }) {
  return <div className="admin-section-heading"><div><h2>{title}</h2>{context && <span className="admin-heading-context">{context}</span>}</div>{action}</div>
}

function DetailValue({ label, value, wide = false }) {
  return <div className={wide ? 'wide' : ''}><span>{label}</span><strong>{value ?? '—'}</strong></div>
}

function SafeContent({ value }) {
  return <div className="safe-content-panel"><span>Contenu sécurisé</span><p>{value || 'La version sécurisée n’est pas disponible pour cet événement.'}</p><small>Le contenu original sensible n’est jamais affiché ici.</small></div>
}

function handleRowKey(event, onSelect) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onSelect()
  }
}

function SecuritySection({ loading, errorFor, globalWords, wordSearch, setWordSearch, onAddWord, onDeleteWord, patterns, patternSearch, setPatternSearch, onCreatePattern, onEditPattern, onTogglePattern, onDeletePattern, onCopyExpression, onCopyError }) {
  const [view, setView] = useState('patterns')
  const [patternSort, setPatternSort] = useState('name-asc')
  const [selectedPattern, setSelectedPattern] = useState(null)
  const sortedPatterns = useMemo(() => {
    const severityRank = { low: 1, medium: 2, high: 3, critical: 4 }
    const [field, direction] = patternSort.split('-')
    const factor = direction === 'desc' ? -1 : 1
    return [...patterns].sort((left, right) => {
      if (field === 'severity') return ((severityRank[left.severity] || 0) - (severityRank[right.severity] || 0)) * factor
      if (field === 'status') return ((left.enabled === false ? 0 : 1) - (right.enabled === false ? 0 : 1)) * factor
      return String(field === 'action' ? left.action : left.name).localeCompare(String(field === 'action' ? right.action : right.name), 'fr') * factor
    })
  }, [patterns, patternSort])

  return (
    <div className="admin-stack">
      <AdminTabs value={view} onChange={setView} label="Gestion de la sécurité" tabs={[{ value: 'patterns', label: 'Patterns DLP' }, { value: 'words', label: 'Mots bannis' }]} />

      {view === 'patterns' ? (
        <section className="admin-card">
          <SectionHeading title="Patterns DLP" context={`${patterns.length} règles`} action={<button type="button" className="admin-button primary" onClick={onCreatePattern}><Icon name="plus" size={15} />Ajouter un pattern</button>} />
          <AdminToolbar>
            <div className="admin-search-field"><Icon name="search" size={16} /><input value={patternSearch} onChange={(event) => setPatternSearch(event.target.value)} placeholder="Rechercher un pattern" aria-label="Rechercher les patterns" /></div>
            <SelectDropdown value={patternSort} options={PATTERN_SORT_OPTIONS} onChange={setPatternSort} ariaLabel="Trier les patterns" className="admin-custom-dropdown compact" />
          </AdminToolbar>
          {loading('patterns') ? <QuietLoading /> : errorFor('patterns') ? <ErrorState message={errorFor('patterns')} /> : sortedPatterns.length ? (
            <div className="admin-compact-list">
              {sortedPatterns.map((pattern) => (
                <div key={pattern.name} className="admin-compact-row interactive pattern-row" data-severity={String(pattern.severity || 'medium').toLowerCase()} role="button" tabIndex="0" onClick={() => setSelectedPattern(pattern)} onKeyDown={(event) => handleRowKey(event, () => setSelectedPattern(pattern))}>
                  <span className="row-main"><strong>{pattern.name}</strong><small>{pattern.type || 'custom'}</small></span>
                  <span className="pattern-severity"><StatusBadge status={pattern.severity} label={severityLabel(pattern.severity)} /></span>
                  <StatusBadge status={pattern.enabled === false ? 'inactive' : 'active'} label={pattern.enabled === false ? 'Inactif' : 'Actif'} />
                  <OverflowMenu label={`Actions pour ${pattern.name}`} items={[
                    { label: 'Modifier', icon: 'edit', onSelect: () => onEditPattern(pattern) },
                    { label: pattern.enabled === false ? 'Activer' : 'Désactiver', icon: 'power', onSelect: () => onTogglePattern(pattern) },
                    { label: 'Supprimer', icon: 'trash', danger: true, onSelect: () => onDeletePattern(pattern.name) },
                  ]} />
                </div>
              ))}
            </div>
          ) : <EmptyState icon="shield" title="Aucun pattern configuré" description="Créez une règle DLP pour commencer à protéger les échanges." action={<button type="button" className="admin-button primary" onClick={onCreatePattern}>Ajouter un pattern</button>} />}
        </section>
      ) : (
        <section className="admin-card">
          <SectionHeading title="Mots bannis globaux" context={`${globalWords.length} résultats`} action={<AddWordForm onSubmit={onAddWord} />} />
          <AdminToolbar><div className="admin-search-field"><Icon name="search" size={16} /><input value={wordSearch} onChange={(event) => setWordSearch(event.target.value)} placeholder="Rechercher un mot" aria-label="Rechercher les mots bannis" /></div></AdminToolbar>
          {loading('globalWords') ? <QuietLoading /> : errorFor('globalWords') ? <ErrorState message={errorFor('globalWords')} /> : globalWords.length ? (
            <div className="admin-compact-list">
              {globalWords.map((item) => {
                const word = item.word || item
                return <div className="admin-compact-row word-row" key={item.id || word}><span className="row-main"><strong>{word}</strong><small>Règle globale</small></span><StatusBadge status="active" label="Appliqué" /><OverflowMenu label={`Actions pour ${word}`} items={[{ label: 'Supprimer', icon: 'trash', danger: true, onSelect: () => onDeleteWord(item.id, word) }]} /></div>
              })}
            </div>
          ) : <EmptyState icon="shield" title="Aucun mot banni" description="Ajoutez un mot pour renforcer les règles globales." />}
        </section>
      )}

      {selectedPattern && (
        <DetailDrawer title={selectedPattern.name} description="Détails techniques du pattern DLP" onClose={() => setSelectedPattern(null)}>
          <div className="drawer-action-row"><button type="button" className="admin-button primary" onClick={() => { setSelectedPattern(null); onEditPattern(selectedPattern) }}><Icon name="edit" size={15} />Modifier</button><button type="button" className="admin-button secondary" onClick={() => onTogglePattern(selectedPattern)}>{selectedPattern.enabled === false ? 'Activer' : 'Désactiver'}</button></div>
          <div className="admin-detail-grid">
            <DetailValue label="Type" value={selectedPattern.type || 'custom'} />
            <DetailValue label="Sévérité" value={<StatusBadge status={selectedPattern.severity} label={severityLabel(selectedPattern.severity)} />} />
            <DetailValue label="Action" value={actionLabel(selectedPattern.action)} />
            <DetailValue label="Statut" value={<StatusBadge status={selectedPattern.enabled === false ? 'inactive' : 'active'} label={selectedPattern.enabled === false ? 'Inactif' : 'Actif'} />} />
            <DetailValue label="Validateur" value={selectedPattern.validator || 'Aucun'} />
            <DetailValue label="Groupe de capture" value={selectedPattern.capture_group ?? selectedPattern.captureGroup ?? 'Aucun'} />
          </div>
          <div className="regex-detail"><div><span>Expression régulière</span><CopyButton value={selectedPattern.pattern} label="Copier l’expression" onCopied={onCopyExpression} onCopyError={onCopyError} /></div><code>{selectedPattern.pattern}</code></div>
        </DetailDrawer>
      )}
    </div>
  )
}

function AddWordForm({ onSubmit }) {
  const [value, setValue] = useState('')
  return <form className="inline-add-form security-add-word-form" onSubmit={async (event) => { event.preventDefault(); if (!value.trim()) return; await onSubmit(value.trim()); setValue('') }}><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ajouter un mot…" aria-label="Nouveau mot banni" /><button className="admin-button primary" type="submit"><Icon name="plus" size={15} />Ajouter</button></form>
}

function severityLabel(value) { return { low: 'Faible', medium: 'Moyenne', high: 'Élevée', critical: 'Critique' }[String(value || '').toLowerCase()] || value || '—' }
function actionLabel(value) { return { MASK: 'Masquer', BLOCK: 'Bloquer' }[value] || value || '—' }
function providerLogoAlias(provider) {
  const value = `${provider?.code || ''} ${provider?.nom || provider?.name || ''}`.toLowerCase()
  if (value.includes('openai') || value.includes('gpt')) return 'secure-gpt'
  if (value.includes('groq')) return 'secure-groq'
  if (value.includes('gemini') || value.includes('google')) return 'secure-gemini'
  if (value.includes('mistral')) return 'secure-mistral'
  if (value.includes('claude') || value.includes('anthropic')) return 'secure-claude'
  return provider?.code || provider?.nom || provider?.name || 'provider'
}

function ModelsSection({ loading, errorFor, providers, models, allModels, availableModels, providerSearch, setProviderSearch, modelSearch, setModelSearch, onCreateProvider, onEditProvider, onToggleProvider, onDeleteProvider, onCreateModel, onEditModel, onToggleModel, onDeleteModel, onTestModel, modelTestResults, busyAction }) {
  const [view, setView] = useState('models')
  const [selectedModel, setSelectedModel] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const configuredAliases = new Set(allModels.map((item) => item.aliasInterne || item.alias))
  const query = modelSearch.trim().toLowerCase()
  const catalogModels = availableModels.filter((item) => !configuredAliases.has(item.alias) && (!query || `${item.displayName || ''} ${item.alias || ''} ${item.providerName || ''}`.toLowerCase().includes(query)))
  const modelRows = [...models.map((model) => ({ model, adminModel: model })), ...catalogModels.map((model) => ({ model, adminModel: null }))]

  return (
    <div className="admin-stack">
      <AdminTabs value={view} onChange={setView} label="Catalogue LLM" tabs={[{ value: 'models', label: 'Modèles' }, { value: 'providers', label: 'Fournisseurs' }]} />

      {view === 'models' ? (
        <section className="admin-card">
          <SectionHeading title="Modèles" context={`${modelRows.length} disponibles`} action={<button type="button" className="admin-button primary" onClick={onCreateModel}><Icon name="plus" size={15} />Ajouter un modèle</button>} />
          <AdminToolbar><div className="admin-search-field"><Icon name="search" size={16} /><input value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="Rechercher un modèle" aria-label="Rechercher les modèles" /></div></AdminToolbar>
          {loading('models') || loading('catalog') ? <QuietLoading /> : errorFor('models') || errorFor('catalog') ? <ErrorState message={errorFor('models') || errorFor('catalog')} /> : modelRows.length ? (
            <div className="admin-compact-list model-compact-list">
              {modelRows.map(({ model, adminModel }) => {
                const alias = adminModel ? (adminModel.aliasInterne || adminModel.alias) : model.alias
                const meta = modelCardMeta(alias)
                const title = adminModel?.nomAffichage || model.displayName || alias
                const providerName = adminModel?.providerName || model.providerName || modelProviderName(alias)
                return (
                  <div key={adminModel?.id || `available-${alias}`} className="admin-compact-row interactive model-compact-row" role="button" tabIndex="0" onClick={() => setSelectedModel({ model, adminModel })} onKeyDown={(event) => handleRowKey(event, () => setSelectedModel({ model, adminModel }))}>
                    <span className="model-mark"><ModelLogo alias={alias} logoUrl={adminModel?.logoUrl || model.logoUrl} className="admin-model-logo" fallback={meta.initials} /></span>
                    <span className="row-main"><strong>{title}</strong><small>{providerName} · {adminModel?.description || model.description || 'Modèle LLM Synapse'}</small></span>
                    <StatusBadge status={adminModel ? adminModel.statut : 'available'} label={adminModel ? (adminModel.statut === 'ACTIF' ? 'Actif' : 'Inactif') : 'Disponible'} />
                    {adminModel ? <OverflowMenu label={`Actions pour ${title}`} items={[
                      { label: 'Modifier', icon: 'edit', onSelect: () => onEditModel(adminModel) },
                      { label: adminModel.statut === 'ACTIF' ? 'Désactiver' : 'Activer', icon: 'power', onSelect: () => onToggleModel(adminModel) },
                      { label: 'Supprimer', icon: 'trash', danger: true, onSelect: () => onDeleteModel(adminModel) },
                    ]} /> : <Icon name="chevron" size={16} />}
                  </div>
                )
              })}
            </div>
          ) : <EmptyState icon="spark" title="Aucun modèle disponible" description="Le catalogue Synapse ne retourne actuellement aucun modèle." />}
        </section>
      ) : (
        <section className="admin-card">
          <SectionHeading title="Fournisseurs" context={`${providers.length} configurés`} action={<button type="button" className="admin-button primary" onClick={onCreateProvider}><Icon name="plus" size={15} />Ajouter un fournisseur</button>} />
          <AdminToolbar><div className="admin-search-field"><Icon name="search" size={16} /><input value={providerSearch} onChange={(event) => setProviderSearch(event.target.value)} placeholder="Rechercher un fournisseur" aria-label="Rechercher les fournisseurs" /></div></AdminToolbar>
          {loading('providers') ? <QuietLoading /> : errorFor('providers') ? <ErrorState message={errorFor('providers')} /> : providers.length ? (
            <div className="admin-compact-list">
              {providers.map((provider) => {
                const name = provider.nom || provider.name || provider.code
                const associatedModels = allModels.filter((model) => String(model.providerId) === String(provider.id) || model.providerName === name)
                const representativeModel = associatedModels.find((model) => model.logoUrl) || associatedModels[0]
                const logoAlias = representativeModel?.aliasInterne || representativeModel?.alias || providerLogoAlias(provider)
                const logoFallback = modelCardMeta(logoAlias).initials
                const count = associatedModels.length
                return (
                  <div key={provider.id} className="admin-compact-row interactive provider-compact-row" role="button" tabIndex="0" onClick={() => setSelectedProvider(provider)} onKeyDown={(event) => handleRowKey(event, () => setSelectedProvider(provider))}>
                    <span className="provider-mark"><ModelLogo alias={logoAlias} logoUrl={representativeModel?.logoUrl} className="admin-provider-logo" fallback={logoFallback} /></span>
                    <span className="row-main"><strong>{name}</strong><small>{provider.code} · {count} modèle{count !== 1 ? 's' : ''}</small></span>
                    <StatusBadge status={provider.statut === 'ACTIF' ? 'active' : 'inactive'} label={provider.statut === 'ACTIF' ? 'Actif' : 'Inactif'} />
                    <OverflowMenu label={`Actions pour ${name}`} items={[
                      { label: 'Modifier', icon: 'edit', onSelect: () => onEditProvider(provider) },
                      { label: provider.statut === 'ACTIF' ? 'Désactiver' : 'Activer', icon: 'power', onSelect: () => onToggleProvider(provider) },
                      { label: 'Supprimer', icon: 'trash', danger: true, onSelect: () => onDeleteProvider(provider) },
                    ]} />
                  </div>
                )
              })}
            </div>
          ) : <EmptyState icon="spark" title="Aucun fournisseur" description="Ajoutez un fournisseur pour gérer ses modèles." />}
        </section>
      )}

      {selectedModel && <ModelDetailDrawer selection={selectedModel} result={selectedModel.adminModel ? modelTestResults[selectedModel.adminModel.id] : null} testing={selectedModel.adminModel ? busyAction === `test-model-${selectedModel.adminModel.id}` : false} onClose={() => setSelectedModel(null)} onEdit={onEditModel} onTest={onTestModel} />}
      {selectedProvider && (
        <DetailDrawer title={selectedProvider.nom || selectedProvider.name || selectedProvider.code} description="Configuration du fournisseur" onClose={() => setSelectedProvider(null)}>
          <div className="drawer-action-row"><button type="button" className="admin-button primary" onClick={() => { setSelectedProvider(null); onEditProvider(selectedProvider) }}><Icon name="edit" size={15} />Modifier</button></div>
          <div className="admin-detail-grid">
            <DetailValue label="Code" value={selectedProvider.code} />
            <DetailValue label="Statut" value={<StatusBadge status={selectedProvider.statut === 'ACTIF' ? 'active' : 'inactive'} label={selectedProvider.statut === 'ACTIF' ? 'Actif' : 'Inactif'} />} />
            <DetailValue label="Variable de clé API" value={selectedProvider.apiKeyEnvVar || 'Non configurée'} wide />
            <DetailValue label="État de la clé" value={selectedProvider.apiKeyEnvVar ? (selectedProvider.apiKeyConfigured ? 'Configurée dans l’environnement' : 'Référence présente, clé indisponible') : 'Non configurée'} wide />
          </div>
          <div className="drawer-section"><h3>Modèles associés</h3><ChipList items={allModels.filter((model) => String(model.providerId) === String(selectedProvider.id)).map((model) => ({ id: model.id, label: model.nomAffichage || model.aliasInterne || model.alias }))} empty="Aucun modèle associé." labelKey="label" /></div>
        </DetailDrawer>
      )}
    </div>
  )
}

function ModelDetailDrawer({ selection, result, testing, onClose, onEdit, onTest }) {
  const { model, adminModel } = selection
  const alias = adminModel ? (adminModel.aliasInterne || adminModel.alias) : model.alias
  const meta = modelCardMeta(alias)
  const title = adminModel?.nomAffichage || model.displayName || alias
  const providerName = adminModel?.providerName || model.providerName || modelProviderName(alias)
  return (
    <DetailDrawer title={title} description={providerName} onClose={onClose}>
      {adminModel && <div className="drawer-action-row"><button type="button" className="admin-button primary" onClick={() => { onClose(); onEdit(adminModel) }}><Icon name="edit" size={15} />Modifier</button><button type="button" className="admin-button secondary" disabled={testing} onClick={() => onTest(adminModel)}>{testing ? 'Test en cours…' : 'Tester la connexion'}</button></div>}
      <div className="drawer-model-heading"><span className="model-mark large"><ModelLogo alias={alias} logoUrl={adminModel?.logoUrl || model.logoUrl} className="admin-model-logo" fallback={meta.initials} /></span><div><h3>{title}</h3><p>{adminModel?.description || model.description || meta.description || 'Modèle LLM disponible dans Synapse.'}</p></div></div>
      <div className="admin-detail-grid">
        <DetailValue label="Statut" value={<StatusBadge status={adminModel ? adminModel.statut : 'available'} label={adminModel ? (adminModel.statut === 'ACTIF' ? 'Actif' : 'Inactif') : 'Disponible'} />} />
        <DetailValue label="Fournisseur" value={providerName} />
        <DetailValue label="Alias interne" value={alias} />
        <DetailValue label="Identifiant fournisseur" value={adminModel?.nomModeleProvider || 'Non configuré'} />
        <DetailValue label="Logo" value={adminModel?.logoUrl ? 'Personnalisé' : 'Logo par défaut'} />
        <DetailValue label="État du test" value={testing ? <span className="model-test-progress"><span />Test en cours</span> : result?.testedAt ? `Terminé · ${formatDate(result.testedAt)}` : 'Non testé'} />
        {result && !testing && <DetailValue label="Résultat du test" value={<StatusBadge status={['OK', 'CONNECTED', 'SUCCESS'].includes(String(result.status).toUpperCase()) ? 'success' : 'error'} label={result.status || 'FAILED'} />} />}
        {result?.latencyMs != null && <DetailValue label="Latence" value={`${result.latencyMs} ms`} />}
      </div>
    </DetailDrawer>
  )
}

function UsersSection({ loading, errorFor, busyAction, users, allUsers, search, setSearch, nameMode, setNameMode, onCreateUser, selectedUser, onSelectUser, keycloakRoles, keycloakRolesError, onRetryKeycloakRoles, selectedRoles, setSelectedRoles, onSaveRoles, restrictions, bannedWords, models, selectedModel, setSelectedModel, userWord, setUserWord, onAddRestriction, onRemoveRestriction, onAddWord, onRemoveWord, onToggleUser }) {
  const actorIsSuperAdmin = hasSuperAdminRole(useContext(AuthContext)?.token)
  return (
    <section className="admin-card">
      <SectionHeading title="Annuaire des utilisateurs" context={`${users.length} résultats`} action={actorIsSuperAdmin ? <button type="button" className="admin-button primary" onClick={onCreateUser}><Icon name="plus" size={15} />Nouvel utilisateur</button> : null} />
      <AdminToolbar><div className="admin-search-field"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, identifiant ou adresse e-mail" aria-label="Rechercher les utilisateurs" /></div><div className="user-name-toggle" role="group" aria-label="Affichage des utilisateurs"><button type="button" aria-pressed={nameMode === 'full-name'} className={nameMode === 'full-name' ? 'active' : ''} onClick={() => setNameMode('full-name')}>Noms complets</button><button type="button" aria-pressed={nameMode === 'username'} className={nameMode === 'username' ? 'active' : ''} onClick={() => setNameMode('username')}>Identifiants</button></div></AdminToolbar>
      {loading('users') ? <QuietLoading /> : errorFor('users') ? <ErrorState message={errorFor('users')} /> : users.length ? (
        <div className="admin-compact-list user-directory">
          {users.map((user) => {
            const displayName = userDirectoryName(user, nameMode)
            return (
              <div key={user.id} className="admin-compact-row interactive user-directory-row" role="button" tabIndex="0" onClick={() => onSelectUser(user)} onKeyDown={(event) => handleRowKey(event, () => onSelectUser(user))}>
                <UserAvatar user={user} label={displayName} />
                <span className="row-main"><strong>{displayName}</strong><small>{user.email || 'Compte Synapse'}</small></span>
                <StatusBadge status={user.enabled !== false ? 'active' : 'inactive'} label={user.enabled !== false ? 'Actif' : 'Inactif'} />
                <Icon name="chevron" size={16} />
              </div>
            )
          })}
        </div>
      ) : <EmptyState icon="users" title="Aucun utilisateur" description={allUsers.length ? 'Aucun résultat pour cette recherche.' : 'Les comptes apparaîtront ici lorsqu’ils seront disponibles.'} />}
      <UserDetails loading={loading('userDetails')} error={errorFor('userDetails')} busyAction={busyAction} user={selectedUser} nameMode={nameMode} onClose={() => onSelectUser(null)} keycloakRoles={keycloakRoles} keycloakRolesError={keycloakRolesError} onRetryKeycloakRoles={onRetryKeycloakRoles} selectedRoles={selectedRoles} setSelectedRoles={setSelectedRoles} onSaveRoles={onSaveRoles} restrictions={restrictions} bannedWords={bannedWords} models={models} selectedModel={selectedModel} setSelectedModel={setSelectedModel} userWord={userWord} setUserWord={setUserWord} onAddRestriction={onAddRestriction} onRemoveRestriction={onRemoveRestriction} onAddWord={onAddWord} onRemoveWord={onRemoveWord} onToggleUser={onToggleUser} />
    </section>
  )
}

function UserDetails({ loading, error, busyAction, user, nameMode, onClose, keycloakRoles, keycloakRolesError, onRetryKeycloakRoles, selectedRoles, setSelectedRoles, onSaveRoles, restrictions, bannedWords, models, selectedModel, setSelectedModel, userWord, setUserWord, onAddRestriction, onRemoveRestriction, onAddWord, onRemoveWord, onToggleUser }) {
  const actorIsSuperAdmin = hasSuperAdminRole(useContext(AuthContext)?.token)
  if (!user) return null
  const targetRoles = user.resolvedRoles || user.roles || user.realmRoles || []
  const normalizedTargetRoles = new Set(targetRoles.map((role) => String(role).toUpperCase()))
  const canManageSettings = canManageUserSettings(actorIsSuperAdmin, targetRoles)
  const canManageAccount = canManageSettings
  const assignableRoles = assignableUserRoles(keycloakRoles)
  const canManage = isUuid(user.externalId)
  const addingRestriction = busyAction === 'user-restriction'
  const addingWord = busyAction === 'user-word'
  const mainRole = roleLabel(selectedRoles[0] || user.roles?.[0] || user.realmRoles?.[0])
  const displayName = userDirectoryName(user, nameMode)

  return (
    <DetailDrawer
      title={displayName}
      onClose={onClose}
      header={<div className="admin-drawer-profile"><UserAvatar user={user} label={displayName} large /><div><h2>{displayName}</h2><p>{user.email || 'Compte Synapse'}</p><div><StatusBadge status={user.enabled !== false ? 'active' : 'inactive'} label={user.enabled !== false ? 'Actif' : 'Inactif'} /><span>{mainRole}</span></div></div></div>}
    >
      <div className="drawer-action-row drawer-action-row-end">
        {!loading && user.keycloakManaged && canManageAccount && <button type="button" className="admin-button secondary" onClick={() => onToggleUser(user)}>{user.enabled !== false ? 'Désactiver le compte' : 'Activer le compte'}</button>}
      </div>
      {loading ? <QuietLoading /> : error ? <ErrorState message={error} /> : !canManageSettings ? (
        <div className="protected-account-state" role="status">
          <span className="protected-account-icon"><Icon name="shieldCheck" size={24} /></span>
          <div>
            <strong>Compte protégé</strong>
            <p>{normalizedTargetRoles.has('SUPER_ADMIN') ? 'Les paramètres d’un super administrateur ne peuvent être modifiés par aucun compte.' : 'Seul un super administrateur peut modifier les paramètres d’un autre administrateur.'}</p>
          </div>
        </div>
      ) : (
        <div className="admin-collapsible-list">
          {canManageAccount && <CollapsibleSection title="Compte et rôles" summary={selectedRoles.length ? `${selectedRoles.length} rôle attribué` : 'Aucun rôle attribué'} count={selectedRoles.length} defaultOpen>
            <div className="role-chip-grid">
              {assignableRoles.length ? assignableRoles.map((role) => {
                const checked = selectedRoles.includes(role.name)
                return <label key={role.id || role.name} className={`role-check ${checked ? 'selected' : ''}`}><input type="radio" name="managed-user-role" checked={checked} onChange={() => setSelectedRoles([role.name])} /><span>{roleLabel(role.name)}</span></label>
              }) : keycloakRolesError ? <div className="role-sync-warning"><span>{keycloakRolesError}</span><button type="button" className="admin-button secondary" onClick={onRetryKeycloakRoles}>Réessayer</button></div> : <span className="muted">Aucun rôle n’est disponible dans Keycloak.</span>}
            </div>
            {assignableRoles.length > 0 && <button type="button" className="admin-button primary" onClick={onSaveRoles} disabled={!user.keycloakManaged || selectedRoles.length !== 1}>Enregistrer le rôle</button>}
          </CollapsibleSection>}

          {canManageSettings && <CollapsibleSection title="Modèles restreints" summary={`${restrictions.length} modèle${restrictions.length !== 1 ? 's' : ''} restreint${restrictions.length !== 1 ? 's' : ''}`} count={restrictions.length}>
            <div className="inline-add-form"><SelectDropdown value={selectedModel} options={[{ value: '', label: 'Choisir un modèle…' }, ...models.map((model) => ({ value: model.alias, label: model.displayName }))]} onChange={setSelectedModel} disabled={!canManage} ariaLabel="Modèle à restreindre" className="admin-custom-dropdown" /><button type="button" className="admin-button secondary" disabled={!canManage || !selectedModel || addingRestriction} title={!canManage ? 'Un UUID Keycloak est requis.' : undefined} onClick={onAddRestriction}>{addingRestriction ? 'Ajout…' : 'Ajouter'}</button></div>
            {!canManage && <p className="helper-text">Les restrictions personnalisées nécessitent l’identifiant Keycloak du compte.</p>}
            <ChipList items={restrictions} empty="Aucune restriction personnalisée." labelKey="llmModelAlias" onRemove={onRemoveRestriction} />
          </CollapsibleSection>}

          {canManageSettings && <CollapsibleSection title="Mots bannis personnels" summary={`${bannedWords.length} mot${bannedWords.length !== 1 ? 's' : ''}`} count={bannedWords.length}>
            <div className="inline-add-form"><input value={userWord} onChange={(event) => setUserWord(event.target.value)} placeholder="Ajouter un mot ou une expression" disabled={!canManage} aria-label="Nouveau mot banni utilisateur" /><button type="button" className="admin-button secondary" disabled={!canManage || !userWord.trim() || addingWord} onClick={onAddWord}>{addingWord ? 'Ajout…' : 'Ajouter'}</button></div>
            <ChipList items={bannedWords} empty="Aucun mot banni spécifique." labelKey="word" onRemove={onRemoveWord} />
          </CollapsibleSection>}
        </div>
      )}
    </DetailDrawer>
  )
}

function ChipList({ items, empty, labelKey, onRemove }) {
  return items.length ? <div className="chip-list">{items.map((item) => <span className="restriction-chip" key={item.id || item[labelKey]}>{item[labelKey]}{onRemove && <button type="button" onClick={() => onRemove(item)} aria-label={`Supprimer ${item[labelKey]}`}><Icon name="close" size={13} /></button>}</span>)}</div> : <span className="muted">{empty}</span>
}

function QuietLoading() {
  return <div className="admin-quiet-loading" role="status"><span className="sr-only">Chargement des informations…</span></div>
}

export function RolesSection({ loading, errorFor, roles, roleCounts = {}, rolesLoading, rolesError, onRetryRoles, role, setRole, restrictions, bannedWords, models, selectedModel, setSelectedModel, word, setWord, onAddRestriction, onRemoveRestriction, onAddWord, onRemoveWord }) {
  return (
    <section className="admin-card">
      <SectionHeading title="Rôles Keycloak" context={roles.length ? `${roles.length} rôles` : undefined} />
      {rolesLoading ? <QuietLoading /> : rolesError ? <ErrorState message={rolesError} onRetry={onRetryRoles} /> : roles.length ? (
        <div className="admin-compact-list role-directory">
          {roles.map((item) => {
            const counts = roleCounts[item] || {}
            return (
              <div key={item} className="admin-compact-row interactive" role="button" tabIndex="0" onClick={() => setRole(item)} onKeyDown={(event) => handleRowKey(event, () => setRole(item))}>
                <span className="row-main"><strong>{roleLabel(item)}</strong><small>Rôle synchronisé avec Keycloak</small></span>
                <span className="role-count">{counts.restrictions == null ? '—' : counts.restrictions}<small>modèles</small></span>
                <span className="role-count">{counts.words == null ? '—' : counts.words}<small>mots bannis</small></span>
                <Icon name="chevron" size={16} />
              </div>
            )
          })}
        </div>
      ) : <EmptyState icon="key" title="Aucun rôle disponible" description="Les rôles administrables proviennent de Keycloak." action={<button type="button" className="admin-button secondary" onClick={onRetryRoles}>Réessayer</button>} />}

      {role && (
        <DetailDrawer title={roleLabel(role)} description="Restrictions héritées par le rôle" onClose={() => setRole('')}>
          {loading ? <QuietLoading /> : errorFor('roles') ? <ErrorState message={errorFor('roles')} onRetry={onRetryRoles} /> : (
            <div className="admin-collapsible-list">
              <CollapsibleSection title="Modèles restreints" summary={`${restrictions.length} restriction${restrictions.length !== 1 ? 's' : ''}`} count={restrictions.length} defaultOpen>
                <div className="inline-add-form"><SelectDropdown value={selectedModel} options={[{ value: '', label: 'Choisir un modèle…' }, ...models.map((model) => ({ value: model.alias, label: model.displayName }))]} onChange={setSelectedModel} ariaLabel="Modèle à restreindre" className="admin-custom-dropdown" /><button type="button" className="admin-button secondary" disabled={!selectedModel} onClick={onAddRestriction}>Ajouter</button></div>
                <ChipList items={restrictions} empty="Aucune restriction de modèle." labelKey="llmModelAlias" onRemove={onRemoveRestriction} />
              </CollapsibleSection>
              <CollapsibleSection title="Mots bannis hérités" summary={`${bannedWords.length} mot${bannedWords.length !== 1 ? 's' : ''}`} count={bannedWords.length}>
                <div className="inline-add-form"><input value={word} onChange={(event) => setWord(event.target.value)} placeholder="Mot ou expression" aria-label="Nouveau mot banni pour le rôle" /><button type="button" className="admin-button secondary" disabled={!word.trim()} onClick={onAddWord}>Ajouter</button></div>
                <ChipList items={bannedWords} empty="Aucun mot banni pour ce rôle." labelKey="word" onRemove={onRemoveWord} />
              </CollapsibleSection>
            </div>
          )}
        </DetailDrawer>
      )}
    </section>
  )
}

const AUDIT_ACTION_OPTIONS = [
  ['', 'Toutes les actions'],
  ['ADD', 'Ajout'],
  ['CREATE', 'Création'],
  ['UPDATE', 'Modification'],
  ['DELETE', 'Suppression'],
  ['STATUS', 'Changement de statut'],
  ['ENABLE', 'Activation'],
  ['DISABLE', 'Désactivation'],
  ['UPDATE_ROLES', 'Modification des rôles'],
]
const FILTERED_ACTION_OPTIONS = [['', 'Toutes les actions'], ['BLOCKED', 'Bloqué'], ['REDACTED', 'Masqué']]
const AUDIT_ENTITY_OPTIONS = [
  ['', 'Toutes les entités'],
  ['GlobalBannedWord', 'Mot banni global'],
  ['UserBannedWord', 'Mot banni utilisateur'],
  ['ROLE_BANNED_WORD', 'Mot banni par rôle'],
  ['UserLlmRestriction', 'Restriction utilisateur'],
  ['ROLE_LLM_RESTRICTION', 'Restriction par rôle'],
  ['DLP_PATTERN', 'Règle DLP'],
  ['LLM_PROVIDER', 'Fournisseur LLM'],
  ['LLM_MODEL', 'Modèle LLM'],
  ['KEYCLOAK_USER', 'Utilisateur Keycloak'],
]

function AuditSection({ loading, error, view, setView, logs, messages, users, search, setSearch, action, setAction, entity, setEntity, date, setDate, filteredSearch, setFilteredSearch, filteredAction, setFilteredAction, filteredUserId, setFilteredUserId, filteredDate, setFilteredDate, expandedId, setExpandedId, page, totalPages, onPageChange }) {
  const rows = view === 'permissions' ? logs : messages
  const actionOptions = view === 'permissions' ? AUDIT_ACTION_OPTIONS : FILTERED_ACTION_OPTIONS
  const currentSearch = view === 'permissions' ? search : filteredSearch
  const currentAction = view === 'permissions' ? action : filteredAction
  const currentDate = view === 'permissions' ? date : filteredDate
  const activeFilterCount = [currentAction, currentDate, view === 'permissions' ? entity : filteredUserId].filter(Boolean).length
  const userNamesById = useMemo(() => new Map(users.flatMap((user) => {
    const id = user.externalId || user.id
    const name = user.nomAffichage || user.username || user.email
    return id && name ? [[String(id), name]] : []
  })), [users])
  const resolveUserName = (id, fallback) => id ? (userNamesById.get(String(id)) || fallback) : fallback
  const resolveAuditTarget = (row) => {
    const raw = String(row.entityId || '')
    if (row.entityName === 'KEYCLOAK_USER') return resolveUserName(raw, 'Utilisateur inconnu')
    if (row.entityName === 'UserBannedWord' || row.entityName === 'USER_BANNED_WORD' || row.entityName === 'UserLlmRestriction' || row.entityName === 'USER_LLM_RESTRICTION') {
      const [userId, ...details] = raw.split(' · ')
      if (details.length) return `${resolveUserName(userId, 'Utilisateur inconnu')} · ${details.join(' · ')}`
    }
    return raw || '—'
  }
  const resetFilters = () => {
    if (view === 'permissions') { setAction(''); setEntity(''); setDate('') }
    else { setFilteredAction(''); setFilteredUserId(''); setFilteredDate('') }
  }

  return (
    <div className="admin-stack">
      <AdminTabs value={view} onChange={(next) => { setView(next); setExpandedId(null) }} label="Vue du journal" tabs={[{ value: 'permissions', label: 'Modifications d’autorisations' }, { value: 'filtered', label: 'Messages filtrés' }]} />
      <section className="admin-card">
        <SectionHeading title={view === 'permissions' ? 'Modifications d’autorisations' : 'Messages filtrés'} context={`${rows.length} résultats sur cette page`} />
        <AdminToolbar>
          <div className="admin-search-field"><Icon name="search" size={16} /><input value={currentSearch} onChange={(event) => view === 'permissions' ? setSearch(event.target.value) : setFilteredSearch(event.target.value)} placeholder="Rechercher dans le journal" aria-label="Rechercher dans le journal" /></div>
          <FilterPopover activeCount={activeFilterCount}>
            <div className="filter-popover-heading"><strong>Filtres</strong><button type="button" onClick={resetFilters}>Réinitialiser</button></div>
            <label className="admin-field"><span>Action</span><SelectDropdown value={currentAction} options={actionOptions.map(([value, label]) => ({ value, label }))} onChange={(value) => view === 'permissions' ? setAction(value) : setFilteredAction(value)} ariaLabel="Filtrer par action" className="admin-custom-dropdown" /></label>
            {view === 'permissions' ? (
              <label className="admin-field"><span>Entité</span><SelectDropdown value={entity} options={AUDIT_ENTITY_OPTIONS.map(([value, label]) => ({ value, label }))} onChange={setEntity} ariaLabel="Filtrer par entité" className="admin-custom-dropdown" /></label>
            ) : <label className="admin-field"><span>Utilisateur</span><input value={filteredUserId} onChange={(event) => setFilteredUserId(event.target.value)} placeholder="Identifiant Keycloak" /></label>}
            <label className="admin-field"><span>Date</span><DateFilterInput key={`${view}:${currentDate}`} value={currentDate} onChange={view === 'permissions' ? setDate : setFilteredDate} /></label>
          </FilterPopover>
        </AdminToolbar>

        {activeFilterCount > 0 && <div className="active-filter-line"><span>{activeFilterCount} filtre{activeFilterCount !== 1 ? 's' : ''} actif{activeFilterCount !== 1 ? 's' : ''}</span><button type="button" onClick={resetFilters}>Effacer</button></div>}

        {loading ? <QuietLoading /> : error ? <ErrorState message={error} /> : rows.length ? (
          <div className="admin-compact-list audit-list">
            {rows.map((row) => {
              const id = row.id || row.timestamp
              const logId = row.id || '—'
              const expanded = expandedId === id
              const isMessage = view === 'filtered'
              const userId = isMessage ? row.userKeycloakId : row.performedBy
              const userName = resolveUserName(userId, isMessage || userId ? 'Utilisateur inconnu' : 'Système')
              const resourceDetail = isMessage ? (row.detectedTypes || 'Catégorie non précisée') : resolveAuditTarget(row)
              const status = isMessage ? row.requestStatus || row.action : row.action
              return (
                <div key={id} className={`audit-item ${expanded ? 'expanded' : ''}`}>
                  <div className={`admin-compact-row ${isMessage ? 'interactive message-audit-row' : 'permission-audit-row'}`} {...(isMessage ? { role: 'button', tabIndex: 0, 'aria-expanded': expanded, onClick: () => setExpandedId(expanded ? null : id), onKeyDown: (event) => handleRowKey(event, () => setExpandedId(expanded ? null : id)) } : {})}>
                    <span className="row-main"><strong>{isMessage ? (row.reason || 'Événement DLP') : formatEntity(row.entityName)}</strong><small>{isMessage ? resourceDetail : `Journal #${logId} · Cible ${resourceDetail}`}</small></span>
                    {isMessage ? <><StatusBadge status={row.action} label={formatAction(row.action)} className="audit-action-badge" /><span className="audit-actor">{userName}</span><time dateTime={row.timestamp}>{formatDate(row.timestamp)}</time><StatusBadge status={status} label={formatAction(status)} className="audit-state-badge" /><Icon name="chevron" size={16} /></> : <span className="audit-permission-meta"><StatusBadge status={row.action} label={formatAction(row.action)} className="audit-action-badge" /><span className="audit-actor">{userName}</span><time dateTime={row.timestamp}>{formatDate(row.timestamp)}</time></span>}
                  </div>
                  {isMessage && expanded && <div className="audit-detail-panel"><div className="admin-detail-grid"><DetailValue label="ID du journal" value={logId} /><DetailValue label="Catégorie" value={resourceDetail} /><DetailValue label="Détections" value={row.detectionCount ?? 0} /></div><SafeContent value={row.redactedContent} /></div>}
                </div>
              )
            })}
          </div>
        ) : <EmptyState icon="activity" title="Aucun événement" description={view === 'permissions' ? 'Les changements d’autorisation apparaîtront ici.' : 'Aucun message filtré ne correspond à ces critères.'} />}
        <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
      </section>
    </div>
  )
}

function DateFilterInput({ value, onChange }) {
  const [displayValue, setDisplayValue] = useState(() => formatDateFilterValue(value))

  const handleChange = (event) => {
    const nextDisplayValue = formatDateFilterDigits(event.target.value)
    setDisplayValue(nextDisplayValue)
    if (!nextDisplayValue) onChange('')
    else {
      const parsedValue = parseDateFilterValue(nextDisplayValue)
      if (parsedValue) onChange(parsedValue)
    }
  }

  const handleBlur = () => {
    if (displayValue && !parseDateFilterValue(displayValue)) {
      setDisplayValue(formatDateFilterValue(value))
    }
  }

  return <input type="text" inputMode="numeric" autoComplete="off" placeholder="jj/mm/aaaa" aria-label="Date au format jour mois année" maxLength={10} value={displayValue} onChange={handleChange} onBlur={handleBlur} />
}
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) }
function dateRange(value) { if (!value) return {}; const [year, month, day] = value.split('-').map(Number); if (!year || !month || !day) return {}; return { from: new Date(year, month - 1, day, 0, 0, 0, 0).toISOString(), to: new Date(year, month - 1, day, 23, 59, 59, 999).toISOString() } }

function PatternModal({ data, busy, onClose, onSave }) { const [form, setForm] = useState(data); const update = (key, value) => setForm((current) => ({ ...current, [key]: value })); return <Modal title={data.mode === 'edit' ? 'Modifier le pattern' : 'Ajouter un pattern'} description="Une règle courte et explicite est plus facile à auditer." onClose={onClose}><form className="admin-modal-form" onSubmit={(event) => { event.preventDefault(); if (!form.name.trim() || !form.pattern.trim()) return; onSave({ ...form, name: form.name.trim(), pattern: form.pattern.trim() }) }}><Field label="Nom"><input value={form.name} onChange={(event) => update('name', event.target.value)} required disabled={data.mode === 'edit'} /></Field><Field label="Type"><input value={form.type} onChange={(event) => update('type', event.target.value)} required /></Field><Field label="Expression régulière"><textarea className="code-input" value={form.pattern} onChange={(event) => update('pattern', event.target.value)} required rows="4" /></Field><div className="form-grid"><DropdownField label="Sévérité" value={form.severity} options={SEVERITY_OPTIONS} onChange={(value) => update('severity', value)} /><DropdownField label="Action" value={form.action} options={DLP_ACTION_OPTIONS} onChange={(value) => update('action', value)} /></div><label className="checkbox-line"><input type="checkbox" checked={form.enabled !== false} onChange={(event) => update('enabled', event.target.checked)} /> Pattern actif</label><div className="admin-modal-actions"><button type="button" className="admin-button secondary" onClick={onClose}>Annuler</button><button type="submit" className="admin-button primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div></form></Modal> }
function ProviderModal({ data, busy, onClose, onSave }) { const [form, setForm] = useState(data); const update = (key, value) => setForm((current) => ({ ...current, [key]: value })); return <Modal title={data.mode === 'edit' ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'} description="La clé reste dans l’environnement ; Synapse ne conserve que le nom de variable." onClose={onClose}><form className="admin-modal-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, name: form.name.trim(), code: form.code.trim() }) }}><Field label="Code fournisseur"><input value={form.code} onChange={(event) => update('code', event.target.value)} required /></Field><Field label="Nom affiché"><input value={form.name} onChange={(event) => update('name', event.target.value)} required /></Field><Field label="Variable de clé API"><input value={form.apiKeyEnvVar} onChange={(event) => update('apiKeyEnvVar', event.target.value.toUpperCase())} pattern="[A-Z][A-Z0-9_]{1,99}" placeholder="OPENAI_API_KEY" /></Field><DropdownField label="Statut" value={form.status || 'ACTIF'} options={STATUS_OPTIONS} onChange={(value) => update('status', value)} /><div className="admin-modal-actions"><button type="button" className="admin-button secondary" onClick={onClose}>Annuler</button><button type="submit" className="admin-button primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div></form></Modal> }
function ModelModal({ data, providers, busy, onClose, onSave }) {
  const [form, setForm] = useState(data)
  const [logoError, setLogoError] = useState('')
  const initialLogoIsLocal = data.logoUrl?.startsWith('data:')
  const [logoMode, setLogoMode] = useState(initialLogoIsLocal ? 'local' : 'url')
  const [urlLogo, setUrlLogo] = useState(initialLogoIsLocal ? '' : (data.logoUrl || ''))
  const [localLogo, setLocalLogo] = useState(initialLogoIsLocal ? data.logoUrl : '')
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const selectedLogo = logoMode === 'local' ? localLogo : urlLogo

  const selectLogoFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!MODEL_LOGO_TYPES.has(file.type)) {
      setLogoError('Choisissez une image PNG, JPEG, WebP ou GIF.')
      return
    }
    if (file.size > MAX_MODEL_LOGO_BYTES) {
      setLogoError('Le logo local ne doit pas dépasser 512 Ko.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setLocalLogo(String(reader.result || ''))
      setLogoError('')
    }
    reader.onerror = () => setLogoError('Impossible de lire ce fichier.')
    reader.readAsDataURL(file)
  }

  return (
    <Modal title={data.mode === 'edit' ? 'Modifier le modèle' : 'Configurer un modèle'} description="Configurez un alias déjà disponible dans LiteLLM et personnalisez son affichage." onClose={onClose} size="large">
      <form className="admin-modal-form model-modal-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, logoUrl: selectedLogo }) }}>
        <div className="model-form-grid">
          <DropdownField label="Fournisseur" value={String(form.providerId || '')} options={[{ value: '', label: 'Choisir un fournisseur…' }, ...providers.map((provider) => ({ value: String(provider.id), label: provider.nom || provider.name || provider.code }))]} onChange={(value) => update('providerId', value)} />
          <DropdownField label="Statut" value={form.status || 'ACTIF'} options={STATUS_OPTIONS} onChange={(value) => update('status', value)} />
          <Field label="Alias interne"><input value={form.alias} onChange={(event) => update('alias', event.target.value)} disabled={Boolean(data.id)} required placeholder="ex. secure-gpt" /></Field>
          <Field label="Identifiant chez le fournisseur"><input value={form.providerModel} onChange={(event) => update('providerModel', event.target.value)} required placeholder="ex. openai/gpt-4o-mini" /></Field>
          <Field label="Nom affiché" wide><input value={form.displayName} onChange={(event) => update('displayName', event.target.value)} required /></Field>
          <Field label="Description" wide><textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows="2" /></Field>
        </div>
        <div className="model-logo-field">
          <div className="model-logo-field-heading"><span>Logo</span><div className="model-logo-source" role="tablist" aria-label="Source du logo"><button type="button" role="tab" aria-selected={logoMode === 'url'} className={logoMode === 'url' ? 'active' : ''} onClick={() => { setLogoMode('url'); setLogoError('') }}>URL</button><button type="button" role="tab" aria-selected={logoMode === 'local'} className={logoMode === 'local' ? 'active' : ''} onClick={() => { setLogoMode('local'); setLogoError('') }}>Local</button></div></div>
          <div className="model-logo-picker"><div className="model-logo-preview"><ModelLogo alias={form.alias} logoUrl={selectedLogo} fallback={modelCardMeta(form.alias || 'model').initials} /></div><div className="model-logo-control">{logoMode === 'url' ? <input className="model-logo-url-input" type="url" value={urlLogo} onChange={(event) => { setUrlLogo(event.target.value); setLogoError('') }} placeholder="https://…" aria-label="URL du logo" /> : <label className="admin-button secondary model-logo-file-button">{localLogo ? 'Changer le logo local' : 'Choisir un logo local'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={selectLogoFile} /></label>}{selectedLogo && <button type="button" className="admin-text-button" onClick={() => { if (logoMode === 'local') setLocalLogo(''); else setUrlLogo(''); setLogoError('') }}>Retirer</button>}<small className="admin-field-help">{logoMode === 'local' ? 'PNG, JPEG, WebP ou GIF · 512 Ko maximum.' : 'URL HTTPS publique vers l’image du modèle.'}</small>{logoError && <small className="admin-field-error" role="alert">{logoError}</small>}</div></div>
        </div>
        <div className="admin-modal-actions"><button type="button" className="admin-button secondary" onClick={onClose}>Annuler</button><button type="submit" className="admin-button primary" disabled={busy || Boolean(logoError) || !form.providerId}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>
      </form>
    </Modal>
  )
}
function UserModal({ data, roles, busy, onClose, onSave }) {
  const roleOptions = roles.map((role) => ({ value: role.name, label: roleLabel(role.name) }))
  const initialRole = roleOptions.some((option) => option.value === data.role) ? data.role : (roleOptions[0]?.value || '')
  const [form, setForm] = useState({ ...data, role: initialRole })
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  return (
    <Modal title="Créer un utilisateur" description="Le compte sera créé dans Keycloak avec le rôle sélectionné." onClose={onClose}>
      <form className="admin-modal-form" onSubmit={(event) => {
        event.preventDefault()
        onSave({
          ...form,
          username: form.username.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
        })
      }}>
        <div className="form-grid">
          <Field label="Prénom"><input value={form.firstName} onChange={(event) => update('firstName', event.target.value)} autoComplete="given-name" /></Field>
          <Field label="Nom"><input value={form.lastName} onChange={(event) => update('lastName', event.target.value)} autoComplete="family-name" /></Field>
        </div>
        <Field label="Nom d’utilisateur"><input value={form.username} onChange={(event) => update('username', event.target.value)} autoComplete="username" required /></Field>
        <Field label="Adresse e-mail"><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" required /></Field>
        <Field label="Mot de passe"><input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} autoComplete="new-password" minLength="8" required /></Field>
        <DropdownField label="Rôle" value={form.role} options={roleOptions} onChange={(value) => update('role', value)} disabled={!roleOptions.length} />
        <label className="checkbox-line"><input type="checkbox" checked={form.temporaryPassword} onChange={(event) => update('temporaryPassword', event.target.checked)} /> Demander un nouveau mot de passe à la première connexion</label>
        <div className="admin-modal-actions"><button type="button" className="admin-button secondary" onClick={onClose}>Annuler</button><button type="submit" className="admin-button primary" disabled={busy || !form.role}>{busy ? 'Création…' : 'Créer l’utilisateur'}</button></div>
      </form>
    </Modal>
  )
}
function DropdownField({ label, value, options, onChange, disabled = false, placeholder }) {
  return (
    <div className="admin-field">
      <span>{label}</span>
      <SelectDropdown
        value={value}
        options={options}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={label}
        className="admin-custom-dropdown"
      />
    </div>
  )
}

function Field({ label, children, wide = false }) { return <label className={`admin-field${wide ? ' admin-field-wide' : ''}`}><span>{label}</span>{children}</label> }
