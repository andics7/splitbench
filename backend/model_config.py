"""Dynamic model configuration with JSON persistence, scoped per profile."""

import json
import os
from pathlib import Path

from .profiles import get_profile_data_dir

_default_config = {
    "council_models": [
        "tngtech/deepseek-r1t2-chimera:free",
        "x-ai/grok-4.1-fast:free",
    ],
    "chairman_model": "openrouter/aurora-alpha"
}

# Per-profile cache: profile_id -> (config, mtime)
_profile_configs: dict[str, dict] = {}
_profile_config_mtimes: dict[str, float] = {}


def _config_path(profile_id: str) -> str:
    return str(get_profile_data_dir(profile_id) / "model_config.json")


def load_config(profile_id: str) -> dict:
    """Load model config from disk, or return defaults. Re-reads if file changed."""
    path = _config_path(profile_id)

    if os.path.exists(path):
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            mtime = 0.0

        if profile_id in _profile_configs and mtime == _profile_config_mtimes.get(profile_id):
            return _profile_configs[profile_id]

        try:
            with open(path, 'r') as f:
                _profile_configs[profile_id] = json.load(f)
            _profile_config_mtimes[profile_id] = mtime
        except (json.JSONDecodeError, IOError):
            _profile_configs[profile_id] = _default_config.copy()
    else:
        _profile_configs[profile_id] = _default_config.copy()
        save_config(profile_id, _profile_configs[profile_id])
    return _profile_configs[profile_id]


def save_config(profile_id: str, config: dict):
    """Persist model config to disk."""
    path = _config_path(profile_id)
    Path(os.path.dirname(path)).mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(config, f, indent=2)
    _profile_configs[profile_id] = config
    try:
        _profile_config_mtimes[profile_id] = os.path.getmtime(path)
    except OSError:
        _profile_config_mtimes[profile_id] = 0.0


def get_council_models(profile_id: str) -> list:
    """Get current council model IDs."""
    return load_config(profile_id)["council_models"]


def get_chairman_model(profile_id: str) -> str:
    """Get current chairman model ID."""
    return load_config(profile_id)["chairman_model"]
