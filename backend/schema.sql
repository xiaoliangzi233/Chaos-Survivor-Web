PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS survivor_player_stats (
    user_id                 TEXT PRIMARY KEY,
    username                TEXT NOT NULL,
    employee_id             TEXT NOT NULL DEFAULT '',
    total_play_seconds      INTEGER NOT NULL DEFAULT 0 CHECK (total_play_seconds >= 0),
    total_kills             INTEGER NOT NULL DEFAULT 0 CHECK (total_kills >= 0),
    total_boss_kills        INTEGER NOT NULL DEFAULT 0 CHECK (total_boss_kills >= 0),
    run_count               INTEGER NOT NULL DEFAULT 0 CHECK (run_count >= 0),
    victory_count           INTEGER NOT NULL DEFAULT 0 CHECK (victory_count >= 0),
    highest_difficulty_id   TEXT,
    highest_difficulty_rank INTEGER NOT NULL DEFAULT 0 CHECK (highest_difficulty_rank >= 0),
    last_played_at          TEXT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS survivor_run_record (
    run_id             TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    difficulty_id      TEXT NOT NULL,
    difficulty_rank    INTEGER NOT NULL CHECK (difficulty_rank > 0),
    played_seconds     INTEGER NOT NULL DEFAULT 0 CHECK (played_seconds BETWEEN 0 AND 86400),
    kills              INTEGER NOT NULL DEFAULT 0 CHECK (kills BETWEEN 0 AND 10000000),
    boss_kills         INTEGER NOT NULL DEFAULT 0 CHECK (boss_kills BETWEEN 0 AND 100),
    status             TEXT NOT NULL CHECK (status IN ('RUNNING', 'VICTORY', 'DEFEAT', 'ABANDONED')),
    client_started_at  TEXT NOT NULL,
    finished_at        TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES survivor_player_stats(user_id)
);

CREATE TABLE IF NOT EXISTS survivor_feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    username    TEXT NOT NULL,
    employee_id TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 100),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS survivor_player_progress (
    user_id                     TEXT PRIMARY KEY,
    username                    TEXT NOT NULL,
    employee_id                 TEXT NOT NULL DEFAULT '',
    best_survival_seconds       INTEGER NOT NULL DEFAULT 0 CHECK (best_survival_seconds BETWEEN 0 AND 86400),
    difficulty_progress_json    TEXT NOT NULL DEFAULT '{}',
    codex_json                  TEXT NOT NULL DEFAULT '{"enemies":[],"weapons":[],"items":[]}',
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_total_time
    ON survivor_player_stats(total_play_seconds DESC, victory_count DESC);
CREATE INDEX IF NOT EXISTS idx_player_total_kills
    ON survivor_player_stats(total_kills DESC, victory_count DESC);
CREATE INDEX IF NOT EXISTS idx_player_boss_kills
    ON survivor_player_stats(total_boss_kills DESC, victory_count DESC);
CREATE INDEX IF NOT EXISTS idx_player_difficulty
    ON survivor_player_stats(highest_difficulty_rank DESC, victory_count DESC);
CREATE INDEX IF NOT EXISTS idx_run_user_updated
    ON survivor_run_record(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_created
    ON survivor_feedback(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_created
    ON survivor_feedback(user_id, created_at DESC, id DESC);
