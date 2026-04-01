import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import UsageBadge, { UsageSummary } from './UsageBadge';
import './Stage2.css';

function shortModelName(model) {
  return model?.split('/')[1] || model || 'unknown';
}

function toModelNameFromLabel(label, labelToModel) {
  if (!label) return 'unknown';
  const model = labelToModel?.[label];
  return model ? shortModelName(model) : label;
}

function deAnonymizeText(text, labelToModel) {
  if (!labelToModel) return text;

  let result = text;
  Object.entries(labelToModel).forEach(([label, model]) => {
    const modelShortName = shortModelName(model);
    result = result.replace(new RegExp(label, 'g'), `**${modelShortName}**`);
  });
  return result;
}

function formatRankingList(labels, labelToModel) {
  if (!labels || labels.length === 0) return 'No ranking parsed';
  return labels.map((label) => toModelNameFromLabel(label, labelToModel)).join(' > ');
}

function FormatBadge({ mode }) {
  const isStructured = mode === 'structured_json';
  const isRubric = mode === 'rubric_scored';
  const label = isStructured ? 'Structured' : isRubric ? 'Rubric' : 'Legacy';
  const cls = isStructured ? 'structured' : isRubric ? 'rubric' : 'legacy';
  return (
    <span className={`stage2-format-badge ${cls}`}>
      {label}
    </span>
  );
}

function StructuredEvaluation({ item, labelToModel }) {
  const score = Number(item?.score) || 0;
  const confidence = Number(item?.confidence) || 0;
  const strengths = item?.strengths || [];
  const weaknesses = item?.weaknesses || [];

  return (
    <div className="score-row">
      <div className="score-row-top">
        <span className="score-label">
          {toModelNameFromLabel(item?.response_label, labelToModel)}
        </span>
        <span className="score-values">
          {score}/100 · {confidence}% confidence
        </span>
      </div>
      <div className="score-row-bar">
        <span style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <div className="score-row-notes">
        <p><strong>+</strong> {strengths.join(' • ')}</p>
        <p><strong>-</strong> {weaknesses.join(' • ')}</p>
      </div>
      {item?.summary && <p className="score-row-summary">{item.summary}</p>}
    </div>
  );
}

function CriterionBreakdownTable({ aggregateRankings, rubricCriteria }) {
  if (!rubricCriteria || rubricCriteria.length === 0) return null;

  const hasScores = aggregateRankings?.some((agg) => agg.criterion_averages);
  if (!hasScores) return null;

  return (
    <div className="criterion-breakdown">
      <h4>Criterion Scores</h4>
      <div className="criterion-table-wrap">
        <table className="criterion-table">
          <thead>
            <tr>
              <th className="criterion-th-model">Model</th>
              {rubricCriteria.map((c) => (
                <th key={c.name} className="criterion-th-score">
                  {c.name}
                  <span className="criterion-weight-badge">w{c.weight}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aggregateRankings.map((agg, i) => (
              <tr key={i}>
                <td className="criterion-model-cell">
                  <span className="rank-position">#{i + 1}</span>
                  {shortModelName(agg.model)}
                </td>
                {rubricCriteria.map((c) => {
                  const score = agg.criterion_averages?.[c.name];
                  return (
                    <td key={c.name} className="criterion-score-cell">
                      {score != null ? (
                        <div className="criterion-score-content">
                          <span className="criterion-score-value">
                            {score.toFixed(1)}
                          </span>
                          <span className="criterion-score-bar">
                            <span
                              className="criterion-score-bar-fill"
                              style={{ width: `${Math.min(100, score * 10)}%` }}
                            />
                          </span>
                        </div>
                      ) : (
                        <span className="criterion-score-na">--</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvaluatorCriterionScores({ criterionScores, rubricCriteria, labelToModel }) {
  if (!criterionScores || !rubricCriteria || rubricCriteria.length === 0) return null;

  const labels = Object.keys(criterionScores);
  if (labels.length === 0) return null;

  return (
    <div className="evaluator-criterion-scores">
      <strong>Criterion Scores:</strong>
      <div className="evaluator-criterion-grid">
        {labels.map((label) => (
          <div key={label} className="evaluator-criterion-block">
            <span className="evaluator-criterion-label">
              {toModelNameFromLabel(label, labelToModel)}
            </span>
            <div className="evaluator-criterion-list">
              {rubricCriteria.map((c) => {
                const score = criterionScores[label]?.[c.name];
                return (
                  <span key={c.name} className="evaluator-criterion-item">
                    {c.name}: {score != null ? `${score}/10` : '--'}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvaluationCard({ rank, labelToModel, rubricCriteria }) {
  const structured = rank.structured_ranking;
  const rankingOrder = rank.parsed_ranking || [];

  return (
    <div className="evaluation-card">
      <div className="evaluation-header">
        <div className="evaluation-title-group">
          <span className="evaluation-model-name">
            {shortModelName(rank.model)}
          </span>
          <FormatBadge mode={rank.format} />
        </div>
        <UsageBadge usage={rank.usage} />
      </div>

      <div className="evaluation-body">
        <div className="evaluation-ranking-line">
          <strong>Ranking:</strong> {formatRankingList(rankingOrder, labelToModel)}
        </div>

        {rank.criterion_scores && rubricCriteria && (
          <EvaluatorCriterionScores
            criterionScores={rank.criterion_scores}
            rubricCriteria={rubricCriteria}
            labelToModel={labelToModel}
          />
        )}

        {structured ? (
          <>
            <p className="evaluation-rationale">
              {structured.overall_rationale}
            </p>
            <div className="score-grid">
              {(structured.evaluations || []).map((item) => (
                <StructuredEvaluation
                  key={item.response_label}
                  item={item}
                  labelToModel={labelToModel}
                />
              ))}
            </div>
            {structured.consensus_summary && (
              <p className="evaluation-consensus-note">
                <strong>Consensus note:</strong> {structured.consensus_summary}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {deAnonymizeText(rank.ranking, labelToModel)}
              </ReactMarkdown>
            </div>
            {rankingOrder.length > 0 && (
              <div className="parsed-ranking">
                <strong>Extracted Ranking:</strong>
                <ol>
                  {rankingOrder.map((label, i) => (
                    <li key={i}>
                      {toModelNameFromLabel(label, labelToModel)}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}

        {rank.validation_issues?.length > 0 && (
          <div className="validation-issues">
            <strong>Validation notes:</strong>
            <ul>
              {rank.validation_issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Stage2({ rankings, labelToModel, aggregateRankings, stage2Insights, rubricCriteria }) {
  const [showEvaluations, setShowEvaluations] = useState(false);
  const [layoutMode, setLayoutMode] = useState(() => {
    if (typeof window === 'undefined') return 'side-by-side';
    return window.localStorage.getItem('splitbench.stage2.layout') || 'side-by-side';
  });
  const [splitRatio, setSplitRatio] = useState(() => {
    if (typeof window === 'undefined') return 50;
    const raw = Number(window.localStorage.getItem('splitbench.stage2.splitRatio'));
    return Number.isFinite(raw) ? Math.min(80, Math.max(20, raw)) : 50;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem('splitbench.stage2.layout', layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    window.localStorage.setItem('splitbench.stage2.splitRatio', String(splitRatio));
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

  if (!rankings || rankings.length === 0) {
    return null;
  }

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleResizeReset = () => {
    setSplitRatio(50);
  };

  const useSplitView = layoutMode === 'side-by-side' && rankings.length === 2;

  return (
    <div className="stage stage2">
      <div className="stage-header">
        <div className="stage-header-main">
          <h3 className="stage-title">Stage 2: Peer Rankings</h3>
        </div>
        <div className="stage2-actions">
          {showEvaluations && (
            <div className="stage2-layout-toggle">
              <button
                type="button"
                className={`stage2-layout-btn ${layoutMode === 'side-by-side' ? 'active' : ''}`}
                onClick={() => setLayoutMode('side-by-side')}
              >
                Side by side
              </button>
              <button
                type="button"
                className={`stage2-layout-btn ${layoutMode === 'stacked' ? 'active' : ''}`}
                onClick={() => setLayoutMode('stacked')}
              >
                Stacked
              </button>
            </div>
          )}
          <button
            className="stage-toggle-btn"
            type="button"
            onClick={() => setShowEvaluations(!showEvaluations)}
          >
            {showEvaluations ? 'Hide' : 'Show'} evaluator notes ({rankings.length})
          </button>
        </div>
      </div>

      {/* Aggregate rankings - always visible at top */}
      {aggregateRankings && aggregateRankings.length > 0 && (
        <div className="aggregate-rankings">
          <h4>Aggregate Rankings</h4>
          <p className="stage-description">
            Combined results across peer evaluations. Lower average rank is better.
          </p>

          {stage2Insights && (
            <div className="consensus-chips">
              <span className="consensus-chip">
                {stage2Insights.evaluator_count || rankings.length} evaluators
              </span>
              <span className="consensus-chip">
                {(stage2Insights.structured_count || 0)} structured · {(stage2Insights.legacy_count || 0)} legacy
              </span>
              {stage2Insights.top_pick?.model && (
                <span className="consensus-chip highlight">
                  Top pick consensus: {stage2Insights.top_pick.share_percent}% ({shortModelName(stage2Insights.top_pick.model)})
                </span>
              )}
            </div>
          )}

          <div className="aggregate-list">
            {aggregateRankings.map((agg, index) => (
              <div key={index} className="aggregate-item">
                <span className="rank-position">#{index + 1}</span>
                <span className="rank-model">
                  {shortModelName(agg.model)}
                </span>
                <span className="rank-score">
                  Avg rank: {agg.average_rank.toFixed(2)}
                </span>
                <span className="rank-count">Votes: {agg.rankings_count}</span>
                {agg.first_place_votes != null && (
                  <span className="rank-metric">
                    1st-place: {agg.first_place_votes}
                  </span>
                )}
                {agg.average_score != null && (
                  <span className="rank-metric">
                    Peer score: {agg.average_score.toFixed(1)}
                  </span>
                )}
                {agg.average_confidence != null && (
                  <span className="rank-metric">
                    Confidence: {agg.average_confidence.toFixed(1)}%
                  </span>
                )}
              </div>
            ))}
          </div>

          <CriterionBreakdownTable
            aggregateRankings={aggregateRankings}
            rubricCriteria={rubricCriteria}
          />
        </div>
      )}

      {/* Expandable evaluations section */}
      {showEvaluations && (
        <div className="stage2-evaluations-section">
          <hr className="stage2-section-divider" />
          <h4 className="stage2-evaluations-heading">Evaluation Details</h4>
          <p className="stage-description evaluations-note">
            Evaluations were performed on anonymized responses (Response A/B/C...). Names below are restored for readability.
          </p>

          {useSplitView ? (
            <div
              className={`stage2-split-container ${isResizing ? 'is-resizing' : ''}`}
              ref={containerRef}
            >
              <div className="stage2-panel" style={{ flexBasis: `${splitRatio}%` }}>
                <EvaluationCard
                  rank={rankings[0]}
                  labelToModel={labelToModel}
                  rubricCriteria={rubricCriteria}
                />
              </div>
              <div
                className="stage2-resizer"
                onMouseDown={handleResizeStart}
                onDoubleClick={handleResizeReset}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize evaluator panels"
              />
              <div className="stage2-panel" style={{ flexBasis: `${100 - splitRatio}%` }}>
                <EvaluationCard
                  rank={rankings[1]}
                  labelToModel={labelToModel}
                  rubricCriteria={rubricCriteria}
                />
              </div>
            </div>
          ) : (
            <div className={`evaluations-grid ${layoutMode === 'stacked' ? 'stacked' : ''}`}>
              {rankings.map((rank, index) => (
                <EvaluationCard
                  key={index}
                  rank={rank}
                  labelToModel={labelToModel}
                  rubricCriteria={rubricCriteria}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <UsageSummary results={rankings} label="Stage 2 total" />
    </div>
  );
}
