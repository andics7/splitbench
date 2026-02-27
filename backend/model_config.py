"""Dynamic model configuration with JSON persistence."""

import json
import os
from pathlib import Path

CONFIG_PATH = "data/model_config.json"

_default_config = {
    "council_models": [
        "tngtech/deepseek-r1t2-chimera:free",
        "x-ai/grok-4.1-fast:free",
    ],
    "chairman_model": "openrouter/aurora-alpha"
}

_current_config = None
_config_mtime = 0.0


def load_config() -> dict:
    """Load model config from disk, or return defaults. Re-reads if file changed."""
    global _current_config, _config_mtime

    if os.path.exists(CONFIG_PATH):
        try:
            mtime = os.path.getmtime(CONFIG_PATH)
        except OSError:
            mtime = 0.0

        if _current_config is not None and mtime == _config_mtime:
            return _current_config

        try:
            with open(CONFIG_PATH, 'r') as f:
                _current_config = json.load(f)
            _config_mtime = mtime
        except (json.JSONDecodeError, IOError):
            _current_config = _default_config.copy()
    else:
        _current_config = _default_config.copy()
        save_config(_current_config)
    return _current_config


def save_config(config: dict):
    """Persist model config to disk."""
    global _current_config, _config_mtime
    Path(os.path.dirname(CONFIG_PATH)).mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=2)
    _current_config = config
    try:
        _config_mtime = os.path.getmtime(CONFIG_PATH)
    except OSError:
        _config_mtime = 0.0


def get_council_models() -> list:
    """Get current council model IDs."""
    return load_config()["council_models"]


def get_chairman_model() -> str:
    """Get current chairman model ID."""
    return load_config()["chairman_model"]
