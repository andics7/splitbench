import { useState } from 'react';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}) {
  const [showMenuId, setShowMenuId] = useState(null);

  const handleDeleteClick = (e, convId) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this conversation?')) {
      onDeleteConversation(convId);
      setShowMenuId(null);
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>LLM Council</h1>
        <button className="new-conversation-btn" onClick={onNewConversation}>
          + New Conversation
        </button>
      </div>

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
              <div className="conversation-menu">
                <button
                  className="menu-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenuId(showMenuId === conv.id ? null : conv.id);
                  }}
                  title="Options"
                >
                  ⋮
                </button>
                {showMenuId === conv.id && (
                  <div className="dropdown-menu">
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
    </div>
  );
}
