FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY src/config /app/src/config

EXPOSE 5010

CMD ["python", "-m", "backend.run", "--host", "0.0.0.0", "--port", "5010", "--db", "/data/survivor.sqlite3"]
