"""OpenRouter API client for making LLM requests."""

import asyncio
import time
from typing import Any, Dict, List, Optional

import httpx

from .config import OPENROUTER_API_URL

# Shared HTTP client (created lazily, closed on shutdown)
_client: Optional[httpx.AsyncClient] = None

# Cache for available models list (shared across profiles — model list is the same)
_models_cache = {"data": None, "fetched_at": 0}
_MODELS_CACHE_TTL = 3600  # 1 hour


async def get_client() -> httpx.AsyncClient:
    """Get or create the shared async HTTP client."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=120.0)
    return _client


async def close_client():
    """Close the shared HTTP client. Call on application shutdown."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.close()
        _client = None


async def query_model(
    model: str,
    messages: List[Dict[str, Any]],
    api_key: str,
    timeout: float = 120.0,
    extra_body: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via OpenRouter API.

    Args:
        model: OpenRouter model identifier (e.g., "openai/gpt-4o")
        messages: List of message dicts with 'role' and 'content'
        api_key: OpenRouter API key for this request
        timeout: Request timeout in seconds
        extra_body: Optional additional request fields merged into payload

    Returns:
        Response dict with 'content' and optional 'reasoning_details', or None if failed
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
    }
    if extra_body:
        payload.update(extra_body)

    try:
        client = await get_client()
        response = await client.post(
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()

        data = response.json()
        choice = data["choices"][0]

        if "error" in choice and choice["error"]:
            error_msg = choice["error"].get("message", "Unknown error")
            raise Exception(f"Model API error: {error_msg}")

        message = choice["message"]
        return {
            "content": message.get("content"),
            "reasoning_details": message.get("reasoning_details"),
            "usage": data.get("usage", {}),
        }

    except httpx.HTTPStatusError as e:
        print(f"Error querying model {model}: HTTP {e.response.status_code}")
        print(f"Response body: {e.response.text}")
        return None
    except Exception as e:
        print(f"Error querying model {model}: {e}")
        if "response" in locals():
            print(f"Response status: {response.status_code}")
            print(f"Response body: {response.text}")
        return None


async def get_account_balance(
    api_key: str,
    mgmt_key: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Fetch account balance and spending info from OpenRouter."""
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        client = await get_client()
        response = await client.get("https://openrouter.ai/api/v1/key", headers=headers, timeout=15.0)
        response.raise_for_status()
        result = response.json().get("data", {})
        result.pop("label", None)

        if mgmt_key:
            try:
                credits_resp = await client.get(
                    "https://openrouter.ai/api/v1/credits",
                    headers={"Authorization": f"Bearer {mgmt_key}"},
                    timeout=15.0,
                )
                credits_resp.raise_for_status()
                credits_data = credits_resp.json().get("data", {})
                result["total_credits"] = credits_data.get("total_credits")
                result["total_usage"] = credits_data.get("total_usage")
            except Exception as e:
                print(f"Error fetching credits (management key may be invalid): {e}")

        return result
    except Exception as e:
        print(f"Error fetching account balance: {e}")
        return None


async def validate_api_key(api_key: str) -> bool:
    """Check if an OpenRouter API key is valid by calling the key info endpoint."""
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        client = await get_client()
        response = await client.get("https://openrouter.ai/api/v1/key", headers=headers, timeout=15.0)
        return response.status_code == 200
    except Exception:
        return False


def enrich_model(model: dict) -> dict:
    """Add structured capability flags to a raw OpenRouter model object."""
    architecture = model.get("architecture") or {}
    supported_params = model.get("supported_parameters") or []
    top_provider = model.get("top_provider") or {}
    input_modalities = architecture.get("input_modalities") or []

    model["supports_vision"] = "image" in input_modalities
    model["supports_tools"] = "tools" in supported_params
    model["supports_reasoning"] = "reasoning" in supported_params
    model["modality"] = architecture.get("modality", "")
    model["max_completion_tokens"] = top_provider.get("max_completion_tokens")
    return model


async def fetch_available_models(api_key: str) -> list:
    """Fetch available models from OpenRouter, with 1-hour cache."""
    now = time.time()
    if _models_cache["data"] and (now - _models_cache["fetched_at"]) < _MODELS_CACHE_TTL:
        return _models_cache["data"]

    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        client = await get_client()
        response = await client.get("https://openrouter.ai/api/v1/models", headers=headers, timeout=30.0)
        response.raise_for_status()
        raw_models = response.json().get("data", [])

        models = [enrich_model(m) for m in raw_models]
        _models_cache["data"] = models
        _models_cache["fetched_at"] = now
        return models
    except Exception as e:
        print(f"Error fetching models list: {e}")
        if _models_cache["data"]:
            return _models_cache["data"]
        return []


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, Any]],
    api_key: str,
    timeout: float = 120.0,
    extra_body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Optional[Dict[str, Any]]]:
    """Query multiple models in parallel."""
    tasks = [
        query_model(model, messages, api_key=api_key, timeout=timeout, extra_body=extra_body)
        for model in models
    ]

    responses = await asyncio.gather(*tasks)
    return {model: response for model, response in zip(models, responses)}
