import { useContext, useState } from 'react'
import { getInitials, getRoleLabel } from '../../utils/authUtils'
import { AuthContext } from '../../AuthProvider'
import ArchiveTabs from '../conversations/components/ArchiveTabs'
import ConversationList from '../conversations/components/ConversationList'
import { Icon } from '../admin/AdminComponents'
import { ADMIN_NAV_ITEMS } from '../admin/AdminUtils'
import ConfirmDialog from '../../components/common/ConfirmDialog'

export default function Sidebar({
  activeConversation,
  isBackgrounded,
  admin,
  archiveConversation,
  closeSidebarPanels,
  closeTransientMenus,
  collapsedPanel,
  conversations,
  deleteConversation,
  editingConversationId,
  editingTitle,
  historyError,
  isAccountMenuOpen,
  isModelsView,
  isSearchModalOpen,
  isSidebarOpen,
  isLoadingHistory,
  loadConversations,
  newConversation,
  openConversation,
  openMenuId,
  renameConversation,
  restoreConversation,
  saveInlineRename,
  setActiveView,
  setCollapsedPanel,
  setEditingConversationId,
  setEditingTitle,
  setIsAccountMenuOpen,
  setIsSearchModalOpen,
  setIsSidebarOpen,
  setModelFilter,
  setOpenMenuId,
  setSearch,
  setShowArchived,
  setShowTabs,
  showArchived,
  showTabs,
  toggleCollapsedPanel,
  toggleSidebar,
}) {
  const keycloak = useContext(AuthContext)
  const [isSidebarOpening, setIsSidebarOpening] = useState(false)
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false)
  const displayName =
    keycloak?.tokenParsed?.name ||
    keycloak?.tokenParsed?.preferred_username ||
    'Utilisateur'
  const initials = getInitials(displayName)
  const email = keycloak?.tokenParsed?.email || ''
  const roleLabel = getRoleLabel(keycloak?.token)

  // Keep the same sidebar shell mounted and only switch its navigation content.
  // This is what allows the chat navigation to visually transition into admin navigation.
  const isAdminMode = Boolean(admin?.showAdminDashboard)

  const historyListProps = {
    activeConversation,
    archiveConversation,
    conversations,
    deleteConversation,
    editingConversationId,
    editingTitle,
    historyError,
    isLoadingHistory,
    loadConversations,
    openMenuId,
    renameConversation,
    restoreConversation,
    saveInlineRename,
    setEditingConversationId,
    setEditingTitle,
    setIsAccountMenuOpen,
    setOpenMenuId,
    showArchived,
  }

  const handleAdminClick = () => {
    setIsAccountMenuOpen(false)
    admin?.setShowAdminDashboard(true)
  }

  const closeAdminDashboard = () => {
    admin?.setShowAdminDashboard(false)
  }

  return (
    <>
      {isSidebarOpen && <button className="mobile-overlay" type="button" aria-label="Fermer" onClick={toggleSidebar} />}

      <aside
        aria-hidden={isBackgrounded || undefined}
        className={`sidebar ${isAdminMode ? 'admin-mode' : 'chat-mode'} ${isBackgrounded ? 'is-backgrounded' : ''} ${isSidebarOpening ? 'sidebar-opening' : ''}`.trim()}
        aria-label="Navigation Synapse"
        data-menu-root
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'width') {
            setIsSidebarOpening(false)
          }
        }}
      >
        <div className="sidebar-header">
          <button
            className="sidebar-brand"
            type="button"
            aria-label={isSidebarOpen ? 'Synapse' : 'Ouvrir la sidebar'}
            onClick={() => {
              if (!isSidebarOpen) {
                closeSidebarPanels()
                setIsSidebarOpening(true)
                setIsSidebarOpen(true)
              }
            }}
          >
            <span className="sidebar-logo" aria-hidden="true">
              <img className="sidebar-logo-default" src="/assets/synapse-logo.png" alt="" />
              <img className="sidebar-logo-hover" src="/assets/synapse-hover.png" alt="" />
            </span>
            <span>Synapse</span>
          </button>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={isSidebarOpen ? 'Réduire la sidebar' : 'Ouvrir la sidebar'}
            aria-expanded={isSidebarOpen}
            onClick={toggleSidebar}
          >
            <img src="/assets/sidebar.png" alt="" />
          </button>
        </div>

        <div className="sidebar-navigation-switch">

          <div className="sidebar-chat-nav">
            <nav className="sidebar-navigation" aria-label="Actions principales">
              <div className="sidebar-primary-nav">
                <button
                  type="button"
                  title="Nouvelle conversation"
                  aria-label="Nouvelle conversation"
                  onClick={() => {
                    closeAdminDashboard()
                    closeSidebarPanels()
                    newConversation()
                  }}
                >
                  <span className="sidebar-icon" aria-hidden="true">
                    <img src="/assets/new-tab.png" alt="" />
                  </span>
                  <span>Nouvelle conversation</span>
                </button>

                <button
                  className={isSearchModalOpen ? 'active' : ''}
                  type="button"
                  title="Rechercher"
                  aria-label="Rechercher"
                  onClick={() => {
                    setIsSearchModalOpen(true)
                    setIsAccountMenuOpen(false)
                    setCollapsedPanel(null)
                  }}
                >
                  <span className="sidebar-icon" aria-hidden="true">
                    <img src="/assets/search.png" alt="" />
                  </span>
                  <span>Rechercher</span>
                </button>

                <button
                  className={isModelsView ? 'active' : ''}
                  type="button"
                  title="Explorer les modèles"
                  aria-label="Explorer les modèles"
                  onClick={() => {
                    closeAdminDashboard()
                    closeTransientMenus()
                    setIsAccountMenuOpen(false)
                    setActiveView((current) =>
                      current === 'models' ? 'chat' : 'models'
                    )
                  }}
                >
                  <span className="sidebar-icon" aria-hidden="true">
                    <img src="/assets/compass.png" alt="" />
                  </span>
                  <span>Explorer les modèles</span>
                </button>
              </div>

              <button
                className={`recent-nav-button ${
                  collapsedPanel === 'history' ? 'active' : ''
                }`}
                type="button"
                title="Discussions récentes"
                aria-label="Discussions récentes"
                onClick={() => {
                  closeAdminDashboard()
                  setShowArchived(false)

                  if (isSidebarOpen) {
                    setIsAccountMenuOpen(false)
                    setActiveView('chat')
                    setCollapsedPanel(null)
                    setModelFilter('')
                    setSearch('')
                    setOpenMenuId(null)
                  } else {
                    setActiveView('chat')
                    setModelFilter('')
                    setSearch('')
                    setOpenMenuId(null)
                    toggleCollapsedPanel('history')
                  }
                }}
              >
                <span className="sidebar-icon" aria-hidden="true">
                  <img src="/assets/message.png" alt="" />
                </span>
                <span>Discussions récentes</span>
              </button>
            </nav>

            <section className="recent-section">
              <div className="history-heading">
                <span>Récents</span>

                <button
                  type="button"
                  className="archive-toggle"
                  title={
                    showTabs
                      ? 'Masquer les filtres archivés'
                      : 'Afficher les filtres archivés'
                  }
                  aria-label={
                    showTabs
                      ? 'Masquer les filtres archivés'
                      : 'Afficher les filtres archivés'
                  }
                  aria-expanded={showTabs}
                  onClick={() => setShowTabs(!showTabs)}
                >
                  <img
                    src="/assets/archive.png"
                    alt=""
                    aria-hidden="true"
                  />
                </button>
              </div>

              {showTabs && (
                <ArchiveTabs
                  showArchived={showArchived}
                  setShowArchived={setShowArchived}
                />
              )}

              <ConversationList
                {...historyListProps}
                openConversation={openConversation}
              />
            </section>
          </div>

          {admin?.isAdmin && (
            <div className="sidebar-admin-mode-nav">
              <nav className="sidebar-navigation admin-sidebar-navigation" aria-label="Navigation administration">
                <div className="sidebar-primary-nav">
                  {ADMIN_NAV_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      className={admin?.adminSection === item.id ? 'active' : ''}
                      type="button"
                      aria-current={admin?.adminSection === item.id ? 'page' : undefined}
                      onClick={() => admin?.setAdminSection?.(item.id)}
                    >
                      <span className="sidebar-icon admin-nav-icon" aria-hidden="true">
                        <Icon name={item.icon} size={19} strokeWidth={1.4} />
                      </span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </nav>
            </div>
          )}

        </div>

        {admin?.isAdmin && (
          <nav className="sidebar-admin-navigation" aria-label={isAdminMode ? 'Espace utilisateur' : 'Administration'}>
            <button
              type="button"
              title={isAdminMode ? 'Espace utilisateur' : 'Administration'}
              aria-label={isAdminMode ? 'Espace utilisateur' : 'Administration'}
              onClick={isAdminMode ? closeAdminDashboard : handleAdminClick}
            >
              <span className="sidebar-icon sidebar-mode-control chat-action" aria-hidden="true">
                <img src="/assets/administrateur.png" alt="" />
              </span>
              <span className="sidebar-icon sidebar-mode-control admin-action admin-back-icon" aria-hidden="true">
                <img src="/assets/message.png" alt="" />
              </span>
              <span className="sidebar-mode-label chat-action">Administration</span>
              <span className="sidebar-mode-label admin-action">Espace utilisateur</span>
            </button>
          </nav>
        )}

        <div className={`sidebar-user ${isSidebarOpen && isAccountMenuOpen ? 'account-menu-open' : ''}`} data-menu-root>
          <button
            type="button"
            title="Compte"
            aria-label="Compte"
            onClick={() => {
              if (isAccountMenuOpen) {
                setIsAccountMenuOpen(false)
                return
              }
              closeTransientMenus()
              setIsAccountMenuOpen(true)
            }}
          >
            <span className="user-avatar-wrapper">
              <span className="user-avatar">{initials}</span>
            </span>
            <span className="user-copy">
              <strong>{displayName}</strong>
            </span>
          </button>
          {isSidebarOpen && isAccountMenuOpen && (
            <AccountPopover displayName={displayName} email={email} roleLabel={roleLabel} initials={initials} onRequestLogout={() => setShowLogoutConfirmation(true)} />
          )}
        </div>
      </aside>

      {!isSidebarOpen && isAccountMenuOpen && (
        <AccountPopover className="account-popover-collapsed" displayName={displayName} email={email} roleLabel={roleLabel} initials={initials} onRequestLogout={() => setShowLogoutConfirmation(true)} />
      )}

      {!isSidebarOpen && collapsedPanel && (
        <div className="collapsed-panel" data-menu-root>
          <div className="collapsed-panel-header">
            <strong>{collapsedPanel === 'history' ? 'Discussions récentes' : 'Rechercher'}</strong>
          </div>

          {(collapsedPanel === 'search' || collapsedPanel === 'history') && (
            <ArchiveTabs showArchived={showArchived} setShowArchived={setShowArchived} />
          )}
          <ConversationList
            {...historyListProps}
            openConversation={async (conversation) => {
              await openConversation(conversation)
              setCollapsedPanel(null)
            }}
          />
        </div>
      )}
      {showLogoutConfirmation && (
        <ConfirmDialog
          title="Se déconnecter ?"
          message="Votre session Synapse sera fermée sur cet appareil."
          confirmLabel="Se déconnecter"
          cancelLabel="Annuler"
          onCancel={() => setShowLogoutConfirmation(false)}
          onConfirm={() => keycloak?.logout({ redirectUri: window.location.origin })}
        />
      )}
    </>
  )
}

function AccountPopover({ className = 'account-popover-open', displayName, email, roleLabel, initials, onRequestLogout }) {
  return (
    <div className={`account-popover ${className}`} role="menu" data-menu-root>
      <div className="account-popover-profile">
        <span className="user-avatar" aria-hidden="true">{initials}</span>
        <div className="account-popover-identity">
          <strong>{displayName}</strong>
          {email && <small>{email}</small>}
          <span className="account-popover-role">{roleLabel}</span>
        </div>
      </div>
      <button
        type="button"
        role="menuitem"
        className="account-popover-logout"
        onClick={onRequestLogout}
      >
        <Icon name="logout" size={15} />
        Se déconnecter
      </button>
    </div>
  )
}
