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
        "employeeIdMasked": mask_employee_id(row["employee_id"]),
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


def mask_employee_id(value: Optional[str]) -> str:
    text = str(value or "").strip()
    return f"••••{text[-4:]}" if text else "—"


def run_response(run_id: str, status: str, accepted_at: str) -> Dict[str, Any]:
    return {"runId": run_id, "status": status, "acceptedAt": accepted_at}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
