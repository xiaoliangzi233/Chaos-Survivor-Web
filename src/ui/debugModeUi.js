import { TAU, TOTAL_WAVES, WORLD_SIZE, waveDurationFor } from "../constants.js";
import { state, world } from "../state.js";
import { difficultyCards, selectDifficulty } from "../difficulty.js";
import { enemyConfig, spawnEnemyById } from "../systems/enemyRegistry.js";
import { clearEnemies } from "../systems/entities.js";
import { applyWaveStartScenario, resetWaveScenarioState } from "../systems/waveScenarios.js";
import { startWaveItems } from "../systems/items.js";
import { STARTER_WEAPONS } from "../systems/weapons.js";

const DEBUG_CREDENTIAL_KEY = "survivor.debug.credentials.v1";
const MIN_PASSWORD_LENGTH = 6;

let debugUi = null;

export function initDebugModeUi({ onQuickStart, onTaintRun, onPauseForDebug, onResumeFromDebug } = {}) {
  const elements = collectElements();
  if (!elements.menuButton || !elements.authOverlay || !elements.panelOverlay) return null;

  let sessionUnlocked = false;
  let resumeOnClose = false;
  let authMode = "unlock";

  populateDifficultyOptions(elements);
  populateWeaponOptions(elements);
  populateEnemyOptions(elements);
  syncControls(elements);
  elements.menuButton.disabled = false;

  function pauseForOverlay() {
    if (resumeOnClose || state.mode !== "playing") return;
    resumeOnClose = Boolean(onPauseForDebug?.());
  }

  function openGateway() {
    if (sessionUnlocked) return openPanel();
    pauseForOverlay();
    authMode = readCredentials() ? "unlock" : "setup";
    configureAuthView(elements, authMode);
    setAuthError(elements, "");
    elements.authOverlay.classList.add("active");
    elements.authOverlay.setAttribute("aria-hidden", "false");
    elements.menuButton.setAttribute("aria-expanded", "true");
    document.body.classList.add("debug-auth-open");
    window.setTimeout(() => elements.passwordInput.focus({ preventScroll: true }), 0);
  }

  function closeAuth({ resume = true } = {}) {
    elements.authOverlay.classList.remove("active");
    elements.authOverlay.setAttribute("aria-hidden", "true");
    elements.menuButton.setAttribute("aria-expanded", "false");
    document.body.classList.remove("debug-auth-open");
    elements.authForm.reset();
    setAuthError(elements, "");
    if (resume) resumeAfterOverlay();
  }

  function openPanel() {
    pauseForOverlay();
    if (state.player && (state.mode === "playing" || state.mode === "paused")) {
      elements.difficultySelect.value = state.difficultyId;
      elements.waveInput.value = String(state.wave);
    }
    refreshPanel(elements);
    elements.panelOverlay.classList.add("active");
    elements.panelOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("debug-panel-open");
    elements.menuButton.setAttribute("aria-expanded", "true");
  }

  function closePanel({ resume = true } = {}) {
    elements.panelOverlay.classList.remove("active");
    elements.panelOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("debug-panel-open");
    elements.menuButton.setAttribute("aria-expanded", "false");
    if (resume) resumeAfterOverlay();
  }

  function resumeAfterOverlay() {
    if (!resumeOnClose) return;
    resumeOnClose = false;
    onResumeFromDebug?.();
  }

  function markDebugUse(message) {
    state.debug.enabled = true;
    state.debug.runTainted = true;
    onTaintRun?.();
    setPanelMessage(elements, message);
    syncControls(elements);
  }

  async function submitAuth(event) {
    event.preventDefault();
    const password = elements.passwordInput.value;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setAuthError(elements, `密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`);
      return;
    }
    elements.authSubmitButton.disabled = true;
    try {
      if (authMode === "setup") {
        if (password !== elements.passwordConfirmInput.value) {
          setAuthError(elements, "两次输入的密码不一致。");
          return;
        }
        localStorage.setItem(DEBUG_CREDENTIAL_KEY, JSON.stringify(await createDebugCredential(password)));
      } else {
        const credentials = readCredentials();
        if (!credentials || !(await verifyDebugCredential(password, credentials))) {
          setAuthError(elements, "密码错误，无法进入调试终端。");
          return;
        }
      }
      sessionUnlocked = true;
      state.debug.unlocked = true;
      closeAuth({ resume: false });
      openPanel();
    } catch (error) {
      setAuthError(elements, error?.message || "无法完成本地密码验证。");
    } finally {
      elements.authSubmitButton.disabled = false;
    }
  }

  function quickStart() {
    const wave = selectedWave(elements);
    markDebugUse("调试测试场已启动，本局成绩不会记录。");
    const started = onQuickStart?.({
      difficultyId: elements.difficultySelect.value,
      weaponId: elements.weaponSelect.value,
      wave,
    });
    if (started === false) {
      setPanelMessage(elements, "无法启动测试场，请检查难度和武器配置。", true);
      return;
    }
    applySetup(elements, { clearBattlefield: true });
    resumeOnClose = false;
    closePanel({ resume: false });
  }

  function applySelectedSetup() {
    if (!state.player) {
      setPanelMessage(elements, "请先快速进入测试场或开始一局游戏。", true);
      return;
    }
    markDebugUse("难度和波次已应用，战场已重置。");
    applySetup(elements, { clearBattlefield: true });
    refreshPanel(elements);
  }

  function spawnSelectedEnemy() {
    if (!state.player || (state.mode !== "playing" && state.mode !== "paused")) {
      setPanelMessage(elements, "请先快速进入测试场或开始一局游戏。", true);
      return;
    }
    const id = elements.enemySelect.value;
    const config = enemyConfig[id];
    if (!config) {
      setPanelMessage(elements, "未找到选中的敌人配置。", true);
      return;
    }
    markDebugUse(`正在生成 ${config.name || id}。`);
    if (config.boss) clearEnemies({ dropRewards: false });
    const count = config.boss ? 1 : selectedCount(elements);
    const spawned = spawnAroundPlayer(id, count, config.radius || 24);
    if (config.boss && spawned > 0) state.bossWaveActive = true;
    setPanelMessage(elements, `已生成 ${spawned} 个 ${config.name || id}${config.boss ? "（Boss 独占战场）" : ""}。`);
    refreshPanel(elements);
  }

  function damageBoss() {
    const boss = world.boss;
    if (!boss || boss.dead || typeof boss.takeDamage !== "function") {
      setPanelMessage(elements, "当前战场没有可测试的 Boss。", true);
      return;
    }
    markDebugUse("已对当前 Boss 注入 25% 最大生命的测试伤害。");
    const damageScale = Math.max(0.001, state.player?.damageScale || 1);
    const shieldScale = boss.shielded ? 0.35 : 1;
    const rawDamage = (boss.maxHp * 0.25 + (boss.defense || 0)) / (damageScale * shieldScale);
    boss.takeDamage(rawDamage, boss.x, boss.y);
    refreshPanel(elements);
  }

  function healPlayer() {
    if (!state.player) return setPanelMessage(elements, "当前没有玩家实体。", true);
    markDebugUse("玩家生命和负面状态已重置。");
    state.player.hp = state.player.maxHp;
    state.player.burnTimer = 0;
    state.player.burnDps = 0;
    state.player.frostTimer = 0;
    state.player.frostSlow = 0;
    state.player.frostMarks = 0;
    state.player.frozenTimer = 0;
  }

  function grantGold() {
    if (!state.player) return setPanelMessage(elements, "当前没有玩家实体。", true);
    markDebugUse("已添加 1000 调试金币。");
    state.gold += 1000;
  }

  function clearHostileEffects() {
    markDebugUse("敌方弹幕、危害区和黑洞已清除。");
    world.enemyProjectiles.length = 0;
    world.hazards.length = 0;
    world.blackhole = null;
  }

  function clearBattlefield() {
    markDebugUse("战场已清空，不结算掉落。");
    clearEnemies({ dropRewards: false });
    state.bossWaveActive = false;
    refreshPanel(elements);
  }

  function setToggle(key, value, message) {
    markDebugUse(message);
    state.debug[key] = Boolean(value);
    syncControls(elements);
  }

  function lockDebugMode() {
    const keepTainted = Boolean(state.debug.runTainted);
    sessionUnlocked = false;
    state.debug.unlocked = false;
    state.debug.enabled = false;
    state.debug.invincible = false;
    state.debug.doubleSpeed = false;
    state.debug.freezeWave = true;
    state.debug.runTainted = keepTainted;
    closePanel();
    syncControls(elements);
  }

  elements.menuButton.addEventListener("click", openGateway);
  elements.quickButton.addEventListener("click", openGateway);
  elements.authForm.addEventListener("submit", submitAuth);
  elements.authCloseButton.addEventListener("click", () => closeAuth());
  elements.authCancelButton.addEventListener("click", () => closeAuth());
  elements.panelCloseButton.addEventListener("click", () => closePanel());
  elements.quickStartButton.addEventListener("click", quickStart);
  elements.applySetupButton.addEventListener("click", applySelectedSetup);
  elements.spawnButton.addEventListener("click", spawnSelectedEnemy);
  elements.damageBossButton.addEventListener("click", damageBoss);
  elements.healButton.addEventListener("click", healPlayer);
  elements.goldButton.addEventListener("click", grantGold);
  elements.clearProjectilesButton.addEventListener("click", clearHostileEffects);
  elements.clearBattlefieldButton.addEventListener("click", clearBattlefield);
  elements.lockButton.addEventListener("click", lockDebugMode);
  elements.invincibleToggle.addEventListener("change", () => setToggle("invincible", elements.invincibleToggle.checked, `玩家无敌已${elements.invincibleToggle.checked ? "开启" : "关闭"}。`));
  elements.speedToggle.addEventListener("change", () => setToggle("doubleSpeed", elements.speedToggle.checked, `双倍移速已${elements.speedToggle.checked ? "开启" : "关闭"}。`));
  elements.freezeWaveToggle.addEventListener("change", () => setToggle("freezeWave", elements.freezeWaveToggle.checked, `波次锁定已${elements.freezeWaveToggle.checked ? "开启" : "关闭"}。`));
  elements.enemySelect.addEventListener("change", () => {
    const boss = Boolean(enemyConfig[elements.enemySelect.value]?.boss);
    elements.enemyCountInput.disabled = boss;
    if (boss) elements.enemyCountInput.value = "1";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "F8") {
      event.preventDefault();
      if (elements.panelOverlay.classList.contains("active")) closePanel();
      else openGateway();
    } else if (event.key === "Escape" && elements.authOverlay.classList.contains("active")) {
      closeAuth();
    } else if (event.key === "Escape" && elements.panelOverlay.classList.contains("active")) {
      closePanel();
    }
  });

  debugUi = {
    elements,
    isUnlocked: () => sessionUnlocked,
    open: openGateway,
    refresh: () => {
      syncControls(elements);
      refreshPanel(elements);
    },
  };
  return debugUi;
}

export function updateDebugModeUi() {
  debugUi?.refresh();
}

export async function createDebugCredential(password, salt = createSalt()) {
  if (String(password).length < MIN_PASSWORD_LENGTH) throw new Error(`密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`);
  return { version: 1, algorithm: "SHA-256", salt, hash: await hashDebugPassword(password, salt) };
}

export async function verifyDebugCredential(password, credentials) {
  if (!credentials?.salt || !credentials?.hash) return false;
  return timingSafeTextEqual(await hashDebugPassword(password, credentials.salt), credentials.hash);
}

export async function hashDebugPassword(password, salt) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("当前浏览器不支持本地密码哈希。");
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function collectElements() {
  const byId = (id) => document.getElementById(id);
  return {
    menuButton: byId("debugMenuButton"), quickButton: byId("debugQuickButton"),
    authOverlay: byId("debugAuthOverlay"), authForm: byId("debugAuthForm"),
    authEyebrow: byId("debugAuthEyebrow"), authTitle: byId("debugAuthTitle"),
    authDescription: byId("debugAuthDescription"), authCloseButton: byId("debugAuthCloseButton"),
    authCancelButton: byId("debugAuthCancelButton"), authSubmitButton: byId("debugAuthSubmitButton"),
    authError: byId("debugAuthError"), passwordInput: byId("debugPasswordInput"),
    passwordConfirmField: byId("debugPasswordConfirmField"), passwordConfirmInput: byId("debugPasswordConfirmInput"),
    panelOverlay: byId("debugPanelOverlay"), panelCloseButton: byId("debugPanelCloseButton"),
    runStatus: byId("debugRunStatus"), panelMessage: byId("debugPanelMessage"),
    difficultySelect: byId("debugDifficultySelect"), waveInput: byId("debugWaveInput"),
    weaponSelect: byId("debugWeaponSelect"), enemySelect: byId("debugEnemySelect"),
    enemyCountInput: byId("debugEnemyCountInput"), quickStartButton: byId("debugQuickStartButton"),
    applySetupButton: byId("debugApplySetupButton"), spawnButton: byId("debugSpawnButton"),
    damageBossButton: byId("debugDamageBossButton"), invincibleToggle: byId("debugInvincibleToggle"),
    speedToggle: byId("debugSpeedToggle"), freezeWaveToggle: byId("debugFreezeWaveToggle"),
    healButton: byId("debugHealButton"), goldButton: byId("debugGoldButton"),
    clearProjectilesButton: byId("debugClearProjectilesButton"),
    clearBattlefieldButton: byId("debugClearBattlefieldButton"), lockButton: byId("debugLockButton"),
  };
}

function configureAuthView(elements, mode) {
  const setup = mode === "setup";
  elements.authEyebrow.textContent = setup ? "FIRST-TIME SETUP" : "RESTRICTED ACCESS";
  elements.authTitle.textContent = setup ? "设置调试密码" : "调试终端认证";
  elements.authDescription.textContent = setup
    ? "首次使用请设置至少 6 位密码。只保存随机盐和哈希，不保存明文，也不会请求后端。"
    : "请输入本机调试密码。验证成功前无法使用生成和作弊功能。";
  elements.passwordConfirmField.hidden = !setup;
  elements.passwordConfirmInput.required = setup;
  elements.passwordInput.autocomplete = setup ? "new-password" : "current-password";
  elements.authSubmitButton.textContent = setup ? "设置并进入" : "验证并进入";
}

function readCredentials() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEBUG_CREDENTIAL_KEY) || "null");
    return parsed?.version === 1 && parsed.salt && parsed.hash ? parsed : null;
  } catch {
    return null;
  }
}

function populateDifficultyOptions(elements) {
  elements.difficultySelect.innerHTML = "";
  const difficulties = difficultyCards();
  for (const difficulty of difficulties) {
    const option = document.createElement("option");
    option.value = difficulty.id;
    option.textContent = `${difficulty.index + 1}. ${difficulty.name} (${difficulty.id})`;
    elements.difficultySelect.appendChild(option);
  }
  elements.difficultySelect.value = state.difficultyId || difficulties[0]?.id || "ember";
}

function populateWeaponOptions(elements) {
  elements.weaponSelect.innerHTML = "";
  for (const weapon of STARTER_WEAPONS) {
    const option = document.createElement("option");
    option.value = weapon.id;
    option.textContent = `${weapon.icon || "◆"} ${weapon.name || weapon.id}`;
    elements.weaponSelect.appendChild(option);
  }
  elements.weaponSelect.value = state.initialWeaponId || STARTER_WEAPONS[0]?.id || "";
}

function populateEnemyOptions(elements) {
  elements.enemySelect.innerHTML = "";
  const entries = Object.values(enemyConfig);
  const groups = [
    { label: "Boss", entries: entries.filter((entry) => entry.boss) },
    { label: "普通 / 精英怪物", entries: entries.filter((entry) => !entry.boss) },
  ];
  for (const group of groups) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    group.entries.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = `${entry.name || entry.id} · ${entry.id}`;
      optgroup.appendChild(option);
    });
    elements.enemySelect.appendChild(optgroup);
  }
  const preferred = enemyConfig.riftblade_saint ? "riftblade_saint" : groups[0].entries[0]?.id || groups[1].entries[0]?.id;
  if (preferred) elements.enemySelect.value = preferred;
  elements.enemyCountInput.disabled = Boolean(enemyConfig[elements.enemySelect.value]?.boss);
}

function applySetup(elements, { clearBattlefield = false } = {}) {
  const wave = selectedWave(elements);
  selectDifficulty(elements.difficultySelect.value);
  if (clearBattlefield) clearEnemies({ dropRewards: false });
  state.wave = wave;
  state.waveDuration = waveDurationFor(wave);
  state.waveTimeLeft = state.waveDuration;
  state.spawnBudget = 0;
  state.pendingNextWave = false;
  state.pendingVictory = false;
  state.spawnedBossWaves?.delete(wave);
  state.bossWaveActive = false;
  resetWaveScenarioState();
  startWaveItems();
  applyWaveStartScenario();
}

function spawnAroundPlayer(id, count, radius) {
  const p = state.player;
  const half = WORLD_SIZE / 2 - Math.max(80, radius);
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const angle = i / Math.max(1, count) * TAU - Math.PI / 2;
    const distance = count === 1 ? 500 : 320 + (i % 3) * 48;
    const x = Math.max(-half, Math.min(half, p.x + Math.cos(angle) * distance));
    const y = Math.max(-half, Math.min(half, p.y + Math.sin(angle) * distance));
    if (spawnEnemyById(id, x, y)) spawned++;
  }
  return spawned;
}

function refreshPanel(elements) {
  if (!elements.runStatus) return;
  const active = Boolean(state.player && (state.mode === "playing" || state.mode === "paused"));
  elements.runStatus.textContent = active
    ? `难度 ${state.difficulty?.name || state.difficultyId} // 第 ${state.wave} 波 // 敌人 ${world.enemies.length}`
    : "等待战斗";
  elements.applySetupButton.disabled = !active;
  elements.spawnButton.disabled = !active;
  elements.damageBossButton.disabled = !world.boss;
}

function syncControls(elements) {
  elements.invincibleToggle.checked = Boolean(state.debug?.invincible);
  elements.speedToggle.checked = Boolean(state.debug?.doubleSpeed);
  elements.freezeWaveToggle.checked = state.debug?.freezeWave !== false;
  elements.quickButton.hidden = !state.debug?.unlocked;
}

function selectedWave(elements) {
  return Math.max(1, Math.min(TOTAL_WAVES, Math.floor(Number(elements.waveInput.value) || 1)));
}

function selectedCount(elements) {
  return Math.max(1, Math.min(20, Math.floor(Number(elements.enemyCountInput.value) || 1)));
}

function setAuthError(elements, message) {
  elements.authError.textContent = message;
}

function setPanelMessage(elements, message, error = false) {
  elements.panelMessage.textContent = message;
  elements.panelMessage.classList.toggle("error", error);
}

function createSalt() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function timingSafeTextEqual(left, right) {
  const a = String(left);
  const b = String(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    mismatch |= (a.charCodeAt(i % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(i % Math.max(1, b.length)) || 0);
  }
  return mismatch === 0;
}
