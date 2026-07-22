FROM python:3.12-alpine

WORKDIR /app

COPY leaderboard_store.py server.py schema.sql ./

EXPOSE 8000

CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8000", "--database", "/data/leaderboard.db"]
