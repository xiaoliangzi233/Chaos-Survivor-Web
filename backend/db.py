from __future__ import annotations

import json
import hashlib
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
            "kills": "total_kills DESC, best_wave DESC, total_seconds ASC",
            "wave": "best_wave DESC, total_kills DESC, total_seconds ASC",
            "time": "total_seconds DESC, total_kills DESC, best_wave DESC",
            "gold": "total_gold DESC, total_kills DESC, best_wave DESC",
            "victory_speed": "victories DESC, best_victory_seconds ASC, total_kills DESC",
        }.get(metric, "total_kills DESC, best_wave DESC, total_seconds ASC")
        clauses = []
        params: list[Any] = []
        if mode != "all":
            clauses.append("mode_key = ?")
            params.append(mode)
        if difficulty != "all":
            clauses.append("difficulty_id = ?")
            params.append(difficulty)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"""
            SELECT
              player_id,
              nickname,
              COUNT(*) AS runs,
              SUM(CASE WHEN outcome = 'victory' THEN 1 ELSE 0 END) AS victories,
              SUM(kills) AS total_kills,
              SUM(seconds) AS total_seconds,
              SUM(gold) AS total_gold,
              MAX(wave) AS best_wave,
              MIN(CASE WHEN outcome = 'victory' THEN seconds END) AS best_victory_seconds,
              GROUP_CONCAT(DISTINCT CASE WHEN outcome = 'victory' THEN difficulty_id END) AS cleared_difficulty_ids,
              GROUP_CONCAT(DISTINCT CASE WHEN outcome = 'victory' THEN difficulty_name END) AS cleared_difficulty_names
            FROM runs
            {where}
            GROUP BY player_id, nickname
            ORDER BY {metric_sql}
            LIMIT ?
        """
        params.append(max(1, min(100, int(limit))))
        with self.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._leaderboard_row(row) for row in rows]

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

    @staticmethod
    def _leaderboard_row(row: sqlite3.Row) -> dict[str, Any]:
        cleared_ids = [entry for entry in (row["cleared_difficulty_ids"] or "").split(",") if entry]
        cleared_names = [entry for entry in (row["cleared_difficulty_names"] or "").split(",") if entry]
        return {
            "playerId": row["player_id"],
            "nickname": row["nickname"],
            "avatar": f"pilot-{int(hashlib.sha1(row['player_id'].encode('utf-8')).hexdigest()[:8], 16) % 8}",
            "runs": row["runs"],
            "victories": row["victories"],
            "totalKills": row["total_kills"] or 0,
            "totalSeconds": row["total_seconds"] or 0,
            "totalGold": row["total_gold"] or 0,
            "bestWave": row["best_wave"] or 0,
            "bestVictorySeconds": row["best_victory_seconds"] or 0,
            "clearedDifficultyIds": cleared_ids,
            "clearedDifficulties": cleared_names,
        }
