import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import './ModelSelector.css';

const ICON_CDN = 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons';

const PROVIDER_ICON_SLUGS = {
  'openai': 'openai',
  'anthropic': 'anthropic',
  'google': 'google',
  'x-ai': 'xai',
  'meta-llama': 'meta',
  'deepseek': 'deepseek',
  'mistralai': 'mistral',
  'qwen': 'qwen',
  'cohere': 'cohere',
  'perplexity': 'perplexity',
  'nvidia': 'nvidia',
  'minimax': 'minimax',
  'microsoft': 'microsoft',
  'amazon': 'aws',
};

const PROVIDER_LABELS = {
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'google': 'Google',
  'x-ai': 'xAI',
  'meta-llama': 'Meta',
  'deepseek': 'DeepSeek',
  'mistralai': 'Mistral',
  'qwen': 'Qwen',
  'cohere': 'Cohere',
  'perplexity': 'Perplexity',
  'nvidia': 'NVIDIA',
};

const CONTEXT_OPTIONS = [
  { value: 0, label: 'Any' },
  { value: 32000, label: '32K+' },
  { value: 100000, label: '100K+' },
  { value: 200000, label: '200K+' },
  { value: 1000000, label: '1M+' },
];

function getProvider(modelId) {
  return modelId.split('/')[0] || modelId;
}

function getShortName(modelId) {
  return modelId.split('/')[1] || modelId;
}

function isFreeModel(model) {
  if (model.id.endsWith(':free')) return true;
  const prompt = parseFloat(model.pricing?.prompt);
  const completion = parseFloat(model.pricing?.completion);
  return prompt === 0 && completion === 0;
}

function formatPrice(pricePerToken) {
  const val = parseFloat(pricePerToken);
  if (isNaN(val) || val === 0) return 'Free';
  const perMillion = val * 1_000_000;
  if (perMillion < 0.01) return '<$0.01/M';
  return `$${perMillion.toFixed(2)}/M`;
}

function formatContextLength(length) {
  if (!length) return '';
  if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(1)}M`;
  if (length >= 1000) return `${Math.round(length / 1000)}K`;
  return `${length}`;
}

function normalizeContextLength(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getProviderIconUrl(provider) {
  const slug = PROVIDER_ICON_SLUGS[provider];
  if (slug) return `${ICON_CDN}/${slug}.svg`;
  return null;
}

function ProviderIcon({ provider, size = 20 }) {
  const [failed, setFailed] = useState(false);
  const url = getProviderIconUrl(provider);
  const letter = (PROVIDER_LABELS[provider] || provider || '?')[0].toUpperCase();

  if (!url || failed) {
    return (
      <span className="provider-icon-fallback" style={{ width: size, height: size, fontSize: size * 0.55 }}>
        {letter}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={provider}
      width={size}
      height={size}
      className="provider-icon"
      onError={() => setFailed(true)}
    />
  );
}

export default function ModelSelector({
  isOpen,
  onClose,
  onSave,
  currentCouncilModels,
  currentChairmanModel,
}) {
  const [allModels, setAllModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [contextMin, setContextMin] = useState(0);
  const [capVision, setCapVision] = useState(false);
  const [capTools, setCapTools] = useState(false);
  const [capReasoning, setCapReasoning] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [sortBy, setSortBy] = useState('default');

  // Selection
  const [selectedCouncil, setSelectedCouncil] = useState([]);
  const [selectedChairman, setSelectedChairman] = useState('');

  // Initialize on open
  useEffect(() => {
    if (isOpen) {
      setSelectedCouncil([...currentCouncilModels]);
      setSelectedChairman(currentChairmanModel);
      setSearchQuery('');
      setSelectedProviders([]);
      setContextMin(0);
      setCapVision(false);
      setCapTools(false);
      setCapReasoning(false);
      setFreeOnly(false);
      setSortBy('default');
      setError(null);
    }
  }, [isOpen, currentCouncilModels, currentChairmanModel]);

  // Fetch models on open
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.getModels()
      .then(data => {
        setAllModels(data.models || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch models:', err);
        setError('Failed to load models from OpenRouter');
        setLoading(false);
      });
  }, [isOpen]);

  // Compute provider counts from all models
  const providerCounts = useMemo(() => {
    const counts = {};
    allModels.forEach(m => {
      const p = getProvider(m.id);
      counts[p] = (counts[p] || 0) + 1;
    });
    // Sort by count descending, take top providers
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: PROVIDER_LABELS[key] || key, count }));
  }, [allModels]);

  // Filter models
  const filtered = useMemo(() => {
    return allModels.filter(m => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!m.name?.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) return false;
      }
      if (selectedProviders.length > 0 && !selectedProviders.includes(getProvider(m.id))) return false;
      if (freeOnly && !isFreeModel(m)) return false;
      if (contextMin > 0 && normalizeContextLength(m.context_length) < contextMin) return false;
      if (capVision && !m.supports_vision) return false;
      if (capTools && !m.supports_tools) return false;
      if (capReasoning && !m.supports_reasoning) return false;
      return true;
    });
  }, [allModels, searchQuery, selectedProviders, freeOnly, contextMin, capVision, capTools, capReasoning]);

  const sortedFiltered = useMemo(() => {
    if (sortBy === 'default') return filtered;

    const parsePromptPrice = (model) => {
      const v = parseFloat(model.pricing?.prompt);
      return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
    };

    const parseContext = (model) => {
      return normalizeContextLength(model.context_length) || -1;
    };

    const parseCreated = (model) => {
      const created = Number(model.created);
      if (!Number.isFinite(created) || created <= 0) return 0;
      return created > 1_000_000_000_000 ? created : created * 1000;
    };

    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortBy === 'price_asc') return parsePromptPrice(a) - parsePromptPrice(b);
      if (sortBy === 'price_desc') return parsePromptPrice(b) - parsePromptPrice(a);
      if (sortBy === 'tokens_desc') return parseContext(b) - parseContext(a);
      if (sortBy === 'tokens_asc') return parseContext(a) - parseContext(b);
      if (sortBy === 'release_desc') return parseCreated(b) - parseCreated(a);
      if (sortBy === 'release_asc') return parseCreated(a) - parseCreated(b);
      return 0;
    });
    return arr;
  }, [filtered, sortBy]);

  // Build a lookup for quick model info in selection bar
  const modelMap = useMemo(() => {
    const map = {};
    allModels.forEach(m => { map[m.id] = m; });
    return map;
  }, [allModels]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleProvider = (key) => {
    setSelectedProviders(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedProviders([]);
    setContextMin(0);
    setCapVision(false);
    setCapTools(false);
    setCapReasoning(false);
    setFreeOnly(false);
  };

  const hasActiveFilters = searchQuery || selectedProviders.length > 0 || contextMin > 0 || capVision || capTools || capReasoning || freeOnly;

  const handleAdd = (modelId) => {
    if (!selectedCouncil.includes(modelId)) {
      setSelectedCouncil(prev => [...prev, modelId]);
    }
  };

  const handleRemove = (modelId) => {
    setSelectedCouncil(prev => prev.filter(id => id !== modelId));
  };

  const handleToggleChairman = (modelId) => {
    setSelectedChairman(prev => prev === modelId ? '' : modelId);
  };

  const handleSave = async () => {
    if (selectedCouncil.length < 2) {
      setError('Select at least 2 council members');
      return;
    }
    if (!selectedChairman) {
      setError('Select a chairman model');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(selectedCouncil, selectedChairman);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ms-overlay" onClick={onClose}>
      <div className="ms-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ms-header">
          <h2>Model Library</h2>
          <button className="ms-close" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="ms-error">{error}</div>}

        {/* Main content: sidebar + list */}
        <div className="ms-body">

          {/* Filter sidebar — Provider only */}
          <div className="ms-sidebar">
            <div className="ms-filter-group">
              <div className="ms-filter-title">Provider</div>
              {providerCounts.map(p => (
                <label key={p.key} className="ms-checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedProviders.includes(p.key)}
                    onChange={() => toggleProvider(p.key)}
                  />
                  <ProviderIcon provider={p.key} size={16} />
                  <span className="ms-checkbox-label">{p.label}</span>
                  <span className="ms-checkbox-count">{p.count}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Model list */}
          <div className="ms-list-area">
            <div className="ms-search-bar">
              <input
                type="text"
                className="ms-search"
                placeholder="Search models..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <div className="ms-search-right">
                <div className="ms-sort-control">
                  <label className="ms-sort-label" htmlFor="ms-sort-select">Sort</label>
                  <select
                    id="ms-sort-select"
                    className="ms-sort-select"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                  >
                    <option value="default">Default</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="tokens_desc">Tokens: High to Low</option>
                    <option value="tokens_asc">Tokens: Low to High</option>
                    <option value="release_desc">Release: Newest</option>
                    <option value="release_asc">Release: Oldest</option>
                  </select>
                </div>
                <span className="ms-count">{sortedFiltered.length} models</span>
              </div>
            </div>

            {/* Horizontal filter bar */}
            <div className="ms-filter-bar">
              <div className="ms-filter-bar-group">
                <span className="ms-filter-bar-label">Context:</span>
                {CONTEXT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`ms-filter-pill ${contextMin === opt.value ? 'active' : ''}`}
                    onClick={() => setContextMin(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="ms-filter-bar-group">
                <span className="ms-filter-bar-label">Capabilities:</span>
                <button
                  className={`ms-filter-pill vision ${capVision ? 'active' : ''}`}
                  onClick={() => setCapVision(!capVision)}
                >
                  Vision
                </button>
                <button
                  className={`ms-filter-pill tools ${capTools ? 'active' : ''}`}
                  onClick={() => setCapTools(!capTools)}
                >
                  Tools
                </button>
                <button
                  className={`ms-filter-pill reasoning ${capReasoning ? 'active' : ''}`}
                  onClick={() => setCapReasoning(!capReasoning)}
                >
                  Reasoning
                </button>
              </div>

              <div className="ms-filter-bar-group">
                <button
                  className={`ms-filter-pill free ${freeOnly ? 'active' : ''}`}
                  onClick={() => setFreeOnly(!freeOnly)}
                >
                  Free
                </button>
              </div>

              {hasActiveFilters && (
                <button className="ms-filter-bar-reset" onClick={resetFilters}>
                  Reset
                </button>
              )}
            </div>

            <div className="ms-list">
              {loading ? (
                <div className="ms-list-empty">Loading models...</div>
              ) : filtered.length === 0 ? (
                <div className="ms-list-empty">No models match your filters</div>
              ) : (
                sortedFiltered.map(model => {
                  const provider = getProvider(model.id);
                  const isAdded = selectedCouncil.includes(model.id);
                  const isChairman = selectedChairman === model.id;
                  return (
                    <div key={model.id} className={`ms-model-row ${isAdded || isChairman ? 'added' : ''}`} title={model.description || ''}>
                      <ProviderIcon provider={provider} size={24} />
                      <div className="ms-model-info">
                        <div className="ms-model-name">{model.name || getShortName(model.id)}</div>
                        <div className="ms-model-meta">
                          {normalizeContextLength(model.context_length) > 0 && (
                            <span className="ms-tag ctx">{formatContextLength(normalizeContextLength(model.context_length))} ctx</span>
                          )}
                          <span className={`ms-tag ${isFreeModel(model) ? 'free' : 'price'}`}>
                            {formatPrice(model.pricing?.prompt)}
                          </span>
                          {model.supports_vision && <span className="ms-tag vision">Vision</span>}
                          {model.supports_tools && <span className="ms-tag tools">Tools</span>}
                          {model.supports_reasoning && <span className="ms-tag reasoning">Reasoning</span>}
                        </div>
                      </div>
                      <div className="ms-action-btns">
                        <button
                          className={`ms-council-btn ${isAdded ? 'is-added' : ''}`}
                          onClick={() => isAdded ? handleRemove(model.id) : handleAdd(model.id)}
                          title={isAdded ? 'Remove from council' : 'Add to council'}
                        >
                          {isAdded ? 'Council ✓' : 'Council'}
                        </button>
                        <button
                          className={`ms-chairman-btn ${isChairman ? 'is-chairman' : ''}`}
                          onClick={() => handleToggleChairman(model.id)}
                          title={isChairman ? 'Remove as chairman' : 'Set as chairman'}
                        >
                          {isChairman ? 'Chair ★' : 'Chair'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Selection bar */}
        <div className="ms-selection-bar">
          <div className="ms-selection-labels-row">
            <span className="ms-selection-label">Council ({selectedCouncil.length})</span>
            <span className="ms-chairman-indicator-label">Chairman</span>
          </div>
          <div className="ms-selection-content-row">
            <div className="ms-chips">
              {selectedCouncil.length === 0 ? (
                <span className="ms-chips-empty">Add models from the list above</span>
              ) : (
                selectedCouncil.map(id => (
                  <span key={id} className={`ms-chip ${selectedChairman === id ? 'is-chairman' : ''}`}>
                    <ProviderIcon provider={getProvider(id)} size={14} />
                    {getShortName(id)}
                    {selectedChairman === id && <span className="ms-chip-crown">★</span>}
                    <button className="ms-chip-x" onClick={() => handleRemove(id)}>&times;</button>
                  </span>
                ))
              )}
            </div>
            <div className="ms-chairman-value-wrap">
              {selectedChairman ? (
                <span className="ms-chairman-indicator-value">
                  <ProviderIcon provider={getProvider(selectedChairman)} size={14} />
                  {modelMap[selectedChairman]?.name || getShortName(selectedChairman)}
                </span>
              ) : (
                <span className="ms-chairman-indicator-empty">Not selected</span>
              )}
            </div>
          </div>
          <div className="ms-selection-actions">
            <button className="ms-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
