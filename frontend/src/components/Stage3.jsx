import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import UsageBadge from './UsageBadge';
import './Stage3.css';

export default function Stage3({ finalResponse }) {
  const [copied, setCopied] = useState(false);

  if (!finalResponse) {
    return null;
  }

  const mode = finalResponse?.mode || 'synthesize';
  const modeLabel = mode === 'best' ? 'Best Response Selected' : 'Merged Answer';
  const modeIcon = mode === 'best' ? '⭐' : '🔀';

  const handleCopy = async () => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(finalResponse.response || '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error('Failed to copy answer:', error);
    }
  };

  return (
    <div className="stage stage3">
      <div className="stage3-header">
        <h3 className="stage-title">Stage 3: Final Council Answer</h3>
        <div className="stage3-header-actions">
          <span className={`mode-badge mode-${mode}`}>
            {modeIcon} {modeLabel}
          </span>
          <button className="copy-answer-btn" type="button" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="final-response">
        <div className="chairman-label">
          {mode === 'best' ? 'Top-Ranked Response' : 'Chairman'}: {finalResponse.model.split('/')[1] || finalResponse.model}
          <UsageBadge usage={finalResponse.usage} />
        </div>
        <div className="final-text markdown-content">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
