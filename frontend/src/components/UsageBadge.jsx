import './UsageBadge.css';

function formatTokens(n) {
  if (!n) return '0';
  return n.toLocaleString();
}

function formatCost(cost) {
  if (!cost) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export default function UsageBadge({ usage }) {
  if (!usage) return null;

  const prompt = usage.prompt_tokens || 0;
  const completion = usage.completion_tokens || 0;
  const total = prompt + completion;
  const cost = usage.cost;

  return (
    <span className="usage-badge">
      {formatTokens(total)} tokens
      {cost != null && <> &middot; {formatCost(cost)}</>}
    </span>
  );
}

export function UsageSummary({ results, label }) {
  if (!results || results.length === 0) return null;

  const totalPrompt = results.reduce((s, r) => s + (r.usage?.prompt_tokens || 0), 0);
  const totalCompletion = results.reduce((s, r) => s + (r.usage?.completion_tokens || 0), 0);
  const totalCost = results.reduce((s, r) => s + (r.usage?.cost || 0), 0);

  if (totalPrompt === 0 && totalCompletion === 0) return null;

  return (
    <div className="usage-summary">
      <span className="usage-summary-label">{label}:</span>
      <span>{formatTokens(totalPrompt)} prompt + {formatTokens(totalCompletion)} completion</span>
      {totalCost > 0 && <span> &middot; {formatCost(totalCost)}</span>}
    </div>
  );
}
