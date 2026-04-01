import { useEffect, useMemo, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import UsageBadge, { UsageSummary } from './UsageBadge';
import './Stage1.css';

function getRankPosition(modelName, aggregateRankings) {
  if (!aggregateRankings) return null;
  const index = aggregateRankings.findIndex(rank => rank.model === modelName);
  return index !== -1 ? index + 1 : null;
}

function shortModelName(modelName) {
  return modelName?.split('/')[1] || modelName || 'unknown';
}

function RankBadge({ position }) {
  if (!position) return null;
  const classNames = ['rank-badge'];
  if (position === 1) classNames.push('rank-gold');
  else if (position === 2) classNames.push('rank-silver');
  else if (position === 3) classNames.push('rank-bronze');
  return <span className={classNames.join(' ')}>#{position}</span>;
}

function ResponseCard({ response, aggregateRankings }) {
  const position = getRankPosition(response.model, aggregateRankings);
  return (
    <div className="response-card">
      <div className="response-header">
        <div className="response-header-left">
          <span className="response-model-name">{shortModelName(response.model)}</span>
          <RankBadge position={position} />
        </div>
        <UsageBadge usage={response.usage} />
      </div>
      <div className="response-body">
        <div className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{response.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default function Stage1({
  responses,
  aggregateRankings,
  councilModelCount,
  failedModels,
}) {
  const [showResponses, setShowResponses] = useState(false);
  const [viewMode, setViewMode] = useState('side-by-side');
  const [activeModel, setActiveModel] = useState('');
  const [splitRatio, setSplitRatio] = useState(() => {
    if (typeof window === 'undefined') return 50;
    const raw = Number(window.localStorage.getItem('splitbench.stage1.splitRatio'));
    return Number.isFinite(raw) ? Math.min(80, Math.max(20, raw)) : 50;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  const safeResponses = useMemo(
    () => (Array.isArray(responses) ? responses : []),
    [responses],
  );

  const successfulResponses = useMemo(
    () => safeResponses.filter((resp) => resp?.status !== 'error' && Boolean((resp?.response || '').trim())),
    [safeResponses],
  );

  const fallbackFailedModels = useMemo(
    () => safeResponses
      .filter((resp) => resp?.status === 'error' || !(resp?.response || '').trim())
      .map((resp) => ({
        model: resp?.model || 'unknown',
        error: resp?.error || 'Model did not return a response.',
      })),
    [safeResponses],
  );

  const failedModelEntries = Array.isArray(failedModels) && failedModels.length > 0
    ? failedModels
    : fallbackFailedModels;

  const configuredCount = Math.max(councilModelCount || safeResponses.length, safeResponses.length);
  const successCount = successfulResponses.length;
  const failureCount = failedModelEntries.length || Math.max(0, configuredCount - successCount);

  // Default to focus for 3+ models, side-by-side for 2
  useEffect(() => {
    if (successCount > 2) {
      setViewMode('focus');
    } else {
      setViewMode('side-by-side');
    }
  }, [successCount]);

  useEffect(() => {
    if (successfulResponses.length === 0) {
      setActiveModel('');
      return;
    }

    const hasActive = successfulResponses.some((resp) => resp.model === activeModel);
    if (!hasActive) {
      setActiveModel(successfulResponses[0].model);
    }
  }, [activeModel, successfulResponses]);

  useEffect(() => {
    window.localStorage.setItem('splitbench.stage1.splitRatio', String(splitRatio));
  }, [splitRatio]);

  useEffect(() => {
    if (!isResizing) return undefined;

    const handleMouseMove = (e) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      setSplitRatio(Math.min(80, Math.max(20, pct)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
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
  }, [isResizing]);

  const activeResponse = successfulResponses.find((resp) => resp.model === activeModel) || successfulResponses[0];

  if (safeResponses.length === 0) {
    return null;
  }

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleResizeReset = () => {
    setSplitRatio(50);
  };

  const useSplitView = viewMode === 'side-by-side' && successCount === 2;

  return (
    <div className="stage stage1">
      <div className="stage-header">
        <div className="stage-header-main">
          <h3 className="stage-title">Stage 1: Individual Responses</h3>
          <div className="stage1-summary">
            <span className="stage1-summary-chip">
              {successCount}/{configuredCount} responded
            </span>
            {failureCount > 0 && (
              <span className="stage1-summary-chip warning">
                {failureCount} unavailable
              </span>
            )}
          </div>
        </div>

        <div className="stage1-actions">
          {showResponses && successCount >= 2 && (
            <div className="stage1-view-toggle">
              {successCount > 2 && (
                <button
                  type="button"
                  className={`stage1-view-btn ${viewMode === 'focus' ? 'active' : ''}`}
                  onClick={() => setViewMode('focus')}
                >
                  Focus
                </button>
              )}
              <button
                type="button"
                className={`stage1-view-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
                onClick={() => setViewMode('side-by-side')}
              >
                Side by side
              </button>
              <button
                type="button"
                className={`stage1-view-btn ${viewMode === 'stacked' ? 'active' : ''}`}
                onClick={() => setViewMode('stacked')}
              >
                Stacked
              </button>
            </div>
          )}

          <button
            className="stage-toggle-btn"
            type="button"
            onClick={() => setShowResponses((prev) => !prev)}
          >
            {showResponses ? 'Hide' : 'Show'} model responses ({configuredCount})
          </button>
        </div>
      </div>

      {showResponses ? (
        <>
          {failureCount > 0 && (
            <div className="stage1-failure-note">
              <p>
                {failureCount} selected model{failureCount === 1 ? '' : 's'} did not return a Stage 1 answer.
              </p>
              <ul>
                {failedModelEntries.map((entry, idx) => (
                  <li key={`${entry.model}-${idx}`}>
                    <strong>{shortModelName(entry.model)}</strong>: {entry.error || 'No details available.'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {successCount === 0 ? (
            <p className="stage-collapsed-note">
              No model responses were available for Stage 1.
            </p>
          ) : viewMode === 'focus' && successCount > 2 ? (
            <div className="stage1-focus-layout">
              <div className="stage1-focus-nav">
                {successfulResponses.map((resp) => {
                  const position = getRankPosition(resp.model, aggregateRankings);
                  const isActive = resp.model === activeResponse?.model;
                  return (
                    <button
                      key={resp.model}
                      type="button"
                      className={`stage1-focus-tab ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveModel(resp.model)}
                    >
                      <span className="stage1-focus-tab-name">{shortModelName(resp.model)}</span>
                      <RankBadge position={position} />
                    </button>
                  );
                })}
              </div>

              <div className="stage1-focus-panel">
                {activeResponse && <ResponseCard response={activeResponse} aggregateRankings={aggregateRankings} />}
              </div>
            </div>
          ) : useSplitView ? (
            <div
              className={`stage1-split-container ${isResizing ? 'is-resizing' : ''}`}
              ref={containerRef}
            >
              <div className="stage1-split-panel" style={{ flexBasis: `${splitRatio}%` }}>
                <ResponseCard response={successfulResponses[0]} aggregateRankings={aggregateRankings} />
              </div>
              <div
                className="stage1-resizer"
                onMouseDown={handleResizeStart}
                onDoubleClick={handleResizeReset}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize response panels"
              />
              <div className="stage1-split-panel" style={{ flexBasis: `${100 - splitRatio}%` }}>
                <ResponseCard response={successfulResponses[1]} aggregateRankings={aggregateRankings} />
              </div>
            </div>
          ) : viewMode === 'stacked' ? (
            <div className="stage1-grid stacked">
              {successfulResponses.map((resp) => (
                <ResponseCard key={resp.model} response={resp} aggregateRankings={aggregateRankings} />
              ))}
            </div>
          ) : (
            <div className="stage1-grid">
              {successfulResponses.map((resp) => (
                <ResponseCard key={resp.model} response={resp} aggregateRankings={aggregateRankings} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="stage-collapsed-note">
          Individual model drafts are hidden by default to keep the answer view clean.
        </p>
      )}

      <UsageSummary results={successfulResponses} label="Stage 1 total" />
    </div>
  );
}
