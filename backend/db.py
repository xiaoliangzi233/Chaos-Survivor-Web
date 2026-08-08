from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


DEFAULT_DB_PATH = Path(__file__).resolve().parent / "survivor.sqlite3"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class SurvivorDatabase:
    def __init__(self, path: str | Path = DEFAULT_DB_PATH):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.migrate()

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def migrate(self) -> None:
        with sqlite3.connect(self.path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS players (
                  player_id TEXT PRIMARY KEY,
                  nickname TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS progress_snapshots (
                  player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
                  progress_json TEXT NOT NULL,
                  revision INTEGER NOT NULL DEFAULT 0,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS runs (
                  id TEXT PRIMARY KEY,
                  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
                  nickname TEXT NOT NULL,
                  completed_at TEXT NOT NULL,
                  outcome TEXT NOT NULL,
                  run_mode TEXT NOT NULL,
                  random_goal TEXT NOT NULL,
                  mode_key TEXT NOT NULL,
                  difficulty_id TEXT NOT NULL,
                  difficulty_name TEXT NOT NULL,
                  weapon_id TEXT NOT NULL,
                  weapon_name TEXT NOT NULL,
                  seconds INTEGER NOT NULL,
                  wave INTEGER NOT NULL,
                  kills INTEGER NOT NULL,
                  boss_kills INTEGER NOT NULL,
                  gold INTEGER NOT NULL,
                  level INTEGER NOT NULL,
                  weapon_count INTEGER NOT NULL,
                  item_count INTEGER NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS config_snapshots (
                  kind TEXT PRIMARY KEY,
                  draft_json TEXT NOT NULL,
                  published_json TEXT,
                  updated_at TEXT NOT NULL,
                  published_at TEXT
                );

                CREATE TABLE IF NOT EXISTS admin_events (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  action TEXT NOT NULL,
                  kind TEXT NOT NULL,
                  detail TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_runs_leaderboard
                  ON runs(mode_key, difficulty_id, outcome, kills DESC, wave DESC, seconds ASC);
                """
            )

    def table_names(self) -> set[str]:
        with self.connect() as conn:
            rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        return {row["name"] for row in rows}

    def upsert_player(self, player_id: str, nickname: str) -> dict[str, Any]:
        now = utc_now()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO players(player_id, nickname, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(player_id) DO UPDATE SET
                  nickname = excluded.nickname,
                  updated_at = excluded.updated_at
                """,
                (player_id, nickname or "Anonymous", now, now),
            )
            row = conn.execute("SELECT * FROM players WHERE player_id = ?", (player_id,)).fetchone()
        return dict(row)

    def player_exists(self, player_id: str) -> bool:
        with self.connect() as conn:
            row = conn.execute("SELECT 1 FROM players WHERE player_id = ?", (player_id,)).fetchone()
        return row is not None

    def save_progress(self, player_id: str, progress: dict[str, Any], revision: int = 0) -> dict[str, Any]:
        now = utc_now()
        payload = json.dumps(progress, ensure_ascii=False, separators=(",", ":"))
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO progress_snapshots(player_id, progress_json, revision, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(player_id) DO UPDATE SET
                  progress_json = excluded.progress_json,
                  revision = MAX(progress_snapshots.revision, excluded.revision),
                  updated_at = excluded.updated_at
                """,
                (player_id, payload, revision, now),
            )
            row = conn.execute("SELECT * FROM progress_snapshots WHERE player_id = ?", (player_id,)).fetchone()
        return self._progress_row(row)

    def get_progress(self, player_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM progress_snapshots WHERE player_id = ?", (player_id,)).fetchone()
        return self._progress_row(row) if row else None

    def insert_run(self, run: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        mode_key = f"random_{run['randomGoal']}" if run["runMode"] == "random" else "standard"
        with self.connect() as conn:
            player = conn.execute("SELECT nickname FROM players WHERE player_id = ?", (run["playerId"],)).fetchone()
            if player is None:
                raise KeyError("player_not_found")
            conn.execute(
                """
                INSERT INTO runs(
                  id, player_id, nickname, completed_at, outcome, run_mode, random_goal, mode_key,
                  difficulty_id, difficulty_name, weapon_id, weapon_name, seconds, wave, kills,
                  boss_kills, gold, level, weapon_count, item_count, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run["id"], run["playerId"], player["nickname"], run["completedAt"] or now,
                    run["outcome"], run["runMode"], run["randomGoal"], mode_key,
                    run["difficultyId"], run["difficultyName"], run["weaponId"], run["weaponName"],
                    run["seconds"], run["wave"], run["kills"], run["bossKills"], run["gold"],
                    run["level"], run["weaponCount"], run["itemCount"], now,
                ),
            )
            row = conn.execute("SELECT * FROM runs WHERE id = ?", (run["id"],)).fetchone()
        return self._run_row(row)

    def leaderboard(self, mode: str = "all", difficulty: str = "all", metric: str = "kills", limit: int = 20) -> list[dict[str, Any]]:
        metric_sql = {
            "kills": "kills DESC, wave DESC, seconds ASC",
            "wave": "wave DESC, kills DESC, seconds ASC",
            "time": "seconds DESC, wave DESC, kills DESC",
            "gold": "gold DESC, kills DESC, wave DESC",
            "victory_speed": "CASE WHEN outcome = 'victory' THEN 0 ELSE 1 END ASC, seconds ASC, kills DESC",
        }.get(metric, "kills DESC, wave DESC, seconds ASC")
        clauses = []
        params: list[Any] = []
        if mode != "all":
            clauses.append("mode_key = ?")
            params.append(mode)
        if difficulty != "all":
            clauses.append("difficulty_id = ?")
            params.append(difficulty)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT * FROM runs {where} ORDER BY {metric_sql}, completed_at DESC LIMIT ?"
        params.append(max(1, min(100, int(limit))))
        with self.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._run_row(row) for row in rows]

    def read_config_snapshot(self, kind: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM config_snapshots WHERE kind = ?", (kind,)).fetchone()
        if not row:
            return None
        return {
            "kind": row["kind"],
            "draft": json.loads(row["draft_json"]),
            "published": json.loads(row["published_json"]) if row["published_json"] else None,
            "updatedAt": row["updated_at"],
            "publishedAt": row["published_at"],
        }

    def save_config_draft(self, kind: str, data: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        payload = json.dumps(data, ensure_ascii=False, indent=2)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO config_snapshots(kind, draft_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(kind) DO UPDATE SET
                  draft_json = excluded.draft_json,
                  updated_at = excluded.updated_at
                """,
                (kind, payload, now),
            )
            conn.execute(
                "INSERT INTO admin_events(action, kind, detail, created_at) VALUES (?, ?, ?, ?)",
                ("save_draft", kind, "draft saved", now),
            )
        return self.read_config_snapshot(kind) or {"kind": kind, "draft": data}

    def publish_config(self, kind: str, data: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        payload = json.dumps(data, ensure_ascii=False, indent=2)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO config_snapshots(kind, draft_json, published_json, updated_at, published_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(kind) DO UPDATE SET
                  draft_json = excluded.draft_json,
                  published_json = excluded.published_json,
                  updated_at = excluded.updated_at,
                  published_at = excluded.published_at
                """,
                (kind, payload, payload, now, now),
            )
            conn.execute(
                "INSERT INTO admin_events(action, kind, detail, created_at) VALUES (?, ?, ?, ?)",
                ("publish", kind, "published to config file", now),
            )
        return self.read_config_snapshot(kind) or {"kind": kind, "draft": data, "published": data}

    @staticmethod
    def _progress_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "playerId": row["player_id"],
            "progress": json.loads(row["progress_json"]),
            "revision": row["revision"],
            "updatedAt": row["updated_at"],
        }

    @staticmethod
    def _run_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "playerId": row["player_id"],
            "nickname": row["nickname"],
            "completedAt": row["completed_at"],
            "outcome": row["outcome"],
            "runMode": row["run_mode"],
            "randomGoal": row["random_goal"],
            "modeKey": row["mode_key"],
            "difficultyId": row["difficulty_id"],
            "difficultyName": row["difficulty_name"],
            "weaponId": row["weapon_id"],
            "weaponName": row["weapon_name"],
            "seconds": row["seconds"],
            "wave": row["wave"],
            "kills": row["kills"],
            "bossKills": row["boss_kills"],
            "gold": row["gold"],
            "level": row["level"],
            "weaponCount": row["weapon_count"],
            "itemCount": row["item_count"],
            "createdAt": row["created_at"],
        }
