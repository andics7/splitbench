"""
Migrate historical conversation data into analytics.json.

Run from the llm-council directory:
    python scripts/migrate_analytics.py
"""

import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Adjust path so backend modules are importable
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

CONVERSATIONS_DIR = ROOT / "data" / "conversations"
ANALYTICS_FILE = ROOT / "data" / "analytics.json"


def load_analytics():
    if not ANALYTICS_FILE.exists():
        return []
    with open(ANALYTICS_FILE) as f:
        return json.load(f).get("records", [])


def save_analytics(records):
    with open(ANALYTICS_FILE, "w") as f:
        json.dump({"records": records}, f, indent=2)


def migrate():
    existing = load_analytics()
    existing_conv_ids = {r["conversation_id"] for r in existing}

    conv_files = sorted(CONVERSATIONS_DIR.glob("*.json"))
    added = 0
    skipped = 0

    for conv_file in conv_files:
        conv_id = conv_file.stem

        if conv_id in existing_conv_ids:
            print(f"  SKIP {conv_id[:8]} (already in analytics)")
            skipped += 1
            continue

        with open(conv_file) as f:
            data = json.load(f)

        messages = data.get("messages", [])
        created_at = data.get("created_at", datetime.utcnow().isoformat())

        for msg in messages:
            if msg.get("role") != "assistant":
                continue

            meta = msg.get("metadata", {})
            stage1 = msg.get("stage1", [])
            stage2 = msg.get("stage2", [])
            aggregate_rankings = meta.get("aggregate_rankings", [])

            # Skip conversations with no useful data
            if not aggregate_rankings and not stage1:
                print(f"  SKIP {conv_id[:8]} (no model data)")
                skipped += 1
                break

            # Collect successful models (status may be 'success', None, or absent)
            successful_models = [
                r["model"]
                for r in stage1
                if r.get("response") and r.get("status") != "error"
            ]

            if not successful_models and aggregate_rankings:
                # Fall back to models listed in rankings
                successful_models = [r["model"] for r in aggregate_rankings]

            winner_model = (
                aggregate_rankings[0]["model"]
                if aggregate_rankings
                else (successful_models[0] if successful_models else "unknown")
            )

            total_usage = meta.get("total_usage", {})
            total_cost = total_usage.get("total_cost", 0) or 0

            record = {
                "id": str(uuid.uuid4()),
                "timestamp": created_at,
                "conversation_id": conv_id,
                "category": data.get("category", "uncategorized"),
                "models": successful_models,
                "aggregate_rankings": aggregate_rankings,
                "winner_model": winner_model,
                "synthesis_mode": data.get("synthesis_mode", "synthesize"),
                "total_cost": total_cost,
                "evaluator_count": len(stage2),
                "model_count": len(successful_models),
            }
            existing.append(record)
            added += 1
            print(f"  ADD  {conv_id[:8]}  winner={winner_model.split('/')[-1]}  models={len(successful_models)}")
            break  # One analytics record per conversation

    save_analytics(existing)
    print(f"\nDone. Added {added} records, skipped {skipped}. Total: {len(existing)} records.")


if __name__ == "__main__":
    print(f"Migrating conversations from {CONVERSATIONS_DIR}")
    migrate()
