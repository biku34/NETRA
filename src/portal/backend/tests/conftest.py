import os
import tempfile
from pathlib import Path

# Tests run against a throwaway database, never backend/netra.db
_dir = tempfile.mkdtemp(prefix="netra-test-")
os.environ["NETRA_DATABASE_PATH"] = str(Path(_dir) / "test.db")
os.environ["NETRA_JWT_SECRET"] = "test-secret-not-used-anywhere-else-0123456789"
os.environ["WATSONX_API_KEY"] = ""
os.environ["WATSONX_PROJECT_ID"] = ""
