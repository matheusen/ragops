from __future__ import annotations

from fastapi import FastAPI

from jira_issue_rag.api.routes import router
from jira_issue_rag.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.include_router(router, prefix=settings.api_prefix)
