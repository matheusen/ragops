"""
LinkedIn Post Scheduler — APScheduler-based cron runner.

Loads active cron jobs from MongoDB on startup and executes them,
generating LinkedIn posts automatically and saving them to linkedin_posts collection.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import TYPE_CHECKING

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger
    _HAS_APSCHEDULER = True
except ImportError:
    _HAS_APSCHEDULER = False

_scheduler: "BackgroundScheduler | None" = None


def _get_scheduler() -> "BackgroundScheduler | None":
    global _scheduler
    if not _HAS_APSCHEDULER:
        return None
    if _scheduler is None:
        from apscheduler.schedulers.background import BackgroundScheduler
        _scheduler = BackgroundScheduler(timezone="UTC")
        _scheduler.start()
    return _scheduler


def next_run_from_schedule(schedule: str) -> str:
    """Compute the next ISO datetime string for a given schedule descriptor."""
    now = datetime.now(timezone.utc)
    if schedule == "daily":
        # Tomorrow same time
        nxt = now + timedelta(days=1)
    elif schedule == "weekly":
        nxt = now + timedelta(weeks=1)
    else:
        # cron:<expr> — just add 1 day as approximation
        nxt = now + timedelta(days=1)
    return nxt.isoformat()


def _make_trigger(schedule: str):
    """Return an APScheduler trigger for the given schedule string."""
    if not _HAS_APSCHEDULER:
        return None
    if schedule == "daily":
        return CronTrigger(hour=9, minute=0, timezone="UTC")
    if schedule == "weekly":
        return CronTrigger(day_of_week="mon", hour=9, minute=0, timezone="UTC")
    if schedule.startswith("cron:"):
        expr = schedule[5:].strip()
        parts = expr.split()
        if len(parts) == 5:
            minute, hour, day, month, dow = parts
            return CronTrigger(
                minute=minute, hour=hour, day=day, month=month,
                day_of_week=dow, timezone="UTC",
            )
    # Fallback: every Monday 09:00 UTC
    return CronTrigger(day_of_week="mon", hour=9, minute=0, timezone="UTC")


def _run_cron(cron_id: str) -> None:
    """Execute a cron job: generate a LinkedIn post and save it."""
    try:
        from jira_issue_rag.core.config import (
            MongoClient as _MC,
            MONGODB_DB_NAME as _DB,
            _resolve_mongodb_uri as _uri,
        )
        uri = _uri()
        if not uri or _MC is None:
            return
        client = _MC(uri, serverSelectionTimeoutMS=3000)
        db = client[_DB]

        cron_doc = db["linkedin_crons"].find_one({"id": cron_id})
        if not cron_doc or not cron_doc.get("active", True):
            return

        roadmap_id  = cron_doc.get("roadmap_id", "")
        topic_focus = cron_doc.get("topic_focus", "")
        custom_prompt = cron_doc.get("prompt", "")
        provider    = cron_doc.get("provider", "gemini")

        roadmap_doc = db["roadmaps"].find_one({"id": roadmap_id})
        if not roadmap_doc:
            return

        # Build content
        title  = roadmap_doc.get("title", roadmap_doc.get("goal", ""))
        phases = roadmap_doc.get("phases", [])
        phase_lines = [
            f"- {p.get('title', '')} ({p.get('duration', '')}): "
            + ", ".join(t.get("title", "") for t in p.get("topics", []))
            for p in phases
        ]
        roadmap_summary = "\n".join(phase_lines)

        if topic_focus:
            content = (
                f"Objetivo: {roadmap_doc.get('goal', '')}\n"
                f"Tópico em foco: {topic_focus}\n\n"
                f"Roadmap:\n{roadmap_summary}"
            )
        else:
            content = f"{roadmap_doc.get('goal', '')}\n\nFases:\n{roadmap_summary}"

        custom_instructions = (
            f"Instruções adicionais: {custom_prompt}" if custom_prompt else ""
        )

        # Call LLM via workflow
        from jira_issue_rag.core.config import get_settings
        from jira_issue_rag.services.workflow import ValidationWorkflow
        from jira_issue_rag.shared.models import PromptExecutionRequest

        settings = get_settings()
        workflow = ValidationWorkflow(settings)
        result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="linkedin_post",
                content=content,
                provider=provider,
                title=title,
                metadata={
                    "topic_focus": topic_focus or "roadmap completo",
                    "custom_instructions": custom_instructions,
                },
            )
        )

        now = datetime.now(timezone.utc).isoformat()
        post_id = uuid.uuid4().hex[:10]

        db["linkedin_posts"].insert_one({
            "id": post_id,
            "roadmap_id": roadmap_id,
            "roadmap_title": title,
            "content": result.output_text.strip(),
            "topic_focus": topic_focus or "Geral",
            "custom_prompt": custom_prompt,
            "provider": provider,
            "created_at": now,
            "from_cron": cron_id,
        })

        db["linkedin_crons"].update_one(
            {"id": cron_id},
            {"$set": {
                "last_run_at": now,
                "next_run_at": next_run_from_schedule(cron_doc.get("schedule", "weekly")),
            }},
        )

    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).error("LinkedIn cron %s failed: %s", cron_id, exc)


def schedule_cron(cron_id: str, schedule: str) -> None:
    """Register a new cron job in the live scheduler."""
    sched = _get_scheduler()
    if sched is None:
        return
    trigger = _make_trigger(schedule)
    if trigger is None:
        return
    # Remove old job with same id if exists
    try:
        sched.remove_job(cron_id)
    except Exception:
        pass
    sched.add_job(_run_cron, trigger, args=[cron_id], id=cron_id, replace_existing=True)


def remove_cron(cron_id: str) -> None:
    """Remove a cron job from the live scheduler."""
    sched = _get_scheduler()
    if sched is None:
        return
    try:
        sched.remove_job(cron_id)
    except Exception:
        pass


def load_crons_from_db() -> None:
    """Called on FastAPI startup — loads all active crons from MongoDB into APScheduler."""
    if not _HAS_APSCHEDULER:
        return
    try:
        from jira_issue_rag.core.config import (
            MongoClient as _MC,
            MONGODB_DB_NAME as _DB,
            _resolve_mongodb_uri as _uri,
        )
        uri = _uri()
        if not uri or _MC is None:
            return
        client = _MC(uri, serverSelectionTimeoutMS=2000)
        docs = list(client[_DB]["linkedin_crons"].find({"active": True}))
        for doc in docs:
            schedule_cron(doc["id"], doc.get("schedule", "weekly"))
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning("Could not load LinkedIn crons: %s", exc)
