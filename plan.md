# Implementation Plan: Prompt Interface & Side-by-Side Viewer

## Project Overview

Building two complementary features for the LLM Council application:
1. **Prompt Interface**: Rich text editor with multi-prompt inputs, templates, auto-complete, and history
2. **Side-by-Side Viewer**: Clean scroll-sync comparison layout with syntax highlighting and token counts

**Status**: Plan approved and ready for implementation
**Total Estimated Time**: 20-27 hours
**Date**: February 15, 2026

---

## User Decisions (Approved)

✅ **Scope**: Both features together in one implementation
✅ **Editor Type**: Enhanced textarea (not full WYSIWYG)
✅ **Navigation**: Modal from sidebar button
✅ **View Mode**: Toggle in Stage 1 header

---

## Technology Stack

### Frontend
- **Framework**: React 19 + Vite
- **Styling**: Vanilla CSS (no Tailwind/styled-components)
- **Markdown Rendering**: react-markdown (existing)
- **New Dependencies**:
  - `react-syntax-highlighter` (v15.5.0+) - Code syntax highlighting
  - `js-tiktoken` (v1.0.7+) - Accurate token counting
  - `react-textarea-autosize` - Auto-resizing textarea

### Backend
- **Framework**: FastAPI (Python)
- **Port**: 8001
- **Storage**: JSON files in `/data/` directory
- **API Client**: OpenRouter (https://openrouter.ai/api/v1/chat/completions)
- **No new dependencies needed** - use existing libraries

### Current Architecture
- **Conversations**: JSON file storage in `/data/conversations/`
- **Model Config**: Single file `/data/model_config.json`
- **State Management**: React hooks (useState, useEffect)
- **Streaming**: Server-Sent Events (SSE)

---

## Feature 1: Prompt Interface

### Overview
Users can create, edit, and manage prompt templates with variables, save favorites, and maintain history. Templates are auto-complete suggestions that speed up common tasks.

### Components to Build

#### 1. `PromptLibrary.jsx` (Modal)
**Purpose**: Browse and select templates
**Location**: `/frontend/src/components/PromptLibrary.jsx`

**UI Structure**:
```
┌─────────────────────────────────────────┐
│ Evals Library                       [×] │
├─────────────────────────────────────────┤
│ 🔍 Search templates...                  │
├──────────────┬──────────────────────────┤
│ Categories   │ Template Grid            │
│ • Creative   │ ┌─────────┐ ┌─────────┐ │
│ • Coding     │ │Template1│ │Template2│ │
│ • Reasoning  │ └─────────┘ └─────────┘ │
│ • Analysis   │                          │
│ • Custom     │ ┌─────────┐ ┌─────────┐ │
└──────────────┴──────────────────────────┘
```

**Features**:
- Category filtering
- Full-text search
- Template cards with usage count badges
- Click to use or edit
- "New Template" button
- Delete button for custom templates only

**Key Code Pattern**:
```jsx
const [templates, setTemplates] = useState([]);
const [selectedCategory, setSelectedCategory] = useState('all');
const [searchTerm, setSearchTerm] = useState('');

useEffect(() => {
  api.getTemplates().then(setTemplates).catch(handleError);
}, []);

const filtered = templates.filter(t =>
  (selectedCategory === 'all' || t.category === selectedCategory) &&
  (t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
   t.description.toLowerCase().includes(searchTerm.toLowerCase()))
);
```

#### 2. `PromptEditor.jsx` (Modal-within-Modal)
**Purpose**: Create and edit prompt templates
**Location**: `/frontend/src/components/PromptEditor.jsx`

**UI Structure**:
```
┌─────────────────────────────────────────────┐
│ New Template                            [×] │
├─────────────────────────────────────────────┤
│ Template Name: ________________________      │
│ Category: [Creative Writing ▼]              │
│ Description: ________________________       │
│                                             │
│ Template Content:                           │
│ ┌────────────────────────────────────────┐ │
│ │ [B] [I] [Code] [{variable}]            │ │
│ │                                        │ │
│ │ Write a {{genre}} story about {{topic}}│ │
│ │                                        │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ Variables Detected: genre, topic            │
│ Tokens: 12 (~estimated)                    │
│                                             │
│ [Save] [Cancel]                             │
└─────────────────────────────────────────────┘
```

**Features**:
- Auto-resizing textarea with markdown shortcuts
- Auto-detect variables from `{{variable}}` syntax
- Real-time token counting
- Markdown preview pane (split view)
- Variable input fields editor
- Save/Cancel with validation

**Variable Detection Logic**:
```jsx
useEffect(() => {
  const regex = /\{\{(\w+)\}\}/g;
  const matches = [...template.matchAll(regex)];
  const uniqueVars = [...new Set(matches.map(m => m[1]))];

  setVariables(uniqueVars.map(v => ({
    name: v,
    placeholder: ''
  })));
}, [template]);
```

**Token Counter Utility** (`/frontend/src/utils/tokenCount.js`):
```javascript
import { encoding_for_model } from 'js-tiktoken';

export const countTokens = (text, model = 'gpt-3.5-turbo') => {
  try {
    const enc = encoding_for_model(model);
    return enc.encode(text).length;
  } catch {
    // Fallback: approximate
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }
};
```

#### 3. `PromptTemplateCard.jsx`
**Purpose**: Individual template display in grid
**Location**: `/frontend/src/components/PromptTemplateCard.jsx`

```jsx
export const PromptTemplateCard = ({ template, onSelect, onEdit, onDelete }) => (
  <div className="template-card">
    <div className="template-header">
      <h4>{template.name}</h4>
      <span className="category-badge">{template.category}</span>
    </div>
    <p className="template-description">{template.description}</p>
    <div className="template-footer">
      <span className="usage-count">Used {template.usage_count} times</span>
      <div className="template-actions">
        {!template.is_builtin && (
          <button onClick={() => onDelete(template.id)}>Delete</button>
        )}
        <button className="secondary" onClick={() => onEdit(template.id)}>Edit</button>
        <button className="primary" onClick={() => onSelect(template.id)}>Use</button>
      </div>
    </div>
  </div>
);
```

#### 4. Enhanced `ChatInterface.jsx` (Modifications)
**Purpose**: Integrate prompt selection into chat input
**Location**: `/frontend/src/components/ChatInterface.jsx`

**Add Above Textarea**:
```jsx
<div className="prompt-selector-section">
  <div className="recent-prompts">
    <label>Recent Templates:</label>
    <select value={selectedTemplate} onChange={handleTemplateSelect}>
      <option value="">-- None --</option>
      {recentTemplates.map(t => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
    <button onClick={openPromptLibrary} className="browse-btn">
      Browse Templates
    </button>
  </div>

  {selectedTemplate && variables.length > 0 && (
    <div className="variable-inputs">
      {variables.map(v => (
        <div key={v.name} className="variable-input">
          <label>{v.name}:</label>
          <input
            type="text"
            placeholder={v.placeholder}
            value={variableValues[v.name] || ''}
            onChange={(e) => updateVariable(v.name, e.target.value)}
          />
        </div>
      ))}
    </div>
  )}
</div>
```

**Keyboard Shortcuts**:
- `Cmd/Ctrl + K`: Open Evals Library
- `Cmd/Ctrl + Shift + V`: Paste as template

### Backend Implementation

#### 1. `/backend/prompts.py` (New File)
**Purpose**: Storage and management functions for templates

```python
import json
import os
from pathlib import Path
from typing import List, Optional, Dict
import uuid
from datetime import datetime

PROMPTS_DIR = Path(__file__).parent.parent / "data" / "prompts"
TEMPLATES_FILE = PROMPTS_DIR / "templates.json"
HISTORY_FILE = PROMPTS_DIR / "history.json"

class PromptManager:
    @staticmethod
    def init():
        """Initialize prompt storage directories"""
        PROMPTS_DIR.mkdir(parents=True, exist_ok=True)

        if not TEMPLATES_FILE.exists():
            PromptManager._seed_builtin_templates()
        if not HISTORY_FILE.exists():
            HISTORY_FILE.write_text(json.dumps({"history": []}, indent=2))

    @staticmethod
    def get_all_templates() -> List[Dict]:
        """Load all templates from storage"""
        with open(TEMPLATES_FILE) as f:
            data = json.load(f)
        return data.get("templates", [])

    @staticmethod
    def get_template(template_id: str) -> Optional[Dict]:
        """Get single template by ID"""
        templates = PromptManager.get_all_templates()
        return next((t for t in templates if t["id"] == template_id), None)

    @staticmethod
    def save_template(template: Dict) -> Dict:
        """Create or update template"""
        if "id" not in template:
            template["id"] = str(uuid.uuid4())

        template["updated_at"] = datetime.utcnow().isoformat()

        templates = PromptManager.get_all_templates()

        # Update existing or add new
        idx = next((i for i, t in enumerate(templates) if t["id"] == template["id"]), -1)
        if idx >= 0:
            templates[idx] = template
        else:
            template["created_at"] = datetime.utcnow().isoformat()
            templates.append(template)

        with open(TEMPLATES_FILE, 'w') as f:
            json.dump({"templates": templates}, f, indent=2)

        return template

    @staticmethod
    def delete_template(template_id: str) -> bool:
        """Delete template (user-created only)"""
        templates = PromptManager.get_all_templates()
        template = next((t for t in templates if t["id"] == template_id), None)

        if not template or template.get("is_builtin"):
            return False

        templates = [t for t in templates if t["id"] != template_id]
        with open(TEMPLATES_FILE, 'w') as f:
            json.dump({"templates": templates}, f, indent=2)

        return True

    @staticmethod
    def add_to_history(content: str, template_id: Optional[str] = None):
        """Add prompt to history"""
        with open(HISTORY_FILE) as f:
            data = json.load(f)

        history_item = {
            "id": str(uuid.uuid4()),
            "content": content,
            "template_id": template_id,
            "created_at": datetime.utcnow().isoformat(),
            "token_count": len(content.split()) * 1.3  # Approximate
        }

        # Keep only last 100 items
        data["history"] = [history_item] + data.get("history", [])[:99]

        with open(HISTORY_FILE, 'w') as f:
            json.dump(data, f, indent=2)

    @staticmethod
    def get_history(limit: int = 20) -> List[Dict]:
        """Get recent prompt history"""
        with open(HISTORY_FILE) as f:
            data = json.load(f)
        return data.get("history", [])[:limit]

    @staticmethod
    def _seed_builtin_templates():
        """Initialize with built-in templates"""
        templates = [
            # Creative Writing
            {
                "id": "builtin-creative-1",
                "name": "Story Outline Generator",
                "category": "creative-writing",
                "description": "Generate a detailed story outline",
                "template": "Create a {{length}} outline for a {{genre}} story about {{topic}}. Include act structure and key plot points.",
                "variables": [
                    {"name": "length", "placeholder": "short/medium/long"},
                    {"name": "genre", "placeholder": "e.g., sci-fi, fantasy, mystery"},
                    {"name": "topic", "placeholder": "main story idea"}
                ],
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "usage_count": 0,
                "is_builtin": True
            },
            # Add more built-in templates...
        ]

        with open(TEMPLATES_FILE, 'w') as f:
            json.dump({"templates": templates}, f, indent=2)

# Initialize on module load
PromptManager.init()
```

#### 2. API Endpoints in `/backend/main.py` (Add These)

```python
from fastapi import APIRouter
from prompts import PromptManager

prompt_router = APIRouter(prefix="/api/prompts", tags=["prompts"])

@prompt_router.get("/templates")
async def get_templates():
    """List all prompt templates"""
    return {"templates": PromptManager.get_all_templates()}

@prompt_router.post("/templates")
async def create_template(template: dict):
    """Create new prompt template"""
    saved = PromptManager.save_template(template)
    return saved

@prompt_router.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Get single template by ID"""
    template = PromptManager.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@prompt_router.put("/templates/{template_id}")
async def update_template(template_id: str, template: dict):
    """Update existing template"""
    template["id"] = template_id
    return PromptManager.save_template(template)

@prompt_router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    """Delete template (user-created only)"""
    success = PromptManager.delete_template(template_id)
    if not success:
        raise HTTPException(status_code=403, detail="Cannot delete built-in template")
    return {"deleted": True}

@prompt_router.get("/history")
async def get_history(limit: int = 20):
    """Get recent prompt history"""
    return {"history": PromptManager.get_history(limit)}

@prompt_router.post("/history")
async def add_history(content: str, template_id: Optional[str] = None):
    """Add prompt to history"""
    PromptManager.add_to_history(content, template_id)
    return {"added": True}

@prompt_router.get("/categories")
async def get_categories():
    """Get available template categories"""
    return {
        "categories": [
            "creative-writing",
            "coding",
            "reasoning",
            "analysis",
            "custom"
        ]
    }

# In main FastAPI app initialization:
app.include_router(prompt_router)
```

### Storage Schema

#### `/data/prompts/templates.json`
```json
{
  "templates": [
    {
      "id": "builtin-creative-1",
      "name": "Story Outline Generator",
      "category": "creative-writing",
      "description": "Generate a detailed story outline",
      "template": "Create a {{length}} outline for a {{genre}} story about {{topic}}.",
      "variables": [
        {"name": "length", "placeholder": "short/medium/long"},
        {"name": "genre", "placeholder": "genre type"},
        {"name": "topic", "placeholder": "main theme"}
      ],
      "created_at": "2026-02-15T10:00:00Z",
      "updated_at": "2026-02-15T10:00:00Z",
      "usage_count": 5,
      "is_builtin": true
    }
  ]
}
```

#### `/data/prompts/history.json`
```json
{
  "history": [
    {
      "id": "uuid-string",
      "content": "Write a science fiction story about AI ethics",
      "template_id": "builtin-creative-1",
      "created_at": "2026-02-15T10:30:00Z",
      "token_count": 12
    }
  ]
}
```

---

## Feature 2: Side-by-Side Viewer

### Overview
Users can compare outputs from two different models with synchronized scrolling, syntax highlighting, and detailed token counts.

### Components to Build

#### 1. `ComparisonViewer.jsx` (New Component)
**Purpose**: Split-pane comparison of two model responses
**Location**: `/frontend/src/components/ComparisonViewer.jsx`

**UI Structure**:
```
┌────────────────────────┬────────────────────────┐
│ Model: [gpt-4 ▼]       │ Model: [claude-3 ▼]    │
├────────────────────────┼────────────────────────┤
│ Raw │ Markdown │ Tokens │ Raw │ Markdown │ Tokens│
├────────────────────────┼────────────────────────┤
│                        │                        │
│ Response A             │ Response B             │
│ (with scrolling sync)  │ (with scrolling sync)  │
│                        │                        │
│ Input: 150 tokens      │ Input: 150 tokens      │
│ Output: 250 tokens     │ Output: 280 tokens     │
└────────────────────────┴────────────────────────┘
```

**Features**:
- Model selection dropdowns
- View mode toggle: Raw text / Markdown rendering
- Syntax highlighting for code blocks
- Scroll sync between panes
- Token count display
- Rank badges from Stage 2 (if available)

**Key Implementation - Scroll Sync**:
```jsx
import { useRef, useState } from 'react';

export const ComparisonViewer = ({ responses, rankings }) => {
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [view, setView] = useState('markdown');

  const handleScroll = (sourceRef, targetRef) => {
    if (isSyncing) return;
    setIsSyncing(true);

    const sourceEl = sourceRef.current;
    const targetEl = targetRef.current;

    if (sourceEl && targetEl) {
      const scrollPercentage = sourceEl.scrollTop /
        (sourceEl.scrollHeight - sourceEl.clientHeight);

      targetEl.scrollTop = scrollPercentage *
        (targetEl.scrollHeight - targetEl.clientHeight);
    }

    setTimeout(() => setIsSyncing(false), 50);
  };

  return (
    <div className="comparison-viewer">
      <div className="comparison-container">
        <ResponsePane
          ref={leftRef}
          response={responses[0]}
          ranking={rankings?.[0]}
          view={view}
          onScroll={(e) => handleScroll(leftRef, rightRef)}
        />
        <ResponsePane
          ref={rightRef}
          response={responses[1]}
          ranking={rankings?.[1]}
          view={view}
          onScroll={(e) => handleScroll(rightRef, leftRef)}
        />
      </div>
    </div>
  );
};
```

**Markdown Custom Renderer with Syntax Highlighting**:
```jsx
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const components = {
  code({inline, className, children, ...props}) {
    const match = /language-(\w+)/.exec(className || '');

    if (!inline && match) {
      return (
        <SyntaxHighlighter
          language={match[1]}
          style={vscDarkPlus}
          customStyle={{
            margin: '12px 0',
            borderRadius: '4px',
            fontSize: '13px'
          }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      );
    }

    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  }
};

// Usage:
<ReactMarkdown components={components}>{content}</ReactMarkdown>
```

#### 2. `ResponsePane.jsx` (Sub-component)
**Purpose**: Individual response display pane
**Location**: `/frontend/src/components/ResponsePane.jsx`

```jsx
import ReactMarkdown from 'react-markdown';
import { countTokens } from '../utils/tokenCount';

export const ResponsePane = React.forwardRef(({
  response,
  ranking,
  view,
  onScroll
}, ref) => {
  const tokensIn = response?.usage?.prompt_tokens || 0;
  const tokensOut = response?.usage?.completion_tokens || 0;
  const totalTokens = tokensIn + tokensOut;

  return (
    <div className="response-pane">
      <div className="pane-header">
        <div className="model-info">
          <h4>{response?.model}</h4>
          {ranking && (
            <span className="rank-badge">#{ranking.average_rank.toFixed(1)}</span>
          )}
        </div>
        <div className="view-toggle">
          <button className={view === 'raw' ? 'active' : ''}>Raw</button>
          <button className={view === 'markdown' ? 'active' : ''}>Markdown</button>
        </div>
      </div>

      <div className="pane-content" ref={ref} onScroll={onScroll}>
        {view === 'raw' ? (
          <pre className="raw-content">{response?.response}</pre>
        ) : (
          <ReactMarkdown
            className="markdown-content"
            components={syntaxHighlightComponents}
          >
            {response?.response}
          </ReactMarkdown>
        )}
      </div>

      <div className="pane-footer">
        <div className="token-info">
          <span>Input: {tokensIn} | Output: {tokensOut} | Total: {totalTokens}</span>
        </div>
      </div>
    </div>
  );
});
```

#### 3. Enhanced `Stage1.jsx` (Modifications)
**Purpose**: Add view toggle between grid and comparison
**Location**: `/frontend/src/components/Stage1.jsx`

**Add View Toggle**:
```jsx
import { ComparisonViewer } from './ComparisonViewer';

export const Stage1 = ({ responses, rankings }) => {
  const [view, setView] = useState('grid');

  return (
    <div className="stage1-section">
      <div className="stage1-header">
        <h3 className="stage-title">Stage 1: Individual Responses</h3>
        <div className="view-toggle">
          <button
            className={view === 'grid' ? 'active' : ''}
            onClick={() => setView('grid')}
          >
            Grid View
          </button>
          <button
            className={view === 'compare' ? 'active' : ''}
            onClick={() => setView('compare')}
          >
            Compare View
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="stage1-grid">
          {responses.map((response, idx) => (
            <div key={idx} className="response-card">
              {/* Existing grid card JSX */}
            </div>
          ))}
        </div>
      ) : (
        <ComparisonViewer
          responses={responses}
          rankings={rankings?.map(r => r.aggregate_rankings)}
        />
      )}
    </div>
  );
};
```

### CSS Styles

#### `/frontend/src/components/ComparisonViewer.css`
```css
.comparison-viewer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comparison-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  min-height: 600px;
  border-radius: 8px;
  overflow: hidden;
}

.response-pane {
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.model-info {
  display: flex;
  gap: 12px;
  align-items: center;
}

.model-info h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.rank-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #4a90e2;
  color: white;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
}

.view-toggle {
  display: flex;
  gap: 8px;
}

.view-toggle button {
  padding: 6px 12px;
  font-size: 12px;
  border: 1px solid #e5e7eb;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.view-toggle button.active {
  background: #4a90e2;
  color: white;
  border-color: #4a90e2;
}

.pane-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.raw-content {
  margin: 0;
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.markdown-content {
  font-size: 14px;
  line-height: 1.6;
  color: #1f2937;
}

.markdown-content code {
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 13px;
}

.pane-footer {
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
  font-size: 12px;
  color: #6b7280;
}

/* Responsive: stack on smaller screens */
@media (max-width: 1024px) {
  .comparison-container {
    grid-template-columns: 1fr;
  }
}
```

#### `/frontend/src/components/Stage1.css` (Add View Toggle Styles)
```css
.stage1-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.stage-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.view-toggle {
  display: flex;
  gap: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 2px;
  background: #f9fafb;
}

.view-toggle button {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.view-toggle button:hover {
  color: #1f2937;
}

.view-toggle button.active {
  background: white;
  color: #4a90e2;
  border: 1px solid #e5e7eb;
}
```

---

## Implementation Sequence

### Phase 1: Backend Foundation (2-3 hours)
**Deliverable**: Working API endpoints for prompt management

1. ✅ Understand prompt storage requirements
2. Create `/backend/prompts.py` with `PromptManager` class
3. Create `/data/prompts/` directory structure
4. Seed with 10-15 built-in templates
5. Add API endpoints to `/backend/main.py`
6. Test all endpoints with curl/Postman

**Testing Checklist**:
- [ ] GET /api/prompts/templates returns list
- [ ] POST /api/prompts/templates creates new
- [ ] PUT updates existing
- [ ] DELETE removes user templates (but not builtin)
- [ ] GET /api/prompts/history returns recent
- [ ] POST /api/prompts/history adds to history

### Phase 2: Prompt Interface - Core (4-5 hours)
**Deliverable**: Working Evals Library modal with browsing

1. Install dependencies: `npm install react-syntax-highlighter js-tiktoken react-textarea-autosize`
2. Create `PromptLibrary.jsx` (modal shell, grid layout)
3. Create `PromptTemplateCard.jsx` (display in grid)
4. Implement template loading from API
5. Add category filtering and search
6. Add "New Template" button
7. Test modal opening/closing from sidebar

**Testing Checklist**:
- [ ] Library modal opens from sidebar
- [ ] All templates load and display
- [ ] Categories filter correctly
- [ ] Search works across name/description
- [ ] Usage counts display

### Phase 3: Prompt Interface - Editor (3-4 hours)
**Deliverable**: Create/edit templates with variable detection

1. Create `PromptEditor.jsx` (modal-within-modal)
2. Implement auto-resizing textarea
3. Auto-detect variables from `{{variable}}` syntax
4. Create `tokenCount.js` utility function
5. Build variable input editor
6. Implement markdown preview pane
7. Add save with validation

**Testing Checklist**:
- [ ] Editor opens for new and existing templates
- [ ] Variables auto-detect correctly
- [ ] Token counting works
- [ ] Save validates required fields
- [ ] Can't save built-in templates (only view)

### Phase 4: Prompt Interface - Integration (2-3 hours)
**Deliverable**: Prompts integrated into chat input

1. Enhance `ChatInterface.jsx` with prompt selector
2. Add "Browse Templates" button
3. Implement variable input fields
4. Show recent templates dropdown
5. Wire up template selection to chat
6. Add keyboard shortcuts (Cmd+K, Cmd+Shift+V)
7. Update prompt history on send

**Testing Checklist**:
- [ ] Prompt dropdown shows recent templates
- [ ] Selecting template shows variable inputs
- [ ] Variable values fill into template text
- [ ] Keyboard shortcuts work
- [ ] History updates after sending

### Phase 5: Side-by-Side Viewer - Core (3-4 hours)
**Deliverable**: Working comparison view with model selection

1. Create `ComparisonViewer.jsx` (split-pane layout)
2. Create `ResponsePane.jsx` (individual pane component)
3. Implement model selection dropdowns
4. Add view mode toggle (raw/markdown)
5. Add view toggle to `Stage1.jsx`
6. Style split-pane layout with CSS Grid
7. Pass response data from Stage1

**Testing Checklist**:
- [ ] Comparison view shows two panes
- [ ] Model dropdowns work
- [ ] Raw text view displays correctly
- [ ] Toggle between grid and compare works

### Phase 6: Side-by-Side Viewer - Advanced (4-5 hours)
**Deliverable**: Full-featured comparison with sync and highlighting

1. Implement scroll sync between panes
2. Integrate `react-syntax-highlighter` with custom markdown renderer
3. Add token counter display
4. Show rank badges from Stage 2
5. Add markdown rendering toggle
6. Test with various response types
7. Fix responsive design

**Testing Checklist**:
- [ ] Scroll one pane, other syncs
- [ ] Code blocks syntax-highlight
- [ ] Token counts display correctly
- [ ] Rank badges show ranking position
- [ ] Responsive on tablet/mobile

### Phase 7: Polish & Testing (2-3 hours)
**Deliverable**: Production-ready features

1. Add loading states while fetching
2. Error handling for API failures
3. Keyboard navigation (Tab through UI)
4. ARIA labels for accessibility
5. Test all user flows end-to-end
6. Performance optimization
7. CSS refinement and polish

**Testing Checklist**:
- [ ] No console errors
- [ ] API errors handled gracefully
- [ ] Tab navigation works
- [ ] Screen reader friendly
- [ ] Fast load times (< 2s)
- [ ] Works in all browsers

---

## Built-in Templates (To Seed)

### Creative Writing (4 templates)
1. Story Outline Generator
2. Character Development
3. Dialogue Writer
4. World Building

### Coding (4 templates)
1. Code Review Template
2. Bug Fixing Assistant
3. Documentation Generator
4. Refactoring Suggestions

### Reasoning (4 templates)
1. Pros/Cons Analysis
2. Step-by-Step Reasoning
3. Devil's Advocate
4. Comparative Analysis

### Analysis (3 templates)
1. SWOT Analysis
2. Data Interpretation
3. Trend Forecasting

---

## CSS Color Palette

**Primary Colors**:
- Primary Blue: `#4a90e2`
- Light Gray: `#f5f5f5`
- White: `#fff`, `#fafafa`

**Text Colors**:
- Primary Text: `#1f2937`
- Secondary Text: `#6b7280`

**UI Elements**:
- Borders: `#e5e7eb`
- Success: `#10b981`
- Error: `#dc2626`
- Warning: `#f59e0b`

---

## Files Modified vs Created

### New Files to Create
```
backend/
├── prompts.py                              (NEW)
└── data/prompts/
    ├── templates.json                      (NEW)
    └── history.json                        (NEW)

frontend/src/components/
├── PromptLibrary.jsx                       (NEW)
├── PromptLibrary.css                       (NEW)
├── PromptEditor.jsx                        (NEW)
├── PromptEditor.css                        (NEW)
├── PromptTemplateCard.jsx                  (NEW)
├── ComparisonViewer.jsx                    (NEW)
├── ComparisonViewer.css                    (NEW)
└── ResponsePane.jsx                        (NEW)

frontend/src/utils/
├── tokenCount.js                           (NEW)
└── promptParser.js                         (NEW)
```

### Files to Modify
```
backend/
├── main.py                                 (MODIFY - add prompt endpoints)
└── storage.py                              (MODIFY - add prompt helpers)

frontend/src/
├── App.jsx                                 (MODIFY - add Evals Library state)
├── api.js                                  (MODIFY - add prompt API calls)
└── components/
    ├── ChatInterface.jsx                   (MODIFY - add prompt selector)
    ├── Stage1.jsx                          (MODIFY - add view toggle)
    └── Stage1.css                          (MODIFY - add toggle styles)
```

---

## Dependencies to Install

```bash
cd frontend
npm install react-syntax-highlighter js-tiktoken react-textarea-autosize
```

**New NPM Packages**:
- `react-syntax-highlighter` v15.5.0+ - Syntax highlighting
- `js-tiktoken` v1.0.7+ - Token counting
- `react-textarea-autosize` - Auto-resizing textarea

**No new backend dependencies needed** - uses existing FastAPI and json libraries.

---

## Backward Compatibility

✅ **No breaking changes**:
- Existing conversations remain unchanged
- Model config unchanged
- All new features are additive
- Default UI behavior unchanged (grid view is default)
- Can ignore prompts entirely if desired

✅ **Future migration considerations**:
- Store which template was used with each conversation
- Allow replaying conversations with different templates
- A/B test different prompts on same conversation

---

## Critical Integration Points

### 1. **App.jsx State Management**
```jsx
const [showPromptLibrary, setShowPromptLibrary] = useState(false);
const [selectedTemplate, setSelectedTemplate] = useState(null);
const [recentTemplates, setRecentTemplates] = useState([]);

useEffect(() => {
  api.getRecentTemplates().then(setRecentTemplates);
}, []);
```

### 2. **API Calls in api.js**
```javascript
export const promptAPI = {
  getTemplates: () => fetch(`${API_BASE}/api/prompts/templates`),
  createTemplate: (t) => fetch(`${API_BASE}/api/prompts/templates`, {...}),
  getHistory: () => fetch(`${API_BASE}/api/prompts/history`),
  addHistory: (content, templateId) => fetch(`${API_BASE}/api/prompts/history`, {...}),
};
```

### 3. **Backend Prompt Injection**
In `council.py`, replace hardcoded prompts:
```python
# Instead of:
# stage1_prompt = "Some hardcoded text..."

# Use:
from prompts import PromptManager
template = PromptManager.get_template(template_id)
stage1_prompt = template['template']  # Fill with variables as needed
```

---

## Performance Considerations

1. **Token Counting**: Client-side only (no API calls)
2. **Scroll Sync**: Debounced to 50ms (smooth but not laggy)
3. **Syntax Highlighting**: Lazy-loaded only when viewing code
4. **Template Caching**: Cache in browser localStorage (optional future improvement)
5. **Search**: Client-side filtering (fast for <1000 templates)

---

## Known Limitations & Future Enhancements

### Limitations
- Token counting uses approximate formula for unknown models
- Comparison viewer only supports 2 models (could extend to 3+)
- No real-time collaboration on templates
- Templates not version controlled

### Future Enhancements
- **Prompt versioning**: Track changes, rollback to previous
- **A/B testing**: Compare which template performs better
- **Import/Export**: Share template packs
- **Batch execution**: Run same template with multiple inputs
- **Prompt analytics**: See which templates are most used
- **Collaborative editing**: Teams can create shared templates
- **3-way comparison**: Compare three models side-by-side
- **Diff view**: Highlight differences between responses
- **Annotations**: Comment on responses for collaboration

---

## Testing Strategy

### Unit Tests
- Token counting utility
- Variable parser
- Template validation

### Integration Tests
- Create/edit/delete template flows
- Prompt selection and usage
- Scroll sync behavior

### End-to-End Tests
- Create template → Use in chat → View results
- Compare two models in Stage 1
- All keyboard shortcuts

### Manual QA
- Browser compatibility (Chrome, Safari, Firefox, Edge)
- Mobile responsiveness (tablet and phone)
- Accessibility (keyboard navigation, screen readers)
- Performance (large responses, many templates)

---

## Development Notes

### Key Patterns to Reuse
1. **Modal Pattern**: From `ModelSelector.jsx`
2. **Grid Layout**: From `Stage1.jsx`
3. **API Client**: From `api.js` with error handling
4. **Textarea Shortcuts**: From `ChatInterface.jsx`
5. **Loading States**: Existing spinner components

### Avoid
- Over-engineering (simple features don't need complex state)
- Backwards-compatibility hacks
- Multiple API call round-trips where one would do
- Client-side database (localStorage is fine for recent 20)

### Best Practices
- Keep components focused and reusable
- Use React hooks (no class components)
- CSS variables for theming
- Error boundaries for graceful degradation
- Progressive enhancement (works without JS)

---

## Success Criteria

### Prompt Interface
- ✅ Users can browse templates organized by category
- ✅ Users can create custom templates with variables
- ✅ Templates auto-fill into chat input
- ✅ Recent prompts accessible from chat
- ✅ Prompt history tracked and accessible
- ✅ Token counting visible while editing

### Side-by-Side Viewer
- ✅ Users can switch between grid and comparison view
- ✅ Can select which two models to compare
- ✅ Scroll position synchronized between panes
- ✅ Code blocks syntax-highlighted
- ✅ Token counts visible for each response
- ✅ Works on mobile (stacks vertically)

---

## Timeline Estimate

| Phase | Estimate | Status |
|-------|----------|--------|
| Phase 1: Backend | 2-3h | Not started |
| Phase 2: Prompt Core | 4-5h | Not started |
| Phase 3: Prompt Editor | 3-4h | Not started |
| Phase 4: Prompt Integration | 2-3h | Not started |
| Phase 5: Viewer Core | 3-4h | Not started |
| Phase 6: Viewer Advanced | 4-5h | Not started |
| Phase 7: Polish | 2-3h | Not started |
| **TOTAL** | **20-27h** | **Ready to start** |

---

## Next Steps

1. ✅ Approved implementation plan
2. ⏳ Install NPM dependencies
3. ⏳ Create backend `prompts.py` module
4. ⏳ Implement backend API endpoints
5. ⏳ Build PromptLibrary component
6. ⏳ Build PromptEditor component
7. ⏳ Integrate with ChatInterface
8. ⏳ Build ComparisonViewer component
9. ⏳ Add scroll sync logic
10. ⏳ Polish and test

---

**Plan Created**: February 15, 2026
**Status**: ✅ Ready for implementation
**Scope**: Both features (Prompt Interface + Side-by-Side Viewer)
**User Approval**: ✅ Confirmed all design decisions
