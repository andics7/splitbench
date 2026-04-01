"""FastAPI dependency for profile-based authentication."""

from fastapi import Request, HTTPException
from typing import Any, Dict

from . import profiles


def get_current_profile(request: Request) -> Dict[str, Any]:
    """Extract and validate X-Profile-Id header. Returns full profile (internal use).

    Raises HTTPException 401 if header missing or profile not found.
    """
    profile_id = request.headers.get("X-Profile-Id")
    if not profile_id:
        raise HTTPException(status_code=401, detail="X-Profile-Id header required")
    profile = profiles.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=401, detail="Profile not found")
    return profile
