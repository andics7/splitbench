import { useState, useEffect } from 'react';
import { api } from '../api';
import './RubricEditor.css';

const MAX_CRITERIA = 8;
const MAX_NAME_LENGTH = 40;

// All active dots use the same dark colour
const DOT_SHADES = ['#1a1a1a', '#1a1a1a', '#1a1a1a', '#1a1a1a', '#1a1a1a'];

function WeightDots({ weight, onChange, disabled }) {
  return (
    <div className="rubric-weight-dots">
      {[1, 2, 3, 4, 5].map((w) => (
        <button
          key={w}
          type="button"
          className={`rubric-weight-dot ${w <= weight ? 'active' : ''}`}
          style={w <= weight ? { background: DOT_SHADES[w - 1], borderColor: DOT_SHADES[w - 1] } : {}}
          onClick={() => !disabled && onChange(w)}
          disabled={disabled}
          title={`Weight ${w}`}
        />
      ))}
    </div>
  );
}

function RemoveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export default function RubricEditor({ rubric, onRubricChange, disabled }) {
  const [savedRubrics, setSavedRubrics] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const criteria = rubric?.criteria || [];

  useEffect(() => {
    api.getRubrics().then((data) => {
      setSavedRubrics(data.rubrics || []);
    }).catch(console.error);
  }, []);

  const updateCriteria = (newCriteria) => {
    if (newCriteria.length === 0) {
      onRubricChange(null);
    } else {
      onRubricChange({ criteria: newCriteria });
    }
  };

  const addCriterion = () => {
    if (criteria.length >= MAX_CRITERIA) return;
    updateCriteria([...criteria, { name: '', weight: 3 }]);
  };

  const removeCriterion = (index) => {
    updateCriteria(criteria.filter((_, i) => i !== index));
  };

  const updateCriterionName = (index, name) => {
    const updated = criteria.map((c, i) =>
      i === index ? { ...c, name: name.slice(0, MAX_NAME_LENGTH) } : c
    );
    updateCriteria(updated);
  };

  const updateCriterionWeight = (index, weight) => {
    const updated = criteria.map((c, i) =>
      i === index ? { ...c, weight } : c
    );
    updateCriteria(updated);
  };

  const handleSave = async () => {
    const name = saveName.trim();
    if (!name || criteria.length === 0) return;
    try {
      const saved = await api.createRubric({ name, criteria });
      setSavedRubrics((prev) => [...prev, saved]);
      setSaveName('');
      setShowSaveInput(false);
    } catch (err) {
      console.error('Failed to save rubric:', err);
    }
  };

  const handleLoadRubric = (saved) => {
    onRubricChange({ criteria: saved.criteria.map((c) => ({ ...c })) });
    setShowSaved(false);
  };

  const handleDeleteSaved = async (id, e) => {
    e.stopPropagation();
    try {
      await api.deleteRubric(id);
      setSavedRubrics((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete rubric:', err);
    }
  };

  const handleClear = () => {
    onRubricChange(null);
  };

  return (
    <div className="rubric-editor">
      <div className="rubric-header">
        <span className="rubric-title">Chairman Evaluation Rubric</span>
        <div className="rubric-header-actions">
          {criteria.length > 0 && (
            <button
              type="button"
              className="rubric-action-btn"
              onClick={() => setShowSaveInput(!showSaveInput)}
              disabled={disabled}
            >
              Save
            </button>
          )}
          <button
            type="button"
            className="rubric-action-btn"
            onClick={() => setShowSaved(!showSaved)}
            disabled={disabled}
          >
            Load
          </button>
          {criteria.length > 0 && (
            <button
              type="button"
              className="rubric-action-btn danger"
              onClick={handleClear}
              disabled={disabled}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {showSaveInput && (
        <div className="rubric-save-row">
          <input
            type="text"
            className="rubric-save-input"
            placeholder="Rubric name..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setShowSaveInput(false);
            }}
            autoFocus
          />
          <button
            type="button"
            className="rubric-action-btn primary"
            onClick={handleSave}
            disabled={!saveName.trim()}
          >
            Save
          </button>
        </div>
      )}

      {showSaved && (
        <div className="rubric-saved-list">
          {savedRubrics.length === 0 ? (
            <div className="rubric-saved-empty">No saved rubrics yet</div>
          ) : (
            savedRubrics.map((r) => (
              <div
                key={r.id}
                className="rubric-saved-item"
                onClick={() => handleLoadRubric(r)}
              >
                <div className="rubric-saved-info">
                  <span className="rubric-saved-name">{r.name}</span>
                  <span className="rubric-saved-count">{r.criteria.length} criteria</span>
                </div>
                <button
                  type="button"
                  className="rubric-saved-delete"
                  onClick={(e) => handleDeleteSaved(r.id, e)}
                  title="Delete rubric"
                >
                  <RemoveIcon />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="rubric-criteria-list">
        {criteria.map((criterion, index) => (
          <div key={index} className="rubric-criterion-row">
            <input
              type="text"
              className="rubric-criterion-name"
              placeholder="Criterion name (e.g. Accuracy)"
              value={criterion.name}
              onChange={(e) => updateCriterionName(index, e.target.value)}
              disabled={disabled}
            />
            <WeightDots
              weight={criterion.weight}
              onChange={(w) => updateCriterionWeight(index, w)}
              disabled={disabled}
            />
            <button
              type="button"
              className="rubric-criterion-remove"
              onClick={() => removeCriterion(index)}
              disabled={disabled}
              title="Remove criterion"
            >
              <RemoveIcon />
            </button>
          </div>
        ))}
      </div>

      {criteria.length < MAX_CRITERIA && (
        <button
          type="button"
          className="rubric-add-btn"
          onClick={addCriterion}
          disabled={disabled}
        >
          Add criterion
        </button>
      )}

      {criteria.length === 0 && (
        <div className="rubric-empty-hint">
          Add criteria to score responses against specific dimensions (e.g. accuracy, conciseness, tone).
        </div>
      )}
    </div>
  );
}
