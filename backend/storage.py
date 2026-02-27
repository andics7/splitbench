"""JSON-based storage for conversations."""

import asyncio
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
from .config import DATA_DIR

# Per-conversation locks to prevent concurrent write corruption
_locks: dict[str, asyncio.Lock] = {}


def _get_lock(conversation_id: str) -> asyncio.Lock:
    """Get or create an asyncio lock for a conversation."""
    if conversation_id not in _locks:
        _locks[conversation_id] = asyncio.Lock()
    return _locks[conversation_id]


def ensure_data_dir():
    """Ensure the data directory exists."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def get_conversation_path(conversation_id: str) -> str:
    """Get the file path for a conversation."""
    return os.path.join(DATA_DIR, f"{conversation_id}.json")


def create_conversation(conversation_id: str) -> Dict[str, Any]:
    """
    Create a new conversation.

    Args:
        conversation_id: Unique identifier for the conversation

    Returns:
        New conversation dict
    """
    ensure_data_dir()

    conversation = {
        "id": conversation_id,
        "created_at": datetime.utcnow().isoformat(),
        "title": "New Conversation",
        "messages": []
    }

    # Save to file
    path = get_conversation_path(conversation_id)
    with open(path, 'w') as f:
        json.dump(conversation, f, indent=2)

    return conversation


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """
    Load a conversation from storage.

    Args:
        conversation_id: Unique identifier for the conversation

    Returns:
        Conversation dict or None if not found
    """
    path = get_conversation_path(conversation_id)

    if not os.path.exists(path):
        return None

    with open(path, 'r') as f:
        return json.load(f)


def save_conversation(conversation: Dict[str, Any]):
    """
    Save a conversation to storage.

    Args:
        conversation: Conversation dict to save
    """
    ensure_data_dir()

    path = get_conversation_path(conversation['id'])
    with open(path, 'w') as f:
        json.dump(conversation, f, indent=2)


def list_conversations() -> List[Dict[str, Any]]:
    """
    List all conversations (metadata only).

    Returns:
        List of conversation metadata dicts
    """
    ensure_data_dir()

    conversations = []
    for filename in os.listdir(DATA_DIR):
        if filename.endswith('.json'):
            path = os.path.join(DATA_DIR, filename)
            with open(path, 'r') as f:
                data = json.load(f)
                # Return metadata only
                conversations.append({
                    "id": data["id"],
                    "created_at": data["created_at"],
                    "title": data.get("title", "New Conversation"),
                    "message_count": len(data["messages"])
                })

    # Sort by creation time, newest first
    conversations.sort(key=lambda x: x["created_at"], reverse=True)

    return conversations


async def add_user_message(
    conversation_id: str,
    content: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
):
    """
    Add a user message to a conversation.

    Args:
        conversation_id: Conversation identifier
        content: User message content
        attachments: Optional attachment metadata
    """
    async with _get_lock(conversation_id):
        conversation = get_conversation(conversation_id)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        conversation["messages"].append({
            "role": "user",
            "content": content,
            "attachments": attachments or [],
        })

        save_conversation(conversation)


async def add_assistant_message(
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
):
    """
    Add an assistant message with all 3 stages to a conversation.

    Args:
        conversation_id: Conversation identifier
        stage1: List of individual model responses
        stage2: List of model rankings
        stage3: Final synthesized response
        metadata: Additional metadata for rankings and usage
    """
    async with _get_lock(conversation_id):
        conversation = get_conversation(conversation_id)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        conversation["messages"].append({
            "role": "assistant",
            "stage1": stage1,
            "stage2": stage2,
            "stage3": stage3,
            "metadata": metadata or {},
        })

        save_conversation(conversation)


async def update_conversation_title(conversation_id: str, title: str):
    """
    Update the title of a conversation.

    Args:
        conversation_id: Conversation identifier
        title: New title for the conversation
    """
    async with _get_lock(conversation_id):
        conversation = get_conversation(conversation_id)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        conversation["title"] = title
        save_conversation(conversation)


def delete_conversation(conversation_id: str):
    """
    Delete a conversation.

    Args:
        conversation_id: Conversation identifier to delete
    """
    path = get_conversation_path(conversation_id)

    if not os.path.exists(path):
        raise ValueError(f"Conversation {conversation_id} not found")

    os.remove(path)


async def clear_conversation_messages(conversation_id: str):
    """
    Clear all messages from a conversation, keeping metadata intact.
    Used when user wants to edit the first message and start fresh.

    Args:
        conversation_id: Conversation identifier
    """
    async with _get_lock(conversation_id):
        conversation = get_conversation(conversation_id)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        conversation["messages"] = []
        save_conversation(conversation)
