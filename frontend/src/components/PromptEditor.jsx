import { useState, useEffect, useMemo } from 'react';
import './PromptEditor.css';

const CATEGORIES = [
  { id: 'creative-writing', label: 'Creative Writing' },
  { id: 'coding', label: 'Coding' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'custom', label: 'Custom' },
];

function extractVariables(template) {
  const regex = /\{\{(\w+)\}\}/g;
  const matches = [...template.matchAll(regex)];
  return [...new Set(matches.map((m) => m[1]))];
}

function estimateTokens(text) {
  if (!text) return 0;
  // Rough approximation: ~1.3 tokens per word
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

export default function PromptEditor({ template, onSave, onClose }) {
  const isEditing = !!template;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('custom');
  const [description, setDescription] = useState('');
  const [templateText, setTemplateText] = useState('');
  const [variablePlaceholders, setVariablePlaceholders] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [rubricCriteria, setRubricCriteria] = useState([]);

  useEffect(() => {
    if (template) {
      setName(template.name || '');
      setCategory(template.category || 'custom');
      setDescription(template.description || '');
      setTemplateText(template.template || '');
      const ph = {};
      (template.variables || []).forEach((v) => {
        ph[v.name] = v.placeholder || '';
      });
      setVariablePlaceholders(ph);
      setRubricCriteria(template.rubric?.criteria || []);
    } else {
      setName('');
      setCategory('custom');
      setDescription('');
      setTemplateText('');
      setVariablePlaceholders({});
      setRubricCriteria([]);
    }
    setError(null);
  }, [template]);

  const detectedVars = useMemo(() => extractVariables(templateText), [templateText]);

  const tokenCount = useMemo(() => estimateTokens(templateText), [templateText]);

  const handleInsertVariable = () => {
    const varName = window.prompt('Variable name (letters, numbers, underscores):');
    if (!varName || !/^\w+$/.test(varName)) return;
    setTemplateText((prev) => prev + `{{${varName}}}`);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    if (!templateText.trim()) {
      setError('Template content is required');
      return;
    }

    const variables = detectedVars.map((v) => ({
      name: v,
      placeholder: variablePlaceholders[v] || '',
    }));

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        category,
        description: description.trim(),
        template: templateText,
        variables,
        rubric: rubricCriteria.length > 0 ? { criteria: rubricCriteria } : null,
      });
    } catch (err) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="pe-overlay" onClick={onClose}>
      <div className="pe-panel" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="pe-header">
          <h2>{isEditing ? 'Edit Template' : 'New Template'}</h2>
          <button className="pe-close" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="pe-error">{error}</div>}

        <div className="pe-body">
          {/* Left: form */}
          <div className="pe-form">
            <div className="pe-field">
              <label className="pe-label">Name</label>
              <input
                type="text"
                className="pe-input"
                placeholder="My Template"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="pe-row">
              <div className="pe-field" style={{ flex: 1 }}>
                <label className="pe-label">Category</label>
                <select
                  className="pe-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="pe-field" style={{ flex: 2 }}>
                <label className="pe-label">Description</label>
                <input
                  type="text"
                  className="pe-input"
                  placeholder="Brief description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="pe-field">
              <div className="pe-label-row">
                <label className="pe-label">Template</label>
                <div className="pe-toolbar">
                  <button
                    className="pe-toolbar-btn"
                    onClick={handleInsertVariable}
                    title="Insert variable"
                  >
                    {'{{'} var {'}}'}
                  </button>
                  <button
                    className={`pe-toolbar-btn ${showPreview ? 'active' : ''}`}
                    onClick={() => setShowPreview(!showPreview)}
                    title="Toggle preview"
                  >
                    Preview
                  </button>
                  <span className="pe-token-count">~{tokenCount} tokens</span>
                </div>
              </div>
              <textarea
                className="pe-textarea"
                placeholder="Write your prompt template here...&#10;&#10;Use {{variable_name}} for dynamic parts."
                value={templateText}
                onChange={(e) => setTemplateText(e.target.value)}
                rows={10}
              />
            </div>

            {/* Detected variables */}
            {detectedVars.length > 0 && (
              <div className="pe-field">
                <label className="pe-label">
                  Variables ({detectedVars.length})
                </label>
                <div className="pe-variables">
                  {detectedVars.map((v) => (
                    <div key={v} className="pe-variable-row">
                      <span className="pe-var-name">{`{{${v}}}`}</span>
                      <input
                        type="text"
                        className="pe-var-placeholder"
                        placeholder="placeholder text..."
                        value={variablePlaceholders[v] || ''}
                        onChange={(e) =>
                          setVariablePlaceholders((prev) => ({
                            ...prev,
                            [v]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evaluation rubric */}
            <div className="pe-field">
              <label className="pe-label">
                Evaluation Rubric {rubricCriteria.length > 0 && `(${rubricCriteria.length})`}
              </label>
              <p className="pe-hint">Optional: define scoring criteria for Stage 2 peer review.</p>
              <div className="pe-rubric-list">
                {rubricCriteria.map((c, i) => (
                  <div key={i} className="pe-rubric-row">
                    <input
                      type="text"
                      className="pe-input"
                      placeholder="Criterion name"
                      value={c.name}
                      onChange={(e) => {
                        const updated = [...rubricCriteria];
                        updated[i] = { ...updated[i], name: e.target.value.slice(0, 40) };
                        setRubricCriteria(updated);
                      }}
                    />
                    <select
                      className="pe-select pe-rubric-weight"
                      value={c.weight}
                      onChange={(e) => {
                        const updated = [...rubricCriteria];
                        updated[i] = { ...updated[i], weight: Number(e.target.value) };
                        setRubricCriteria(updated);
                      }}
                    >
                      {[1, 2, 3, 4, 5].map((w) => (
                        <option key={w} value={w}>w{w}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="pe-toolbar-btn"
                      onClick={() => setRubricCriteria(rubricCriteria.filter((_, j) => j !== i))}
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              {rubricCriteria.length < 8 && (
                <button
                  type="button"
                  className="pe-toolbar-btn"
                  onClick={() => setRubricCriteria([...rubricCriteria, { name: '', weight: 3 }])}
                >
                  + Add criterion
                </button>
              )}
            </div>
          </div>

          {/* Right: preview */}
          {showPreview && (
            <div className="pe-preview">
              <div className="pe-preview-label">Preview</div>
              <div className="pe-preview-content">
                {templateText || 'Start typing to see a preview...'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pe-footer">
          <button className="pe-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="pe-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
