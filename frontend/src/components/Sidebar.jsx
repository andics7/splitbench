import { useState, useEffect, useRef } from 'react';
import './Sidebar.css';

function formatUsd(amount) {
  if (amount == null) return '—';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onResetToNew,
  onDeleteConversation,
  onEditConversation,
  onOpenModelSelector,
  onOpenPromptLibrary,
  onOpenAnalytics,
  activeView,
  balance,
  width,
  isCollapsed,
  onToggleCollapse,
}) {
  const [showMenuId, setShowMenuId] = useState(null);
  const [isBalanceExpanded, setIsBalanceExpanded] = useState(true);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showMenuId) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenuId]);

  const NewChatIcon = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M16 4h4v4" />
      <path d="M13 11 20 4" />
    </svg>
  );

  const ModelsIcon = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="11" cy="18" r="2" />
    </svg>
  );

  const EvalsIcon = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M6 5h9a2 2 0 0 1 2 2v12H8a2 2 0 0 0-2 2V5z" />
      <path d="M8 21h10" />
      <path d="M10 9h5" />
      <path d="M10 13h5" />
    </svg>
  );

  const AnalyticsIcon = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <rect x="4" y="14" width="4" height="6" rx="1" />
      <rect x="10" y="8" width="4" height="12" rx="1" />
      <rect x="16" y="4" width="4" height="16" rx="1" />
    </svg>
  );

  const SidebarPanelIcon = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  );

  const ChevronDownIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );

  const ChevronUpIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );

  const handleDeleteClick = (e, convId) => {
    e.stopPropagation();
    setShowMenuId(null);
    onDeleteConversation(convId);
  };

  const collapseLabel = isCollapsed ? 'Open sidebar' : 'Collapse sidebar';
  const newChatTooltip = isCollapsed ? 'New chat' : undefined;
  const modelsTooltip = isCollapsed ? 'Configure models' : undefined;
  const evalsTooltip = isCollapsed ? 'Evals library' : undefined;
  const analyticsTooltip = isCollapsed ? 'Analytics' : undefined;

  return (
    <div className={`sidebar ${isCollapsed ? 'is-collapsed' : ''}`} style={width ? { width } : undefined}>
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          {!isCollapsed && (
            <button
              type="button"
              className="sidebar-brand"
              onClick={onResetToNew}
              title="Start a new conversation"
              aria-label="Start a new conversation"
            >
              <img src="/icon.png" alt="" className="sidebar-logo" />
              <h1>Split Bench</h1>
            </button>
          )}
          <button
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title={isCollapsed ? undefined : collapseLabel}
            aria-label={collapseLabel}
            data-tooltip={isCollapsed ? collapseLabel : undefined}
          >
            <SidebarPanelIcon />
          </button>
        </div>

        <button
          className="new-conversation-btn sidebar-action-btn"
          onClick={onResetToNew}
          title={isCollapsed ? undefined : 'New chat'}
          aria-label="New chat"
          data-tooltip={newChatTooltip}
        >
          <span className="sidebar-btn-icon"><NewChatIcon /></span>
          {!isCollapsed && <span className="sidebar-btn-label">New chat</span>}
        </button>

        <button
          className="model-selector-btn sidebar-action-btn"
          onClick={onOpenModelSelector}
          title={isCollapsed ? undefined : 'Configure models'}
          aria-label="Configure models"
          data-tooltip={modelsTooltip}
        >
          <span className="sidebar-btn-icon"><ModelsIcon /></span>
          {!isCollapsed && <span className="sidebar-btn-label">Configure models</span>}
        </button>

        <button
          className="prompt-library-btn sidebar-action-btn"
          onClick={onOpenPromptLibrary}
          title={isCollapsed ? undefined : 'Evals library'}
          aria-label="Evals library"
          data-tooltip={evalsTooltip}
        >
          <span className="sidebar-btn-icon"><EvalsIcon /></span>
          {!isCollapsed && <span className="sidebar-btn-label">Evals library</span>}
        </button>

        <button
          className={`analytics-btn sidebar-action-btn ${activeView === 'analytics' ? 'sidebar-action-active' : ''}`}
          onClick={onOpenAnalytics}
          title={isCollapsed ? undefined : 'Analytics'}
          aria-label="Analytics"
          data-tooltip={analyticsTooltip}
        >
          <span className="sidebar-btn-icon"><AnalyticsIcon /></span>
          {!isCollapsed && <span className="sidebar-btn-label">Analytics</span>}
        </button>
      </div>

      {!isCollapsed && (
        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="no-conversations">No conversations yet</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${
                  conv.id === currentConversationId ? 'active' : ''
                }`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="conversation-content">
                  <div className="conversation-title">
                    {conv.title || 'New Conversation'}
                  </div>
                  <div className="conversation-meta">
                    {conv.message_count} messages
                  </div>
                </div>
                <div className="conversation-menu" ref={showMenuId === conv.id ? menuRef : null}>
                  <button
                    className="menu-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenuId(showMenuId === conv.id ? null : conv.id);
                    }}
                  >
                    ⋮
                  </button>
                  {showMenuId === conv.id && (
                    <div className="dropdown-menu">
                      <button
                        className="menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditConversation(conv.id);
                          setShowMenuId(null);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="menu-item delete"
                        onClick={(e) => handleDeleteClick(e, conv.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {balance && !isCollapsed && (
        <div className="balance-widget">
          <div className="balance-title-row">
            <div className="balance-title">OpenRouter Account</div>
            {(
              <button
                className="balance-toggle-btn"
                onClick={() => setIsBalanceExpanded((prev) => !prev)}
                aria-label={isBalanceExpanded ? 'Collapse account details' : 'Expand account details'}
                title={isBalanceExpanded ? 'Collapse account details' : 'Expand account details'}
              >
                {isBalanceExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </button>
            )}
          </div>

          {isBalanceExpanded && (
            <>
              {balance.total_credits != null && (
                <div className="balance-row balance-row-highlight">
                  <span>Balance</span>
                  <span className="balance-value">{formatUsd(balance.total_credits - (balance.total_usage || 0))}</span>
                </div>
              )}
              {balance.is_free_tier ? (
                <div className="balance-row">
                  <span>Tier</span>
                  <span className="balance-value">Free</span>
                </div>
              ) : balance.limit != null ? (
                <div className="balance-row">
                  <span>Remaining</span>
                  <span className="balance-value">{formatUsd(balance.limit - (balance.usage || 0))}</span>
                </div>
              ) : null}
              <div className="balance-row">
                <span>All time</span>
                <span className="balance-value">{formatUsd(balance.usage)}</span>
              </div>
              <div className="balance-row">
                <span>Today</span>
                <span className="balance-value">{formatUsd(balance.usage_daily)}</span>
              </div>
              <div className="balance-row">
                <span>This month</span>
                <span className="balance-value">{formatUsd(balance.usage_monthly)}</span>
              </div>
            </>
          )}

          {!isBalanceExpanded && (
            <div className="balance-row balance-row-highlight compact">
              <span>Balance</span>
              <span className="balance-value">
                {formatUsd(balance.total_credits != null ? balance.total_credits - (balance.total_usage || 0) : balance.usage)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
