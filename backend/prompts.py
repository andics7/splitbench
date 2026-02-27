"""Prompt template storage and management."""

import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
import uuid


PROMPTS_DIR = Path(__file__).parent.parent / "data" / "prompts"
TEMPLATES_FILE = PROMPTS_DIR / "templates.json"
HISTORY_FILE = PROMPTS_DIR / "history.json"
RUBRICS_FILE = PROMPTS_DIR / "rubrics.json"


def _ensure_dir():
    """Ensure the prompts data directory exists."""
    PROMPTS_DIR.mkdir(parents=True, exist_ok=True)


def _load_json(path: Path) -> dict:
    """Load JSON from file, return empty dict if missing."""
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return json.load(f)


def _save_json(path: Path, data: dict):
    """Save data as JSON to file."""
    _ensure_dir()
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# Built-in templates seeded on first run
# ---------------------------------------------------------------------------

BUILTIN_TEMPLATES = [
    # Creative Writing
    {
        "id": "builtin-creative-story",
        "name": "Story Outline Generator",
        "category": "creative-writing",
        "description": "Generate a structured story outline with acts and plot points",
        "template": "Create a {{length}} outline for a {{genre}} story about {{topic}}. Include act structure, key plot points, and character arcs.",
        "variables": [
            {"name": "length", "placeholder": "short / medium / long"},
            {"name": "genre", "placeholder": "e.g. sci-fi, fantasy, mystery"},
            {"name": "topic", "placeholder": "main story idea"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-creative-character",
        "name": "Character Development",
        "category": "creative-writing",
        "description": "Create a deep character profile with backstory and motivations",
        "template": "Develop a detailed character profile for a {{role}} in a {{genre}} setting. Include their backstory, personality traits, motivations, flaws, and how they change throughout the story.",
        "variables": [
            {"name": "role", "placeholder": "e.g. protagonist, antagonist, mentor"},
            {"name": "genre", "placeholder": "e.g. dystopian, romance, thriller"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-creative-dialogue",
        "name": "Dialogue Writer",
        "category": "creative-writing",
        "description": "Generate natural-sounding dialogue between characters",
        "template": "Write a dialogue scene between {{characters}} about {{situation}}. The tone should be {{tone}}. Make the dialogue feel natural, with distinct voices for each character.",
        "variables": [
            {"name": "characters", "placeholder": "e.g. a detective and a suspect"},
            {"name": "situation", "placeholder": "e.g. interrogation, first meeting"},
            {"name": "tone", "placeholder": "e.g. tense, humorous, emotional"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-creative-worldbuild",
        "name": "World Building",
        "category": "creative-writing",
        "description": "Build a detailed fictional world with cultures and rules",
        "template": "Design a {{type}} world set in {{era}}. Describe the geography, major cultures, political systems, technology/magic level, and key conflicts that drive the narrative.",
        "variables": [
            {"name": "type", "placeholder": "e.g. fantasy, post-apocalyptic, alien"},
            {"name": "era", "placeholder": "e.g. medieval, far future, bronze age"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    # Coding
    {
        "id": "builtin-coding-review",
        "name": "Code Review",
        "category": "coding",
        "description": "Get a structured code review with improvement suggestions",
        "template": "Review the following {{language}} code for:\n1. Correctness and bugs\n2. Performance issues\n3. Security vulnerabilities\n4. Code style and best practices\n5. Suggested improvements\n\n```{{language}}\n{{code}}\n```",
        "variables": [
            {"name": "language", "placeholder": "e.g. Python, JavaScript, Go"},
            {"name": "code", "placeholder": "paste your code here"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-coding-debug",
        "name": "Bug Fixing Assistant",
        "category": "coding",
        "description": "Debug code with systematic error analysis",
        "template": "I have a bug in my {{language}} code. The expected behavior is: {{expected}}. The actual behavior is: {{actual}}.\n\nHere is the code:\n```{{language}}\n{{code}}\n```\n\nPlease identify the root cause and suggest a fix.",
        "variables": [
            {"name": "language", "placeholder": "e.g. Python, TypeScript"},
            {"name": "expected", "placeholder": "what should happen"},
            {"name": "actual", "placeholder": "what actually happens"},
            {"name": "code", "placeholder": "paste your code here"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-coding-docs",
        "name": "Documentation Generator",
        "category": "coding",
        "description": "Generate comprehensive documentation for code",
        "template": "Generate {{style}} documentation for the following {{language}} code. Include function signatures, parameter descriptions, return values, and usage examples.\n\n```{{language}}\n{{code}}\n```",
        "variables": [
            {"name": "style", "placeholder": "e.g. JSDoc, docstring, README"},
            {"name": "language", "placeholder": "e.g. Python, JavaScript"},
            {"name": "code", "placeholder": "paste your code here"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-coding-refactor",
        "name": "Refactoring Suggestions",
        "category": "coding",
        "description": "Get refactoring recommendations with clean code principles",
        "template": "Refactor the following {{language}} code to improve {{focus}}. Explain each change and why it's an improvement.\n\n```{{language}}\n{{code}}\n```",
        "variables": [
            {"name": "language", "placeholder": "e.g. Python, Java"},
            {"name": "focus", "placeholder": "e.g. readability, performance, testability"},
            {"name": "code", "placeholder": "paste your code here"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    # Reasoning
    {
        "id": "builtin-reasoning-proscons",
        "name": "Pros & Cons Analysis",
        "category": "reasoning",
        "description": "Structured decision-making with weighted pros and cons",
        "template": "Analyze the pros and cons of {{decision}}. Consider these factors: {{factors}}. Provide a structured analysis with a final recommendation.",
        "variables": [
            {"name": "decision", "placeholder": "e.g. switching to TypeScript, remote work policy"},
            {"name": "factors", "placeholder": "e.g. cost, time, team skill, maintenance"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-reasoning-stepbystep",
        "name": "Step-by-Step Reasoning",
        "category": "reasoning",
        "description": "Break down complex problems into clear reasoning steps",
        "template": "Solve the following problem step by step, showing your reasoning at each stage:\n\n{{problem}}\n\nConstraints: {{constraints}}",
        "variables": [
            {"name": "problem", "placeholder": "describe the problem"},
            {"name": "constraints", "placeholder": "e.g. budget, time, resources (or 'none')"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-reasoning-devils",
        "name": "Devil's Advocate",
        "category": "reasoning",
        "description": "Challenge assumptions and find weaknesses in an argument",
        "template": "Play devil's advocate against the following position:\n\n\"{{position}}\"\n\nChallenge the key assumptions, find logical weaknesses, and present the strongest counter-arguments. Then respond to those counter-arguments.",
        "variables": [
            {"name": "position", "placeholder": "the argument or position to challenge"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-reasoning-compare",
        "name": "Comparative Analysis",
        "category": "reasoning",
        "description": "Compare multiple options across key dimensions",
        "template": "Compare {{options}} across these dimensions: {{dimensions}}. Create a structured comparison table and provide a recommendation based on {{priority}}.",
        "variables": [
            {"name": "options", "placeholder": "e.g. React vs Vue vs Svelte"},
            {"name": "dimensions", "placeholder": "e.g. performance, learning curve, ecosystem"},
            {"name": "priority", "placeholder": "what matters most to you"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    # Analysis
    {
        "id": "builtin-analysis-swot",
        "name": "SWOT Analysis",
        "category": "analysis",
        "description": "Structured strengths, weaknesses, opportunities, threats analysis",
        "template": "Perform a SWOT analysis for {{subject}} in the context of {{context}}. Provide actionable insights for each quadrant.",
        "variables": [
            {"name": "subject", "placeholder": "e.g. our startup, this product idea"},
            {"name": "context", "placeholder": "e.g. the AI market, enterprise SaaS"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-analysis-data",
        "name": "Data Interpretation",
        "category": "analysis",
        "description": "Analyze data patterns and derive insights",
        "template": "Analyze the following data and identify key patterns, trends, and anomalies:\n\n{{data}}\n\nContext: {{context}}\n\nProvide actionable insights and recommendations.",
        "variables": [
            {"name": "data", "placeholder": "paste your data or describe it"},
            {"name": "context", "placeholder": "what this data represents"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
    {
        "id": "builtin-analysis-rootcause",
        "name": "Root Cause Analysis",
        "category": "analysis",
        "description": "Systematic investigation to find the root cause of a problem",
        "template": "Perform a root cause analysis for the following issue:\n\nProblem: {{problem}}\nSymptoms: {{symptoms}}\nContext: {{context}}\n\nUse the 5 Whys technique and fishbone diagram approach. Suggest preventive measures.",
        "variables": [
            {"name": "problem", "placeholder": "describe the problem"},
            {"name": "symptoms", "placeholder": "observable effects"},
            {"name": "context", "placeholder": "when/where it occurs"},
        ],
        "usage_count": 0,
        "is_builtin": True,
    },
]

CATEGORIES = [
    {"id": "creative-writing", "label": "Creative Writing", "icon": "pencil"},
    {"id": "coding", "label": "Coding", "icon": "code"},
    {"id": "reasoning", "label": "Reasoning", "icon": "brain"},
    {"id": "analysis", "label": "Analysis", "icon": "chart"},
    {"id": "custom", "label": "Custom", "icon": "star"},
]


# ---------------------------------------------------------------------------
# Template CRUD
# ---------------------------------------------------------------------------

def init():
    """Initialize prompts storage. Seed built-ins if needed."""
    _ensure_dir()
    if not TEMPLATES_FILE.exists():
        now = datetime.utcnow().isoformat()
        templates = []
        for t in BUILTIN_TEMPLATES:
            t = {**t, "created_at": now, "updated_at": now}
            templates.append(t)
        _save_json(TEMPLATES_FILE, {"templates": templates})
    if not HISTORY_FILE.exists():
        _save_json(HISTORY_FILE, {"history": []})


def get_all_templates() -> List[Dict[str, Any]]:
    """Return all templates."""
    _ensure_initialized()
    data = _load_json(TEMPLATES_FILE)
    return data.get("templates", [])


def get_template(template_id: str) -> Optional[Dict[str, Any]]:
    """Return a single template by ID."""
    for t in get_all_templates():
        if t["id"] == template_id:
            return t
    return None


def save_template(template: Dict[str, Any]) -> Dict[str, Any]:
    """Create or update a template. Returns the saved template."""
    now = datetime.utcnow().isoformat()
    templates = get_all_templates()

    if "id" not in template or not template["id"]:
        template["id"] = str(uuid.uuid4())
        template["created_at"] = now
        template["usage_count"] = 0
        template["is_builtin"] = False

    template["updated_at"] = now

    # Update existing or append
    idx = next((i for i, t in enumerate(templates) if t["id"] == template["id"]), -1)
    if idx >= 0:
        # Preserve created_at and is_builtin from existing
        template["created_at"] = templates[idx].get("created_at", now)
        template["is_builtin"] = templates[idx].get("is_builtin", False)
        templates[idx] = template
    else:
        templates.append(template)

    _save_json(TEMPLATES_FILE, {"templates": templates})
    return template


def delete_template(template_id: str) -> bool:
    """Delete a user-created template. Returns False if builtin or not found."""
    templates = get_all_templates()
    target = next((t for t in templates if t["id"] == template_id), None)
    if not target or target.get("is_builtin"):
        return False
    templates = [t for t in templates if t["id"] != template_id]
    _save_json(TEMPLATES_FILE, {"templates": templates})
    return True


def increment_usage(template_id: str):
    """Increment usage count for a template."""
    templates = get_all_templates()
    for t in templates:
        if t["id"] == template_id:
            t["usage_count"] = t.get("usage_count", 0) + 1
            break
    _save_json(TEMPLATES_FILE, {"templates": templates})


# ---------------------------------------------------------------------------
# Prompt history
# ---------------------------------------------------------------------------

MAX_HISTORY = 100


def get_history(limit: int = 20) -> List[Dict[str, Any]]:
    """Return recent prompt history, newest first."""
    _ensure_initialized()
    data = _load_json(HISTORY_FILE)
    history = data.get("history", [])
    return history[:limit]


def add_to_history(
    content: str,
    template_id: Optional[str] = None,
    attachments: Optional[List[Dict[str, Any]]] = None,
):
    """Add a prompt to history."""
    data = _load_json(HISTORY_FILE)
    history = data.get("history", [])

    item = {
        "id": str(uuid.uuid4()),
        "content": content,
        "template_id": template_id,
        "attachments": attachments or [],
        "created_at": datetime.utcnow().isoformat(),
    }

    history = [item] + history[:MAX_HISTORY - 1]
    _save_json(HISTORY_FILE, {"history": history})
    return item


def delete_history_item(item_id: str) -> bool:
    """Remove a single history item."""
    data = _load_json(HISTORY_FILE)
    history = data.get("history", [])
    new_history = [h for h in history if h["id"] != item_id]
    if len(new_history) == len(history):
        return False
    _save_json(HISTORY_FILE, {"history": new_history})
    return True


def clear_history():
    """Clear all prompt history."""
    _save_json(HISTORY_FILE, {"history": []})


# ---------------------------------------------------------------------------
# Evaluation rubrics
# ---------------------------------------------------------------------------


def _ensure_rubrics_file():
    """Ensure rubrics.json exists."""
    _ensure_dir()
    if not RUBRICS_FILE.exists():
        _save_json(RUBRICS_FILE, {"rubrics": []})


def get_all_rubrics() -> List[Dict[str, Any]]:
    """Return all saved rubrics."""
    _ensure_rubrics_file()
    data = _load_json(RUBRICS_FILE)
    return data.get("rubrics", [])


def get_rubric(rubric_id: str) -> Optional[Dict[str, Any]]:
    """Return a single rubric by ID."""
    for r in get_all_rubrics():
        if r["id"] == rubric_id:
            return r
    return None


def save_rubric(rubric: Dict[str, Any]) -> Dict[str, Any]:
    """Create or update a rubric. Returns the saved rubric."""
    now = datetime.utcnow().isoformat()
    rubrics = get_all_rubrics()

    if "id" not in rubric or not rubric["id"]:
        rubric["id"] = str(uuid.uuid4())
        rubric["created_at"] = now

    rubric["updated_at"] = now

    idx = next((i for i, r in enumerate(rubrics) if r["id"] == rubric["id"]), -1)
    if idx >= 0:
        rubric["created_at"] = rubrics[idx].get("created_at", now)
        rubrics[idx] = rubric
    else:
        rubrics.append(rubric)

    _save_json(RUBRICS_FILE, {"rubrics": rubrics})
    return rubric


def delete_rubric(rubric_id: str) -> bool:
    """Delete a rubric. Returns False if not found."""
    rubrics = get_all_rubrics()
    new_rubrics = [r for r in rubrics if r["id"] != rubric_id]
    if len(new_rubrics) == len(rubrics):
        return False
    _save_json(RUBRICS_FILE, {"rubrics": new_rubrics})
    return True


def get_categories() -> List[Dict[str, str]]:
    """Return available template categories."""
    return CATEGORIES


_initialized = False


def _ensure_initialized():
    """Lazily initialize on first access."""
    global _initialized
    if not _initialized:
        init()
        _initialized = True
