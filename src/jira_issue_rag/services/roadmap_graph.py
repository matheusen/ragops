"""
Roadmap Graph — Neo4j layer for roadmap mind map structure.

Schema:
  (:RoadmapGoal  {roadmap_id, node_id, title, goal})
  (:RoadmapPhase {roadmap_id, node_id, title, duration, color, phase_index})
  (:RoadmapTopic {roadmap_id, node_id, title, description, color, node_type})
    node_type: "topic" | "subtopic"

Relationships:
  (Goal)  -[:HAS_PHASE]->  (Phase)
  (Phase) -[:HAS_TOPIC]->  (Topic)
  (Topic) -[:EXPANDED_TO]-> (Topic)   # expanded subtopics

Key queries:
  get_node_neighbourhood(roadmap_id, node_id) → structured context text for LLM
  sync_roadmap(doc)                           → full upsert from MongoDB doc
  sync_expanded_node(...)                     → add a newly expanded subtopic
  delete_roadmap(roadmap_id)                  → remove all nodes for a roadmap
"""
from __future__ import annotations

from typing import Any


# ── Cypher — constraints ──────────────────────────────────────────────────────

_CONSTRAINTS = [
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:RoadmapGoal)  REQUIRE (n.roadmap_id, n.node_id) IS NODE KEY",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:RoadmapPhase) REQUIRE (n.roadmap_id, n.node_id) IS NODE KEY",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:RoadmapTopic) REQUIRE (n.roadmap_id, n.node_id) IS NODE KEY",
]

# ── Cypher — upserts ──────────────────────────────────────────────────────────

_UPSERT_GOAL = """
MERGE (n:RoadmapGoal {roadmap_id: $roadmap_id, node_id: $node_id})
SET n.title = $title, n.goal = $goal
"""

_UPSERT_PHASE = """
MERGE (n:RoadmapPhase {roadmap_id: $roadmap_id, node_id: $node_id})
SET n.title = $title, n.duration = $duration, n.color = $color, n.phase_index = $phase_index
WITH n
MATCH (g:RoadmapGoal {roadmap_id: $roadmap_id, node_id: 'goal'})
MERGE (g)-[:HAS_PHASE]->(n)
"""

_UPSERT_TOPIC = """
MERGE (n:RoadmapTopic {roadmap_id: $roadmap_id, node_id: $node_id})
SET n.title = $title, n.description = $description, n.color = $color, n.node_type = $node_type
WITH n
MATCH (p:RoadmapPhase {roadmap_id: $roadmap_id, node_id: $parent_id})
MERGE (p)-[:HAS_TOPIC]->(n)
"""

_UPSERT_SUBTOPIC = """
MERGE (n:RoadmapTopic {roadmap_id: $roadmap_id, node_id: $node_id})
SET n.title = $title, n.description = $description, n.color = $color, n.node_type = 'subtopic'
WITH n
MATCH (p:RoadmapTopic {roadmap_id: $roadmap_id, node_id: $parent_id})
MERGE (p)-[:EXPANDED_TO]->(n)
"""

_DELETE_ROADMAP = """
MATCH (n {roadmap_id: $roadmap_id})
DETACH DELETE n
"""

# ── Cypher — neighbourhood query ──────────────────────────────────────────────

_NEIGHBOURHOOD = """
// Find node regardless of label
MATCH (n {roadmap_id: $roadmap_id, node_id: $node_id})

// Parent (phase or topic that points to n)
OPTIONAL MATCH (parent)-[:HAS_TOPIC|HAS_PHASE|EXPANDED_TO]->(n)

// Children of n
OPTIONAL MATCH (n)-[:HAS_TOPIC|HAS_PHASE|EXPANDED_TO]->(child)

// Siblings (same parent, same level)
OPTIONAL MATCH (parent)-[:HAS_TOPIC|HAS_PHASE]->(sibling)
  WHERE sibling.node_id <> n.node_id

// Grandparent (phase parent of the topic's parent, if parent is a phase)
OPTIONAL MATCH (gp:RoadmapGoal)-[:HAS_PHASE]->(parent)

RETURN
  n.title        AS title,
  n.description  AS description,
  n.node_type    AS node_type,
  labels(n)      AS labels,
  parent.title   AS parent_title,
  parent.node_id AS parent_id,
  gp.title       AS grandparent_title,
  collect(DISTINCT child.title)   AS children,
  collect(DISTINCT sibling.title) AS siblings
"""

_FULL_PATH = """
MATCH path = (g:RoadmapGoal {roadmap_id: $roadmap_id})-[*1..5]->(n {roadmap_id: $roadmap_id, node_id: $node_id})
RETURN [node IN nodes(path) | node.title] AS path_titles
ORDER BY length(path) ASC
LIMIT 1
"""

# ── Cypher — full roadmap context ─────────────────────────────────────────────

_FULL_ROADMAP_CONTEXT = """
MATCH (g:RoadmapGoal {roadmap_id: $roadmap_id})
OPTIONAL MATCH (g)-[:HAS_PHASE]->(ph:RoadmapPhase)
OPTIONAL MATCH (ph)-[:HAS_TOPIC]->(t:RoadmapTopic)
OPTIONAL MATCH (t)-[:EXPANDED_TO]->(st:RoadmapTopic)
RETURN
  g.title        AS goal_title,
  g.goal         AS goal,
  ph.title       AS phase_title,
  ph.duration    AS phase_duration,
  ph.phase_index AS phase_index,
  t.title        AS topic_title,
  t.description  AS topic_desc,
  t.node_id      AS topic_id,
  collect(DISTINCT {title: st.title, description: st.description}) AS subtopics
ORDER BY ph.phase_index, t.title
"""


def _get_driver(url: str, user: str, password: str) -> Any:
    try:
        import neo4j  # type: ignore[import-untyped]
        return neo4j.GraphDatabase.driver(url, auth=(user, password))
    except ImportError as exc:
        raise ImportError("neo4j not installed — pip install neo4j") from exc


class RoadmapGraphService:
    """Manages the Neo4j graph for one or more roadmaps."""

    def __init__(self, url: str, user: str, password: str, database: str = "neo4j") -> None:
        self._driver = _get_driver(url, user, password)
        self._db = database
        self._constraints_done = False

    def close(self) -> None:
        self._driver.close()

    # ── constraints ───────────────────────────────────────────────────────────

    def _ensure_constraints(self) -> None:
        if self._constraints_done:
            return
        with self._driver.session(database=self._db) as s:
            for cypher in _CONSTRAINTS:
                try:
                    s.run(cypher)
                except Exception:
                    pass  # constraint may already exist or driver version doesn't support NODE KEY
        self._constraints_done = True

    # ── write ─────────────────────────────────────────────────────────────────

    def sync_roadmap(self, doc: dict) -> None:
        """Full sync of a saved roadmap MongoDB doc → Neo4j graph."""
        self._ensure_constraints()
        roadmap_id = doc.get("id", "")
        if not roadmap_id:
            return

        with self._driver.session(database=self._db) as s:
            # Goal node
            s.run(_UPSERT_GOAL, roadmap_id=roadmap_id, node_id="goal",
                  title=doc.get("title", ""), goal=doc.get("goal", ""))

            # Phases + Topics
            for pi, phase in enumerate(doc.get("phases", [])):
                phase_id = phase.get("id", f"phase_{pi}")
                s.run(_UPSERT_PHASE,
                      roadmap_id=roadmap_id, node_id=phase_id,
                      title=phase.get("title", ""), duration=phase.get("duration", ""),
                      color=phase.get("color", ""), phase_index=pi)

                for ti, topic in enumerate(phase.get("topics", [])):
                    topic_id = topic.get("id", f"topic_{pi}_{ti}")
                    s.run(_UPSERT_TOPIC,
                          roadmap_id=roadmap_id, node_id=topic_id, parent_id=phase_id,
                          title=topic.get("title", ""), description=topic.get("description", ""),
                          color=phase.get("color", ""), node_type="topic")

            # Previously expanded subtopics
            for exp in doc.get("expanded_nodes", []):
                self._upsert_expanded(s, roadmap_id, exp)

    def sync_expanded_node(self, roadmap_id: str, node: dict) -> None:
        """Add a single newly expanded subtopic to the graph."""
        self._ensure_constraints()
        with self._driver.session(database=self._db) as s:
            self._upsert_expanded(s, roadmap_id, node)

    def _upsert_expanded(self, session: Any, roadmap_id: str, node: dict) -> None:
        node_id   = node.get("id", "")
        parent_id = node.get("parent_id", "")
        if not node_id or not parent_id:
            return
        session.run(_UPSERT_SUBTOPIC,
                    roadmap_id=roadmap_id, node_id=node_id, parent_id=parent_id,
                    title=node.get("title", ""), description=node.get("description", ""),
                    color=node.get("color", ""))

    def delete_roadmap(self, roadmap_id: str) -> None:
        with self._driver.session(database=self._db) as s:
            s.run(_DELETE_ROADMAP, roadmap_id=roadmap_id)

    # ── read ──────────────────────────────────────────────────────────────────

    def get_node_neighbourhood(self, roadmap_id: str, node_id: str) -> str:
        """
        Returns a structured text describing a node's position in the roadmap graph:
        path from root, parent, siblings, children.
        Ready to inject into the chat LLM prompt.
        """
        with self._driver.session(database=self._db) as s:
            # Full path goal→phase→topic→...
            path_titles: list[str] = []
            for rec in s.run(_FULL_PATH, roadmap_id=roadmap_id, node_id=node_id):
                path_titles = list(rec["path_titles"])
                break

            # Neighbourhood
            record = s.run(_NEIGHBOURHOOD, roadmap_id=roadmap_id, node_id=node_id).single()

        if not record:
            return ""

        lines: list[str] = []

        if path_titles:
            lines.append(f"📍 Caminho: {' → '.join(path_titles)}")

        parent = record["parent_title"]
        if parent:
            lines.append(f"🔼 Pai: {parent}")

        children = [c for c in (record["children"] or []) if c]
        if children:
            lines.append(f"🔽 Subtópicos expandidos: {', '.join(children)}")

        siblings = [s for s in (record["siblings"] or []) if s]
        if siblings:
            lines.append(f"↔️ Tópicos irmãos (mesma fase): {', '.join(siblings[:6])}")

        desc = record["description"] or ""
        if desc:
            lines.append(f"📝 Descrição: {desc}")

        return "\n".join(lines)

    def get_full_roadmap_context(self, roadmap_id: str) -> str:
        """
        Returns the entire roadmap graph as structured text for injection into
        the LLM chat prompt — all phases, topics and expanded subtopics.
        """
        with self._driver.session(database=self._db) as s:
            records = list(s.run(_FULL_ROADMAP_CONTEXT, roadmap_id=roadmap_id))

        if not records:
            return ""

        # Extract goal info from first row
        goal_title = records[0]["goal_title"] or ""
        goal       = records[0]["goal"] or ""

        # Group by phase
        phases: dict[str, dict] = {}
        for rec in records:
            ph_title = rec["phase_title"]
            if not ph_title:
                continue
            ph_key = f"{rec['phase_index']}:{ph_title}"
            if ph_key not in phases:
                phases[ph_key] = {
                    "title":    ph_title,
                    "duration": rec["phase_duration"] or "",
                    "index":    rec["phase_index"] if rec["phase_index"] is not None else 999,
                    "topics":   [],
                }
            t_title = rec["topic_title"]
            if t_title:
                subtopics = [
                    st for st in (rec["subtopics"] or [])
                    if st and st.get("title")
                ]
                phases[ph_key]["topics"].append({
                    "title":     t_title,
                    "desc":      rec["topic_desc"] or "",
                    "subtopics": subtopics,
                })

        lines: list[str] = [
            f"Roadmap: {goal_title}",
            f"Objetivo: {goal}",
            "",
        ]
        for ph in sorted(phases.values(), key=lambda p: p["index"]):
            dur = f" ({ph['duration']})" if ph["duration"] else ""
            lines.append(f"## Fase: {ph['title']}{dur}")
            for t in ph["topics"]:
                desc = f" — {t['desc']}" if t["desc"] else ""
                lines.append(f"  • {t['title']}{desc}")
                for st in t["subtopics"]:
                    st_desc = f": {st['description']}" if st.get("description") else ""
                    lines.append(f"    ◦ {st['title']}{st_desc}")
            lines.append("")

        return "\n".join(lines)
