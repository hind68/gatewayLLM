import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { AuthContext } from './AuthProvider'
import useConversations from './features/conversations/hooks/useConversations'
import AppLayout from './features/layout/AppLayout'
import useAppMenus from './features/layout/hooks/useAppMenus'
import useChatController from './features/chat/hooks/useChatController'
import useChatUi from './features/chat/hooks/useChatUi'
import useModels from './features/models/hooks/useModels'
import { hasAdminRole } from './utils/authUtils'

function App() {
  const keycloak = useContext(AuthContext)
  const token = keycloak?.token
  const isAdmin = hasAdminRole(token)

  const [notifications, setNotifications] = useState([])
  const notificationIdRef = useRef(0)
  const lastNotifiedRef = useRef(new Map())
  const [showTabs, setShowTabs] = useState(false)
  const [showAdminDashboard, setShowAdminDashboardState] = useState(
    () => isAdmin && window.localStorage.getItem('synapse-active-workspace') === 'admin',
  )

  useEffect(() => {
    // On a hard refresh, Keycloak's token is not available yet during the
    // very first render, so `isAdmin` is briefly false and the lazy
    // initializer above misses the saved workspace. Re-sync once the token
    // (and therefore isAdmin) has loaded, so a refresh from the admin
    // dashboard lands back on the admin dashboard instead of the chat view.
    if (isAdmin && window.localStorage.getItem('synapse-active-workspace') === 'admin') {
      setShowAdminDashboardState(true)
    }
  }, [isAdmin])

  const setShowAdminDashboard = useCallback((nextValue) => {
    const currentValue = showAdminDashboard
    const requestedValue = typeof nextValue === 'function' ? nextValue(currentValue) : nextValue
    const resolvedValue = Boolean(requestedValue) && isAdmin
    if (resolvedValue === currentValue) return

    const updateView = () => {
      flushSync(() => {
        setShowAdminDashboardState(resolvedValue)
      })
    }

    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      updateView()
      return
    }

    document.startViewTransition(updateView)
  }, [isAdmin, showAdminDashboard])

  const showError = useCallback((message) => {
    setNotifications((current) => appendNotification(current, notificationIdRef, lastNotifiedRef, 'error', message))
  }, [])

  const showNotice = useCallback((message) => {
    setNotifications((current) => appendNotification(current, notificationIdRef, lastNotifiedRef, 'success', message))
  }, [])

  const clearChatError = useCallback(() => {
    setNotifications((current) => current.filter((notification) => notification.kind !== 'error'))
  }, [])

  const clearFeedback = useCallback(() => {
    setNotifications([])
  }, [])

  const dismissNotification = useCallback((id) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }, [])

  const menus = useAppMenus({
    onEscape: () => {
      clearFeedback()
    },
  })

  const models = useModels({
    activeConversation: null,
    onError: showError,
    onLoaded: clearChatError,
  })

  const conversations = useConversations({
    selectedModel: models.selectedModel,
    setSelectedModel: models.setSelectedModel,
    navigation: {
      closeSidePanelOnMobile: menus.closeSidePanelOnMobile,
      closeTransientMenus: menus.closeTransientMenus,
      setActiveView: menus.setActiveView,
      setIsModelMenuOpen: menus.setIsModelMenuOpen,
    },
    feedback: {
      clearChatError,
      showError,
      showNotice,
    },
  })

  const chat = useChatUi({
    activeConversationIdRef: conversations.status.activeConversationIdRef,
    activeModelAlias: models.activeModelAlias,
    isGenerating: conversations.status.isGenerating,
    loadConversations: conversations.actions.loadConversations,
    modelDisplayName: models.modelDisplayName,
    setConversationUiStatus: conversations.status.setConversationUiStatus,
    showError,
    showNotice,
  })

  const controller = useChatController({
    chat,
    conversations,
    models,
    navigation: {
      closeSidePanelOnMobile: menus.closeSidePanelOnMobile,
      setIsModelMenuOpen: menus.setIsModelMenuOpen,
    },
    feedback: {
      clearChatError,
      showError,
    },
  })

  useEffect(() => {
    window.localStorage.setItem('synapse-active-workspace', showAdminDashboard ? 'admin' : 'chat')
  }, [isAdmin, showAdminDashboard])

  const conversationProps = {
    ...conversations,
    actions: {
      ...conversations.actions,
      ...controller,
    },
  }

  return (
    <AppLayout
      layout={{
        closeSidebarPanels: menus.closeSidebarPanels,
        closeTransientMenus: menus.closeTransientMenus,
        collapsedPanel: menus.collapsedPanel,
        isAccountMenuOpen: menus.isAccountMenuOpen,
        isHeaderMenuOpen: menus.isHeaderMenuOpen,
        isModelMenuOpen: menus.isModelMenuOpen,
        isModelsView: menus.isModelsView,
        isSearchModalOpen: menus.isSearchModalOpen,
        isSidebarOpen: menus.isSidebarOpen,
        openMenuId: menus.openMenuId,
        searchInputRef: menus.searchInputRef,
        setActiveView: menus.setActiveView,
        setCollapsedPanel: menus.setCollapsedPanel,
        setIsAccountMenuOpen: menus.setIsAccountMenuOpen,
        setIsHeaderMenuOpen: menus.setIsHeaderMenuOpen,
        setIsModelMenuOpen: menus.setIsModelMenuOpen,
        setIsSearchModalOpen: menus.setIsSearchModalOpen,
        setIsSidebarOpen: menus.setIsSidebarOpen,
        setOpenMenuId: menus.setOpenMenuId,
        toggleCollapsedPanel: menus.toggleCollapsedPanel,
        toggleSidebar: menus.toggleSidebar,
      }}
      sidebar={{
        showTabs,
        setShowTabs,
      }}
      chat={chat}
      models={models}
      conversations={conversationProps}
      feedback={{
        notifications,
        onDismissNotification: dismissNotification,
      }}
      admin={{
        isAdmin,
        showAdminDashboard,
        setShowAdminDashboard,
        onError: showError,
        onNotice: showNotice,
        onModelsChanged: models.refreshModels,
      }}
    />
  )
}

export default App

// Repeated failures (e.g. a background poll retrying the same error) must not
// flood the toast stack: beyond de-duplicating what's currently on screen, a
// short cooldown also blocks the same message from reappearing right after it
// auto-dismisses.
const RENOTIFY_COOLDOWN_MS = 6000

function appendNotification(current, idRef, lastNotifiedRef, kind, message) {
  const normalizedMessage = String(message || '').trim()
  if (!normalizedMessage) return current
  const key = `${kind}:${normalizedMessage}`
  const now = Date.now()
  const lastShownAt = lastNotifiedRef.current.get(key)
  if (lastShownAt != null && now - lastShownAt < RENOTIFY_COOLDOWN_MS) return current
  if (current.some((item) => item.kind === kind && item.message === normalizedMessage)) return current
  lastNotifiedRef.current.set(key, now)
  idRef.current += 1
  return [...current, { id: idRef.current, kind, message: normalizedMessage }]
}
