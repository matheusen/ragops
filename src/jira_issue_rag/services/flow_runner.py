"""flow_runner.py
Translates a canvas pipeline configuration (list of node states saved from the
dashboard Pipeline Canvas) into a live ``Settings`` instance, then runs the
full validation workflow with those settings.

Node-to-Settings mapping
------------------------
The canvas persists each node as::

    { id: str, data: { active: bool, selectedVariant: str | None } }

This module maps those values to the boolean flags and model-name fields that
``ValidationWorkflow`` already understands — zero changes needed in any other
service file.
"""
from __future__ import annotations

import copy
from typing import Any

from jira_issue_rag.core.config import Settings
from jira_issue_rag.services.workflow import ValidationWorkflow
from jira_issue_rag.shared.models import (
    DecisionResult,
    FlowNodeState,
    ValidationRequest,
)


# ---------------------------------------------------------------------------
# Variant label → model / flag overrides
# ---------------------------------------------------------------------------

_PROVIDER_VARIANTS: dict[str, dict[str, Any]] = {
    "gpt-4o": {
        "default_provider": "openai",
        "openai_model": "gpt-4o",
        "allow_third_party_llm": True,
    },
    "gpt-4o mini": {
        "default_provider": "openai",
        "openai_model": "gpt-4o-mini",
        "allow_third_party_llm": True,
    },
    "gpt-4.1": {
        "default_provider": "openai",
        "openai_model": "gpt-4.1",
        "allow_third_party_llm": True,
    },
    "gemini 2.5 flash": {
        "default_provider": "gemini",
        "gemini_model": "gemini-2.5-flash",
        "allow_third_party_llm": True,
    },
    "gemini 2.5 pro": {
        "default_provider": "gemini",
        "gemini_model": "gemini-2.5-pro",
        "allow_third_party_llm": True,
    },
    "ollama": {
        "default_provider": "ollama",
        "allow_third_party_llm": False,
    },
    "ollama local": {
        "default_provider": "ollama",
        "allow_third_party_llm": False,
    },
    "mock": {
        "default_provider": "mock",
        "allow_third_party_llm": False,
    },
    "mock provider": {
        "default_provider": "mock",
        "allow_third_party_llm": False,
    },
}

_EMBEDDING_VARIANTS: dict[str, dict[str, Any]] = {
    "openai ada-002": {
        "openai_embedding_model": "text-embedding-ada-002",
        "embedding_dimension": 1536,
        "allow_third_party_embeddings": True,
    },
    "openai 3-small": {
        "openai_embedding_model": "text-embedding-3-small",
        "embedding_dimension": 1536,
        "allow_third_party_embeddings": True,
    },
    "gemini embedding": {
        "gemini_embedding_model": "gemini-embedding-001",
        "embedding_dimension": 3072,
        "allow_third_party_embeddings": True,
    },
    "ollama": {
        # local model — no external calls
        "allow_third_party_embeddings": False,
        "enable_external_retrieval": False,
    },
    "ollama local": {
        "allow_third_party_embeddings": False,
        "enable_external_retrieval": False,
    },
}

_RETRIEVER_VARIANTS: dict[str, dict[str, Any]] = {
    "hybrid bm25+dense": {
        "enable_external_retrieval": True,
        "enable_cascade_retrieval": False,
        "enable_graphrag": False,
    },
    "hybrid bm25 + dense": {
        "enable_external_retrieval": True,
        "enable_cascade_retrieval": False,
        "enable_graphrag": False,
    },
    "qdrant only": {
        "enable_external_retrieval": True,
        "enable_cascade_retrieval": False,
        "enable_graphrag": False,
    },
    "neo4j graphrag": {
        "enable_external_retrieval": True,
        "enable_graphrag": True,
        "enable_cascade_retrieval": False,
    },
    "in-memory": {
        "enable_external_retrieval": False,
        "enable_cascade_retrieval": False,
        "enable_graphrag": False,
    },
}

_DISTILLER_VARIANTS: dict[str, dict[str, Any]] = {
    "simple": {
        "distiller_mode": "simple",
    },
    "refrag": {
        # REFRAG-style LLM compression (Meta 2025) — uses the distiller_provider
        # (defaults to primary provider) to compress evidence before judging.
        "distiller_mode": "refrag",
    },
}

_PLANNER_VARIANTS: dict[str, dict[str, Any]] = {
    "step plan": {
        "planner_mode": "step-plan",
    },
    "tool-aware": {
        "planner_mode": "tool-aware",
    },
}

_QUERY_REWRITER_VARIANTS: dict[str, dict[str, Any]] = {
    "metadata-aware": {
        "query_rewriter_mode": "metadata-aware",
    },
    "hyde": {
        "query_rewriter_mode": "hyde",
    },
}

_REFLECTION_VARIANTS: dict[str, dict[str, Any]] = {
    "summary log": {
        "reflection_mode": "summary-log",
    },
    "evidence ledger": {
        "reflection_mode": "evidence-ledger",
    },
}

_POLICY_VARIANTS: dict[str, dict[str, Any]] = {
    "rule-gated": {
        "policy_mode": "rule-gated",
    },
    "policy agent": {
        "policy_mode": "policy-agent",
    },
}

_TEMPORAL_GRAPH_VARIANTS: dict[str, dict[str, Any]] = {
    "fact graph": {
        "temporal_graphrag_mode": "fact-graph",
    },
    "versioned graph": {
        "temporal_graphrag_mode": "versioned-graph",
    },
}


def _normalise(label: str | None) -> str:
    """Lowercase + strip for loose matching."""
    normalized = (label or "").strip().lower()
    normalized = normalized.replace("(", " ").replace(")", " ")
    return " ".join(normalized.split())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def settings_from_flow(nodes: list[FlowNodeState], base: Settings | None = None) -> Settings:
    """Return a new ``Settings`` instance derived from *base* (or defaults) with
    every field overridden according to the canvas node list.

    Only nodes that are *active* (or have no active concept, like required nodes)
    contribute their overrides.  Inactive optional nodes explicitly disable the
    corresponding flag.
    """
    # Start from a dict of the base settings so we can patch individual fields.
    if base is None:
        base = Settings()

    overrides: dict[str, Any] = base.model_dump(by_alias=False)

    # Index nodes by id for fast lookup
    by_id: dict[str, FlowNodeState] = {n.id: n for n in nodes}

    # ── provider ──────────────────────────────────────────────────────────
    if provider_node := by_id.get("provider"):
        variant_key = _normalise(provider_node.selected_variant)
        if patches := _PROVIDER_VARIANTS.get(variant_key):
            overrides.update(patches)

    # ── embeddings ────────────────────────────────────────────────────────
    if emb_node := by_id.get("embeddings"):
        variant_key = _normalise(emb_node.selected_variant)
        if patches := _EMBEDDING_VARIANTS.get(variant_key):
            overrides.update(patches)

    # ── retriever ─────────────────────────────────────────────────────────
    if ret_node := by_id.get("retriever"):
        variant_key = _normalise(ret_node.selected_variant)
        if patches := _RETRIEVER_VARIANTS.get(variant_key):
            overrides.update(patches)

    # ── agentic planner / rewriter / reflection / policy ────────────────
    if planner_node := by_id.get("planner"):
        overrides["enable_planner"] = planner_node.active
        if patches := _PLANNER_VARIANTS.get(_normalise(planner_node.selected_variant)):
            overrides.update(patches)

    if rewriter_node := by_id.get("query-rewriter"):
        overrides["enable_query_rewriter"] = rewriter_node.active
        if patches := _QUERY_REWRITER_VARIANTS.get(_normalise(rewriter_node.selected_variant)):
            overrides.update(patches)

    if reflection_node := by_id.get("reflection-memory"):
        overrides["enable_reflection_memory"] = reflection_node.active
        if patches := _REFLECTION_VARIANTS.get(_normalise(reflection_node.selected_variant)):
            overrides.update(patches)

    if policy_node := by_id.get("policy-loop"):
        overrides["enable_policy_loop"] = policy_node.active
        if patches := _POLICY_VARIANTS.get(_normalise(policy_node.selected_variant)):
            overrides.update(patches)

    if temporal_node := by_id.get("temporal-graphrag"):
        overrides["enable_temporal_graphrag"] = temporal_node.active
        if patches := _TEMPORAL_GRAPH_VARIANTS.get(_normalise(temporal_node.selected_variant)):
            overrides.update(patches)

    # ── optional modules — active flag drives the boolean toggle ──────────
    _toggle(overrides, by_id, node_id="reranker", flag="enable_reranker")
    _toggle(overrides, by_id, node_id="neo4j", flag="enable_graphrag")

    # ── distiller variant ─────────────────────────────────────────────────
    if dist_node := by_id.get("distiller"):
        variant_key = _normalise(dist_node.selected_variant)
        if patches := _DISTILLER_VARIANTS.get(variant_key):
            overrides.update(patches)
        # If node is inactive, fall back to simple (zero cost)
        if not dist_node.active:
            overrides["distiller_mode"] = "simple"

    # ── confidentiality ───────────────────────────────────────────────────
    if conf_node := by_id.get("confidentiality"):
        overrides["confidentiality_mode"] = conf_node.active

    # Reconstruct a validated Settings from the patched dict.
    # ``model_validate`` respects field aliases — use field names directly.
    return Settings.model_validate(overrides)


def run_flow(
    nodes: list[FlowNodeState],
    request: ValidationRequest,
    base_settings: Settings | None = None,
) -> DecisionResult:
    """Build a workflow from the canvas *nodes* config and run *request*."""
    settings = settings_from_flow(nodes, base=base_settings)
    workflow = ValidationWorkflow(settings=settings)
    return workflow.validate_issue(request)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _toggle(
    overrides: dict[str, Any],
    by_id: dict[str, "FlowNodeState"],
    *,
    node_id: str,
    flag: str,
) -> None:
    """Set *flag* in *overrides* to the ``active`` state of *node_id*, if present."""
    if node := by_id.get(node_id):
        overrides[flag] = node.active


def describe_flow(nodes: list[FlowNodeState]) -> dict[str, Any]:
    """Return a human-readable summary of what the canvas config will do.
    Useful for the dashboard "explain this flow" feature.
    """
    settings = settings_from_flow(nodes)
    by_id = {n.id: n for n in nodes}
    embedding_label = by_id.get("embeddings").selected_variant if by_id.get("embeddings") else None
    if embedding_label:
        embedding_model = embedding_label
    elif settings.default_provider == "gemini":
        embedding_model = settings.gemini_embedding_model
    else:
        embedding_model = settings.openai_embedding_model
    return {
        "provider": settings.default_provider,
        "llm_model": settings.openai_model if settings.default_provider == "openai"
                     else settings.gemini_model if settings.default_provider == "gemini"
                     else settings.ollama_model if settings.default_provider == "ollama"
                     else "mock-judge-v1",
        "embedding_model": embedding_model,
        "retrieval": {
            "external": settings.enable_external_retrieval,
            "graphrag": settings.enable_graphrag,
            "cascade": settings.enable_cascade_retrieval,
        },
        "agentic": {
            "planner": settings.enable_planner,
            "query_rewriter": settings.enable_query_rewriter,
            "reflection_memory": settings.enable_reflection_memory,
            "policy_loop": settings.enable_policy_loop,
            "temporal_graphrag": settings.enable_temporal_graphrag,
        },
        "reranker": settings.enable_reranker,
        "distiller": settings.distiller_mode,
        "planner_mode": settings.planner_mode,
        "query_rewriter_mode": settings.query_rewriter_mode,
        "reflection_mode": settings.reflection_mode,
        "policy_mode": settings.policy_mode,
        "temporal_graphrag_mode": settings.temporal_graphrag_mode,
        "confidentiality": settings.confidentiality_mode,
        "langgraph": settings.enable_langgraph,
        "dspy_active": (by_id["dspy"].active if "dspy" in by_id else False),
        "ragas_active": (by_id["ragas"].active if "ragas" in by_id else False),
    }
