import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import PromptEditor from './PromptEditor';
import './PromptLibrary.css';

const CATEGORY_ICONS = {
  'creative-writing': 'Creative',
  'coding': 'Code',
  'reasoning': 'Logic',
  'analysis': 'Data',
  'custom': 'Custom',
};

function getCategoryClass(category) {
  if (!category) return 'cat-unknown';
  return `cat-${category.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'unknown'}`;
}

function fillTemplate(template, variableValues) {
  let filled = template;
  for (const [name, value] of Object.entries(variableValues)) {
    filled = filled.replaceAll(`{{${name}}}`, value || `{{${name}}}`);
  }
  return filled;
}

export default function PromptLibrary({ isOpen, onClose, onUseTemplate, onRequestConfirm }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [error, setError] = useState(null);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Variable fill state (when using a template)
  const [fillingTemplate, setFillingTemplate] = useState(null);
  const [variableValues, setVariableValues] = useState({});

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setSelectedCategory('all');
      setError(null);
      setFillingTemplate(null);
      setVariableValues({});
    }
  }, [isOpen]);

  // Escape key handler with nested modal priority
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editorOpen) {
          setEditorOpen(false);
          setEditingTemplate(null);
        } else if (fillingTemplate) {
          setFillingTemplate(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editorOpen, fillingTemplate, onClose]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await api.getPromptTemplates();
      setTemplates(data.templates || []);
    } catch (err) {
      setError('Failed to load templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const counts = { all: templates.length };
    templates.forEach((t) => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return counts;
  }, [templates]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
      return true;
    });
  }, [templates, selectedCategory]);

  const handleUseClick = (template) => {
    if (template.variables && template.variables.length > 0) {
      setFillingTemplate(template);
      const initial = {};
      template.variables.forEach((v) => {
        initial[v.name] = '';
      });
      setVariableValues(initial);
    } else {
      // No variables, use directly
      api.usePromptTemplate(template.id).catch(console.error);
      onUseTemplate(template.template, template.id, template.category, template.rubric || null);
      onClose();
    }
  };

  const handleFillAndUse = () => {
    if (!fillingTemplate) return;
    const filled = fillTemplate(fillingTemplate.template, variableValues);
    api.usePromptTemplate(fillingTemplate.id).catch(console.error);
    onUseTemplate(filled, fillingTemplate.id, fillingTemplate.category, fillingTemplate.rubric || null);
    setFillingTemplate(null);
    setVariableValues({});
    onClose();
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const handleEditorSave = async (templateData) => {
    try {
      if (editingTemplate && editingTemplate.id) {
        await api.updatePromptTemplate(editingTemplate.id, templateData);
      } else {
        await api.createPromptTemplate(templateData);
      }
      setEditorOpen(false);
      setEditingTemplate(null);
      loadTemplates();
    } catch (err) {
      console.error('Failed to save template:', err);
      throw err;
    }
  };

  const handleDelete = (template) => {
    onRequestConfirm({
      title: `Delete "${template.name}"?`,
      message: 'This template will be permanently deleted.',
      confirmLabel: 'Yes, delete it',
      danger: true,
      onConfirm: async () => {
        try {
          await api.deletePromptTemplate(template.id);
          loadTemplates();
        } catch (err) {
          console.error('Failed to delete template:', err);
          setError('Failed to delete template');
        }
      },
    });
  };

  if (!isOpen) return null;

  // Variable fill modal
  if (fillingTemplate) {
    return (
      <div className="pl-overlay" onClick={() => setFillingTemplate(null)}>
        <div className="pl-fill-panel" onClick={(e) => e.stopPropagation()}>
          <div className="pl-header">
            <h2>Fill Template Variables</h2>
            <button className="pl-close" onClick={() => setFillingTemplate(null)}>
              &times;
            </button>
          </div>
          <div className="pl-fill-body">
            <div className="pl-fill-template-name">{fillingTemplate.name}</div>
            <div className="pl-fill-description">{fillingTemplate.description}</div>

            <div className="pl-fill-variables">
              {fillingTemplate.variables.map((v) => (
                <div key={v.name} className="pl-fill-variable">
                  <label className="pl-fill-label">{v.name}</label>
                  <input
                    type="text"
                    className="pl-fill-input"
                    placeholder={v.placeholder}
                    value={variableValues[v.name] || ''}
                    onChange={(e) =>
                      setVariableValues((prev) => ({
                        ...prev,
                        [v.name]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFillAndUse();
                    }}
                    autoFocus={fillingTemplate.variables.indexOf(v) === 0}
                  />
                </div>
              ))}
            </div>

            <div className="pl-fill-preview">
              <div className="pl-fill-preview-label">Preview</div>
              <div className="pl-fill-preview-text">
                {fillTemplate(fillingTemplate.template, variableValues)}
              </div>
            </div>
          </div>
          <div className="pl-fill-footer">
            <button
              className="pl-btn-secondary"
              onClick={() => setFillingTemplate(null)}
            >
              Cancel
            </button>
            <button className="pl-btn-primary" onClick={handleFillAndUse}>
              Use Prompt
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-overlay" onClick={onClose}>
      <div className="pl-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pl-header">
          <h2>Evals Library</h2>
          <div className="pl-header-actions">
            <button className="pl-btn-primary" onClick={handleNewTemplate}>
              + New Template
            </button>
            <button className="pl-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {error && <div className="pl-error">{error}</div>}

        {/* Body: sidebar + grid */}
        <div className="pl-body">
          {/* Category sidebar */}
          <div className="pl-sidebar">
            <div className="pl-filter-title">Categories</div>
            <button
              className={`pl-category-btn cat-all ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              <span>All</span>
              <span className="pl-category-count">{categories.all || 0}</span>
            </button>
            {Object.entries(CATEGORY_ICONS).map(([key, label]) => (
              <button
                key={key}
                className={`pl-category-btn ${getCategoryClass(key)} ${selectedCategory === key ? 'active' : ''}`}
                onClick={() => setSelectedCategory(key)}
              >
                <span>{label}</span>
                <span className="pl-category-count">{categories[key] || 0}</span>
              </button>
            ))}
          </div>

          {/* Template list */}
          <div className="pl-list-area">
            <div className="pl-grid">
              {loading ? (
                <div className="pl-empty">Loading templates...</div>
              ) : filtered.length === 0 ? (
                <div className="pl-empty">
                  No templates match your search
                </div>
              ) : (
                filtered.map((template) => (
                  <div key={template.id} className="pl-card" onClick={() => handleEdit(template)}>
                    <div className="pl-card-header">
                      <div className="pl-card-title">{template.name}</div>
                      <span className={`pl-tag ${getCategoryClass(template.category)}`}>
                        {CATEGORY_ICONS[template.category] || template.category}
                      </span>
                    </div>
                    <div className="pl-card-description">
                      {template.description}
                    </div>
                    <div className="pl-card-template">
                      {template.template.length > 120
                        ? template.template.slice(0, 120) + '...'
                        : template.template}
                    </div>
                    {template.variables && template.variables.length > 0 && (
                      <div className="pl-card-vars">
                        {template.variables.map((v) => (
                          <span key={v.name} className="pl-var-chip">
                            {`{{${v.name}}}`}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="pl-card-footer">
                      <span className="pl-usage-count">
                        Used {template.usage_count || 0} time
                        {(template.usage_count || 0) !== 1 ? 's' : ''}
                      </span>
                      <div className="pl-card-actions">
                        {!template.is_builtin && (
                          <button
                            className="pl-btn-danger-sm"
                            onClick={(e) => { e.stopPropagation(); handleDelete(template); }}
                          >
                            Delete
                          </button>
                        )}
                        <button
                          className="pl-btn-primary-sm"
                          onClick={(e) => { e.stopPropagation(); handleUseClick(template); }}
                        >
                          Use
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Editor sub-modal */}
      {editorOpen && (
        <PromptEditor
          template={editingTemplate}
          onSave={handleEditorSave}
          onClose={() => {
            setEditorOpen(false);
            setEditingTemplate(null);
          }}
        />
      )}
    </div>
  );
}
