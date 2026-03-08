import sys
sys.path.insert(0, r"c:\Users\mengl\Documents\Github\ragflow\src")
from jira_issue_rag.main import app
import uvicorn
uvicorn.run(app, host="0.0.0.0", port=8000)
