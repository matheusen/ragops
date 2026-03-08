"""
Neo4j GraphRAG layer — optional second store.

Activated when ENABLE_GRAPHRAG=true and NEO4J_URL is set.

Graph schema:
    (:Issue {key, summary, project, component, service, environment, issue_type})
    (:Component {name})
    (:Service {name})
    (:Environment {name})
    (:ErrorFingerprint {value})

Relationships:
    (Issue)-[:LINKS_TO {relation}]->(Issue)          # from issue_links
    (Issue)-[:IN_COMPONENT]->(Component)
    (Issue)-[:USES_SERVICE]->(Service)
    (Issue)-[:REPRODUCED_IN]->(Environment)
    (Issue)-[:HAS_ERROR]->(ErrorFingerprint)

Retrieval:
    Depth-2 neighbourhood of an issue key:
    similar issues, duplicates, root causes, component siblings, error siblings.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from jira_issue_rag.shared.models import IssueCanonical, RetrievedEvidence

if TYPE_CHECKING:
    from jira_issue_rag.core.config import Settings


def _neo4j_driver(url: str, user: str, password: str, database: str) -> Any:
    try:
        import neo4j  # type: ignore[import-untyped]
        return neo4j.GraphDatabase.driver(url, auth=(user, password)), database
    except ImportError as exc:
        raise ImportError(
            "neo4j is not installed. Install it with: pip install -e '.[graphrag]'"
        ) from exc


# ──────────────────────────────────────────────────────────────────────────────
# Index queries
# ──────────────────────────────────────────────────────────────────────────────

_UPSERT_ISSUE = """
MERGE (i:Issue {key: $key})
SET i.summary       = $summary,
    i.project       = $project,
    i.component     = $component,
    i.service       = $service,
    i.environment   = $environment,
    i.issue_type    = $issue_type,
    i.priority      = $priority,
    i.status        = $status,
    i.affected_version = $affected_version,
    i.collected_at  = $collected_at,
    i.latest_change_at = $latest_change_at
"""

_UPSERT_COMPONENT = """
MERGE (c:Component {name: $name})
WITH c
MATCH (i:Issue {key: $issue_key})
MERGE (i)-[:IN_COMPONENT]->(c)
"""

_UPSERT_SERVICE = """
MERGE (s:Service {name: $name})
WITH s
MATCH (i:Issue {key: $issue_key})
MERGE (i)-[:USES_SERVICE]->(s)
"""

_UPSERT_ENV = """
MERGE (e:Environment {name: $name})
WITH e
MATCH (i:Issue {key: $issue_key})
MERGE (i)-[:REPRODUCED_IN]->(e)
"""

_UPSERT_LINK = """
MATCH (a:Issue {key: $from_key})
MERGE (b:Issue {key: $to_key})
MERGE (a)-[:LINKS_TO {relation: $relation}]->(b)
"""

_UPSERT_ERROR = """
MERGE (e:ErrorFingerprint {value: $fingerprint})
WITH e
MATCH (i:Issue {key: $issue_key})
MERGE (i)-[:HAS_ERROR]->(e)
"""

# ──────────────────────────────────────────────────────────────────────────────
# Retrieval query — depth-2 neighbourhood
# ──────────────────────────────────────────────────────────────────────────────

_GRAPH_SEARCH = """
MATCH (root:Issue {key: $issue_key})
CALL {
    WITH root
    MATCH (root)-[r1:LINKS_TO|IN_COMPONENT|USES_SERVICE|REPRODUCED_IN|HAS_ERROR]-(mid)
    OPTIONAL MATCH (mid)-[r2]-(leaf:Issue)
    WHERE leaf.key <> root.key
    RETURN collect(DISTINCT {
        key:     coalesce(leaf.key, mid.key, ''),
        summary: coalesce(leaf.summary, toString(mid), ''),
        rel:     type(r1),
        depth:   CASE WHEN leaf IS NOT NULL THEN 2 ELSE 1 END
    }) AS neighbours
}
UNWIND neighbours AS n
WITH DISTINCT n
WHERE n.key <> '' AND n.key <> $issue_key
RETURN n.key AS key, n.summary AS summary, n.rel AS relation, n.depth AS depth
ORDER BY depth ASC, relation ASC
LIMIT $limit
"""

_SIMILAR_ERRORS = """
MATCH (root:Issue {key: $issue_key})-[:HAS_ERROR]->(fp:ErrorFingerprint)<-[:HAS_ERROR]-(other:Issue)
WHERE other.key <> $issue_key
RETURN DISTINCT other.key AS key, other.summary AS summary, 'shared_error' AS relation, 1 AS depth
ORDER BY other.key
LIMIT $limit
"""


class Neo4jGraphStore:
    def __init__(self, settings: "Settings") -> None:
        self.settings = settings
        self._driver: Any = None
        self._database: str = settings.neo4j_database

    # ── lifecycle ──────────────────────────────────────────────────────────────

    def is_available(self) -> bool:
        return bool(
            self.settings.enable_graphrag
            and self.settings.neo4j_url
            and self.settings.neo4j_user
            and self.settings.neo4j_password
        )

    def _get_driver(self) -> Any:
        if self._driver is None:
            self._driver, self._database = _neo4j_driver(
                url=self.settings.neo4j_url,  # type: ignore[arg-type]
                user=self.settings.neo4j_user,  # type: ignore[arg-type]
                password=self.settings.neo4j_password,  # type: ignore[arg-type]
                database=self.settings.neo4j_database,
            )
        return self._driver

    def close(self) -> None:
        if self._driver is not None:
            self._driver.close()
            self._driver = None

    def ensure_constraints(self) -> None:
        """Create uniqueness constraints once on first use."""
        if not self.is_available():
            return
        constraints = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (i:Issue) REQUIRE i.key IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Component) REQUIRE c.name IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (s:Service) REQUIRE s.name IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (e:Environment) REQUIRE e.name IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (f:ErrorFingerprint) REQUIRE f.value IS UNIQUE",
        ]
        with self._get_driver().session(database=self._database) as session:
            for cypher in constraints:
                try:
                    session.run(cypher)
                except Exception:  # pragma: no cover — constraint may already exist
                    pass

    # ── indexing ───────────────────────────────────────────────────────────────

    def index_issue(self, issue: IssueCanonical, error_fingerprints: list[str] | None = None) -> None:
        """Upsert issue node + all relationship nodes into the graph."""
        if not self.is_available():
            return
        self.ensure_constraints()
        latest_change_at = max(
            (event.changed_at for event in issue.changelog if event.changed_at is not None),
            default=None,
        )
        with self._get_driver().session(database=self._database) as session:
            session.run(
                _UPSERT_ISSUE,
                key=issue.issue_key,
                summary=issue.summary,
                project=issue.project or "",
                component=issue.component or "",
                service=issue.service or "",
                environment=issue.environment or "",
                issue_type=issue.issue_type,
                priority=issue.priority or "",
                status=issue.status or "",
                affected_version=issue.affected_version or "",
                collected_at=issue.collected_at.isoformat(),
                latest_change_at=latest_change_at.isoformat() if latest_change_at else "",
            )
            if issue.component:
                session.run(_UPSERT_COMPONENT, name=issue.component, issue_key=issue.issue_key)
            if issue.service:
                session.run(_UPSERT_SERVICE, name=issue.service, issue_key=issue.issue_key)
            if issue.environment:
                session.run(_UPSERT_ENV, name=issue.environment, issue_key=issue.issue_key)
            for link in issue.issue_links:
                session.run(
                    _UPSERT_LINK,
                    from_key=issue.issue_key,
                    to_key=link.key.upper().strip(),
                    relation=link.relation or link.link_type,
                )
            for fp in (error_fingerprints or []):
                if fp.strip():
                    session.run(_UPSERT_ERROR, fingerprint=fp.strip(), issue_key=issue.issue_key)

    # ── retrieval ──────────────────────────────────────────────────────────────

    def search_related(
        self,
        issue: IssueCanonical,
        limit: int = 10,
    ) -> list[RetrievedEvidence]:
        """
        Return graph-aware retrieved evidence for an issue:
        depth-2 neighbourhood + issues sharing the same error fingerprints.
        """
        if not self.is_available():
            return []
        results: list[RetrievedEvidence] = []
        seen: set[str] = set()

        with self._get_driver().session(database=self._database) as session:
            # Neighbourhood traversal
            for record in session.run(
                _GRAPH_SEARCH,
                issue_key=issue.issue_key,
                limit=limit,
            ):
                key = record["key"]
                if key in seen:
                    continue
                seen.add(key)
                depth = int(record["depth"])
                relation = str(record["relation"])
                summary = str(record.get("summary") or "")
                score = 0.70 if depth == 1 else 0.55
                if relation in {"LINKS_TO", "shared_error"}:
                    score += 0.10
                results.append(
                    RetrievedEvidence(
                        evidence_id=f"graph:{issue.issue_key}:{key}",
                        source=f"neo4j:{key}",
                        content=f"Related issue {key}: {summary}" if summary else f"Related issue {key}",
                        metadata={
                            "category": "graph",
                            "backend": "neo4j",
                            "relation": relation,
                            "depth": depth,
                            "issue_key": key,
                        },
                        sparse_score=0.0,
                        dense_score=0.0,
                        final_score=round(score, 4),
                    )
                )

            # Shared error fingerprints (high-signal sibling issues)
            for record in session.run(
                _SIMILAR_ERRORS,
                issue_key=issue.issue_key,
                limit=limit,
            ):
                key = record["key"]
                if key in seen:
                    continue
                seen.add(key)
                summary = str(record.get("summary") or "")
                results.append(
                    RetrievedEvidence(
                        evidence_id=f"graph:error:{issue.issue_key}:{key}",
                        source=f"neo4j:{key}",
                        content=f"Issue {key} shares error fingerprint: {summary}",
                        metadata={
                            "category": "graph",
                            "backend": "neo4j",
                            "relation": "shared_error",
                            "depth": 1,
                            "issue_key": key,
                        },
                        sparse_score=0.0,
                        dense_score=0.0,
                        final_score=0.72,
                    )
                )

        return sorted(results, key=lambda x: x.final_score, reverse=True)[:limit]
