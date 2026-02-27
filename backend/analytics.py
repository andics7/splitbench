"""Analytics data persistence for model performance tracking."""

import asyncio
import json
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

ANALYTICS_FILE = Path(__file__).parent.parent / "data" / "analytics.json"

_lock = asyncio.Lock()


def _ensure_file():
    """Ensure the analytics file and parent dir exist."""
    ANALYTICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not ANALYTICS_FILE.exists():
        with open(ANALYTICS_FILE, "w") as f:
            json.dump({"records": []}, f, indent=2)


def _load_records() -> List[Dict[str, Any]]:
    """Load all analytics records from disk."""
    _ensure_file()
    with open(ANALYTICS_FILE, "r") as f:
        data = json.load(f)
    return data.get("records", [])


def _save_records(records: List[Dict[str, Any]]):
    """Save all analytics records to disk."""
    _ensure_file()
    with open(ANALYTICS_FILE, "w") as f:
        json.dump({"records": records}, f, indent=2)


async def add_record(
    conversation_id: str,
    category: str,
    models: List[str],
    aggregate_rankings: List[Dict[str, Any]],
    synthesis_mode: str,
    total_cost: float,
    evaluator_count: int,
) -> Dict[str, Any]:
    """Append a new analytics record after a successful council run."""
    async with _lock:
        records = _load_records()
        winner_model = (
            aggregate_rankings[0]["model"]
            if aggregate_rankings
            else (models[0] if models else "unknown")
        )
        record = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "conversation_id": conversation_id,
            "category": category or "uncategorized",
            "models": models,
            "aggregate_rankings": aggregate_rankings,
            "winner_model": winner_model,
            "synthesis_mode": synthesis_mode,
            "total_cost": total_cost,
            "evaluator_count": evaluator_count,
            "model_count": len(models),
        }
        records.append(record)
        _save_records(records)
        return record


def get_filtered_records(
    category: Optional[str] = None,
    days: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Return records filtered by category and/or time range."""
    records = _load_records()

    if category and category != "all":
        records = [r for r in records if r["category"] == category]

    if days:
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        records = [r for r in records if r["timestamp"] >= cutoff]

    return records


def get_aggregated_analytics(
    category: Optional[str] = None,
    days: Optional[int] = None,
) -> Dict[str, Any]:
    """Compute aggregated analytics suitable for the dashboard."""
    records = get_filtered_records(category, days)

    if not records:
        return {
            "total_evaluations": 0,
            "unique_models": 0,
            "top_model": None,
            "total_cost": 0.0,
            "leaderboard": [],
            "time_series": [],
            "category_breakdown": {},
        }

    # --- Summary stats ---
    total_evaluations = len(records)
    all_models: set = set()
    for r in records:
        all_models.update(r.get("models", []))
    unique_models = len(all_models)
    total_cost = sum(r.get("total_cost", 0) for r in records)

    # --- Leaderboard ---
    model_stats: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {
            "wins": 0,
            "total_rank_sum": 0.0,
            "total_rank_count": 0,
            "times_tested": 0,
            "first_place_votes": 0,
            "total_cost": 0.0,
        }
    )

    for r in records:
        winner = r.get("winner_model")
        rankings = r.get("aggregate_rankings", [])
        participating_models = r.get("models", [])
        cost_per_model = r.get("total_cost", 0) / max(len(participating_models), 1)

        for rank_entry in rankings:
            model = rank_entry["model"]
            model_stats[model]["total_rank_sum"] += rank_entry["average_rank"]
            model_stats[model]["total_rank_count"] += 1
            model_stats[model]["times_tested"] += 1
            model_stats[model]["total_cost"] += cost_per_model

        if winner:
            model_stats[winner]["wins"] += 1
            model_stats[winner]["first_place_votes"] += 1

    leaderboard = []
    for model, stats in model_stats.items():
        times_tested = stats["times_tested"]
        win_rate = (stats["wins"] / times_tested * 100) if times_tested > 0 else 0
        avg_rank = (
            stats["total_rank_sum"] / stats["total_rank_count"]
            if stats["total_rank_count"] > 0
            else 0
        )
        leaderboard.append(
            {
                "model": model,
                "win_rate": round(win_rate, 1),
                "avg_rank": round(avg_rank, 2),
                "times_tested": times_tested,
                "first_place_votes": stats["first_place_votes"],
                "total_cost": round(stats["total_cost"], 6),
            }
        )

    leaderboard.sort(key=lambda x: (-x["win_rate"], x["avg_rank"]))

    top_model = leaderboard[0] if leaderboard else None

    # --- Time series (daily granularity) ---
    daily_data: Dict[str, Dict[str, List[float]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for r in records:
        day = r["timestamp"][:10]  # YYYY-MM-DD
        for rank_entry in r.get("aggregate_rankings", []):
            daily_data[day][rank_entry["model"]].append(rank_entry["average_rank"])

    time_series = []
    for day in sorted(daily_data.keys()):
        entry: Dict[str, Any] = {"date": day}
        for model, ranks in daily_data[day].items():
            entry[model] = round(sum(ranks) / len(ranks), 2)
        time_series.append(entry)

    # --- Category breakdown ---
    cat_data: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(
        lambda: defaultdict(
            lambda: {"wins": 0, "tests": 0, "rank_sum": 0.0, "rank_count": 0}
        )
    )
    for r in records:
        cat = r.get("category", "uncategorized")
        winner = r.get("winner_model")
        for rank_entry in r.get("aggregate_rankings", []):
            model = rank_entry["model"]
            cat_data[cat][model]["tests"] += 1
            cat_data[cat][model]["rank_sum"] += rank_entry["average_rank"]
            cat_data[cat][model]["rank_count"] += 1
        if winner:
            cat_data[cat][winner]["wins"] += 1

    category_breakdown = {}
    for cat, models_data in cat_data.items():
        category_breakdown[cat] = []
        for model, stats in models_data.items():
            avg_rank = (
                stats["rank_sum"] / stats["rank_count"]
                if stats["rank_count"] > 0
                else 0
            )
            win_rate = (
                (stats["wins"] / stats["tests"] * 100) if stats["tests"] > 0 else 0
            )
            category_breakdown[cat].append(
                {
                    "model": model,
                    "win_rate": round(win_rate, 1),
                    "avg_rank": round(avg_rank, 2),
                    "tests": stats["tests"],
                }
            )
        category_breakdown[cat].sort(key=lambda x: (-x["win_rate"], x["avg_rank"]))

    return {
        "total_evaluations": total_evaluations,
        "unique_models": unique_models,
        "top_model": top_model,
        "total_cost": round(total_cost, 6),
        "leaderboard": leaderboard,
        "time_series": time_series,
        "category_breakdown": category_breakdown,
    }
