import { TOTAL_WAVES } from "../constants.js";

export const CONTEST_VERSION = 1;
export const CONTEST_DIFFICULTY_ID = "ember";
export const CONTEST_SCORE_WEIGHTS = Object.freeze({
  victory: 50000,
  wave: 2500,
  kill: 12,
  bossKill: 3500,
  gold: 8,
  level: 450,
  timePenalty: 4,
});

export function contestDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return contestDateKey(new Date());
  return value.toISOString().slice(0, 10);
}

export function contestIdForDate(dateKey = contestDateKey()) {
  return `daily-${dateKey}-v${CONTEST_VERSION}`;
}

export function seedFromContestId(contestId) {
  return fnv1a32(String(contestId || ""));
}

export function buildDailyContestSpec({
  dateKey = contestDateKey(),
  difficulties = [],
  weapons = [],
} = {}) {
  const contestId = contestIdForDate(dateKey);
  const seed = seedFromContestId(contestId);
  const difficulty = difficulties.find((entry) => entry?.id === CONTEST_DIFFICULTY_ID)
    || difficulties.find((entry) => entry?.id)
    || { id: CONTEST_DIFFICULTY_ID, name: "Ember" };
  const weaponPool = weapons.filter((entry) => entry?.id);
  const weapon = weaponPool.length ? weaponPool[seed % weaponPool.length] : { id: "arc", name: "Arc" };
  return {
    contestId,
    dateKey,
    seed,
    difficultyId: difficulty.id,
    difficultyName: difficulty.name || difficulty.id,
    weaponId: weapon.id,
    weaponName: weapon.name || weapon.id,
    waveGoal: TOTAL_WAVES,
    rules: [
      "固定每日赛题",
      "固定地图 seed",
      "固定难度与初始武器",
      "调试或污染战局不可提交",
    ],
  };
}

export function createContestState(spec = null) {
  if (!spec) {
    return {
      active: false,
      contestId: "",
      dateKey: "",
      seed: 0,
      difficultyId: "",
      difficultyName: "",
      weaponId: "",
      weaponName: "",
      waveGoal: TOTAL_WAVES,
      startedAt: "",
      submitted: false,
      tainted: false,
      lastResult: null,
      leaderboard: [],
      syncStatus: "",
    };
  }
  return {
    active: true,
    contestId: spec.contestId,
    dateKey: spec.dateKey,
    seed: spec.seed,
    difficultyId: spec.difficultyId,
    difficultyName: spec.difficultyName,
    weaponId: spec.weaponId,
    weaponName: spec.weaponName,
    waveGoal: spec.waveGoal || TOTAL_WAVES,
    startedAt: new Date().toISOString(),
    submitted: false,
    tainted: false,
    lastResult: null,
    leaderboard: [],
    syncStatus: "pending",
  };
}

export function scoreContestRun(summary = {}) {
  const victory = summary.outcome === "victory" || summary.victory === true;
  const seconds = sanitizeNonNegative(summary.seconds);
  const wave = Math.max(0, Math.min(TOTAL_WAVES, sanitizeNonNegative(summary.wave)));
  const kills = sanitizeNonNegative(summary.kills);
  const bossKills = sanitizeNonNegative(summary.bossKills);
  const gold = sanitizeNonNegative(summary.gold);
  const level = Math.max(1, sanitizeNonNegative(summary.level) || 1);
  const raw = (victory ? CONTEST_SCORE_WEIGHTS.victory : 0)
    + wave * CONTEST_SCORE_WEIGHTS.wave
    + kills * CONTEST_SCORE_WEIGHTS.kill
    + bossKills * CONTEST_SCORE_WEIGHTS.bossKill
    + gold * CONTEST_SCORE_WEIGHTS.gold
    + level * CONTEST_SCORE_WEIGHTS.level
    - seconds * CONTEST_SCORE_WEIGHTS.timePenalty;
  return Math.max(0, Math.round(raw));
}

export function buildContestRunSubmission({ contest, state, outcome, debug = false, tainted = false } = {}) {
  const seconds = sanitizeNonNegative(Math.floor(state?.time || 0));
  const summary = {
    outcome,
    seconds,
    wave: sanitizeNonNegative(state?.wave),
    kills: sanitizeNonNegative(state?.kills),
    bossKills: sanitizeNonNegative(state?.bossKills),
    gold: sanitizeNonNegative(state?.gold),
    level: Math.max(1, sanitizeNonNegative(state?.player?.level) || 1),
  };
  return {
    id: `${contest.contestId}-${Math.round(Date.now())}`,
    contestId: contest.contestId,
    completedAt: new Date().toISOString(),
    score: scoreContestRun(summary),
    outcome,
    seconds: summary.seconds,
    wave: summary.wave,
    kills: summary.kills,
    bossKills: summary.bossKills,
    gold: summary.gold,
    level: summary.level,
    weaponId: contest.weaponId,
    weaponName: contest.weaponName,
    difficultyId: contest.difficultyId,
    difficultyName: contest.difficultyName,
    seed: contest.seed,
    expectedSeed: seedFromContestId(contest.contestId),
    tainted: Boolean(tainted),
    debug: Boolean(debug),
  };
}

export function isContestSubmissionClean(run = {}) {
  if (!run.contestId || seedFromContestId(run.contestId) !== Number(run.seed)) return false;
  if (run.debug || run.tainted) return false;
  const numeric = ["score", "seconds", "wave", "kills", "bossKills", "gold", "level"];
  return numeric.every((key) => Number.isFinite(Number(run[key])) && Number(run[key]) >= 0);
}

function sanitizeNonNegative(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
