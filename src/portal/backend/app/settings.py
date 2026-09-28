"""Configuration read from the environment (backend/.env is loaded if present)."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")

SHARED_DIR = PROJECT_DIR / "shared"
SEED_FILE = Path(os.getenv("NETRA_SEED_FILE", PROJECT_DIR / "src" / "data" / "firs.json"))

# SQLite file. PostgreSQL + PostGIS replaces app/db.py when PS12 needs spatial queries.
DATABASE_PATH = os.getenv("NETRA_DATABASE_PATH", str(BACKEND_DIR / "netra.db"))

# Development credentials only. Real accounts replace these before any deployment.
DEV_USER = os.getenv("NETRA_DEV_USER", "123")
DEV_PASSWORD = os.getenv("NETRA_DEV_PASSWORD", "123")

# Without NETRA_JWT_SECRET a random secret is used, so tokens stop working on restart.
JWT_SECRET = os.getenv("NETRA_JWT_SECRET") or secrets.token_urlsafe(48)
JWT_HOURS = int(os.getenv("NETRA_JWT_HOURS", "12"))

CORS_ORIGINS = [o.strip() for o in os.getenv("NETRA_CORS_ORIGINS", "http://localhost:5173,http://localhost:4173").split(",") if o.strip()]

EMBEDDING_MODEL = os.getenv("NETRA_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
# "auto" uses sentence embeddings when the model can be loaded, otherwise TF-IDF.
TEXT_SIMILARITY = os.getenv("NETRA_TEXT_SIMILARITY", "auto")

WATSONX_API_KEY = os.getenv("WATSONX_API_KEY", "")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_URL = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com").rstrip("/")
WATSONX_MODEL_ID = os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-8b-instruct")
WATSONX_API_VERSION = os.getenv("WATSONX_API_VERSION", "2024-10-08")


def granite_configured() -> bool:
    return bool(WATSONX_API_KEY and WATSONX_PROJECT_ID)
