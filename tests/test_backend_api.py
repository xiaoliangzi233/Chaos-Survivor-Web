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
        self.assertEqual(entries[0]["id"], "run-1")
        self.assertEqual(entries[0]["nickname"], "Ace")

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


if __name__ == "__main__":
    unittest.main()
