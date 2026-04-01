"""FastAPI backend for LLM Council with multi-user profile support."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import uuid
import json
import asyncio
import logging

logger = logging.getLogger(__name__)

from . import storage
from .council import (
    generate_conversation_title,
    stage1_collect_responses,
    stage2_collect_rankings,
    stage3_synthesize_final,
    calculate_aggregate_rankings,
    calculate_stage2_insights,
    get_best_response,
)
from .openrouter import (
    get_account_balance,
    fetch_available_models,
    close_client,
    validate_api_key,
)
from . import model_config
from . import prompts
from . import analytics
from . import profiles as profiles_mod
from .auth import get_current_profile
from .migrate_to_profiles import migrate_if_needed


@asynccontextmanager
async def lifespan(app):
    """Startup and shutdown lifecycle for the FastAPI app."""
    await migrate_if_needed()
    yield
    await close_client()


app = FastAPI(title="Split Bench API", lifespan=lifespan)

# Enable CORS for local development and LAN access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    pass


class RubricCriterion(BaseModel):
    """A single evaluation criterion with a weight."""
    name: str
    weight: int = Field(ge=1, le=5)


class RubricPayload(BaseModel):
    """Evaluation rubric sent with a message."""
    criteria: List[RubricCriterion] = Field(default_factory=list)


class SendMessageRequest(BaseModel):
    """Request to send a message in a conversation."""
    content: str
    attachments: List[Dict[str, Any]] = Field(default_factory=list)
    synthesis_mode: str = "synthesize"  # "best" or "synthesize"
    category: str = "uncategorized"  # prompt template category for analytics
    rubric: Optional[RubricPayload] = None


class ModelConfigRequest(BaseModel):
    """Request to update model configuration."""
    council_models: List[str]
    chairman_model: str


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    message_count: int


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]


class CreateProfileRequest(BaseModel):
    """Request to create a new user profile."""
    name: str
    openrouter_api_key: str
    openrouter_mgmt_key: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    """Request to update a user profile."""
    name: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    openrouter_mgmt_key: Optional[str] = None


class SetPinRequest(BaseModel):
    """Request to set/update owner PIN."""
    pin: str


class VerifyPinRequest(BaseModel):
    """Request to verify owner PIN."""
    pin: str


# ---------------------------------------------------------------------------
# Health check (no auth)
# ---------------------------------------------------------------------------


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "Split Bench API"}


# ---------------------------------------------------------------------------
# Profile management (no auth required for list/create/verify-pin)
# ---------------------------------------------------------------------------


@app.get("/api/profiles")
async def list_profiles():
    """List all profiles (names and masked keys only)."""
    return {"profiles": profiles_mod.list_profiles()}


@app.post("/api/profiles")
async def create_profile(request: CreateProfileRequest):
    """Create a new user profile. Validates the API key first."""
    if not request.openrouter_api_key:
        raise HTTPException(status_code=400, detail="API key is required")

    # Validate the key against OpenRouter
    is_valid = await validate_api_key(request.openrouter_api_key)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid OpenRouter API key")

    profile = await profiles_mod.create_profile(
        name=request.name,
        api_key=request.openrouter_api_key,
        mgmt_key=request.openrouter_mgmt_key,
    )
    return profile


@app.get("/api/profiles/{profile_id}")
async def get_profile(profile_id: str):
    """Get a profile by ID (masked keys)."""
    profile = profiles_mod.get_profile_safe(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.put("/api/profiles/{profile_id}")
async def update_profile(profile_id: str, request: UpdateProfileRequest):
    """Update a profile's name and/or API keys."""
    updates = {}
    if request.name is not None:
        updates["name"] = request.name
    if request.openrouter_api_key is not None:
        is_valid = await validate_api_key(request.openrouter_api_key)
        if not is_valid:
            raise HTTPException(status_code=400, detail="Invalid OpenRouter API key")
        updates["openrouter_api_key"] = request.openrouter_api_key
    if request.openrouter_mgmt_key is not None:
        updates["openrouter_mgmt_key"] = request.openrouter_mgmt_key

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    profile = await profiles_mod.update_profile(profile_id, updates)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.delete("/api/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    """Delete a profile. Owner profiles cannot be deleted."""
    success = await profiles_mod.delete_profile(profile_id)
    if not success:
        raise HTTPException(status_code=403, detail="Cannot delete: profile is owner or not found")
    return {"status": "deleted"}


@app.post("/api/profiles/{profile_id}/validate-key")
async def validate_profile_key(profile_id: str):
    """Validate the API key for a profile against OpenRouter."""
    profile = profiles_mod.get_profile(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    is_valid = await validate_api_key(profile["openrouter_api_key"])
    return {"valid": is_valid}


@app.post("/api/profiles/{profile_id}/verify-pin")
async def verify_pin(profile_id: str, request: VerifyPinRequest):
    """Verify owner PIN to unlock profile switch."""
    profile = profiles_mod.get_profile(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not profile.get("pin_hash"):
        return {"verified": True}  # No PIN set
    result = profiles_mod.verify_pin(profile_id, request.pin)
    if not result:
        raise HTTPException(status_code=403, detail="Incorrect PIN")
    return {"verified": True}


@app.put("/api/profiles/{profile_id}/pin")
async def set_profile_pin(profile_id: str, request: SetPinRequest):
    """Set or update PIN for a profile (typically owner only)."""
    profile = profiles_mod.get_profile(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    success = await profiles_mod.set_pin(profile_id, request.pin)
    if not success:
        raise HTTPException(status_code=400, detail="PIN must be 4-6 digits")
    return {"status": "pin_set"}


# ---------------------------------------------------------------------------
# Conversations (auth required)
# ---------------------------------------------------------------------------


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations(profile: dict = Depends(get_current_profile)):
    """List all conversations (metadata only)."""
    return storage.list_conversations(profile["id"])


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(
    request: CreateConversationRequest,
    profile: dict = Depends(get_current_profile),
):
    """Create a new conversation."""
    conversation_id = str(uuid.uuid4())
    conversation = storage.create_conversation(profile["id"], conversation_id)
    return conversation


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(
    conversation_id: str,
    profile: dict = Depends(get_current_profile),
):
    """Get a specific conversation with all its messages."""
    conversation = storage.get_conversation(profile["id"], conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    profile: dict = Depends(get_current_profile),
):
    """Delete a specific conversation."""
    try:
        storage.delete_conversation(profile["id"], conversation_id)
        return {"status": "deleted"}
    except ValueError:
        raise HTTPException(status_code=404, detail="Conversation not found")


@app.post("/api/conversations/{conversation_id}/clear-messages")
async def clear_conversation_messages(
    conversation_id: str,
    profile: dict = Depends(get_current_profile),
):
    """Clear all messages from a conversation (used for edit functionality)."""
    try:
        conversation = storage.get_conversation(profile["id"], conversation_id)
        if conversation is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

        await storage.clear_conversation_messages(profile["id"], conversation_id)
        return {"status": "cleared"}
    except ValueError:
        raise HTTPException(status_code=404, detail="Conversation not found")


# ---------------------------------------------------------------------------
# Balance & Models (auth required)
# ---------------------------------------------------------------------------


@app.get("/api/balance")
async def get_balance(profile: dict = Depends(get_current_profile)):
    """Get OpenRouter account balance and spending info."""
    data = await get_account_balance(
        api_key=profile["openrouter_api_key"],
        mgmt_key=profile.get("openrouter_mgmt_key"),
    )
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch balance from OpenRouter")
    return data


@app.get("/api/models")
async def list_models(profile: dict = Depends(get_current_profile)):
    """List available models from OpenRouter (cached 1hr)."""
    models = await fetch_available_models(api_key=profile["openrouter_api_key"])
    return {"models": models}


# ---------------------------------------------------------------------------
# Model configuration (auth required)
# ---------------------------------------------------------------------------


@app.get("/api/config/models")
async def get_model_config(profile: dict = Depends(get_current_profile)):
    """Get current council and chairman model configuration."""
    return model_config.load_config(profile["id"])


@app.put("/api/config/models")
async def update_model_config(
    request: ModelConfigRequest,
    profile: dict = Depends(get_current_profile),
):
    """Update council and chairman model configuration."""
    if len(request.council_models) < 2:
        raise HTTPException(status_code=400, detail="At least 2 council models are required")
    if not request.chairman_model:
        raise HTTPException(status_code=400, detail="Chairman model is required")
    config = {
        "council_models": request.council_models,
        "chairman_model": request.chairman_model,
    }
    model_config.save_config(profile["id"], config)
    return config


# ---------------------------------------------------------------------------
# Message streaming (auth required)
# ---------------------------------------------------------------------------


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(
    conversation_id: str,
    request: SendMessageRequest,
    profile: dict = Depends(get_current_profile),
):
    """
    Send a message and stream the 3-stage council process.
    Returns Server-Sent Events as each stage completes.
    """
    pid = profile["id"]
    api_key = profile["openrouter_api_key"]

    # Check if conversation exists
    conversation = storage.get_conversation(pid, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0
    attachments = request.attachments or []

    async def event_generator():
        try:
            # Add user message
            await storage.add_user_message(pid, conversation_id, request.content, attachments)

            # Start title generation in parallel (don't await yet)
            title_task = None
            if is_first_message:
                title_task = asyncio.create_task(
                    generate_conversation_title(request.content, attachments, api_key=api_key)
                )

            # Load model config for this profile
            configured_council_models = model_config.get_council_models(pid)
            configured_chairman_model = model_config.get_chairman_model(pid)

            # Stage 1: Collect responses
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(
                request.content,
                attachments,
                api_key=api_key,
                council_models=configured_council_models,
            )
            successful_stage1_results = [
                r for r in stage1_results
                if r.get("status") == "success" and r.get("response")
            ]
            failed_stage1_models = [
                {
                    "model": r.get("model", "unknown"),
                    "error": r.get("error", "Model did not return a response."),
                }
                for r in stage1_results
                if r.get("status") == "error"
            ]
            stage1_metadata = {
                "configured_council_models": configured_council_models,
                "council_model_count": len(configured_council_models),
                "stage1_success_count": len(successful_stage1_results),
                "stage1_failure_count": len(failed_stage1_models),
                "stage1_failed_models": failed_stage1_models,
            }
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results, 'metadata': stage1_metadata})}\n\n"

            # Stage 2: Collect rankings (only when at least two models answered Stage 1)
            stage2_results = []
            stage2_metadata = {
                "label_to_model": {},
                "aggregate_rankings": [],
                "stage2_insights": {
                    "evaluator_count": 0,
                    "structured_count": 0,
                    "legacy_count": 0,
                    "top_pick": None,
                    "ranked_models_count": 0,
                },
            }
            aggregate_rankings = []

            if len(successful_stage1_results) >= 2:
                yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
                stage2_results, label_to_model = await stage2_collect_rankings(
                    request.content,
                    successful_stage1_results,
                    attachments,
                    rubric=request.rubric,
                    api_key=api_key,
                )
                aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
                stage2_insights = calculate_stage2_insights(stage2_results, label_to_model, aggregate_rankings)
                stage2_metadata = {
                    "label_to_model": label_to_model,
                    "aggregate_rankings": aggregate_rankings,
                    "stage2_insights": stage2_insights,
                    "rubric_criteria": (
                        [{"name": c.name, "weight": c.weight} for c in request.rubric.criteria]
                        if request.rubric and request.rubric.criteria
                        else None
                    ),
                }
                yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': stage2_metadata})}\n\n"

            # Stage 3: Final answer (based on synthesis mode)
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            if not successful_stage1_results:
                stage3_result = {
                    "model": "error",
                    "response": "All selected council models failed to respond. Please try different models.",
                    "usage": {},
                    "mode": request.synthesis_mode,
                }
            elif request.synthesis_mode == "best":
                # Get top-ranked response directly
                best_response = get_best_response(successful_stage1_results, aggregate_rankings)
                stage3_result = {
                    "model": best_response['model'],
                    "response": best_response['response'],
                    "usage": best_response.get('usage', {}),
                    "mode": "best"
                }
            else:
                # Full synthesis by chairman
                stage3_result = await stage3_synthesize_final(
                    request.content,
                    successful_stage1_results,
                    stage2_results,
                    attachments,
                    api_key=api_key,
                    chairman_model=configured_chairman_model,
                )
                stage3_result["mode"] = "synthesize"
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            all_usages = (
                [r.get("usage", {}) for r in stage1_results] +
                [r.get("usage", {}) for r in stage2_results] +
                [stage3_result.get("usage", {})]
            )
            total_usage = {
                "prompt_tokens": sum(u.get("prompt_tokens", 0) for u in all_usages),
                "completion_tokens": sum(u.get("completion_tokens", 0) for u in all_usages),
                "total_cost": sum(u.get("cost", 0) or 0 for u in all_usages),
            }
            message_metadata = {
                **stage1_metadata,
                **stage2_metadata,
                "total_usage": total_usage,
            }

            # Wait for title generation if it was started
            if title_task:
                title = await title_task
                await storage.update_conversation_title(pid, conversation_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            # Save complete assistant message
            await storage.add_assistant_message(
                pid,
                conversation_id,
                stage1_results,
                stage2_results,
                stage3_result,
                message_metadata,
            )

            # Write analytics record (failure here should not break main flow)
            successful_models = [
                r["model"] for r in stage1_results
                if r.get("status") == "success" and r.get("response")
            ]
            try:
                await analytics.add_record(
                    profile_id=pid,
                    conversation_id=conversation_id,
                    category=request.category,
                    models=successful_models,
                    aggregate_rankings=aggregate_rankings,
                    synthesis_mode=request.synthesis_mode,
                    total_cost=total_usage.get("total_cost", 0),
                    evaluator_count=len(stage2_results),
                )
            except Exception as analytics_exc:
                logger.error("Failed to write analytics record: %s", analytics_exc, exc_info=True)

            # Send completion event
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"

        except Exception as e:
            # Send error event
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


# ---------------------------------------------------------------------------
# Prompt templates & history (auth required)
# ---------------------------------------------------------------------------


class PromptTemplateRequest(BaseModel):
    """Request body for creating/updating a prompt template."""
    name: str
    category: str
    description: Optional[str] = ""
    template: str
    variables: List[Dict[str, str]] = []
    rubric: Optional[Dict[str, Any]] = None


class PromptHistoryRequest(BaseModel):
    """Request body for adding to prompt history."""
    content: str
    template_id: Optional[str] = None
    attachments: List[Dict[str, Any]] = Field(default_factory=list)


@app.get("/api/prompts/categories")
async def get_prompt_categories():
    """Get available template categories."""
    return {"categories": prompts.get_categories()}


@app.get("/api/prompts/templates")
async def list_prompt_templates(profile: dict = Depends(get_current_profile)):
    """List all prompt templates."""
    return {"templates": prompts.get_all_templates(profile["id"])}


@app.post("/api/prompts/templates")
async def create_prompt_template(
    request: PromptTemplateRequest,
    profile: dict = Depends(get_current_profile),
):
    """Create a new prompt template."""
    template = {
        "name": request.name,
        "category": request.category,
        "description": request.description,
        "template": request.template,
        "variables": request.variables,
        "rubric": request.rubric,
    }
    saved = prompts.save_template(profile["id"], template)
    return saved


@app.get("/api/prompts/templates/{template_id}")
async def get_prompt_template(
    template_id: str,
    profile: dict = Depends(get_current_profile),
):
    """Get a single prompt template by ID."""
    template = prompts.get_template(profile["id"], template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@app.put("/api/prompts/templates/{template_id}")
async def update_prompt_template(
    template_id: str,
    request: PromptTemplateRequest,
    profile: dict = Depends(get_current_profile),
):
    """Update an existing prompt template."""
    existing = prompts.get_template(profile["id"], template_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Template not found")
    template = {
        "id": template_id,
        "name": request.name,
        "category": request.category,
        "description": request.description,
        "template": request.template,
        "variables": request.variables,
        "usage_count": existing.get("usage_count", 0),
        "rubric": request.rubric,
    }
    saved = prompts.save_template(profile["id"], template)
    return saved


@app.delete("/api/prompts/templates/{template_id}")
async def delete_prompt_template(
    template_id: str,
    profile: dict = Depends(get_current_profile),
):
    """Delete a user-created prompt template."""
    success = prompts.delete_template(profile["id"], template_id)
    if not success:
        raise HTTPException(
            status_code=403,
            detail="Cannot delete: template is built-in or not found",
        )
    return {"status": "deleted"}


@app.get("/api/prompts/history")
async def get_prompt_history(
    limit: int = 20,
    profile: dict = Depends(get_current_profile),
):
    """Get recent prompt history."""
    return {"history": prompts.get_history(profile["id"], limit)}


@app.post("/api/prompts/history")
async def add_prompt_history(
    request: PromptHistoryRequest,
    profile: dict = Depends(get_current_profile),
):
    """Add a prompt to history."""
    item = prompts.add_to_history(
        profile["id"],
        request.content,
        request.template_id,
        request.attachments or [],
    )
    return item


@app.delete("/api/prompts/history/{item_id}")
async def delete_prompt_history(
    item_id: str,
    profile: dict = Depends(get_current_profile),
):
    """Delete a single history item."""
    success = prompts.delete_history_item(profile["id"], item_id)
    if not success:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"status": "deleted"}


@app.delete("/api/prompts/history")
async def clear_prompt_history(profile: dict = Depends(get_current_profile)):
    """Clear all prompt history."""
    prompts.clear_history(profile["id"])
    return {"status": "cleared"}


@app.post("/api/prompts/templates/{template_id}/use")
async def use_prompt_template(
    template_id: str,
    profile: dict = Depends(get_current_profile),
):
    """Increment usage count for a template."""
    template = prompts.get_template(profile["id"], template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    prompts.increment_usage(profile["id"], template_id)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Analytics (auth required)
# ---------------------------------------------------------------------------


@app.get("/api/analytics")
async def get_analytics(
    category: Optional[str] = None,
    days: Optional[int] = None,
    profile: dict = Depends(get_current_profile),
):
    """Get aggregated analytics data with optional filters."""
    return analytics.get_aggregated_analytics(profile["id"], category, days)


@app.get("/api/analytics/summary")
async def get_analytics_summary(profile: dict = Depends(get_current_profile)):
    """Get quick analytics summary stats."""
    return analytics.get_aggregated_analytics(profile["id"])


# ---------------------------------------------------------------------------
# Evaluation rubrics (auth required)
# ---------------------------------------------------------------------------


class RubricRequest(BaseModel):
    """Request body for creating/updating a rubric."""
    name: str
    criteria: List[Dict[str, Any]]


@app.get("/api/rubrics")
async def list_rubrics(profile: dict = Depends(get_current_profile)):
    """List all saved rubrics."""
    return {"rubrics": prompts.get_all_rubrics(profile["id"])}


@app.post("/api/rubrics")
async def create_rubric(
    request: RubricRequest,
    profile: dict = Depends(get_current_profile),
):
    """Create a new rubric."""
    rubric = {"name": request.name, "criteria": request.criteria}
    saved = prompts.save_rubric(profile["id"], rubric)
    return saved


@app.put("/api/rubrics/{rubric_id}")
async def update_rubric(
    rubric_id: str,
    request: RubricRequest,
    profile: dict = Depends(get_current_profile),
):
    """Update an existing rubric."""
    existing = prompts.get_rubric(profile["id"], rubric_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Rubric not found")
    rubric = {"id": rubric_id, "name": request.name, "criteria": request.criteria}
    saved = prompts.save_rubric(profile["id"], rubric)
    return saved


@app.delete("/api/rubrics/{rubric_id}")
async def delete_rubric(
    rubric_id: str,
    profile: dict = Depends(get_current_profile),
):
    """Delete a rubric."""
    success = prompts.delete_rubric(profile["id"], rubric_id)
    if not success:
        raise HTTPException(status_code=404, detail="Rubric not found")
    return {"status": "deleted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
