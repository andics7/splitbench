import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import RubricEditor from './RubricEditor';
import './ChatInterface.css';

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V6" />
      <path d="M6.5 11.5 12 6l5.5 5.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function SlidersIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="10" cy="18" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 6;

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function isImageAttachment(attachment) {
  return (attachment?.mime_type || '').startsWith('image/');
}

function countSuccessfulStage1Responses(stage1Results) {
  return (stage1Results || []).filter(
    (item) => item?.status !== 'error' && Boolean((item?.response || '').trim())
  ).length;
}

export default function ChatInterface({
  conversation,
  onSendMessage,
  onStopGeneration,
  onEditAndRerun,
  isLoading,
  pendingPrompt,
  onPendingPromptConsumed,
  onOpenPromptLibrary,
  onShowAlert,
}) {
  const [input, setInput] = useState('');
  const [synthesisMode, setSynthesisMode] = useState('best');
  const [showSynthesisModeInfo, setShowSynthesisModeInfo] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [expandedProcessByMessage, setExpandedProcessByMessage] = useState({});
  const [pendingCategory, setPendingCategory] = useState('uncategorized');
  const [activeRubric, setActiveRubric] = useState(null);
  const [showRubricEditor, setShowRubricEditor] = useState(false);

  const [showPlusMenu, setShowPlusMenu] = useState(false);

  const attachmentInputRef = useRef(null);
  const attachmentsRef = useRef([]);
  const dragCounterRef = useRef(0);
  const plusMenuRef = useRef(null);


  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Handle pending prompt from template library
  useEffect(() => {
    if (pendingPrompt) {
      setInput(pendingPrompt.text);
      setAttachments(pendingPrompt.attachments || []);
      setPendingCategory(pendingPrompt.category || 'uncategorized');
      if (pendingPrompt.rubric) {
        setActiveRubric(pendingPrompt.rubric);
      }
      onPendingPromptConsumed();
    }
  }, [pendingPrompt, onPendingPromptConsumed]);

  useEffect(() => {
    setExpandedProcessByMessage({});
  }, [conversation?.id]);

  // Click-outside handler for plus menu
  useEffect(() => {
    if (!showPlusMenu) return;
    const handleClick = (e) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPlusMenu]);

  // Escape key handler for overlay
  useEffect(() => {
    if (!showSynthesisModeInfo) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowSynthesisModeInfo(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSynthesisModeInfo]);

  const handlePickAttachments = () => {
    if (!isLoading) {
      attachmentInputRef.current?.click();
    }
  };

  const addFilesAsAttachments = useCallback(async (fileList) => {
    const selectedFiles = Array.from(fileList || []);
    if (selectedFiles.length === 0 || isLoading) return;

    const remainingSlots = MAX_ATTACHMENTS - attachmentsRef.current.length;
    if (remainingSlots <= 0) {
      onShowAlert?.(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }

    const filesToProcess = selectedFiles.slice(0, remainingSlots);
    const nextAttachments = [];

    for (const file of filesToProcess) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        onShowAlert?.(`${file.name} is larger than 5 MB and was skipped.`);
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        nextAttachments.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          data_url: dataUrl,
        });
      } catch (error) {
        console.error(error);
      }
    }

    if (nextAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...nextAttachments]);
    }
  }, [isLoading]);

  const handleAttachmentSelect = async (event) => {
    await addFilesAsAttachments(event.target.files);
    event.target.value = '';
  };

  useEffect(() => {
    const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

    const onDragEnter = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current += 1;
      setIsDragActive(true);
    };

    const onDragOver = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };

    const onDragLeave = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDragActive(false);
      }
    };

    const onDrop = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragActive(false);
      void addFilesAsAttachments(event.dataTransfer?.files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [addFilesAsAttachments]);

  const removeAttachment = (attachmentId) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const hasPromptInput = input.trim().length > 0 || attachments.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (hasPromptInput && !isLoading) {
      // Add to history
      api.addPromptHistory(input, null, attachments).catch(console.error);
      onSendMessage(input, attachments, synthesisMode, pendingCategory, activeRubric);
      setInput('');
      setAttachments([]);
      setPendingCategory('uncategorized');
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    // Cmd/Ctrl+K to open evals library
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onOpenPromptLibrary();
    }
  };

  const showPromptScreen = !conversation || conversation.messages.length === 0;
  const latestUserIndex = conversation?.messages
    ? conversation.messages.reduce((lastUserIdx, message, idx) => (
      message?.role === 'user' ? idx : lastUserIdx
    ), -1)
    : -1;

  const toggleProcessVisibility = (messageIndex) => {
    setExpandedProcessByMessage((prev) => ({
      ...prev,
      [messageIndex]: !(prev[messageIndex] ?? false),
    }));
  };

  const renderComposerAttachments = () => (
    attachments.length > 0 && (
      <div className="composer-attachments">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="composer-attachment-chip">
            {isImageAttachment(attachment) && attachment.data_url && (
              <img
                className="composer-attachment-thumb"
                src={attachment.data_url}
                alt={attachment.name}
              />
            )}
            <span className="composer-attachment-name">{attachment.name}</span>
            <span className="composer-attachment-size">{formatFileSize(attachment.size_bytes)}</span>
            <button
              type="button"
              className="composer-attachment-remove"
              onClick={() => removeAttachment(attachment.id)}
              disabled={isLoading}
              aria-label={`Remove ${attachment.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="chat-interface">
      <div className={`messages-container ${showPromptScreen ? '' : 'with-composer'}`}>
        {showPromptScreen ? (
          <div className="centered-prompt-container">
            <div className="centered-prompt-inner">
              <h2 className="greeting-text">What would you like to explore?</h2>
              <p className="greeting-subtext">Ask a question to consult the council</p>

              <div className="answer-mode-toggle">
                <div className="mode-segment">
                  <button
                    className={`mode-pill ${synthesisMode === 'best' ? 'active' : ''}`}
                    onClick={() => setSynthesisMode('best')}
                    type="button"
                  >
                    Best
                  </button>
                  <button
                    className={`mode-pill ${synthesisMode === 'synthesize' ? 'active' : ''}`}
                    onClick={() => setSynthesisMode('synthesize')}
                    type="button"
                  >
                    Merged
                  </button>
                </div>
                <button
                  className="info-btn"
                  onClick={() => setShowSynthesisModeInfo(true)}
                  type="button"
                  title="Learn more about answer modes"
                >
                  ?
                </button>
              </div>

              <div className="prompt-box">
                <form className="prompt-form" onSubmit={handleSubmit}>
                  <textarea
                    className="prompt-textarea"
                    placeholder="Ask your question... (Shift+Enter for new line)"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    rows={3}
                  />
                  {renderComposerAttachments()}
                  <div className="prompt-actions">
                    <div className="prompt-meta">
                      <div className="plus-menu-wrap" ref={plusMenuRef}>
                        <button
                          type="button"
                          className={`attach-btn ${showPlusMenu ? 'active' : ''} ${showRubricEditor && !showPlusMenu ? 'rubric-open' : ''}`}
                          onClick={() => setShowPlusMenu((v) => !v)}
                          disabled={isLoading}
                          aria-label="More options"
                          aria-expanded={showPlusMenu}
                        >
                          {showRubricEditor && !showPlusMenu ? <SlidersIcon /> : <PlusIcon />}
                        </button>
                        {showPlusMenu && (
                          <div className="plus-menu">
                            <button
                              type="button"
                              className="plus-menu-item"
                              onClick={() => { handlePickAttachments(); setShowPlusMenu(false); }}
                              disabled={isLoading || attachments.length >= MAX_ATTACHMENTS}
                            >
                              <PaperclipIcon />
                              <span>Add files or photos</span>
                            </button>
                            <button
                              type="button"
                              className={`plus-menu-item ${showRubricEditor ? 'active' : ''}`}
                              onClick={() => { setShowRubricEditor((v) => !v); setShowPlusMenu(false); }}
                              disabled={isLoading}
                            >
                              <SlidersIcon />
                              <span>Evaluation rubric{activeRubric?.criteria?.length > 0 ? ` · ${activeRubric.criteria.length}` : ''}</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <span className="prompt-shortcut-hint">⌘K for templates</span>
                    </div>
                    <button
                      type="submit"
                      className="prompt-send-btn"
                      disabled={!hasPromptInput || isLoading}
                      title="Send message"
                    >
                      <SendIcon />
                    </button>
                  </div>
                </form>
              </div>

              {showRubricEditor && (
                <div className="prompt-rubric-below">
                  <RubricEditor
                    rubric={activeRubric}
                    onRubricChange={setActiveRubric}
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          conversation.messages.map((msg, index) => {
            const hasFinalAnswer = Boolean(msg.stage3);
            const hasProcessData = Boolean(msg.stage1 || msg.stage2 || msg.loading?.stage1 || msg.loading?.stage2);
            const processExpanded = expandedProcessByMessage[index] ?? !hasFinalAnswer;
            const processVisible = !hasFinalAnswer || (processExpanded);
            const stage1ConfiguredCount = msg.metadata?.council_model_count ?? (msg.stage1?.length || 0);
            const stage1SuccessCount = msg.metadata?.stage1_success_count ?? countSuccessfulStage1Responses(msg.stage1);
            const stage1FailureCount = msg.metadata?.stage1_failure_count
              ?? Math.max(0, stage1ConfiguredCount - stage1SuccessCount);
            const stage2Count = msg.stage2?.length || 0;
            const topRankedModel = msg.metadata?.aggregate_rankings?.[0]?.model;
            const topRankedModelShort = topRankedModel
              ? (topRankedModel.split('/')[1] || topRankedModel)
              : null;

            return (
              <div key={index} className="message-group">
                {msg.role === 'user' ? (
                  <div className="user-message">
                    <div className="user-header-row">
                      <div className="message-label">Your Prompt</div>
                      {isLoading && index === latestUserIndex ? (
                        <button
                          className="stop-generation-btn"
                          onClick={onStopGeneration}
                          title="Stop generation"
                          type="button"
                        >
                          Stop
                        </button>
                      ) : !isLoading && editingMessageIndex !== index && (
                        <button
                          className="edit-message-btn"
                          onClick={() => {
                            setEditingMessageIndex(index);
                            setEditingText(msg.content);
                          }}
                          title="Edit and re-run"
                          type="button"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingMessageIndex === index ? (
                      <div className="edit-message-form">
                        <textarea
                          className="edit-message-textarea"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (editingText.trim() && !isLoading) {
                                setEditingMessageIndex(null);
                                onEditAndRerun(editingText.trim(), msg.attachments || [], synthesisMode, activeRubric);
                              }
                            }
                            if (e.key === 'Escape') {
                              setEditingMessageIndex(null);
                            }
                          }}
                          rows={3}
                          autoFocus
                        />
                        <div className="edit-message-actions">
                          <button
                            className="edit-cancel-btn"
                            onClick={() => setEditingMessageIndex(null)}
                          >
                            Cancel
                          </button>
                          <button
                            className="edit-submit-btn"
                            disabled={!editingText.trim() || isLoading}
                            onClick={() => {
                              if (editingText.trim() && !isLoading) {
                                setEditingMessageIndex(null);
                                onEditAndRerun(editingText.trim(), msg.attachments || [], synthesisMode, activeRubric);
                              }
                            }}
                          >
                            Re-run
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="message-content">
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.attachments?.length > 0 && (
                          <div className="message-attachments">
                            {msg.attachments.map((attachment, attachmentIndex) => (
                              <div
                                key={attachment.id || `${attachment.name}-${attachmentIndex}`}
                                className="message-attachment"
                              >
                                {isImageAttachment(attachment) && attachment.data_url && (
                                  <img
                                    className="message-attachment-thumb"
                                    src={attachment.data_url}
                                    alt={attachment.name}
                                  />
                                )}
                                <div className="message-attachment-text">
                                  <span className="message-attachment-name">{attachment.name}</span>
                                  <span className="message-attachment-meta">
                                    {attachment.mime_type || 'file'} · {formatFileSize(attachment.size_bytes)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="assistant-message">
                    <div className="assistant-header-row">
                      <div className="message-label">Split Bench</div>
                      {hasProcessData && hasFinalAnswer && (
                        <button
                          className="assistant-process-toggle"
                          onClick={() => toggleProcessVisibility(index)}
                          type="button"
                        >
                          {processExpanded ? 'Hide process' : 'Show process'}
                        </button>
                      )}
                    </div>

                    <div className="assistant-main">
                      {processVisible && (
                        <div className="assistant-process-pane">
                          {msg.loading?.stage1 && (
                            <div className="stage-loading">
                              <div className="spinner"></div>
                              <span>Running Stage 1: Collecting individual responses...</span>
                            </div>
                          )}
                          {msg.stage1 && (
                            <Stage1
                              responses={msg.stage1}
                              aggregateRankings={msg.metadata?.aggregate_rankings}
                              councilModelCount={stage1ConfiguredCount}
                              failedModels={msg.metadata?.stage1_failed_models}
                            />
                          )}

                          {msg.loading?.stage2 && (
                            <div className="stage-loading">
                              <div className="spinner"></div>
                              <span>Running Stage 2: Peer rankings...</span>
                            </div>
                          )}
                          {msg.stage2 && (
                            <Stage2
                              rankings={msg.stage2}
                              labelToModel={msg.metadata?.label_to_model}
                              aggregateRankings={msg.metadata?.aggregate_rankings}
                              stage2Insights={msg.metadata?.stage2_insights}
                              rubricCriteria={msg.metadata?.rubric_criteria}
                            />
                          )}
                        </div>
                      )}

                      {(msg.stage3 || msg.loading?.stage3) && (
                        <div className="assistant-answer-pane">
                          {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}
                          {msg.loading?.stage3 && (
                            <div className="stage-loading">
                              <div className="spinner"></div>
                              <span>Running Stage 3: Final synthesis...</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {hasFinalAnswer && !processVisible && hasProcessData && (
                      <div className="assistant-process-summary">
                        {stage1ConfiguredCount > 0 && (
                          <span className="assistant-summary-chip">
                            {stage1SuccessCount}/{stage1ConfiguredCount} model responses
                          </span>
                        )}
                        {stage1FailureCount > 0 && (
                          <span className="assistant-summary-chip">
                            {stage1FailureCount} unavailable
                          </span>
                        )}
                        {stage2Count > 0 && (
                          <span className="assistant-summary-chip">{stage2Count} peer evaluations</span>
                        )}
                        {topRankedModelShort && (
                          <span className="assistant-summary-chip">Top ranked: {topRankedModelShort}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>Consulting the council...</span>
          </div>
        )}


      </div>

      {isDragActive && (
        <div className="attachment-drop-overlay" aria-hidden="true">
          <div className="attachment-drop-card">
            Drop files to attach
          </div>
        </div>
      )}

      {!showPromptScreen && (
        <div className="bottom-composer-wrap">
          <div className="bottom-composer">
            <div className="answer-mode-toggle compact">
              <div className="mode-segment">
                <button
                  className={`mode-pill ${synthesisMode === 'best' ? 'active' : ''}`}
                  onClick={() => setSynthesisMode('best')}
                  type="button"
                >
                  Best
                </button>
                <button
                  className={`mode-pill ${synthesisMode === 'synthesize' ? 'active' : ''}`}
                  onClick={() => setSynthesisMode('synthesize')}
                  type="button"
                >
                  Merged
                </button>
              </div>
              <button
                className="info-btn"
                onClick={() => setShowSynthesisModeInfo(true)}
                type="button"
                title="Learn more about answer modes"
              >
                ?
              </button>
              <button
                className="templates-link-btn"
                type="button"
                onClick={onOpenPromptLibrary}
                title="Open templates"
              >
                Templates
              </button>
            </div>

            {showRubricEditor && (
              <div className="prompt-rubric-below">
                <RubricEditor
                  rubric={activeRubric}
                  onRubricChange={setActiveRubric}
                  disabled={isLoading}
                />
              </div>
            )}

            <div className="prompt-box compact">
              <form className="prompt-form" onSubmit={handleSubmit}>
                <textarea
                  className="prompt-textarea compact"
                  placeholder="Ask a follow-up... (Shift+Enter for new line)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  rows={2}
                />
                {renderComposerAttachments()}
                <div className="prompt-actions">
                  <div className="prompt-meta">
                    <div className="plus-menu-wrap" ref={plusMenuRef}>
                      <button
                        type="button"
                        className={`attach-btn ${showPlusMenu ? 'active' : ''}`}
                        onClick={() => setShowPlusMenu((v) => !v)}
                        disabled={isLoading}
                        aria-label="More options"
                        aria-expanded={showPlusMenu}
                      >
                        <PlusIcon />
                      </button>
                      {showPlusMenu && (
                        <div className="plus-menu">
                          <button
                            type="button"
                            className="plus-menu-item"
                            onClick={() => { handlePickAttachments(); setShowPlusMenu(false); }}
                            disabled={isLoading || attachments.length >= MAX_ATTACHMENTS}
                          >
                            <PaperclipIcon />
                            <span>Add files or photos</span>
                          </button>
                          <button
                            type="button"
                            className={`plus-menu-item ${showRubricEditor ? 'active' : ''}`}
                            onClick={() => { setShowRubricEditor((v) => !v); setShowPlusMenu(false); }}
                            disabled={isLoading}
                          >
                            <SlidersIcon />
                            <span>Evaluation rubric{activeRubric?.criteria?.length > 0 ? ` · ${activeRubric.criteria.length}` : ''}</span>
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="prompt-shortcut-hint">Shift+Enter newline · ⌘K templates</span>
                  </div>
                  <button
                    type="submit"
                    className="prompt-send-btn"
                    disabled={!hasPromptInput || isLoading}
                    title="Send message"
                  >
                    <SendIcon />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <input
        ref={attachmentInputRef}
        type="file"
        className="attachment-input-hidden"
        multiple
        onChange={handleAttachmentSelect}
      />

      {showSynthesisModeInfo && (
        <div className="synthesis-info-overlay" onClick={() => setShowSynthesisModeInfo(false)}>
          <div className="synthesis-info-panel" onClick={(e) => e.stopPropagation()}>
            <div className="synthesis-info-header">
              <h2>Answer Mode</h2>
              <button className="close-btn" onClick={() => setShowSynthesisModeInfo(false)}>×</button>
            </div>
            <div className="synthesis-info-body">
              <div className="mode-explanation">
                <h3>⭐ Best</h3>
                <p>Returns the highest-ranked response from Stage 2 directly, without additional processing.</p>
                <ul>
                  <li><strong>Faster:</strong> Skips Stage 3 synthesis (~2-5 seconds saved)</li>
                  <li><strong>Cheaper:</strong> No chairman model tokens used</li>
                  <li><strong>Preserves Quality:</strong> Original response unchanged</li>
                </ul>
              </div>
              <div className="mode-explanation">
                <h3>🔀 Merged</h3>
                <p>Chairman model creates a comprehensive answer combining all council perspectives.</p>
                <ul>
                  <li><strong>Comprehensive:</strong> Integrates insights from all models</li>
                  <li><strong>Balanced:</strong> Considers multiple viewpoints</li>
                  <li><strong>Refined:</strong> Chairman polishes and structures the final answer</li>
                </ul>
              </div>
              <p className="synthesis-tip">
                <strong>Tip:</strong> Use "Best" for quick, focused answers. Use "Merged" for comprehensive, multi-perspective responses.
              </p>
            </div>
            <div className="synthesis-info-footer">
              <button className="btn-primary" onClick={() => setShowSynthesisModeInfo(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
