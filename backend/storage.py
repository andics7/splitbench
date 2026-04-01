"""JSON-based storage for conversations, scoped per profile."""

import asyncio
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path

from .profiles import get_profile_data_dir

# Per-conversation locks to prevent concurrent write corruption
_locks: dict[str, asyncio.Lock] = {}


def _get_lock(profile_id: str, conversation_id: str) -> asyncio.Lock:
    """Get or create an asyncio lock for a profile+conversation pair."""
    key = f"{profile_id}:{conversation_id}"
    if key not in _locks:
        _locks[key] = asyncio.Lock()
    return _locks[key]


def _conversations_dir(profile_id: str) -> Path:
    """Get the conversations directory for a profile."""
    return get_profile_data_dir(profile_id) / "conversations"


def ensure_data_dir(profile_id: str):
    """Ensure the conversations directory exists for a profile."""
    _conversations_dir(profile_id).mkdir(parents=True, exist_ok=True)


def get_conversation_path(profile_id: str, conversation_id: str) -> str:
    """Get the file path for a conversation."""
    return str(_conversations_dir(profile_id) / f"{conversation_id}.json")


def create_conversation(profile_id: str, conversation_id: str) -> Dict[str, Any]:
    """Create a new conversation."""
    ensure_data_dir(profile_id)

    conversation = {
        "id": conversation_id,
        "created_at": datetime.utcnow().isoformat(),
        "title": "New Conversation",
        "messages": []
    }

    path = get_conversation_path(profile_id, conversation_id)
    with open(path, 'w') as f:
        json.dump(conversation, f, indent=2)

    return conversation


def get_conversation(profile_id: str, conversation_id: str) -> Optional[Dict[str, Any]]:
    """Load a conversation from storage."""
    path = get_conversation_path(profile_id, conversation_id)

    if not os.path.exists(path):
        return None

    with open(path, 'r') as f:
        return json.load(f)


def save_conversation(profile_id: str, conversation: Dict[str, Any]):
    """Save a conversation to storage."""
    ensure_data_dir(profile_id)

    path = get_conversation_path(profile_id, conversation['id'])
    with open(path, 'w') as f:
        json.dump(conversation, f, indent=2)


def list_conversations(profile_id: str) -> List[Dict[str, Any]]:
    """List all conversations for a profile (metadata only)."""
    ensure_data_dir(profile_id)

    conv_dir = str(_conversations_dir(profile_id))
    conversations = []
    for filename in os.listdir(conv_dir):
        if filename.endswith('.json'):
            path = os.path.join(conv_dir, filename)
            with open(path, 'r') as f:
                data = json.load(f)
                conversations.append({
                    "id": data["id"],
                    "created_at": data["created_at"],
                    "title": data.get("title", "New Conversation"),
                    "message_count": len(data["messages"])
                })

    conversations.sort(key=lambda x: x["created_at"], reverse=True)
    return conversations


async def add_user_message(
    profile_id: str,
    conversation_id: str,
    content: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
):
    """Add a user message to a conversation."""
    async with _get_lock(profile_id, conversation_id):
        conversation = get_conversation(profile_id, conversation_id)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        conversation["messages"].append({
            "role": "user",
            "content": content,
            "attachments": attachments or [],
        })

        save_conversation(profile_id, conversation)


async def add_assistant_message(
    profile_id: str,
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
):
    """Add an assistant message with all 3 stages to a conversation."""
    async with _get_lock(profile_id, conversation_id):
        conversation = get_conversation(profile_id, conversation_id)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        conversation["messages"].append({
            "role": "assistant",
            "stage1": stage1,
            "stage2": stage2,
            "stage3": stage3,
            "metadata": metadata or {},
        })

        save_conversation(profile_id, conversation)


async def update_conversation_title(profile_id: str, conversation_id: str, title: str):
    """Update the title of a conversation."""
    async with _get_lock(profile_id, conversation_id):
        conversation = get_conversation(profile_id, conversation_id)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        conversation["title"] = title
        save_conversation(profile_id, conversation)


def delete_conversation(profile_id: str, conversation_id: str):
    """Delete a conversation."""
    path = get_conversation_path(profile_id, conversation_id)

    if not os.path.exists(path):
        raise ValueError(f"Conversation {conversation_id} not found")

    os.remove(path)


async def clear_conversation_messages(profile_id: str, conversation_id: str):
    """Clear all messages from a conversation, keeping metadata intact."""
    async with _get_lock(profile_id, conversation_id):
        conversation = get_conversation(profile_id, conversation_id)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        conversation["messages"] = []
        save_conversation(profile_id, conversation)
