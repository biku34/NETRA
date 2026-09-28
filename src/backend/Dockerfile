# Backend image — build context is the REPO ROOT (see docker-compose.yml).
FROM python:3.11-slim

# System deps kept minimal; all Python deps ship manylinux wheels.
WORKDIR /app

COPY src/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY src/backend/ /app/
# config.py resolves DATA_DIR to <repo>/data == /data here; seed the patrol config.
COPY src/data/patrol_config.json /data/patrol_config.json
# the static CSV dataset the API serves from
COPY src/data/csv/ /data/csv/

EXPOSE 8000

# Serve the API from the CSV dataset (loaded into SQLite on startup).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000"]
