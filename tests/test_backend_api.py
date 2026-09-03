import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

import backend.admin as admin_module
from backend.app import create_app
from backend.db import SurvivorDatabase


class BackendApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self.tmp.name)
        self.db_path = self.root / "survivor.sqlite3"
        self.config_root = self.root / "src" / "config"
        self.config_root.mkdir(parents=True)
        for name, filename in {
            "enemy": "enemy-config.json",
            "difficulty": "difficulty-config.json",
            "weapon": "weapon-config.json",
            "item": "item-config.json",
            "game": "game-config.json",
        }.items():
            (self.config_root / filename).write_text(json.dumps({"kind": name}), encoding="utf-8")
        self.previous_config_root = admin_module.CONFIG_ROOT
        admin_module.CONFIG_ROOT = self.config_root
        self.client = TestClient(create_app(self.db_path))

    def tearDown(self):
        self.client.close()
        admin_module.CONFIG_ROOT = self.previous_config_root
        self.tmp.cleanup()

    def test_migration_creates_expected_tables(self):
        db = SurvivorDatabase(self.db_path)
        self.assertTrue({
            "players",
            "progress_snapshots",
            "runs",
            "config_snapshots",
            "admin_events",
            "feedback",
            "contest_runs",
        }.issubset(db.table_names()))

    def test_player_progress_round_trip(self):
        response = self.client.post("/api/players/bootstrap", json={"playerId": "anon-test", "nickname": "Pilot"})
        self.assertEqual(response.status_code, 200)

        progress = {"bestSurvivalSeconds": 300, "codex": {"enemies": ["slime"]}}
        response = self.client.put("/api/progress/anon-test", json={"progress": progress, "revision": 3})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["revision"], 3)

        response = self.client.get("/api/progress/anon-test")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["progress"]["bestSurvivalSeconds"], 300)

    def test_player_nickname_update(self):
        response = self.client.post("/api/players/bootstrap", json={"playerId": "anon-test", "nickname": "Pilot"})
        self.assertEqual(response.status_code, 200)

        response = self.client.post(
            "/api/players/nickname",
            json={
                "playerId": "anon-test",
                "userId": "anon-test",
                "username": "",
                "employeeId": "",
                "nickname": "管理员",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["player"]["nickname"], "管理员")

        run = self.client.post("/api/runs", json=self.run_payload(playerId="anon-test"))
        self.assertEqual(run.status_code, 200)
        self.assertEqual(run.json()["run"]["nickname"], "管理员")

    def test_bootstrap_preserves_existing_nickname(self):
        response = self.client.post("/api/players/bootstrap", json={"playerId": "anon-test"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["needsNickname"])

        response = self.client.post("/api/players/nickname", json={"playerId": "anon-test", "nickname": "管理员"})
        self.assertEqual(response.status_code, 200)

        response = self.client.post("/api/players/bootstrap", json={"playerId": "anon-test", "nickname": ""})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["needsNickname"])
        self.assertEqual(response.json()["player"]["nickname"], "管理员")

    def test_player_nickname_update_validates_length(self):
        response = self.client.post("/api/players/nickname", json={"playerId": "anon-test", "nickname": ""})
        self.assertEqual(response.status_code, 422)

    def test_run_submission_rejections_and_leaderboard(self):
        self.client.post("/api/players/bootstrap", json={"playerId": "anon-a", "nickname": "Ace"})
        missing = self.client.post("/api/runs", json=self.run_payload(playerId="missing"))
        self.assertEqual(missing.status_code, 404)

        tainted = self.client.post("/api/runs", json=self.run_payload(id="tainted", tainted=True))
        self.assertEqual(tainted.status_code, 400)

        invalid = self.client.post("/api/runs", json=self.run_payload(id="bad", kills=-1))
        self.assertEqual(invalid.status_code, 422)

        first = self.client.post("/api/runs", json=self.run_payload(id="run-1", kills=500, wave=20, seconds=480))
        self.assertEqual(first.status_code, 200)
        second = self.client.post("/api/runs", json=self.run_payload(id="run-2", difficultyId="neon", kills=200, wave=12))
        self.assertEqual(second.status_code, 200)

        board = self.client.get("/api/leaderboards?difficulty=ember&metric=kills&limit=10")
        self.assertEqual(board.status_code, 200)
        entries = board.json()["entries"]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["playerId"], "anon-a")
        self.assertEqual(entries[0]["nickname"], "Ace")
        self.assertEqual(entries[0]["totalKills"], 500)
        self.assertEqual(entries[0]["totalSeconds"], 480)
        self.assertEqual(entries[0]["clearedDifficulties"], ["Ember"])

    def test_feedback_submit_and_list(self):
        self.client.post("/api/players/bootstrap", json={"playerId": "anon-a", "nickname": "Ace"})

        missing = self.client.post("/api/feedback", json={"playerId": "missing", "nickname": "Ghost", "message": "按钮点不了"})
        self.assertEqual(missing.status_code, 404)

        invalid = self.client.post("/api/feedback", json={"playerId": "anon-a", "nickname": "Ace", "message": "短"})
        self.assertEqual(invalid.status_code, 422)

        created = self.client.post("/api/feedback", json={"playerId": "anon-a", "nickname": "Ace", "message": "随机模式进入后界面卡住"})
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["feedback"]["nickname"], "Ace")
        self.assertEqual(created.json()["feedback"]["status"], "open")

        listed = self.client.get("/api/feedback?limit=10")
        self.assertEqual(listed.status_code, 200)
        entries = listed.json()["entries"]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["message"], "随机模式进入后界面卡住")

    def test_contest_run_submission_keeps_daily_best(self):
        self.client.post("/api/players/bootstrap", json={"playerId": "anon-a", "nickname": "Ace"})
        self.client.post("/api/players/bootstrap", json={"playerId": "anon-b", "nickname": "Bolt"})
        contest_id = "daily-2026-09-03-v1"
        seed = self.contest_seed(contest_id)

        missing = self.client.post("/api/contest-runs", json=self.contest_payload(playerId="missing", contestId=contest_id, seed=seed, expectedSeed=seed))
        self.assertEqual(missing.status_code, 404)

        tainted = self.client.post("/api/contest-runs", json=self.contest_payload(id="tainted", contestId=contest_id, seed=seed, expectedSeed=seed, tainted=True))
        self.assertEqual(tainted.status_code, 400)

        bad_seed = self.client.post("/api/contest-runs", json=self.contest_payload(id="bad-seed", contestId=contest_id, seed=seed + 1, expectedSeed=seed + 1))
        self.assertEqual(bad_seed.status_code, 400)

        first = self.client.post("/api/contest-runs", json=self.contest_payload(id="contest-a-1", contestId=contest_id, seed=seed, expectedSeed=seed, score=50000, kills=200))
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.json()["updated"])

        lower = self.client.post("/api/contest-runs", json=self.contest_payload(id="contest-a-2", contestId=contest_id, seed=seed, expectedSeed=seed, score=45000, kills=900))
        self.assertEqual(lower.status_code, 200)
        self.assertFalse(lower.json()["updated"])
        self.assertEqual(lower.json()["best"]["id"], "contest-a-1")
        self.assertEqual(lower.json()["best"]["score"], 50000)

        higher = self.client.post("/api/contest-runs", json=self.contest_payload(id="contest-a-3", contestId=contest_id, seed=seed, expectedSeed=seed, score=52000, seconds=500))
        self.assertEqual(higher.status_code, 200)
        self.assertTrue(higher.json()["updated"])

        second_player = self.client.post("/api/contest-runs", json=self.contest_payload(
            id="contest-b-1",
            playerId="anon-b",
            contestId=contest_id,
            seed=seed,
            expectedSeed=seed,
            score=52000,
            seconds=420,
            kills=260,
        ))
        self.assertEqual(second_player.status_code, 200)

        board = self.client.get(f"/api/contest-leaderboards?contestId={contest_id}&limit=10")
        self.assertEqual(board.status_code, 200)
        entries = board.json()["entries"]
        self.assertEqual([entry["playerId"] for entry in entries], ["anon-b", "anon-a"])
        self.assertEqual(entries[0]["score"], 52000)
        self.assertEqual(entries[0]["seconds"], 420)

    def test_admin_config_publish_validates_kind_and_writes_json(self):
        bad = self.client.put(
            "/api/admin/config/not-real",
            headers={"X-Admin-Token": "local-admin"},
            json={"data": {"x": 1}},
        )
        self.assertEqual(bad.status_code, 404)

        unauthorized = self.client.put("/api/admin/config/game", json={"data": {"version": "x"}})
        self.assertEqual(unauthorized.status_code, 401)

        draft = self.client.put(
            "/api/admin/config/game",
            headers={"X-Admin-Token": "local-admin"},
            json={"data": {"version": "backend-test"}},
        )
        self.assertEqual(draft.status_code, 200)
        publish = self.client.post("/api/admin/config/game/publish", headers={"X-Admin-Token": "local-admin"})
        self.assertEqual(publish.status_code, 200)
        written = json.loads((self.config_root / "game-config.json").read_text(encoding="utf-8"))
        self.assertEqual(written["version"], "backend-test")

    @staticmethod
    def run_payload(**overrides):
        payload = {
            "id": "run",
            "playerId": "anon-a",
            "outcome": "victory",
            "runMode": "standard",
            "randomGoal": "twenty_waves",
            "difficultyId": "ember",
            "difficultyName": "Ember",
            "weaponId": "arc",
            "weaponName": "Arc",
            "seconds": 420,
            "wave": 20,
            "kills": 100,
            "bossKills": 2,
            "gold": 80,
            "level": 12,
            "weaponCount": 4,
            "itemCount": 7,
        }
        payload.update(overrides)
        return payload

    @staticmethod
    def contest_payload(**overrides):
        payload = {
            "id": "contest-run",
            "contestId": "daily-2026-09-03-v1",
            "playerId": "anon-a",
            "score": 50000,
            "outcome": "victory",
            "seconds": 420,
            "wave": 20,
            "kills": 100,
            "bossKills": 2,
            "gold": 80,
            "level": 12,
            "weaponId": "arc",
            "weaponName": "Arc",
            "difficultyId": "ember",
            "difficultyName": "Ember",
            "seed": 0,
            "expectedSeed": 0,
        }
        payload.update(overrides)
        return payload

    @staticmethod
    def contest_seed(contest_id):
        value = 0x811C9DC5
        for char in contest_id:
            value ^= ord(char)
            value = (value * 0x01000193) & 0xFFFFFFFF
        return value


if __name__ == "__main__":
    unittest.main()
