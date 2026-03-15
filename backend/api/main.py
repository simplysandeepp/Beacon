import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
from dotenv import load_dotenv

# Add the parent directory and nested modules so we can import them
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load env vars once for all routers (e.g., Slack OAuth config).
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(PROJECT_ROOT, "Noise filter module", ".env"), override=False)
load_dotenv(os.path.join(PROJECT_ROOT, ".env"), override=False)

from .routers import sessions, ingest, review, brd, hitl, slack
from integration_module.routes.gmail_routes import router as gmail_router
from brd_module.storage import init_db

# Initialize database (PG or SQLite fallback) on startup
try:
    init_db()
except Exception as e:
    print(f"Warning: Database initialization failed: {e}")

app = FastAPI(
    title="BRD Generation API",
    description="API for the Attributed Knowledge Store and BRD Generation Pipeline",
    version="1.0.0"
)

# Allow frontend testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(ingest.router)
app.include_router(review.router)
app.include_router(brd.router)
app.include_router(hitl.router)
app.include_router(slack.router)
app.include_router(gmail_router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "BRD Generation API is running."}
