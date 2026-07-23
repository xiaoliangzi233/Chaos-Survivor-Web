import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Union


DIFFICULTIES = {
    "ember": (1, "废弃实验室 难度1"),
    "neon": (2, "废弃实验室 难度2"),
    "overclock": (3, "废弃实验室 难度3"),
    "singularity": (4, "废弃实验室 难度4"),
    "apocalypse": (5, "废弃实验室 难度5"),
    "void_crown": (6, "废弃实验室 难度6"),
}

METRIC_COLUMNS = {
    "TOTAL_PLAY_SECONDS": "total_play_seconds",
    "TOTAL_KILLS": "total_kills",
    "TOTAL_BOSS_KILLS": "total_boss_kills",
    "HIGHEST_DIFFICULTY": "highest_difficulty_rank",
}

FINAL_STATUSES = {"VICTORY", "DEFEAT", "ABANDONED"}
ALL_STATUSES = FINAL_STATUSES | {"RUNNING"}
CODEX_TYPES = ("enemies", "weapons", "items", "events")


class StoreError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class LeaderboardStore:
    def __init__(self, database_path: Union[str, Path], schema_path: Optional[Union[str, Path]] = None):
        self.database_path = Path(database_path)
        self.schema_path = Path(schema_path or Path(__file__).with_name("schema.sql"))
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.database_path), timeout=8.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 8000")
        return connection

    def initialize(self) -> None:
        connection = self.connect()
        try:
            try:
                connection.execute("PRAGMA journal_mode = WAL")
                connection.execute("PRAGMA synchronous = NORMAL")
            except sqlite3.OperationalError:
                connection.rollback()
                connection.execute("PRAGMA journal_mode = DELETE")
                connection.execute("PRAGMA synchronous = FULL")
            connection.executescript(self.schema_path.read_text(encoding="utf-8"))
        finally:
            connection.close()

    def sync_run(self, user: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized = validate_run_payload(payload)
        difficulty_rank, _ = DIFFICULTIES[normalized["difficultyId"]]
        now = utc_now()

        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                INSERT OR IGNORE INTO survivor_player_stats
                    (user_id, username, employee_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user["id"], user["username"], user.get("employeeId", ""), now, now),
            )
            connection.execute(
                """
                UPDATE survivor_player_stats
                SET username = ?, employee_id = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (user["username"], user.get("employeeId", ""), now, user["id"]),
            )
            inserted = connection.execute(
                """
                INSERT OR IGNORE INTO survivor_run_record
                    (run_id, user_id, difficulty_id, difficulty_rank, played_seconds, kills,
                     boss_kills, status, client_started_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, 0, 0, 'RUNNING', ?, ?, ?)
                """,
                (
                    normalized["runId"], user["id"], normalized["difficultyId"], difficulty_rank,
                    normalized["startedAt"], now, now,
                ),
            ).rowcount
            record = connection.execute(
                "SELECT * FROM survivor_run_record WHERE run_id = ?",
                (normalized["runId"],),
            ).fetchone()
            if record is None:
                raise StoreError(500, "RUN_CREATE_FAILED", "战局记录创建失败")
            if record["user_id"] != user["id"]:
                raise StoreError(409, "RUN_OWNER_MISMATCH", "runId 已属于其他用户")
            if record["difficulty_id"] != normalized["difficultyId"]:
                raise StoreError(409, "RUN_DIFFICULTY_MISMATCH", "同一 runId 不允许修改难度")

            incoming = (normalized["playedSeconds"], normalized["kills"], normalized["bossKills"])
            stored = (record["played_seconds"], record["kills"], record["boss_kills"])
            if any(new < old for new, old in zip(incoming, stored)):
                if all(new <= old for new, old in zip(incoming, stored)):
                    connection.commit()
                    return run_response(record["run_id"], record["status"], now)
                raise StoreError(409, "RUN_METRICS_NOT_MONOTONIC", "战局统计必须单调递增")

            old_status = record["status"]
            new_status = normalized["status"]
            if old_status in FINAL_STATUSES:
                if incoming == stored and new_status in {old_status, "RUNNING"}:
                    connection.commit()
                    return run_response(record["run_id"], old_status, now)
                raise StoreError(409, "RUN_ALREADY_FINISHED", "已结算战局不能继续修改")

            play_delta = incoming[0] - stored[0]
            kills_delta = incoming[1] - stored[1]
            boss_delta = incoming[2] - stored[2]
            victory_increment = 1 if new_status == "VICTORY" else 0
            finished_at = now if new_status in FINAL_STATUSES else None

            connection.execute(
                """
                UPDATE survivor_run_record
                SET played_seconds = ?, kills = ?, boss_kills = ?, status = ?,
                    finished_at = ?, updated_at = ?
                WHERE run_id = ?
                """,
                (*incoming, new_status, finished_at, now, normalized["runId"]),
            )
            connection.execute(
                """
                UPDATE survivor_player_stats
                SET total_play_seconds = total_play_seconds + ?,
                    total_kills = total_kills + ?,
                    total_boss_kills = total_boss_kills + ?,
                    run_count = run_count + ?,
                    victory_count = victory_count + ?,
                    highest_difficulty_id = CASE
                        WHEN ? = 1 AND ? > highest_difficulty_rank THEN ?
                        ELSE highest_difficulty_id
                    END,
                    highest_difficulty_rank = CASE
                        WHEN ? = 1 THEN MAX(highest_difficulty_rank, ?)
                        ELSE highest_difficulty_rank
                    END,
                    last_played_at = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (
                    play_delta, kills_delta, boss_delta, 1 if inserted else 0, victory_increment,
                    victory_increment, difficulty_rank, normalized["difficultyId"],
                    victory_increment, difficulty_rank, now, now, user["id"],
                ),
            )
            connection.commit()
            return run_response(normalized["runId"], new_status, now)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def leaderboard(self, metric: str, current_user_id: str, page: int, page_size: int) -> Dict[str, Any]:
        if metric not in METRIC_COLUMNS:
            raise StoreError(400, "INVALID_METRIC", "不支持的排行榜指标")
        page = max(1, page)
        page_size = min(100, max(1, page_size))
        offset = (page - 1) * page_size
        metric_column = METRIC_COLUMNS[metric]
        connection = self.connect()
        try:
            rows = connection.execute(
                f"""
                SELECT *, {metric_column} AS primary_value
                FROM survivor_player_stats
                WHERE run_count > 0
                ORDER BY primary_value DESC, victory_count DESC,
                         total_play_seconds DESC, total_kills DESC, user_id ASC
                """
            ).fetchall()
        finally:
            connection.close()

        ranked_rows = rank_rows(rows)
        total_players = len(ranked_rows)
        current = next((row for row in ranked_rows if row["user_id"] == current_user_id), None)
        page_rows = ranked_rows[offset:offset + page_size]
        return {
            "metric": metric,
            "page": page,
            "pageSize": page_size,
            "totalPlayers": total_players,
            "generatedAt": utc_now(),
            "rows": [player_response(row, total_players, row["user_id"] == current_user_id) for row in page_rows],
            "currentPlayer": player_response(current, total_players, True) if current else None,
        }

    def list_feedback(
        self,
        scope: str,
        current_user_id: str,
        page: int,
        page_size: int,
    ) -> Dict[str, Any]:
        normalized_scope = str(scope or "ALL").strip().upper()
        if normalized_scope not in {"ALL", "MINE"}:
            raise StoreError(400, "INVALID_FEEDBACK_SCOPE", "反馈筛选仅支持 ALL 或 MINE")
        page = max(1, page)
        page_size = min(20, max(1, page_size))
        offset = (page - 1) * page_size
        where_sql = "WHERE user_id = ?" if normalized_scope == "MINE" else ""
        parameters = (current_user_id,) if normalized_scope == "MINE" else ()

        connection = self.connect()
        try:
            total_items = connection.execute(
                f"SELECT COUNT(*) FROM survivor_feedback {where_sql}",
                parameters,
            ).fetchone()[0]
            rows = connection.execute(
                f"""
                SELECT id, user_id, username, employee_id, content, created_at, updated_at
                FROM survivor_feedback
                {where_sql}
                ORDER BY created_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                parameters + (page_size, offset),
            ).fetchall()
        finally:
            connection.close()

        return {
            "scope": normalized_scope,
            "page": page,
            "pageSize": page_size,
            "totalItems": total_items,
            "totalPages": max(1, (total_items + page_size - 1) // page_size),
            "items": [feedback_response(row, current_user_id) for row in rows],
        }

    def create_feedback(self, user: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
        content = validate_feedback_payload(payload)
        now = utc_now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            cursor = connection.execute(
                """
                INSERT INTO survivor_feedback
                    (user_id, username, employee_id, content, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user["id"], user["username"], user.get("employeeId", ""), content, now, now),
            )
            row = connection.execute(
                "SELECT * FROM survivor_feedback WHERE id = ?",
                (cursor.lastrowid,),
            ).fetchone()
            connection.commit()
            return feedback_response(row, user["id"])
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def update_feedback(
        self,
        user: Dict[str, str],
        feedback_id: int,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        content = validate_feedback_payload(payload)
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = require_owned_feedback(connection, feedback_id, user["id"])
            now = next_feedback_update_time(existing["created_at"])
            connection.execute(
                """
                UPDATE survivor_feedback
                SET username = ?, employee_id = ?, content = ?, updated_at = ?
                WHERE id = ?
                """,
                (user["username"], user.get("employeeId", ""), content, now, feedback_id),
            )
            row = connection.execute(
                "SELECT * FROM survivor_feedback WHERE id = ?",
                (feedback_id,),
            ).fetchone()
            connection.commit()
            return feedback_response(row, user["id"])
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def delete_feedback(self, user: Dict[str, str], feedback_id: int) -> Dict[str, Any]:
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            require_owned_feedback(connection, feedback_id, user["id"])
            connection.execute("DELETE FROM survivor_feedback WHERE id = ?", (feedback_id,))
            connection.commit()
            return {"id": feedback_id, "deleted": True}
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get_player_progress(self, user: Dict[str, str]) -> Dict[str, Any]:
        now = utc_now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = ensure_progress_row(connection, user, now)
            stored = progress_from_row(row)
            derived = derive_run_progress(connection, user["id"])
            merged = merge_player_progress(stored, derived)
            write_progress_row(connection, user, merged, now)
            connection.commit()
            return progress_response(merged, now)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def sync_player_progress(self, user: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
        incoming = validate_player_progress_payload(payload)
        now = utc_now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = ensure_progress_row(connection, user, now)
            stored = progress_from_row(row)
            derived = derive_run_progress(connection, user["id"])
            merged = merge_player_progress(stored, derived, incoming)
            write_progress_row(connection, user, merged, now)
            connection.commit()
            return progress_response(merged, now)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()


def default_player_progress() -> Dict[str, Any]:
    difficulty_progress = {
        difficulty_id: {"unlocked": index == 0, "completed": False}
        for index, difficulty_id in enumerate(DIFFICULTIES)
    }
    return {
        "bestSurvivalSeconds": 0,
        "difficultyProgress": difficulty_progress,
        "codex": {kind: [] for kind in CODEX_TYPES},
    }


def ensure_progress_row(
    connection: sqlite3.Connection,
    user: Dict[str, str],
    now: str,
) -> sqlite3.Row:
    defaults = default_player_progress()
    connection.execute(
        """
        INSERT OR IGNORE INTO survivor_player_progress
            (user_id, username, employee_id, best_survival_seconds,
             difficulty_progress_json, codex_json, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?, ?)
        """,
        (
            user["id"],
            user["username"],
            user.get("employeeId", ""),
            json_text(defaults["difficultyProgress"]),
            json_text(defaults["codex"]),
            now,
            now,
        ),
    )
    row = connection.execute(
        "SELECT * FROM survivor_player_progress WHERE user_id = ?",
        (user["id"],),
    ).fetchone()
    if row is None:
        raise StoreError(500, "PROGRESS_CREATE_FAILED", "玩家进度创建失败")
    return row


def write_progress_row(
    connection: sqlite3.Connection,
    user: Dict[str, str],
    progress: Dict[str, Any],
    now: str,
) -> None:
    connection.execute(
        """
        UPDATE survivor_player_progress
        SET username = ?, employee_id = ?, best_survival_seconds = ?,
            difficulty_progress_json = ?, codex_json = ?, updated_at = ?
        WHERE user_id = ?
        """,
        (
            user["username"],
            user.get("employeeId", ""),
            progress["bestSurvivalSeconds"],
            json_text(progress["difficultyProgress"]),
            json_text(progress["codex"]),
            now,
            user["id"],
        ),
    )


def progress_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "bestSurvivalSeconds": row["best_survival_seconds"],
        "difficultyProgress": parse_json_object(row["difficulty_progress_json"]),
        "codex": parse_json_object(row["codex_json"]),
    }


def derive_run_progress(connection: sqlite3.Connection, user_id: str) -> Dict[str, Any]:
    progress = default_player_progress()
    best_row = connection.execute(
        "SELECT MAX(played_seconds) FROM survivor_run_record WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    progress["bestSurvivalSeconds"] = int(best_row[0] or 0)
    victories = connection.execute(
        """
        SELECT difficulty_id,
               MIN(CASE WHEN played_seconds > 0 THEN played_seconds END) AS best_time,
               MAX(kills) AS best_kills,
               MIN(finished_at) AS completed_at
        FROM survivor_run_record
        WHERE user_id = ? AND status = 'VICTORY'
        GROUP BY difficulty_id
        """,
        (user_id,),
    ).fetchall()
    difficulty_ids = list(DIFFICULTIES)
    for row in victories:
        difficulty_id = row["difficulty_id"]
        if difficulty_id not in DIFFICULTIES:
            continue
        record = progress["difficultyProgress"][difficulty_id]
        record.update({
            "unlocked": True,
            "completed": True,
            "bestTime": int(row["best_time"] or 0),
            "bestKills": int(row["best_kills"] or 0),
        })
        if row["completed_at"]:
            record["completedAt"] = row["completed_at"]
        index = difficulty_ids.index(difficulty_id)
        if index + 1 < len(difficulty_ids):
            progress["difficultyProgress"][difficulty_ids[index + 1]]["unlocked"] = True
    return progress


def validate_player_progress_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise StoreError(400, "INVALID_JSON", "请求体必须是 JSON 对象")
    best_survival_seconds = bounded_integer(payload.get("bestSurvivalSeconds", 0), 0, 86400, "bestSurvivalSeconds")
    raw_difficulty = payload.get("difficultyProgress", {})
    if not isinstance(raw_difficulty, dict):
        raise StoreError(400, "INVALID_PROGRESS", "difficultyProgress 必须是对象")
    difficulty_progress = {}
    for difficulty_id, value in raw_difficulty.items():
        if difficulty_id not in DIFFICULTIES:
            continue
        if not isinstance(value, dict):
            raise StoreError(400, "INVALID_PROGRESS", "难度进度必须是对象")
        record = {
            "unlocked": bool(value.get("unlocked", False)),
            "completed": bool(value.get("completed", False)),
            "bestTime": bounded_integer(value.get("bestTime", 0), 0, 86400, "bestTime"),
            "bestKills": bounded_integer(value.get("bestKills", 0), 0, 10_000_000, "bestKills"),
            "bestGold": bounded_integer(value.get("bestGold", 0), 0, 1_000_000_000, "bestGold"),
        }
        completed_at = value.get("completedAt")
        if completed_at is not None:
            if not isinstance(completed_at, str) or len(completed_at) > 64:
                raise StoreError(400, "INVALID_PROGRESS", "completedAt 格式不正确")
            if completed_at:
                record["completedAt"] = completed_at
        difficulty_progress[difficulty_id] = record

    raw_codex = payload.get("codex", {})
    if not isinstance(raw_codex, dict):
        raise StoreError(400, "INVALID_PROGRESS", "codex 必须是对象")
    codex = {}
    for kind in CODEX_TYPES:
        values = raw_codex.get(kind, [])
        if not isinstance(values, list) or len(values) > 500:
            raise StoreError(400, "INVALID_PROGRESS", f"codex.{kind} 格式不正确")
        normalized = []
        seen = set()
        for value in values:
            if not isinstance(value, str) or not value.strip() or len(value.strip()) > 64:
                raise StoreError(400, "INVALID_PROGRESS", f"codex.{kind} 包含无效条目")
            entry = value.strip()
            if entry not in seen:
                normalized.append(entry)
                seen.add(entry)
        codex[kind] = normalized
    return {
        "bestSurvivalSeconds": best_survival_seconds,
        "difficultyProgress": difficulty_progress,
        "codex": codex,
    }


def merge_player_progress(*values: Dict[str, Any]) -> Dict[str, Any]:
    merged = default_player_progress()
    for value in values:
        if not isinstance(value, dict):
            continue
        merged["bestSurvivalSeconds"] = max(
            merged["bestSurvivalSeconds"],
            safe_integer(value.get("bestSurvivalSeconds"), 0, 86400),
        )
        source_difficulty = value.get("difficultyProgress", {})
        if isinstance(source_difficulty, dict):
            for difficulty_id in DIFFICULTIES:
                source = source_difficulty.get(difficulty_id)
                if not isinstance(source, dict):
                    continue
                target = merged["difficultyProgress"][difficulty_id]
                target["unlocked"] = target["unlocked"] or bool(source.get("unlocked"))
                target["completed"] = target["completed"] or bool(source.get("completed"))
                target["bestTime"] = minimum_positive(target.get("bestTime"), source.get("bestTime"))
                target["bestKills"] = max(
                    safe_integer(target.get("bestKills"), 0, 10_000_000),
                    safe_integer(source.get("bestKills"), 0, 10_000_000),
                )
                target["bestGold"] = max(
                    safe_integer(target.get("bestGold"), 0, 1_000_000_000),
                    safe_integer(source.get("bestGold"), 0, 1_000_000_000),
                )
                completed_at = str(source.get("completedAt") or "").strip()
                if completed_at and (not target.get("completedAt") or completed_at < target["completedAt"]):
                    target["completedAt"] = completed_at
        source_codex = value.get("codex", {})
        if isinstance(source_codex, dict):
            for kind in CODEX_TYPES:
                for entry in source_codex.get(kind, []) if isinstance(source_codex.get(kind, []), list) else []:
                    text = str(entry or "").strip()
                    if text and text not in merged["codex"][kind]:
                        merged["codex"][kind].append(text)

    difficulty_ids = list(DIFFICULTIES)
    merged["difficultyProgress"][difficulty_ids[0]]["unlocked"] = True
    for index, difficulty_id in enumerate(difficulty_ids):
        record = merged["difficultyProgress"][difficulty_id]
        if record.get("completed"):
            record["unlocked"] = True
            if index + 1 < len(difficulty_ids):
                merged["difficultyProgress"][difficulty_ids[index + 1]]["unlocked"] = True
    return merged


def progress_response(progress: Dict[str, Any], updated_at: str) -> Dict[str, Any]:
    return {
        "bestSurvivalSeconds": progress["bestSurvivalSeconds"],
        "difficultyProgress": progress["difficultyProgress"],
        "codex": progress["codex"],
        "updatedAt": updated_at,
    }


def minimum_positive(first: Any, second: Any) -> int:
    values = [safe_integer(value, 0, 86400) for value in (first, second)]
    positive = [value for value in values if value > 0]
    return min(positive) if positive else 0


def safe_integer(value: Any, minimum: int, maximum: int) -> int:
    if isinstance(value, bool):
        return minimum
    try:
        number = int(value)
    except (TypeError, ValueError):
        return minimum
    return min(maximum, max(minimum, number))


def parse_json_object(value: str) -> Dict[str, Any]:
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def json_text(value: Dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def validate_feedback_payload(payload: Dict[str, Any]) -> str:
    if not isinstance(payload, dict):
        raise StoreError(400, "INVALID_JSON", "请求体必须是 JSON 对象")
    content = payload.get("content")
    if not isinstance(content, str):
        raise StoreError(400, "INVALID_FEEDBACK_CONTENT", "反馈内容必须是字符串")
    normalized = content.strip()
    if not 1 <= len(normalized) <= 100:
        raise StoreError(400, "INVALID_FEEDBACK_CONTENT", "反馈内容必须为 1 到 100 个字符")
    return normalized


def require_owned_feedback(connection: sqlite3.Connection, feedback_id: int, user_id: str) -> sqlite3.Row:
    row = connection.execute(
        "SELECT * FROM survivor_feedback WHERE id = ?",
        (feedback_id,),
    ).fetchone()
    if row is None:
        raise StoreError(404, "FEEDBACK_NOT_FOUND", "反馈不存在")
    if row["user_id"] != user_id:
        raise StoreError(403, "FEEDBACK_FORBIDDEN", "不能修改或删除其他用户的反馈")
    return row


def feedback_response(row: sqlite3.Row, current_user_id: str) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "employeeId": row["employee_id"] or "—",
        "content": row["content"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "currentUser": row["user_id"] == current_user_id,
    }


def next_feedback_update_time(created_at: str) -> str:
    now = utc_now()
    if now != created_at:
        return now
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def validate_run_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise StoreError(400, "INVALID_JSON", "请求体必须是 JSON 对象")
    run_id = str(payload.get("runId", "")).strip()
    difficulty_id = str(payload.get("difficultyId", "")).strip()
    status = str(payload.get("status", "")).strip().upper()
    if not 16 <= len(run_id) <= 64 or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-" for char in run_id):
        raise StoreError(400, "INVALID_RUN_ID", "runId 格式不正确")
    if difficulty_id not in DIFFICULTIES:
        raise StoreError(400, "INVALID_DIFFICULTY", "未知难度")
    if status not in ALL_STATUSES:
        raise StoreError(400, "INVALID_STATUS", "未知战局状态")
    played_seconds = bounded_integer(payload.get("playedSeconds"), 0, 86400, "playedSeconds")
    kills = bounded_integer(payload.get("kills"), 0, 10_000_000, "kills")
    boss_kills = bounded_integer(payload.get("bossKills"), 0, 100, "bossKills")
    started_at = validate_iso_datetime(payload.get("startedAt"), "startedAt")
    client_updated_at = validate_iso_datetime(payload.get("clientUpdatedAt"), "clientUpdatedAt")
    return {
        "runId": run_id,
        "difficultyId": difficulty_id,
        "playedSeconds": played_seconds,
        "kills": kills,
        "bossKills": boss_kills,
        "status": status,
        "startedAt": started_at,
        "clientUpdatedAt": client_updated_at,
    }


def bounded_integer(value: Any, minimum: int, maximum: int, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise StoreError(400, "INVALID_FIELD", f"{field} 必须是 {minimum} 到 {maximum} 之间的整数")
    return value


def validate_iso_datetime(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise StoreError(400, "INVALID_FIELD", f"{field} 必须是 ISO-8601 时间")
    try:
        parse_iso_datetime(value)
    except ValueError as error:
        raise StoreError(400, "INVALID_FIELD", f"{field} 必须是 ISO-8601 时间") from error
    return value


def parse_iso_datetime(value: str) -> datetime:
    normalized = value[:-1] + "+0000" if value.endswith("Z") else value
    if len(normalized) >= 6 and normalized[-3] == ":" and normalized[-6] in {"+", "-"}:
        normalized = normalized[:-3] + normalized[-2:]
    if "." in normalized:
        head, tail = normalized.split(".", 1)
        zone_index = next((i for i, char in enumerate(tail) if char in "+-"), len(tail))
        digits = "".join(char for char in tail[:zone_index] if char.isdigit())[:6]
        zone = tail[zone_index:]
        normalized = f"{head}.{digits.ljust(6, '0')}{zone}"
        return datetime.strptime(normalized, "%Y-%m-%dT%H:%M:%S.%f%z")
    return datetime.strptime(normalized, "%Y-%m-%dT%H:%M:%S%z")


def rank_rows(rows):
    ranked = []
    previous_value = None
    previous_rank = 0
    for index, row in enumerate(rows, start=1):
        value = row["primary_value"]
        rank_no = previous_rank if value == previous_value else index
        data = dict(row)
        data["rank_no"] = rank_no
        ranked.append(data)
        previous_value = value
        previous_rank = rank_no
    return ranked


def player_response(row: Dict[str, Any], total_players: int, current_user: bool) -> Dict[str, Any]:
    difficulty_id = row["highest_difficulty_id"]
    difficulty_name = DIFFICULTIES.get(difficulty_id, (0, "未通关"))[1]
    run_count = row["run_count"]
    return {
        "rank": row["rank_no"],
        "totalPlayers": total_players,
        "username": row["username"],
        "employeeId": display_employee_id(row["employee_id"]),
        "totalPlaySeconds": row["total_play_seconds"],
        "totalKills": row["total_kills"],
        "totalBossKills": row["total_boss_kills"],
        "highestDifficultyId": difficulty_id,
        "highestDifficultyName": difficulty_name,
        "runCount": run_count,
        "victoryCount": row["victory_count"],
        "winRate": row["victory_count"] / run_count if run_count else 0,
        "lastPlayedAt": row["last_played_at"],
        "currentUser": current_user,
    }


def display_employee_id(value: Optional[str]) -> str:
    text = str(value or "").strip()
    return text or "—"


def run_response(run_id: str, status: str, accepted_at: str) -> Dict[str, Any]:
    return {"runId": run_id, "status": status, "acceptedAt": accepted_at}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
