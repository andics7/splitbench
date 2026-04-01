"""One-time migration: move existing single-user data into an owner profile."""

import asyncio
import json
import os
import shutil
from pathlib import Path

from .config import OPENROUTER_API_KEY, OPENROUTER_MGMT_KEY
from .profiles import (
    PROFILES_FILE,
    ensure_profile_dirs,
    get_owner_profile,
    get_profile_data_dir,
)


def _already_migrated() -> bool:
    """Check if migration has already been performed."""
    return PROFILES_FILE.exists()


def _move_if_exists(src: str, dst: str):
    """Move a file or directory if the source exists and destination does not."""
    if os.path.exists(src) and not os.path.exists(dst):
        Path(os.path.dirname(dst)).mkdir(parents=True, exist_ok=True)
        shutil.move(src, dst)


async def migrate_if_needed():
    """Run migration if not already done. Idempotent and safe to call on every startup."""
    if _already_migrated():
        return

    print("[migrate] Starting one-time migration to multi-user profile system...")

    project_root = Path(__file__).parent.parent
    old_conversations_dir = project_root / "data" / "conversations"
    old_analytics_file = project_root / "data" / "analytics.json"
    old_model_config_file = project_root / "data" / "model_config.json"
    old_prompts_dir = project_root / "data" / "prompts"

    # Create owner profile
    from .profiles import create_profile
    owner_profile = await create_profile(
        name="Owner",
        api_key=OPENROUTER_API_KEY or "",
        mgmt_key=OPENROUTER_MGMT_KEY,
        is_owner=True,
    )
    owner_id = owner_profile["id"]
    print(f"[migrate] Created owner profile: {owner_id}")

    profile_dir = get_profile_data_dir(owner_id)
    ensure_profile_dirs(owner_id)

    # Move conversations
    if old_conversations_dir.exists():
        dst_conversations = profile_dir / "conversations"
        for filename in os.listdir(old_conversations_dir):
            if filename.endswith(".json"):
                src = old_conversations_dir / filename
                dst = dst_conversations / filename
                _move_if_exists(str(src), str(dst))
        # Remove empty old directory
        try:
            old_conversations_dir.rmdir()
        except OSError:
            pass  # Not empty or doesn't exist
        print(f"[migrate] Moved conversations to profile directory")

    # Move analytics
    _move_if_exists(
        str(old_analytics_file),
        str(profile_dir / "analytics.json"),
    )
    print(f"[migrate] Moved analytics to profile directory")

    # Move model config
    _move_if_exists(
        str(old_model_config_file),
        str(profile_dir / "model_config.json"),
    )
    print(f"[migrate] Moved model config to profile directory")

    # Move prompts
    if old_prompts_dir.exists():
        dst_prompts = profile_dir / "prompts"
        for filename in os.listdir(old_prompts_dir):
            src = old_prompts_dir / filename
            dst = dst_prompts / filename
            _move_if_exists(str(src), str(dst))
        try:
            old_prompts_dir.rmdir()
        except OSError:
            pass
        print(f"[migrate] Moved prompts to profile directory")

    print("[migrate] Migration complete.")
