from __future__ import annotations

import os
import json
import urllib.error
import urllib.request
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .admin import admin_page, read_config_file, require_admin, validate_config_kind, write_config_file
from .db import DEFAULT_DB_PATH, SurvivorDatabase
from .schemas import ConfigDraft, FeedbackSubmission, PlayerBootstrap, PlayerNicknameUpdate, ProgressSnapshot, RunSubmission

AUTH_USER_URL = "http://113.249.91.32/sszl/user/simple-info"


def create_app(db_path: str | Path | None = None) -> FastAPI:
    database = SurvivorDatabase(db_path or os.environ.get("SURVIVOR_DB", DEFAULT_DB_PATH))
    app = FastAPI(title="Survivor Backend", version="1.0.0")
    allowed_origins = [origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins or ["*"],
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Content-Type", "X-Admin-Token", "Authorization"],
    )
    app.state.database = database

    @app.get("/api/health")
    def health():
        return {"ok": True, "service": "survivor-backend"}

    @app.get("/api/auth/simple-info")
    def auth_simple_info(authorization: str | None = Header(default=None)):
        token = (authorization or "").strip()
        if not token:
            raise HTTPException(status_code=401, detail="token_required")
        request = urllib.request.Request(AUTH_USER_URL, headers={"Authorization": token}, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                payload = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            raise HTTPException(status_code=exc.code, detail="auth_failed") from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail="auth_unavailable") from exc
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=502, detail="invalid_auth_response") from exc
        if not data:
            raise HTTPException(status_code=401, detail="auth_failed")
        return data

    @app.post("/api/players/bootstrap")
    def bootstrap_player(payload: PlayerBootstrap):
        player = database.get_or_create_player(payload.playerId, payload.nickname)
        return {"player": player, "needsNickname": not bool(player.get("nickname"))}

    @app.post("/api/players/nickname")
    def update_player_nickname(payload: PlayerNicknameUpdate):
        player = database.upsert_player(payload.playerId, payload.nickname)
        return {"player": player, "needsNickname": False}

    @app.get("/api/progress/{player_id}")
    def get_progress(player_id: str):
        if not database.player_exists(player_id):
            raise HTTPException(status_code=404, detail="player_not_found")
        snapshot = database.get_progress(player_id)
        return snapshot or {"playerId": player_id, "progress": {}, "revision": 0, "updatedAt": ""}

    @app.put("/api/progress/{player_id}")
    def put_progress(player_id: str, payload: ProgressSnapshot):
        if not database.player_exists(player_id):
            raise HTTPException(status_code=404, detail="player_not_found")
        return database.save_progress(player_id, payload.progress, payload.revision)

    @app.post("/api/runs")
    def submit_run(payload: RunSubmission):
        if payload.tainted or payload.debug:
            raise HTTPException(status_code=400, detail="tainted_run_rejected")
        if not database.player_exists(payload.playerId):
            raise HTTPException(status_code=404, detail="player_not_found")
        try:
            run = database.insert_run(payload.model_dump())
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="player_not_found") from exc
        except Exception as exc:
            if "UNIQUE" in str(exc).upper():
                raise HTTPException(status_code=409, detail="run_already_recorded") from exc
            raise
        return {"run": run}

    @app.get("/api/leaderboards")
    def leaderboards(
        mode: str = Query(default="all", max_length=64),
        difficulty: str = Query(default="all", max_length=64),
        metric: str = Query(default="kills", max_length=32),
        limit: int = Query(default=20, ge=1, le=100),
    ):
        return {"entries": database.leaderboard(mode, difficulty, metric, limit)}

    @app.post("/api/feedback")
    def submit_feedback(payload: FeedbackSubmission):
        if not database.player_exists(payload.playerId):
            raise HTTPException(status_code=404, detail="player_not_found")
        try:
            feedback = database.insert_feedback(payload.playerId, payload.nickname, payload.message)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="player_not_found") from exc
        return {"feedback": feedback}

    @app.get("/api/feedback")
    def list_feedback(limit: int = Query(default=60, ge=1, le=100)):
        return {"entries": database.list_feedback(limit)}

    @app.get("/api/config/{kind}")
    def get_config(kind: str):
        normalized = validate_config_kind(kind)
        snapshot = database.read_config_snapshot(normalized)
        data = snapshot["published"] if snapshot and snapshot.get("published") is not None else read_config_file(normalized)
        return {"kind": normalized, "data": data, "snapshot": snapshot}

    @app.put("/api/admin/config/{kind}", dependencies=[Depends(require_admin)])
    def save_config(kind: str, payload: ConfigDraft):
        normalized = validate_config_kind(kind)
        return database.save_config_draft(normalized, payload.data)

    @app.post("/api/admin/config/{kind}/publish", dependencies=[Depends(require_admin)])
    def publish_config(kind: str):
        normalized = validate_config_kind(kind)
        snapshot = database.read_config_snapshot(normalized)
        if not snapshot:
            raise HTTPException(status_code=404, detail="draft_not_found")
        write_config_file(normalized, snapshot["draft"])
        return database.publish_config(normalized, snapshot["draft"])

    @app.get("/admin")
    def admin():
        return admin_page()

    return app


app = create_app()
