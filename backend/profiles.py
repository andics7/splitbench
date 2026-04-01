"""User profile management for multi-user BYOK support."""

import asyncio
import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


PROFILES_FILE = Path(__file__).parent.parent / "data" / "profiles.json"

_lock = asyncio.Lock()


def _ensure_file():
    """Ensure profiles.json and parent directory exist."""
    PROFILES_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not PROFILES_FILE.exists():
        with open(PROFILES_FILE, "w") as f:
            json.dump({"profiles": []}, f, indent=2)


def _load_profiles() -> List[Dict[str, Any]]:
    """Load all profiles from disk."""
    _ensure_file()
    with open(PROFILES_FILE, "r") as f:
        data = json.load(f)
    return data.get("profiles", [])


def _save_profiles(profiles: List[Dict[str, Any]]):
    """Save all profiles to disk."""
    _ensure_file()
    with open(PROFILES_FILE, "w") as f:
        json.dump({"profiles": profiles}, f, indent=2)


def _hash_pin(pin: str, salt: Optional[str] = None) -> Dict[str, str]:
    """Hash a PIN with a random salt. Returns {"hash": ..., "salt": ...}."""
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()
    return {"hash": hashed, "salt": salt}


def _verify_pin(pin: str, pin_hash: str, pin_salt: str) -> bool:
    """Verify a PIN against its stored hash and salt."""
    computed = hashlib.sha256(f"{pin_salt}:{pin}".encode()).hexdigest()
    return secrets.compare_digest(computed, pin_hash)


def _mask_key(key: Optional[str]) -> Optional[str]:
    """Mask an API key for display: sk-or-v1-****{last4}."""
    if not key:
        return None
    if len(key) <= 8:
        return "****"
    return key[:8] + "****" + key[-4:]


def _profile_data_dir(profile_id: str) -> Path:
    """Return the data directory for a profile."""
    return Path(__file__).parent.parent / "data" / "profiles" / profile_id


def ensure_profile_dirs(profile_id: str):
    """Create the data directory structure for a profile."""
    base = _profile_data_dir(profile_id)
    (base / "conversations").mkdir(parents=True, exist_ok=True)
    (base / "prompts").mkdir(parents=True, exist_ok=True)


def get_profile_data_dir(profile_id: str) -> Path:
    """Public accessor for profile data directory."""
    return _profile_data_dir(profile_id)


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------


def list_profiles() -> List[Dict[str, Any]]:
    """List all profiles with masked keys (safe for API responses)."""
    profiles = _load_profiles()
    result = []
    for p in profiles:
        result.append({
            "id": p["id"],
            "name": p["name"],
            "is_owner": p.get("is_owner", False),
            "has_pin": bool(p.get("pin_hash")),
            "created_at": p["created_at"],
            "openrouter_api_key": _mask_key(p.get("openrouter_api_key")),
            "has_mgmt_key": bool(p.get("openrouter_mgmt_key")),
        })
    return result


def get_profile(profile_id: str) -> Optional[Dict[str, Any]]:
    """Get a profile by ID. Returns full profile including keys (internal use)."""
    profiles = _load_profiles()
    for p in profiles:
        if p["id"] == profile_id:
            return p
    return None


def get_profile_safe(profile_id: str) -> Optional[Dict[str, Any]]:
    """Get a profile by ID with masked keys (safe for API responses)."""
    profile = get_profile(profile_id)
    if profile is None:
        return None
    return {
        "id": profile["id"],
        "name": profile["name"],
        "is_owner": profile.get("is_owner", False),
        "has_pin": bool(profile.get("pin_hash")),
        "created_at": profile["created_at"],
        "openrouter_api_key": _mask_key(profile.get("openrouter_api_key")),
        "has_mgmt_key": bool(profile.get("openrouter_mgmt_key")),
    }


async def create_profile(
    name: str,
    api_key: str,
    mgmt_key: Optional[str] = None,
    is_owner: bool = False,
) -> Dict[str, Any]:
    """Create a new profile. Returns the saved profile (with masked key)."""
    async with _lock:
        profiles = _load_profiles()
        profile = {
            "id": str(uuid.uuid4()),
            "name": name,
            "is_owner": is_owner,
            "openrouter_api_key": api_key,
            "openrouter_mgmt_key": mgmt_key,
            "pin_hash": None,
            "pin_salt": None,
            "created_at": datetime.utcnow().isoformat(),
        }
        profiles.append(profile)
        _save_profiles(profiles)
        ensure_profile_dirs(profile["id"])
        return get_profile_safe(profile["id"])


async def update_profile(profile_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a profile's name and/or API keys. Returns updated profile (masked)."""
    async with _lock:
        profiles = _load_profiles()
        for p in profiles:
            if p["id"] == profile_id:
                if "name" in updates:
                    p["name"] = updates["name"]
                if "openrouter_api_key" in updates:
                    p["openrouter_api_key"] = updates["openrouter_api_key"]
                if "openrouter_mgmt_key" in updates:
                    p["openrouter_mgmt_key"] = updates["openrouter_mgmt_key"]
                _save_profiles(profiles)
                return get_profile_safe(profile_id)
        return None


async def delete_profile(profile_id: str) -> bool:
    """Delete a profile. Owner profiles cannot be deleted. Returns success."""
    async with _lock:
        profiles = _load_profiles()
        target = next((p for p in profiles if p["id"] == profile_id), None)
        if target is None:
            return False
        if target.get("is_owner"):
            return False
        profiles = [p for p in profiles if p["id"] != profile_id]
        _save_profiles(profiles)
        return True


def get_owner_profile() -> Optional[Dict[str, Any]]:
    """Get the owner profile (full, internal use)."""
    profiles = _load_profiles()
    for p in profiles:
        if p.get("is_owner"):
            return p
    return None


async def ensure_owner_profile(api_key: str, mgmt_key: Optional[str] = None) -> Dict[str, Any]:
    """Create the owner profile if it doesn't exist. Uses keys from .env."""
    owner = get_owner_profile()
    if owner:
        return get_profile_safe(owner["id"])
    return await create_profile(
        name="Owner",
        api_key=api_key,
        mgmt_key=mgmt_key,
        is_owner=True,
    )


# ---------------------------------------------------------------------------
# PIN management
# ---------------------------------------------------------------------------


async def set_pin(profile_id: str, pin: str) -> bool:
    """Set or update PIN for a profile (typically owner only)."""
    if not pin or len(pin) < 4 or len(pin) > 6 or not pin.isdigit():
        return False
    async with _lock:
        profiles = _load_profiles()
        for p in profiles:
            if p["id"] == profile_id:
                pin_data = _hash_pin(pin)
                p["pin_hash"] = pin_data["hash"]
                p["pin_salt"] = pin_data["salt"]
                _save_profiles(profiles)
                return True
        return False


def verify_pin(profile_id: str, pin: str) -> bool:
    """Verify a PIN for a profile. Returns True if correct or profile has no PIN."""
    profile = get_profile(profile_id)
    if profile is None:
        return False
    if not profile.get("pin_hash"):
        return True  # No PIN set
    return _verify_pin(pin, profile["pin_hash"], profile["pin_salt"])
