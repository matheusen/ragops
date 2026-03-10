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
import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from jira_issue_rag.core.config import Settings
from jira_issue_rag.providers.mock_provider import MockProvider
from jira_issue_rag.services.audit import AuditStore
from jira_issue_rag.services.article_store import ArticleStore
from jira_issue_rag.services.decision import ProviderRouter
from jira_issue_rag.services.neo4j_store import Neo4jGraphStore
from jira_issue_rag.services.prompt_catalog import PromptCatalog
from jira_issue_rag.services.qdrant_store import QdrantStore
from jira_issue_rag.services.workflow import ValidationWorkflow
from jira_issue_rag.shared.models import (
    FlowDSPyOptimizationResult,
    FlowNodeState,
    FlowRunRequest,
    FlowRunResponse,
    PromptExecutionRequest,
)


# ---------------------------------------------------------------------------
# Variant label → model / flag overrides
# ---------------------------------------------------------------------------

_PROVIDER_VARIANTS: dict[str, dict[str, Any]] = {
    "gpt4o": {
        "default_provider": "openai",
        "openai_model": "gpt-4o",
        "allow_third_party_llm": True,
    },
    "gpt-4o": {
        "default_provider": "openai",
        "openai_model": "gpt-4o",
        "allow_third_party_llm": True,
    },
    "gpt4o-mini": {
        "default_provider": "openai",
        "openai_model": "gpt-4o-mini",
        "allow_third_party_llm": True,
    },
    "gpt-4o mini": {
        "default_provider": "openai",
        "openai_model": "gpt-4o-mini",
        "allow_third_party_llm": True,
    },
    "gpt41": {
        "default_provider": "openai",
        "openai_model": "gpt-4.1",
        "allow_third_party_llm": True,
    },
    "gpt-4.1": {
        "default_provider": "openai",
        "openai_model": "gpt-4.1",
        "allow_third_party_llm": True,
    },
    "gemini-flash": {
        "default_provider": "gemini",
        "gemini_model": "gemini-2.5-flash",
        "allow_third_party_llm": True,
    },
    "gemini 2.5 flash": {
        "default_provider": "gemini",
        "gemini_model": "gemini-2.5-flash",
        "allow_third_party_llm": True,
    },
    "gemini-pro": {
        "default_provider": "gemini",
        "gemini_model": "gemini-2.5-pro",
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
    "ollm": {
        "default_provider": "ollm",
        "allow_third_party_llm": False,
    },
    "ollm in-process": {
        "default_provider": "ollm",
        "allow_third_party_llm": False,
    },
    "ollm local offload": {
        "default_provider": "ollm",
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
    "openai-ada": {
        "openai_embedding_model": "text-embedding-ada-002",
        "embedding_dimension": 1536,
        "allow_third_party_embeddings": True,
    },
    "openai ada-002": {
        "openai_embedding_model": "text-embedding-ada-002",
        "embedding_dimension": 1536,
        "allow_third_party_embeddings": True,
    },
    "openai-3s": {
        "openai_embedding_model": "text-embedding-3-small",
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
    "hybrid": {
        "enable_external_retrieval": True,
        "enable_cascade_retrieval": False,
        "enable_graphrag": False,
    },
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
    "qdrant": {
        "enable_external_retrieval": True,
        "enable_cascade_retrieval": False,
        "enable_graphrag": False,
    },
    "qdrant only": {
        "enable_external_retrieval": True,
        "enable_cascade_retrieval": False,
        "enable_graphrag": False,
    },
    "neo4j": {
        "enable_external_retrieval": True,
        "enable_graphrag": True,
        "enable_cascade_retrieval": False,
    },
    "neo4j graphrag": {
        "enable_external_retrieval": True,
        "enable_graphrag": True,
        "enable_cascade_retrieval": False,
    },
    "memory": {
        "enable_external_retrieval": False,
        "enable_cascade_retrieval": False,
        "enable_graphrag": False,
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
    "step-plan": {
        "planner_mode": "step-plan",
    },
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
    "summary-log": {
        "reflection_mode": "summary-log",
    },
    "summary log": {
        "reflection_mode": "summary-log",
    },
    "evidence-ledger": {
        "reflection_mode": "evidence-ledger",
    },
    "evidence ledger": {
        "reflection_mode": "evidence-ledger",
    },
}

_POLICY_VARIANTS: dict[str, dict[str, Any]] = {
    "rule-gated": {
        "policy_mode": "rule-gated",
    },
    "policy-agent": {
        "policy_mode": "policy-agent",
    },
    "policy agent": {
        "policy_mode": "policy-agent",
    },
}

_TEMPORAL_GRAPH_VARIANTS: dict[str, dict[str, Any]] = {
    "fact-graph": {
        "temporal_graphrag_mode": "fact-graph",
    },
    "fact graph": {
        "temporal_graphrag_mode": "fact-graph",
    },
    "versioned-graph": {
        "temporal_graphrag_mode": "versioned-graph",
    },
    "versioned graph": {
        "temporal_graphrag_mode": "versioned-graph",
    },
}

_FLOW_MODE_VARIANTS: dict[str, str] = {
    "issue validation": "issue-validation",
    "jira issue triage": "issue-validation",
    "article analysis": "article-analysis",
}

_EXPLORATORY_ONLY_NODES = {"ragas"}

_SCENARIO_IGNORED_NODES: dict[str, set[str]] = {
    "issue-validation": set(_EXPLORATORY_ONLY_NODES),
    "article-analysis": {
        "dspy",
        *tuple(_EXPLORATORY_ONLY_NODES),
        "normalizer",
        "artifacts",
        "rules",
        "planner",
        "query-rewriter",
        "temporal-graphrag",
        "reranker",
        "distiller",
        "reflection-memory",
        "policy-loop",
        "result-norm",
        "audit",
    },
}


def _normalise(label: str | None) -> str:
    """Lowercase + strip for loose matching."""
    normalized = (label or "").strip().lower()
    normalized = normalized.replace("(", " ").replace(")", " ")
    return " ".join(normalized.split())


def resolve_flow_mode(nodes: list[FlowNodeState]) -> str:
    for node in nodes:
        if node.id != "flow-mode":
            continue
        return _FLOW_MODE_VARIANTS.get(_normalise(node.selected_variant), "issue-validation")
    return "issue-validation"


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
    _toggle(overrides, by_id, node_id="monkeyocr", flag="enable_monkeyocr_pdf_parser")
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


def _runtime_settings_from_flow(
    nodes: list[FlowNodeState],
    base: Settings | None = None,
) -> Settings:
    settings = settings_from_flow(nodes, base=copy.deepcopy(base) if base is not None else None)
    settings.enforce_runtime_policy()
    return settings


def run_flow(
    nodes: list[FlowNodeState],
    request: FlowRunRequest,
    base_settings: Settings | None = None,
) -> FlowRunResponse:
    """Build a runtime from the canvas *nodes* config and dispatch the selected flow mode."""
    settings = _runtime_settings_from_flow(nodes, base=base_settings)
    flow_mode = resolve_flow_mode(nodes)
    runtime_summary = describe_flow(nodes, base_settings=base_settings)
    dspy_result = _run_dspy_optimization(
        nodes=nodes,
        settings=settings,
        flow_mode=flow_mode,
        effective_provider=runtime_summary["provider"],
    )
    warnings = list(runtime_summary["warnings"])
    if dspy_result and dspy_result.skipped_reason:
        warnings.append(dspy_result.skipped_reason)

    workflow = ValidationWorkflow(settings=settings)
    if flow_mode == "article-analysis":
        if request.article is None:
            raise ValueError("Flow mode 'article-analysis' requires the 'article' payload.")
        article_store = ArticleStore(settings=settings)
        article_request = request.article
        query_text = (
            article_request.search_query
            or article_request.title
            or article_request.content[:280]
        ).strip()
        graph_assessment = article_store.assess_graph_usefulness(query_text) if query_text else None
        article_search = article_store.search(
            query=query_text,
            top_k=article_request.top_k,
            collection=article_request.collection,
            retrieval_policy=article_request.retrieval_policy,
            tenant_id=article_request.tenant_id,
            source_tags=article_request.source_tags,
            source_contains=article_request.source_contains,
            exact_match_required=article_request.exact_match_required,
            enable_corrective_rag=article_request.enable_corrective_rag,
        ) if query_text else []
        if any(item.retrieval_mode == "corrective" for item in article_search):
            warnings.append("Corrective retrieval was triggered for this article query.")
        if query_text and article_store.retrieval_requires_human_review(
            query_text,
            article_search,
            exact_match_required=article_request.exact_match_required,
        ):
            warnings.append("Retrieval quality remained weak after routing; human review is recommended.")
        related_articles = article_store.related_articles(
            doc_id=article_request.related_doc_id,
            limit=article_request.related_limit,
        ) if article_request.related_doc_id else []
        article_benchmark = article_store.benchmark_query_modes(
            query=query_text,
            top_k=min(article_request.top_k, 4),
            collection=article_request.collection,
            tenant_id=article_request.tenant_id,
            source_tags=article_request.source_tags,
            source_contains=article_request.source_contains,
            exact_match_required=article_request.exact_match_required,
            enable_corrective_rag=article_request.enable_corrective_rag,
        ) if query_text else None
        article_distillation = (
            article_store.distill_for_small_model(
                query=query_text,
                results=article_search,
                assessment=graph_assessment,
            )
            if query_text and article_search and article_request.use_small_model_distillation
            else None
        )

        prompt_content = article_request.content.strip()
        if article_distillation is not None:
            prompt_content = (
                f"{prompt_content}\n\nContexto grafo-destilado para modelo menor:\n{article_distillation.context_text}"
            ).strip()
        elif article_search:
            retrieved_context = "\n\n".join(
                f"[{item.title} #{item.chunk_index}] {item.content[:480]}"
                for item in article_search[:article_request.top_k]
            )
            prompt_content = (
                f"{prompt_content}\n\nContexto adicional recuperado do corpus de artigos:\n{retrieved_context}"
            ).strip()

        prompt_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name=article_request.prompt_name,
                content=prompt_content,
                provider=article_request.provider,
                title=article_request.title,
                metadata=article_request.metadata,
            )
        )
        write_article_analysis_audit(
            settings=settings,
            article_request=article_request,
            prompt_result=prompt_result,
            article_search=article_search,
            related_articles=related_articles,
            query_text=query_text,
            warnings=_dedupe_warnings(warnings),
            runtime_summary=runtime_summary,
            graph_assessment=graph_assessment,
            article_distillation=article_distillation,
            article_benchmark=article_benchmark,
        )
        return FlowRunResponse(
            flow_mode=flow_mode,
            prompt_execution=prompt_result,
            article_search=article_search,
            related_articles=related_articles,
            article_graph_assessment=graph_assessment,
            article_distillation=article_distillation,
            article_benchmark=article_benchmark,
            dspy_optimization=dspy_result,
            warnings=_dedupe_warnings(warnings),
        )

    if request.validation is None:
        raise ValueError("Flow mode 'issue-validation' requires the 'validation' payload.")
    return FlowRunResponse(
        flow_mode=flow_mode,
        decision=workflow.validate_issue(request.validation),
        dspy_optimization=dspy_result,
        warnings=_dedupe_warnings(warnings),
    )


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


def _run_dspy_optimization(
    *,
    nodes: list[FlowNodeState],
    settings: Settings,
    flow_mode: str,
    effective_provider: str,
) -> FlowDSPyOptimizationResult | None:
    by_id = {node.id: node for node in nodes}
    if not by_id.get("dspy", FlowNodeState(id="dspy", active=False)).active:
        return None

    result = FlowDSPyOptimizationResult(
        active=True,
        optimizer="gepa",
        provider=effective_provider,
    )

    if flow_mode != "issue-validation":
        result.skipped_reason = (
            "DSPy + GEPA currently targets the issue-validation golden dataset and is skipped for article-analysis."
        )
        result.history_file = _write_dspy_history(
            settings=settings,
            result=result,
            flow_mode=flow_mode,
        )
        return result

    if not settings.golden_dataset_path.exists():
        result.skipped_reason = (
            f"DSPy + GEPA skipped because the golden dataset was not found at '{settings.golden_dataset_path}'."
        )
        result.history_file = _write_dspy_history(
            settings=settings,
            result=result,
            flow_mode=flow_mode,
        )
        return result

    if effective_provider not in {"openai", "gemini", "ollama"}:
        result.skipped_reason = (
            f"DSPy + GEPA requires openai, gemini or ollama, but the current runtime provider is '{effective_provider}'."
        )
        result.history_file = _write_dspy_history(
            settings=settings,
            result=result,
            flow_mode=flow_mode,
        )
        return result

    try:
        from jira_issue_rag.services.dspy_optimizer import DSPyOptimizationLab
    except Exception as exc:
        result.skipped_reason = f"DSPy + GEPA is not available in this environment: {exc}"
        result.history_file = _write_dspy_history(
            settings=settings,
            result=result,
            flow_mode=flow_mode,
        )
        return result

    try:
        lab = DSPyOptimizationLab(settings)
        lab.configure_lm(provider=effective_provider)
        opt_result = lab.optimize(
            golden_path=settings.golden_dataset_path,
            optimizer="gepa",
        )
        exported = lab.export_to_prompts(opt_result["program"], output_dir=settings.prompts_dir)
    except Exception as exc:
        result.skipped_reason = f"DSPy + GEPA failed at runtime: {exc}"
        result.history_file = _write_dspy_history(
            settings=settings,
            result=result,
            flow_mode=flow_mode,
        )
        return result

    result.triggered = True
    result.dev_score = opt_result.get("dev_score")
    result.exported_files = exported
    result.history_file = _write_dspy_history(
        settings=settings,
        result=result,
        flow_mode=flow_mode,
    )
    return result


def _dedupe_warnings(warnings: list[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for warning in warnings:
        if not warning or warning in seen:
            continue
        seen.add(warning)
        unique.append(warning)
    return unique


def _write_dspy_history(
    *,
    settings: Settings,
    result: FlowDSPyOptimizationResult,
    flow_mode: str,
) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    optimizer = (result.optimizer or "gepa").lower().replace(" ", "-")
    provider = (result.provider or "unknown").lower().replace(" ", "-")
    target_dir = settings.dspy_lab_dir / "runs"
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{timestamp}__{optimizer}__{provider}.json"
    payload = {
        "timestamp": timestamp,
        "flow_mode": flow_mode,
        "optimizer": result.optimizer,
        "provider": result.provider,
        "triggered": result.triggered,
        "skipped_reason": result.skipped_reason,
        "dev_score": result.dev_score,
        "exported_files": result.exported_files,
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return str(path)


def write_article_analysis_audit(
    *,
    settings: Settings,
    article_request: Any,
    prompt_result: Any,
    article_search: list[Any],
    related_articles: list[dict[str, Any]],
    query_text: str,
    warnings: list[str],
    runtime_summary: dict[str, Any] | None = None,
    graph_assessment: Any | None = None,
    article_distillation: Any | None = None,
    article_benchmark: Any | None = None,
) -> str:
    source = str(
        article_request.metadata.get("source")
        or article_request.metadata.get("source_path")
        or article_request.metadata.get("file_name")
        or ""
    )
    source_seed = source or article_request.title or article_request.content[:120]
    digest = hashlib.sha1(source_seed.encode("utf-8")).hexdigest()[:6].upper()
    issue_key = f"ARTICLE-{digest}"
    artifact_id = f"article:{hashlib.sha1((article_request.title + source + article_request.content[:500]).encode('utf-8')).hexdigest()}"
    artifact_kind = "pdf" if source.lower().endswith(".pdf") else "text"
    runtime_payload = dict(runtime_summary or {})
    runtime_payload.update(
        {
            "flow_mode": str(runtime_payload.get("flow_mode") or "article-analysis"),
            "provider": prompt_result.provider,
            "llm_model": prompt_result.model,
            "model": prompt_result.model,
            "prompt_name": prompt_result.prompt_name,
            "query_text": query_text,
            "collection": article_request.collection,
            "retrieval_policy": article_request.retrieval_policy,
            "tenant_id": article_request.tenant_id,
            "source_tags": article_request.source_tags,
            "source_contains": article_request.source_contains,
            "exact_match_required": article_request.exact_match_required,
            "graph_assessment": graph_assessment.model_dump(mode="json") if hasattr(graph_assessment, "model_dump") else graph_assessment,
            "search_hits": len(article_search),
            "warnings": _dedupe_warnings([*warnings, *runtime_payload.get("warnings", [])] if isinstance(runtime_payload.get("warnings"), list) else warnings),
        }
    )

    audit_path = AuditStore(settings.audit_dir).write(
        issue_key=issue_key,
        payload={
            "run_kind": "article-analysis",
            "issue": {
                "issue_key": issue_key,
                "summary": article_request.title,
                "description": article_request.content[:4000],
                "comments": [],
                "acceptance_criteria": [],
                "reproduction_steps": [],
                "expected_behavior": "",
                "actual_behavior": "",
                "priority": None,
                "issue_type": "Article",
                "status": None,
                "project": None,
                "component": None,
                "service": None,
                "environment": None,
                "affected_version": None,
                "labels": ["article-analysis"],
                "issue_links": [],
                "attachments": [],
                "changelog": [],
                "collected_at": datetime.now(timezone.utc).isoformat(),
            },
            "attachment_facts": {
                "issue_key": issue_key,
                "artifacts": [
                    {
                        "artifact_id": artifact_id,
                        "artifact_type": artifact_kind,
                        "source_path": source or article_request.title,
                        "extracted_text": article_request.content,
                        "facts": {
                            "article_title": article_request.title,
                            "primary_theme": str(article_request.metadata.get("theme") or ""),
                            "secondary_themes": article_request.metadata.get("tags", []),
                        },
                        "confidence": 1.0,
                    }
                ],
                "contradictions": [],
                "missing_information": [],
            },
            "rule_evaluation": {
                "missing_items": [],
                "contradictions": [],
                "financial_impact_detected": False,
                "requires_human_review": False,
                "results": [],
            },
            "retrieved": [item.model_dump(mode="json") for item in article_search],
            "distilled": {
                "key_facts": [],
                "preserved_quotes": [],
                "evidence": [],
            },
            "decision": {
                "issue_key": issue_key,
                "classification": "article_analysis",
                "is_bug": False,
                "is_complete": True,
                "ready_for_dev": True,
                "confidence": 1.0,
                "missing_items": [],
                "evidence_used": [item.chunk_id for item in article_search],
                "contradictions": [],
                "financial_impact_detected": False,
                "requires_human_review": False,
                "rationale": prompt_result.output_text,
                "provider": prompt_result.provider,
                "model": prompt_result.model,
            },
            "prompt_execution": prompt_result.model_dump(mode="json"),
            "article_run": {
                "title": article_request.title,
                "source": source,
                "prompt_name": article_request.prompt_name,
                "search_query": query_text,
                "collection": article_request.collection,
                "retrieval_policy": article_request.retrieval_policy,
                "tenant_id": article_request.tenant_id,
                "source_tags": article_request.source_tags,
                "source_contains": article_request.source_contains,
                "exact_match_required": article_request.exact_match_required,
                "enable_corrective_rag": article_request.enable_corrective_rag,
                "prompt_chunk_ids": [item.chunk_id for item in article_search],
                "top_k": article_request.top_k,
                "related_doc_id": article_request.related_doc_id,
                "related_limit": article_request.related_limit,
                "use_small_model_distillation": article_request.use_small_model_distillation,
                "metadata": article_request.metadata,
                "content_excerpt": article_request.content[:4000],
                "output_text": prompt_result.output_text,
                "warnings": warnings,
                "related_articles": related_articles,
                "graph_assessment": graph_assessment.model_dump(mode="json") if hasattr(graph_assessment, "model_dump") else graph_assessment,
                "distillation": article_distillation.model_dump(mode="json") if hasattr(article_distillation, "model_dump") else article_distillation,
                "benchmark": article_benchmark.model_dump(mode="json") if hasattr(article_benchmark, "model_dump") else article_benchmark,
            },
            "runtime": {
                **runtime_payload,
            },
        },
    )
    return audit_path


def describe_flow(
    nodes: list[FlowNodeState],
    base_settings: Settings | None = None,
) -> dict[str, Any]:
    """Return a human-readable summary of what the canvas config will do.
    Useful for the dashboard "explain this flow" feature.
    """
    configured_settings = settings_from_flow(
        nodes,
        base=copy.deepcopy(base_settings) if base_settings is not None else None,
    )
    settings = _runtime_settings_from_flow(nodes, base=base_settings)
    flow_mode = resolve_flow_mode(nodes)
    by_id = {n.id: n for n in nodes}
    provider_info = _resolve_effective_provider(settings=settings)
    qdrant_available = QdrantStore(settings).is_available()
    neo4j_available = Neo4jGraphStore(settings).is_available()
    embedding_label = by_id.get("embeddings").selected_variant if by_id.get("embeddings") else None
    if embedding_label:
        embedding_model = embedding_label
    elif settings.default_provider == "gemini":
        embedding_model = settings.gemini_embedding_model
    else:
        embedding_model = settings.openai_embedding_model
    ignored_nodes = [
        node.id
        for node in nodes
        if node.active and node.id in _SCENARIO_IGNORED_NODES.get(flow_mode, set())
    ]
    supported_runtime_nodes = [
        node.id
        for node in nodes
        if node.active and node.id not in _SCENARIO_IGNORED_NODES.get(flow_mode, set())
    ]
    warnings = _build_describe_warnings(
        nodes=nodes,
        flow_mode=flow_mode,
        settings=settings,
        configured_settings=configured_settings,
        ignored_nodes=ignored_nodes,
        provider_warning=provider_info["warning"],
        effective_provider=provider_info["provider"],
        qdrant_available=qdrant_available,
        neo4j_available=neo4j_available,
    )
    return {
        "flow_mode": flow_mode,
        "provider": provider_info["provider"],
        "llm_model": provider_info["model"],
        "configured_provider": configured_settings.default_provider,
        "configured_llm_model": _llm_model_for_provider(
            configured_settings,
            configured_settings.default_provider,
        ),
        "embedding_model": embedding_model,
        "retrieval": {
            "external": qdrant_available,
            "graphrag": neo4j_available,
            "cascade": qdrant_available and settings.enable_cascade_retrieval,
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
        "monkeyocr": settings.enable_monkeyocr_pdf_parser,
        "dspy_active": (by_id["dspy"].active if "dspy" in by_id else False),
        "ragas_active": (by_id["ragas"].active if "ragas" in by_id else False),
        "supported_runtime_nodes": supported_runtime_nodes,
        "ignored_nodes": ignored_nodes,
        "warnings": warnings,
    }


def _llm_model_for_provider(settings: Settings, provider_name: str) -> str:
    lowered = (provider_name or "mock").lower()
    if lowered == "openai":
        return settings.openai_model
    if lowered == "gemini":
        return settings.gemini_model
    if lowered == "ollama":
        return settings.ollama_model
    if lowered == "ollm":
        return settings.ollm_model
    return settings.primary_model


def _resolve_effective_provider(settings: Settings) -> dict[str, str]:
    router = ProviderRouter(settings)
    configured_provider = settings.default_provider
    provider = router._get_provider(configured_provider)
    warning = ""
    if not provider.is_available():
        warning = (
            f"Provider '{configured_provider}' is not available in the current runtime; "
            "the flow will fall back to mock."
        )
        provider = MockProvider(settings.primary_model)
    return {
        "provider": provider.provider_name,
        "model": provider.model_name,
        "warning": warning,
    }


def _build_describe_warnings(
    *,
    nodes: list[FlowNodeState],
    flow_mode: str,
    settings: Settings,
    configured_settings: Settings,
    ignored_nodes: list[str],
    provider_warning: str,
    effective_provider: str,
    qdrant_available: bool,
    neo4j_available: bool,
) -> list[str]:
    warnings: list[str] = []
    by_id = {node.id: node for node in nodes}

    if provider_warning:
        warnings.append(provider_warning)

    if configured_settings.enable_external_retrieval and not qdrant_available:
        warnings.append(
            "External retrieval is configured in the canvas, but Qdrant is not available. "
            "The flow will use only in-memory evidence plus local policies."
        )

    if configured_settings.enable_graphrag and not neo4j_available:
        warnings.append(
            "GraphRAG is configured in the canvas, but Neo4j is not available. "
            "Related-issue graph traversal will be skipped."
        )

    if configured_settings.enable_monkeyocr_pdf_parser:
        warnings.append(
            "MonkeyOCR is enabled in the flow. PDF parsing will try the local sidecar first and silently fall back if it is unavailable."
        )

    if ignored_nodes:
        warnings.append(
            "Some active nodes do not affect the selected /run-flow runtime: "
            + ", ".join(sorted(ignored_nodes))
            + "."
        )

    retriever_label = _normalise(by_id.get("retriever").selected_variant if by_id.get("retriever") else None)
    if retriever_label == "neo4j graphrag" and not by_id.get("neo4j", FlowNodeState(id="neo4j")).active:
        warnings.append(
            "Retriever variant 'Neo4j GraphRAG' overlaps with the separate Neo4j node. "
            "Keep the Neo4j node active if you expect graph retrieval."
        )

    if not settings.enable_langgraph and any(
        settings_flag
        for settings_flag in (
            settings.enable_planner,
            settings.enable_query_rewriter,
            settings.enable_reflection_memory,
            settings.enable_policy_loop,
        )
    ):
        warnings.append(
            "Agentic nodes depend on LangGraph. Enable LangGraph in runtime settings for planner, rewriter, reflection and policy loop to execute."
        )

    if flow_mode == "article-analysis":
        warnings.append(
            "Article-analysis mode currently runs through PromptCatalog plus optional ArticleStore search. "
            "Issue-specific nodes such as normalizer, rules and audit are ignored."
        )

    dspy_active = by_id.get("dspy", FlowNodeState(id="dspy", active=False)).active
    if dspy_active:
        if flow_mode != "issue-validation":
            warnings.append(
                "DSPy + GEPA is wired only for issue-validation. In article-analysis mode, the DSPy node is skipped."
            )
        elif not settings.golden_dataset_path.exists():
            warnings.append(
                f"DSPy + GEPA needs a golden dataset, but '{settings.golden_dataset_path}' does not exist."
            )
        elif _normalise(effective_provider) not in {"openai", "gemini", "ollama"}:
            warnings.append(
                "DSPy + GEPA requires an OpenAI, Gemini or Ollama runtime provider. "
                f"Current effective provider: {effective_provider}."
            )

    try:
        prompt_catalog = PromptCatalog(settings.prompts_dir)
        if not prompt_catalog.list_prompts():
            warnings.append(
                f"No prompts were found in '{settings.prompts_dir}'. Prompt-driven runs such as article_analysis will fail."
            )
    except Exception as exc:
        warnings.append(f"Prompt catalog could not be read from '{settings.prompts_dir}': {exc}")

    unique_warnings: list[str] = []
    seen: set[str] = set()
    for warning in warnings:
        if warning in seen:
            continue
        seen.add(warning)
        unique_warnings.append(warning)
    return unique_warnings
