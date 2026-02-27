import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import ModelSelector from './components/ModelSelector';
import PromptLibrary from './components/PromptLibrary';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ConfirmDialog from './components/ConfirmDialog';
import { api } from './api';
import './App.css';

const SIDEBAR_WIDTH_STORAGE_KEY = 'splitbench.sidebar.width';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'splitbench.sidebar.collapsed';
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 86;
const MOBILE_BREAKPOINT = 960;

function clampSidebarWidth(width) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function getInitialSidebarWidth() {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH;
  return clampSidebarWidth(parsed);
}

function getInitialSidebarCollapsed() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
}

function getInitialIsMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [modelConfig, setModelConfig] = useState(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(getInitialIsMobileViewport);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('chat');
  const [dialog, setDialog] = useState(null); // { title, message, confirmLabel, danger, onConfirm }
  const streamAbortControllerRef = useRef(null);

  const openDialog = useCallback((opts) => setDialog(opts), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const loadBalance = async () => {
    try {
      const data = await api.getBalance();
      setBalance(data);
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
  };

  // Load conversations, balance, and model config on mount
  useEffect(() => {
    loadConversations();
    loadBalance();
    api.getModelConfig().then(setModelConfig).catch(console.error);
  }, []);

  // Load conversation details when selected, but avoid clobbering
  // optimistic stream state while a message is actively streaming.
  useEffect(() => {
    if (currentConversationId && !isLoading) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId, isLoading]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!isResizingSidebar || isSidebarCollapsed) return undefined;

    const handleMouseMove = (event) => {
      setSidebarWidth(clampSidebarWidth(event.clientX));
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isSidebarCollapsed]);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobileViewport(mobile);
      if (!mobile) {
        setIsMobileSidebarOpen(false);
      }
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobileSidebarOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobileSidebarOpen]);

  const loadConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConversation = async (id) => {
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(conv);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleNewConversation = () => {
    setActiveView('chat');
    setCurrentConversationId(null);
    setCurrentConversation(null);
  };

  const handleSelectConversation = (id) => {
    setActiveView('chat');
    if (id === currentConversationId) {
      // Already selected — force reload from server
      loadConversation(id);
    } else {
      setCurrentConversationId(id);
    }
  };

  const handleDeleteConversation = async (id) => {
    try {
      await api.deleteConversation(id);
      // Remove from conversations list
      setConversations(conversations.filter((conv) => conv.id !== id));
      // Clear current conversation if it was deleted
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      openDialog({ title: 'Failed to delete conversation', confirmLabel: 'OK' });
    }
  };

  const handleEditConversation = async (id) => {
    try {
      // Load the conversation to get the first user message
      const conv = await api.getConversation(id);
      const firstUserMsg = conv.messages.find(m => m.role === 'user');

      // Clear all messages from the existing conversation
      await api.clearConversationMessages(id);

      // Switch to the existing conversation (not a new one)
      setCurrentConversationId(id);

      // Clear the current conversation state to show empty state
      setCurrentConversation({
        ...conv,
        messages: []
      });

      // Pre-fill the prompt if there was a first user message
      if (firstUserMsg) {
        setPendingPrompt({
          text: firstUserMsg.content,
          templateId: null,
          attachments: firstUserMsg.attachments || [],
        });
      }

      // Reload conversations list to update message count (now 0)
      loadConversations();
    } catch (error) {
      console.error('Failed to edit conversation:', error);
      openDialog({ title: 'Failed to edit conversation', confirmLabel: 'OK' });
    }
  };

  const handleEditAndRerun = async (newContent, attachments = [], synthesisMode, rubric = null) => {
    if (!currentConversationId) return;
    try {
      // Clear existing messages on the server
      await api.clearConversationMessages(currentConversationId);

      // Reset local conversation state
      setCurrentConversation((prev) => prev ? { ...prev, messages: [] } : prev);

      // Re-run with the new (or edited) content
      handleSendMessage(newContent, attachments, synthesisMode, 'uncategorized', rubric);
    } catch (error) {
      console.error('Failed to edit and re-run:', error);
      openDialog({ title: 'Failed to edit and re-run', confirmLabel: 'OK' });
    }
  };

  const handleSaveModelConfig = async (councilModels, chairmanModel) => {
    const config = await api.updateModelConfig(councilModels, chairmanModel);
    setModelConfig(config);
  };

  const handleUseTemplate = (filledText, templateId, templateCategory, templateRubric) => {
    setPendingPrompt({
      text: filledText,
      templateId,
      attachments: [],
      category: templateCategory || 'uncategorized',
      rubric: templateRubric || null,
    });
  };

  const clearLastAssistantLoadingState = () => {
    setCurrentConversation((prev) => {
      if (!prev || !Array.isArray(prev.messages) || prev.messages.length === 0) {
        return prev;
      }

      const messages = [...prev.messages];
      const lastIndex = messages.length - 1;
      const lastMsg = messages[lastIndex];
      if (!lastMsg || lastMsg.role !== 'assistant') {
        return prev;
      }

      const nextAssistant = {
        ...lastMsg,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      const hasContent = Boolean(
        nextAssistant.stage3
        || (Array.isArray(nextAssistant.stage1) && nextAssistant.stage1.length > 0)
        || (Array.isArray(nextAssistant.stage2) && nextAssistant.stage2.length > 0)
      );

      if (!hasContent) {
        messages.pop();
      } else {
        messages[lastIndex] = nextAssistant;
      }

      return {
        ...prev,
        messages,
      };
    });
  };

  const handleStopGeneration = () => {
    if (!streamAbortControllerRef.current) return;
    streamAbortControllerRef.current.abort();
    streamAbortControllerRef.current = null;
    setIsLoading(false);
    clearLastAssistantLoadingState();
  };

  const handleSendMessage = async (content, attachments = [], synthesisMode = 'synthesize', category = 'uncategorized', rubric = null) => {
    setIsLoading(true);
    const streamAbortController = new AbortController();
    streamAbortControllerRef.current = streamAbortController;
    try {
      // Lazily create conversation if none exists
      let convId = currentConversationId;
      if (!convId) {
        const newConv = await api.createConversation();
        convId = newConv.id;
        setCurrentConversationId(convId);
        setCurrentConversation({ id: convId, created_at: newConv.created_at, messages: [] });
      }

      // Optimistically add user message + partial assistant message together
      const userMessage = { role: 'user', content, attachments: attachments || [] };
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      setCurrentConversation((prev) => {
        const base = prev || { id: convId, created_at: new Date().toISOString(), messages: [] };
        return {
          ...base,
          messages: [...base.messages, userMessage, assistantMessage],
        };
      });

      // Helper: update the last assistant message in state
      const updateLastAssistant = (updater) => {
        setCurrentConversation((prev) => {
          if (!prev) return prev;
          const messages = [...prev.messages];
          const lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.role !== 'assistant') return prev;
          const updated = { ...lastMsg, loading: { ...lastMsg.loading } };
          updater(updated);
          messages[messages.length - 1] = updated;
          return { ...prev, messages };
        });
      };

      // Send message with streaming
      await api.sendMessageStream(convId, content, attachments || [], synthesisMode, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            updateLastAssistant((msg) => { msg.loading.stage1 = true; });
            break;

          case 'stage1_complete':
            updateLastAssistant((msg) => {
              msg.stage1 = event.data;
              msg.metadata = { ...(msg.metadata || {}), ...(event.metadata || {}) };
              msg.loading.stage1 = false;
            });
            break;

          case 'stage2_start':
            updateLastAssistant((msg) => { msg.loading.stage2 = true; });
            break;

          case 'stage2_complete':
            updateLastAssistant((msg) => {
              msg.stage2 = event.data;
              msg.metadata = { ...(msg.metadata || {}), ...(event.metadata || {}) };
              msg.loading.stage2 = false;
            });
            break;

          case 'stage3_start':
            updateLastAssistant((msg) => { msg.loading.stage3 = true; });
            break;

          case 'stage3_complete':
            updateLastAssistant((msg) => { msg.stage3 = event.data; msg.loading.stage3 = false; });
            break;

          case 'title_complete':
            // Reload conversations to get updated title
            loadConversations();
            break;

          case 'complete':
            // Stream complete, reload conversations list and refresh balance
            loadConversations();
            loadBalance();
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      }, streamAbortController.signal, category, rubric);
      streamAbortControllerRef.current = null;
    } catch (error) {
      streamAbortControllerRef.current = null;
      if (error?.name === 'AbortError') {
        clearLastAssistantLoadingState();
        setIsLoading(false);
        return;
      }
      console.error('Failed to send message:', error);
      // Remove optimistic messages on error
      setCurrentConversation((prev) => {
        if (!prev || !Array.isArray(prev.messages)) {
          return prev;
        }
        return {
          ...prev,
          messages: prev.messages.slice(0, -2),
        };
      });
      openDialog({ title: 'Failed to send message', message: error?.message || 'An unknown error occurred.', confirmLabel: 'OK' });
      setIsLoading(false);
    }
  };

  const handleSidebarResizeStart = (event) => {
    if (isSidebarCollapsed) return;
    event.preventDefault();
    setIsResizingSidebar(true);
  };

  const handleToggleSidebarCollapse = () => {
    if (isMobileViewport) {
      setIsMobileSidebarOpen((prev) => !prev);
      return;
    }
    setIsSidebarCollapsed(prev => !prev);
    setIsResizingSidebar(false);
  };

  const closeMobileSidebar = () => {
    if (isMobileViewport) {
      setIsMobileSidebarOpen(false);
    }
  };

  return (
    <div className={`app ${isResizingSidebar ? 'is-resizing' : ''} ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${isMobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
      <div className="app-sidebar-shell">
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={(id) => {
            handleSelectConversation(id);
            closeMobileSidebar();
          }}
          onResetToNew={() => {
            handleNewConversation();
            closeMobileSidebar();
          }}
          onDeleteConversation={(id) => {
            openDialog({
              title: 'Delete conversation?',
              message: 'This conversation will be permanently deleted.',
              confirmLabel: 'Yes, delete it',
              danger: true,
              onConfirm: () => {
                handleDeleteConversation(id);
                closeMobileSidebar();
                closeDialog();
              },
            });
          }}
          onEditConversation={(id) => {
            handleEditConversation(id);
            closeMobileSidebar();
          }}
          onOpenModelSelector={() => {
            setShowModelSelector(true);
            closeMobileSidebar();
          }}
          onOpenPromptLibrary={() => {
            setShowPromptLibrary(true);
            closeMobileSidebar();
          }}
          onOpenAnalytics={() => {
            setActiveView('analytics');
            closeMobileSidebar();
          }}
          activeView={activeView}
          balance={balance}
          width={!isMobileViewport ? (isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth) : undefined}
          isCollapsed={!isMobileViewport && isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapse}
        />
      </div>
      <div
        className="sidebar-resizer"
        onMouseDown={handleSidebarResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
      <div className="app-main">
        <div className="mobile-topbar">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
        </div>
        {activeView === 'analytics' ? (
          <AnalyticsDashboard onBackToChat={() => setActiveView('chat')} />
        ) : (
          <ChatInterface
            conversation={currentConversation}
            onSendMessage={handleSendMessage}
            onStopGeneration={handleStopGeneration}
            onEditAndRerun={handleEditAndRerun}
            isLoading={isLoading}
            pendingPrompt={pendingPrompt}
            onPendingPromptConsumed={() => setPendingPrompt(null)}
            onOpenPromptLibrary={() => setShowPromptLibrary(true)}
            onShowAlert={(msg) => openDialog({ title: msg, confirmLabel: 'OK' })}
          />
        )}
      </div>
      <ModelSelector
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        onSave={handleSaveModelConfig}
        currentCouncilModels={modelConfig?.council_models || []}
        currentChairmanModel={modelConfig?.chairman_model || ''}
      />
      <PromptLibrary
        isOpen={showPromptLibrary}
        onClose={() => setShowPromptLibrary(false)}
        onUseTemplate={handleUseTemplate}
        onRequestConfirm={openDialog}
      />
      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog?.title || ''}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel || 'OK'}
        danger={dialog?.danger || false}
        onConfirm={dialog?.onConfirm ? dialog.onConfirm : closeDialog}
        onCancel={closeDialog}
      />
      <button
        type="button"
        className="mobile-sidebar-backdrop"
        aria-label="Close menu"
        onClick={() => setIsMobileSidebarOpen(false)}
      />
    </div>
  );
}

export default App;
