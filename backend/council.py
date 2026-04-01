"""3-stage LLM Council orchestration."""

import re
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple

from .openrouter import query_model, query_models_parallel


def _normalize_content(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(parts)
    return ""


def _build_user_query_context(user_query: str, attachments: List[Dict[str, Any]]) -> str:
    text = (user_query or "").strip()
    if not attachments:
        return text

    attachment_lines = []
    for attachment in attachments:
        name = attachment.get("name", "attachment")
        mime_type = attachment.get("mime_type", "unknown")
        attachment_lines.append(f"- {name} ({mime_type})")

    summary = "\n".join(attachment_lines)
    if text:
        return f"{text}\n\nAttachments:\n{summary}"
    return f"User prompt includes attachments:\n{summary}"


async def stage1_collect_responses(
    user_query: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
    *,
    api_key: str,
    council_models: List[str],
) -> List[Dict[str, Any]]:
    """Stage 1: Collect individual responses from all council models."""
    messages = [{"role": "user", "content": _build_user_query_context(user_query, attachments or [])}]

    responses = await query_models_parallel(council_models, messages, api_key=api_key)

    stage1_results: List[Dict[str, Any]] = []
    for model in council_models:
        response = responses.get(model)
        if response is None:
            stage1_results.append(
                {
                    "model": model,
                    "response": "",
                    "usage": {},
                    "status": "error",
                    "error": "Model did not return a response.",
                }
            )
            continue

        content = _normalize_content(response.get("content", "")).strip()
        if not content:
            stage1_results.append(
                {
                    "model": model,
                    "response": "",
                    "usage": response.get("usage", {}),
                    "status": "error",
                    "error": "Model returned an empty response.",
                }
            )
            continue

        stage1_results.append(
            {
                "model": model,
                "response": content,
                "usage": response.get("usage", {}),
                "status": "success",
            }
        )

    return stage1_results


def _has_active_rubric(rubric) -> bool:
    """Return True if the rubric has at least one criterion."""
    if rubric is None:
        return False
    criteria = getattr(rubric, "criteria", None) or rubric.get("criteria", []) if isinstance(rubric, dict) else getattr(rubric, "criteria", [])
    return len(criteria) > 0


def _get_rubric_criteria(rubric) -> List[Dict[str, Any]]:
    """Extract criteria list from a rubric (Pydantic model or dict)."""
    if rubric is None:
        return []
    if isinstance(rubric, dict):
        return rubric.get("criteria", [])
    return [{"name": c.name, "weight": c.weight} for c in getattr(rubric, "criteria", [])]


def _build_rubric_ranking_prompt(
    query_context: str,
    responses_text: str,
    response_labels: List[str],
    rubric,
) -> str:
    """Build a Stage 2 prompt that asks for per-criterion scores."""
    criteria = _get_rubric_criteria(rubric)
    criteria_list = "\n".join(
        f"- {c['name']} (weight: {c['weight']}/5)"
        for c in criteria
    )
    criteria_names_list = "\n".join(f"- {c['name']}: <score>/10 - <brief justification>" for c in criteria)
    labels_str = ", ".join(response_labels)

    return f"""You are evaluating different responses to the following question:

Question: {query_context}

Here are the responses from different models (anonymized):

{responses_text}

You must evaluate each response against these specific criteria:
{criteria_list}

Your task:
1. For EACH response ({labels_str}), score EVERY criterion on a scale of 1-10.
2. Provide a brief justification for each score.
3. Then provide a final ranking based on the weighted scores.

IMPORTANT: You MUST output your scores in EXACTLY this format. Do not deviate.

CRITERION SCORES:
For each response, output a block like this:

[Response X]
{criteria_names_list}

After scoring all responses, provide:

FINAL RANKING:
1. Response X
2. Response Y
(best to worst, based on weighted criterion scores)

Now provide your evaluation:"""


def parse_criterion_scores_from_text(
    text: str,
    criteria_names: List[str],
    response_labels: List[str],
) -> Dict[str, Dict[str, Optional[int]]]:
    """Parse per-criterion scores from evaluator response text.

    Returns a dict mapping response label -> {criterion_name: score_or_None}.
    """
    scores: Dict[str, Dict[str, Optional[int]]] = {}

    criterion_section = text
    if "CRITERION SCORES:" in text:
        criterion_section = text.split("CRITERION SCORES:", 1)[1]
        if "FINAL RANKING:" in criterion_section:
            criterion_section = criterion_section.split("FINAL RANKING:", 1)[0]

    for label in response_labels:
        scores[label] = {}
        # Try [Response X] block delimiters
        block_pattern = re.compile(
            rf"\[{re.escape(label)}\](.*?)(?=\[Response [A-Z]\]|\Z)",
            re.DOTALL,
        )
        match = block_pattern.search(criterion_section)
        if not match:
            # Fallback: try without brackets
            block_pattern = re.compile(
                rf"{re.escape(label)}[:\s]*(.*?)(?=Response [A-Z]|\Z)",
                re.DOTALL,
            )
            match = block_pattern.search(criterion_section)

        block_text = match.group(1) if match else ""

        for criterion in criteria_names:
            score_pattern = re.compile(
                rf"{re.escape(criterion)}[:\s]*(\d+)\s*/\s*10",
                re.IGNORECASE,
            )
            score_match = score_pattern.search(block_text)
            if score_match:
                val = int(score_match.group(1))
                scores[label][criterion] = max(1, min(10, val))
            else:
                scores[label][criterion] = None

    return scores


async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    attachments: Optional[List[Dict[str, Any]]] = None,
    rubric: Optional[Any] = None,
    *,
    api_key: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """Stage 2: Each successful Stage 1 model ranks the anonymized responses."""
    successful_stage1_results = [
        result for result in stage1_results if result.get("status") == "success" and result.get("response")
    ]

    if len(successful_stage1_results) < 2:
        return [], {}

    evaluator_models = [result["model"] for result in successful_stage1_results]

    labels = [chr(65 + i) for i in range(len(successful_stage1_results))]
    response_labels = [f"Response {label}" for label in labels]

    label_to_model = {
        response_label: result["model"]
        for response_label, result in zip(response_labels, successful_stage1_results)
    }

    responses_text = "\n\n".join(
        [
            f"{response_label}:\n{result['response']}"
            for response_label, result in zip(response_labels, successful_stage1_results)
        ]
    )

    query_context = _build_user_query_context(user_query, attachments or [])

    if _has_active_rubric(rubric):
        ranking_prompt = _build_rubric_ranking_prompt(
            query_context, responses_text, response_labels, rubric
        )
    else:
        ranking_prompt = f"""You are evaluating different responses to the following question:

Question: {query_context}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Now provide your evaluation and ranking:"""

    messages = [{"role": "user", "content": ranking_prompt}]
    responses = await query_models_parallel(evaluator_models, messages, api_key=api_key)

    use_rubric = _has_active_rubric(rubric)
    criteria_names = [c["name"] for c in _get_rubric_criteria(rubric)] if use_rubric else []

    stage2_results: List[Dict[str, Any]] = []
    for model in evaluator_models:
        response = responses.get(model)
        if response is None:
            continue

        full_text = _normalize_content(response.get("content", ""))
        parsed = parse_ranking_from_text(full_text)

        result_entry: Dict[str, Any] = {
            "model": model,
            "ranking": full_text,
            "parsed_ranking": parsed,
            "structured_ranking": None,
            "format": "legacy_text",
            "validation_issues": ["Structured output unavailable for this model."],
            "usage": response.get("usage", {}),
        }

        if use_rubric:
            criterion_scores = parse_criterion_scores_from_text(
                full_text, criteria_names, response_labels
            )
            result_entry["criterion_scores"] = criterion_scores
            result_entry["format"] = "rubric_scored"

            missing = []
            for label, label_scores in criterion_scores.items():
                for cname, score in label_scores.items():
                    if score is None:
                        missing.append(f"{label}/{cname}")
            if missing:
                result_entry["validation_issues"] = [
                    f"Could not parse scores for: {', '.join(missing[:5])}"
                ]
            else:
                result_entry["validation_issues"] = []

        stage2_results.append(result_entry)

    return stage2_results, label_to_model


async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    attachments: Optional[List[Dict[str, Any]]] = None,
    *,
    api_key: str,
    chairman_model: str,
) -> Dict[str, Any]:
    """Stage 3: Chairman synthesizes final response."""
    stage1_text = "\n\n".join(
        [f"Model: {result['model']}\nResponse: {result['response']}" for result in stage1_results]
    )

    stage2_text = "\n\n".join(
        [f"Model: {result['model']}\nRanking:\n{result.get('ranking', '')}" for result in stage2_results]
    )

    query_context = _build_user_query_context(user_query, attachments or [])

    chairman_prompt = f"""You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: {query_context}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:"""

    messages = [{"role": "user", "content": chairman_prompt}]
    response = await query_model(chairman_model, messages, api_key=api_key)

    if response is None:
        return {"model": chairman_model, "response": "Error: Unable to generate final synthesis.", "usage": {}}

    return {
        "model": chairman_model,
        "response": _normalize_content(response.get("content", "")) or "",
        "usage": response.get("usage", {}),
    }


def parse_ranking_from_text(ranking_text: str) -> List[str]:
    """Parse the FINAL RANKING section from a model response."""
    if "FINAL RANKING:" in ranking_text:
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            ranking_section = parts[1]
            numbered_matches = re.findall(r"\d+\.\s*Response [A-Z]", ranking_section)
            if numbered_matches:
                return [re.search(r"Response [A-Z]", m).group() for m in numbered_matches if re.search(r"Response [A-Z]", m)]

            return re.findall(r"Response [A-Z]", ranking_section)

    return re.findall(r"Response [A-Z]", ranking_text)


def calculate_aggregate_rankings(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str],
) -> List[Dict[str, Any]]:
    """Calculate aggregate rankings across all models."""
    model_positions = defaultdict(list)
    model_criterion_scores: Dict[str, Dict[str, List[int]]] = defaultdict(lambda: defaultdict(list))

    for ranking in stage2_results:
        parsed_ranking = ranking.get("parsed_ranking") or parse_ranking_from_text(ranking.get("ranking", ""))
        for position, label in enumerate(parsed_ranking, start=1):
            model_name = label_to_model.get(label)
            if model_name:
                model_positions[model_name].append(position)

        criterion_scores = ranking.get("criterion_scores")
        if criterion_scores:
            for label, scores_dict in criterion_scores.items():
                model_name = label_to_model.get(label)
                if model_name:
                    for criterion_name, score_val in scores_dict.items():
                        if score_val is not None:
                            model_criterion_scores[model_name][criterion_name].append(score_val)

    aggregate: List[Dict[str, Any]] = []
    for model, positions in model_positions.items():
        if not positions:
            continue
        avg_rank = sum(positions) / len(positions)
        entry: Dict[str, Any] = {
            "model": model,
            "average_rank": round(avg_rank, 2),
            "rankings_count": len(positions),
        }

        if model in model_criterion_scores:
            criterion_avgs = {}
            for cname, score_list in model_criterion_scores[model].items():
                criterion_avgs[cname] = round(sum(score_list) / len(score_list), 2)
            entry["criterion_averages"] = criterion_avgs

        aggregate.append(entry)

    aggregate.sort(key=lambda x: x["average_rank"])
    return aggregate


def calculate_stage2_insights(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str],
    aggregate_rankings: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build compact Stage 2 summary metrics for UI rendering."""
    evaluator_count = len(stage2_results)
    top_pick_counter = Counter()

    for result in stage2_results:
        parsed = result.get("parsed_ranking") or parse_ranking_from_text(result.get("ranking", ""))
        if not parsed:
            continue
        top_model = label_to_model.get(parsed[0])
        if top_model:
            top_pick_counter[top_model] += 1

    top_pick = None
    if top_pick_counter and evaluator_count > 0:
        model, votes = top_pick_counter.most_common(1)[0]
        top_pick = {
            "model": model,
            "votes": votes,
            "share_percent": round((votes / evaluator_count) * 100, 1),
        }

    return {
        "evaluator_count": evaluator_count,
        "structured_count": 0,
        "legacy_count": evaluator_count,
        "top_pick": top_pick,
        "ranked_models_count": len(aggregate_rankings),
    }


def get_best_response(
    stage1_results: List[Dict[str, Any]],
    aggregate_rankings: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Get the top-ranked response from Stage 1 based on aggregate rankings."""
    successful = [r for r in stage1_results if r.get("status") == "success" and r.get("response")]

    if not successful:
        return {"model": "unknown", "response": "Error: No responses available.", "usage": {}}

    if not aggregate_rankings:
        return successful[0]

    best_model = aggregate_rankings[0]["model"]
    for response in successful:
        if response["model"] == best_model:
            return response

    return successful[0]


async def generate_conversation_title(
    user_query: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
    *,
    api_key: str,
) -> str:
    """Generate a short title for a conversation based on the first user message."""
    query_context = _build_user_query_context(user_query, attachments or [])
    title_prompt = f"""Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: {query_context}

Title:"""

    messages = [{"role": "user", "content": title_prompt}]
    response = await query_model("google/gemini-2.5-flash", messages, api_key=api_key, timeout=30.0)

    if response is None:
        return "New Conversation"

    title = _normalize_content(response.get("content", "New Conversation")).strip()
    if not title:
        title = "New Conversation"

    title = title.strip("\"'")
    if len(title) > 50:
        title = title[:47] + "..."

    return title
