from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


Outcome = Literal["victory", "defeat", "abandoned"]
RunMode = Literal["standard", "random"]
RandomGoal = Literal["twenty_waves", "endless"]


class PlayerBootstrap(BaseModel):
    playerId: str = Field(min_length=3, max_length=96)
    nickname: str = Field(default="Anonymous", max_length=32)

    @field_validator("playerId", "nickname")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class ProgressSnapshot(BaseModel):
    progress: dict[str, Any]
    revision: int = Field(default=0, ge=0)


class RunSubmission(BaseModel):
    id: str = Field(min_length=1, max_length=96)
    playerId: str = Field(min_length=3, max_length=96)
    completedAt: str = Field(default="", max_length=64)
    outcome: Outcome
    runMode: RunMode = "standard"
    randomGoal: RandomGoal = "twenty_waves"
    difficultyId: str = Field(default="unknown", max_length=64)
    difficultyName: str = Field(default="unknown", max_length=64)
    weaponId: str = Field(default="", max_length=64)
    weaponName: str = Field(default="", max_length=64)
    seconds: int = Field(default=0, ge=0, le=86400 * 30)
    wave: int = Field(default=0, ge=0, le=1_000_000)
    kills: int = Field(default=0, ge=0, le=100_000_000)
    bossKills: int = Field(default=0, ge=0, le=1_000_000)
    gold: int = Field(default=0, ge=0, le=1_000_000_000)
    level: int = Field(default=1, ge=1, le=1_000_000)
    weaponCount: int = Field(default=0, ge=0, le=1_000)
    itemCount: int = Field(default=0, ge=0, le=1_000_000)
    tainted: bool = False
    debug: bool = False

    @field_validator("id", "playerId", "difficultyId", "difficultyName", "weaponId", "weaponName", "completedAt")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class ConfigDraft(BaseModel):
    data: dict[str, Any]


VALID_CONFIG_KINDS = {
    "enemy": "enemy-config.json",
    "difficulty": "difficulty-config.json",
    "weapon": "weapon-config.json",
    "item": "item-config.json",
    "game": "game-config.json",
}
