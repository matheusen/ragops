from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="Jira Issue Validation RAG", alias="APP_NAME")
    app_env: str = Field(default="dev", alias="APP_ENV")
    api_prefix: str = Field(default="/api/v1", alias="API_PREFIX")
    confidentiality_mode: bool = Field(default=True, alias="CONFIDENTIALITY_MODE")
    allow_third_party_llm: bool = Field(default=False, alias="ALLOW_THIRD_PARTY_LLM")
    allow_third_party_embeddings: bool = Field(default=False, alias="ALLOW_THIRD_PARTY_EMBEDDINGS")
    allow_external_vector_store: bool = Field(default=False, alias="ALLOW_EXTERNAL_VECTOR_STORE")

    default_provider: str = Field(default="mock", alias="DEFAULT_PROVIDER")
    secondary_provider: str = Field(default="gemini", alias="SECONDARY_PROVIDER")
    enable_second_opinion: bool = Field(default=True, alias="ENABLE_SECOND_OPINION")
    enable_langgraph: bool = Field(default=True, alias="ENABLE_LANGGRAPH")
    enable_reranker: bool = Field(default=True, alias="ENABLE_RERANKER")
    enable_external_retrieval: bool = Field(default=True, alias="ENABLE_EXTERNAL_RETRIEVAL")
    enable_modular_judge: bool = Field(default=False, alias="ENABLE_MODULAR_JUDGE")
    enable_planner: bool = Field(default=False, alias="ENABLE_PLANNER")
    enable_query_rewriter: bool = Field(default=False, alias="ENABLE_QUERY_REWRITER")
    enable_reflection_memory: bool = Field(default=False, alias="ENABLE_REFLECTION_MEMORY")
    enable_policy_loop: bool = Field(default=False, alias="ENABLE_POLICY_LOOP")
    second_opinion_confidence_threshold: float = Field(default=0.65, alias="SECOND_OPINION_CONFIDENCE_THRESHOLD")
    max_planning_iterations: int = Field(default=4, alias="MAX_PLANNING_ITERATIONS")

    primary_model: str = Field(default="mock-judge-v1", alias="PRIMARY_MODEL")
    openai_model: str = Field(default="gpt-5-mini", alias="OPENAI_MODEL")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    openai_embedding_model: str = Field(default="text-embedding-3-large", alias="OPENAI_EMBEDDING_MODEL")
    gemini_embedding_model: str = Field(default="gemini-embedding-001", alias="GEMINI_EMBEDDING_MODEL")
    embedding_dimension: int = Field(default=1536, alias="EMBEDDING_DIMENSION")
    gcp_project_id: str | None = Field(default=None, alias="GCP_PROJECT_ID")
    gcp_location: str = Field(default="us-central1", alias="GCP_LOCATION")
    google_application_credentials: str | None = Field(default=None, alias="GOOGLE_APPLICATION_CREDENTIALS")
    google_cloud_access_token: str | None = Field(default=None, alias="GOOGLE_CLOUD_ACCESS_TOKEN")

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")

    jira_base_url: str | None = Field(default=None, alias="JIRA_BASE_URL")
    jira_user_email: str | None = Field(default=None, alias="JIRA_USER_EMAIL")
    jira_api_token: str | None = Field(default=None, alias="JIRA_API_TOKEN")
    jira_project_key: str | None = Field(default=None, alias="JIRA_PROJECT_KEY")
    jira_verify_ssl: bool = Field(default=True, alias="JIRA_VERIFY_SSL")
    staging_dir: Path = Field(default=Path("data/staging"), alias="STAGING_DIR")

    qdrant_url: str | None = Field(default=None, alias="QDRANT_URL")
    qdrant_collection: str = Field(default="issue_evidence", alias="QDRANT_COLLECTION")
    qdrant_api_key: str | None = Field(default=None, alias="QDRANT_API_KEY")
    # Qdrant quantization + cascade retrieval (item 13)
    qdrant_quantization_type: str = Field(default="none", alias="QDRANT_QUANTIZATION_TYPE")  # none | scalar | binary
    qdrant_quantization_rescore: bool = Field(default=True, alias="QDRANT_QUANTIZATION_RESCORE")
    qdrant_cascade_overretrieve_factor: int = Field(default=4, alias="QDRANT_CASCADE_OVERRETRIEVE_FACTOR")
    enable_cascade_retrieval: bool = Field(default=False, alias="ENABLE_CASCADE_RETRIEVAL")

    # Neo4j GraphRAG (item 12)
    neo4j_url: str | None = Field(default=None, alias="NEO4J_URL")
    neo4j_user: str = Field(default="neo4j", alias="NEO4J_USER")
    neo4j_password: str | None = Field(default=None, alias="NEO4J_PASSWORD")
    neo4j_database: str = Field(default="neo4j", alias="NEO4J_DATABASE")
    enable_graphrag: bool = Field(default=False, alias="ENABLE_GRAPHRAG")
    enable_temporal_graphrag: bool = Field(default=False, alias="ENABLE_TEMPORAL_GRAPHRAG")
    planner_mode: str = Field(default="step-plan", alias="PLANNER_MODE")
    query_rewriter_mode: str = Field(default="metadata-aware", alias="QUERY_REWRITER_MODE")
    reflection_mode: str = Field(default="summary-log", alias="REFLECTION_MODE")
    policy_mode: str = Field(default="rule-gated", alias="POLICY_MODE")
    temporal_graphrag_mode: str = Field(default="versioned-graph", alias="TEMPORAL_GRAPHRAG_MODE")

    # Ollama local provider (from article: oLLM / Programação Agentic totalmente local)
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")
    ollama_model: str = Field(default="llama3.1:8b", alias="OLLAMA_MODEL")

    # Auto-improvement threshold (from article: Criando arquitetura de treinamento)
    auto_improvement_threshold: float = Field(default=0.75, alias="AUTO_IMPROVEMENT_THRESHOLD")

    # Distiller mode: "simple" (rule-based, zero cost) or "refrag" (LLM-based REFRAG compression)
    distiller_mode: str = Field(default="simple", alias="DISTILLER_MODE")
    # Provider used for the compression LLM in refrag mode — defaults to the primary provider.
    # Set to a cheaper/faster model (e.g. "openai" with gpt-5-mini) to keep latency low.
    distiller_provider: str = Field(default="", alias="DISTILLER_PROVIDER")

    # DSPy optimization lab (item 11)
    dspy_lab_dir: Path = Field(default=Path("data/dspy_lab"), alias="DSPY_LAB_DIR")

    audit_dir: Path = Field(default=Path("data/audit"), alias="AUDIT_DIR")
    eval_reports_dir: Path = Field(default=Path("data/eval_reports"), alias="EVAL_REPORTS_DIR")
    golden_dataset_path: Path = Field(default=Path("examples/golden_dataset.json"), alias="GOLDEN_DATASET_PATH")
    prompts_dir: Path = Field(default=Path("prompts"), alias="PROMPTS_DIR")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    def allows_provider(self, provider_name: str | None) -> bool:
        lowered = (provider_name or "mock").lower()
        # mock and ollama are always allowed — no external API calls
        if lowered in {"mock", "ollama"}:
            return True
        if lowered in {"openai", "gemini"}:
            return not self.confidentiality_mode or self.allow_third_party_llm
        return True

    def allows_external_embeddings(self) -> bool:
        return not self.confidentiality_mode or self.allow_third_party_embeddings

    def external_vector_store_enabled(self) -> bool:
        if not self.enable_external_retrieval:
            return False
        return not self.confidentiality_mode or self.allow_external_vector_store

    def enforce_runtime_policy(self) -> None:
        if not self.confidentiality_mode:
            return
        self.enable_external_retrieval = self.external_vector_store_enabled()
        if not self.allows_provider(self.default_provider):
            self.default_provider = "mock"
        if not self.allows_provider(self.secondary_provider):
            self.secondary_provider = "mock"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.enforce_runtime_policy()
    settings.audit_dir.mkdir(parents=True, exist_ok=True)
    settings.staging_dir.mkdir(parents=True, exist_ok=True)
    settings.eval_reports_dir.mkdir(parents=True, exist_ok=True)
    settings.prompts_dir.mkdir(parents=True, exist_ok=True)
    settings.dspy_lab_dir.mkdir(parents=True, exist_ok=True)
    return settings
