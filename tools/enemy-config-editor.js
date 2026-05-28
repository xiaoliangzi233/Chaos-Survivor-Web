const CONFIG_URL = "../src/config/enemy-config.json";
const DIFFICULTY_URL = "../src/config/difficulty-config.json";
const PAGE_SIZE = 24;

const NUMBER_FIELDS = ["hp", "speed", "damage", "xp", "radius", "defense", "knockbackResistance"];
const TEXT_FIELDS = ["name", "category", "trait", "behavior", "color", "desc", "tip"];
const RULE_FIELDS = ["waves", "waveRanges", "spawnWaves", "excludeWaves", "bossWave", "bossWaves", "bossWaveRanges"];
const DIFFICULTY_FIELDS = ["difficulties", "difficultyIds", "difficulty", "excludeDifficulties", "disabledDifficulties", "minDifficulty", "maxDifficulty"];
const BASE_WAVE_COUNT = 20;

const DEFAULT_ENEMY = {
  name: "新敌人",
  category: "小怪",
  trait: "未定义特性",
  waves: [1, 20],
  hp: 100,
  speed: 70,
  damage: 10,
  xp: 8,
  radius: 15,
  color: "#42e8ff",
  behavior: "melee",
  desc: "填写敌人描述。",
  tip: "填写应对建议。"
};

const state = {
  config: {},
  originalConfig: {},
  difficulties: [],
  selectedId: "",
  filter: "all",
  query: "",
  page: 1,
  waveScope: "default",
  weightScope: "",
  dirty: false
};

const dom = {
  enemyList: document.getElementById("enemyList"),
  enemyForm: document.getElementById("enemyForm"),
  searchInput: document.getElementById("searchInput"),
  jumpInput: document.getElementById("jumpInput"),
  pageInfo: document.getElementById("pageInfo"),
  prevPageButton: document.getElementById("prevPageButton"),
  nextPageButton: document.getElementById("nextPageButton"),
  addEnemyButton: document.getElementById("addEnemyButton"),
  duplicateButton: document.getElementById("duplicateButton"),
  deleteButton: document.getElementById("deleteButton"),
  resetButton: document.getElementById("resetButton"),
  importButton: document.getElementById("importButton"),
  copyButton: document.getElementById("copyButton"),
  downloadButton: document.getElementById("downloadButton"),
  saveFileButton: document.getElementById("saveFileButton"),
  fileInput: document.getElementById("fileInput"),
  statusText: document.getElementById("statusText"),
  selectedTitle: document.getElementById("selectedTitle"),
  messageBox: document.getElementById("messageBox"),
  behaviorOptions: document.getElementById("behaviorOptions"),
  rawPreview: document.getElementById("rawPreview"),
  validationList: document.getElementById("validationList"),
  enemyPreview: document.getElementById("enemyPreview"),
  summaryHp: document.getElementById("summaryHp"),
  summaryDamage: document.getElementById("summaryDamage"),
  summarySpeed: document.getElementById("summarySpeed"),
  summaryWave: document.getElementById("summaryWave"),
  wavePicker: document.getElementById("wavePicker"),
  waveScopeTabs: document.getElementById("waveScopeTabs"),
  weightScopeTabs: document.getElementById("weightScopeTabs"),
  weightMatrix: document.getElementById("weightMatrix"),
  difficultyWeightInput: document.getElementById("difficultyWeightInput"),
  difficultyPicker: document.getElementById("difficultyPicker"),
  selectAllWavesButton: document.getElementById("selectAllWavesButton"),
  clearWavesButton: document.getElementById("clearWavesButton"),
  clearExcludeWavesButton: document.getElementById("clearExcludeWavesButton"),
  selectAllDifficultiesButton: document.getElementById("selectAllDifficultiesButton"),
  clearDifficultiesButton: document.getElementById("clearDifficultiesButton"),
  fillWeightButton: document.getElementById("fillWeightButton"),
  clearWaveWeightsButton: document.getElementById("clearWaveWeightsButton")
};

init();

async function init() {
  bindEvents();
  await Promise.all([loadDifficulties(), loadConfig()]);
  renderWaveScopeTabs();
  state.weightScope = state.difficulties[0]?.id || "";
  renderWeightScopeTabs();
  renderWeightMatrix();
  renderDifficultyControls();
  renderAll();
}

function bindEvents() {
  dom.searchInput.addEventListener("input", () => {
    state.query = dom.searchInput.value.trim().toLowerCase();
    state.page = 1;
    renderEnemyList();
  });

  dom.jumpInput.addEventListener("change", () => {
    const index = Math.max(1, Number(dom.jumpInput.value || 1));
    state.page = Math.ceil(index / PAGE_SIZE);
    renderEnemyList();
  });

  dom.prevPageButton.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    renderEnemyList();
  });

  dom.nextPageButton.addEventListener("click", () => {
    state.page += 1;
    renderEnemyList();
  });

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      state.page = 1;
      renderEnemyList();
    });
  });

  dom.enemyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyForm();
  });

  dom.enemyForm.addEventListener("input", updatePreviewFromForm);
  dom.enemyForm.addEventListener("change", updatePreviewFromForm);

  dom.selectAllWavesButton.addEventListener("click", () => setWaveChecks("include", true));
  dom.clearWavesButton.addEventListener("click", () => setWaveChecks("include", false));
  dom.clearExcludeWavesButton.addEventListener("click", () => setWaveChecks("exclude", false));
  dom.selectAllDifficultiesButton.addEventListener("click", () => setDifficultyChecks(true));
  dom.clearDifficultiesButton.addEventListener("click", () => setDifficultyChecks(false));
  dom.fillWeightButton.addEventListener("click", fillVisibleWaveWeights);
  dom.clearWaveWeightsButton.addEventListener("click", clearVisibleWaveWeights);

  dom.addEnemyButton.addEventListener("click", addEnemy);
  dom.duplicateButton.addEventListener("click", duplicateEnemy);
  dom.deleteButton.addEventListener("click", deleteEnemy);
  dom.resetButton.addEventListener("click", resetCurrentEnemy);
  dom.importButton.addEventListener("click", () => dom.fileInput.click());
  dom.fileInput.addEventListener("change", importConfig);
  dom.copyButton.addEventListener("click", copyConfig);
  dom.downloadButton.addEventListener("click", downloadConfig);
  dom.saveFileButton.addEventListener("click", saveWithFilePicker);
}

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setConfig(await response.json(), "已读取 src/config/enemy-config.json", false);
  } catch (error) {
    setConfig({}, `读取失败：${error.message}`, false);
    setMessage("无法自动读取配置。请通过“导入 JSON”选择 enemy-config.json。", "error");
  }
}

async function loadDifficulties() {
  try {
    const response = await fetch(DIFFICULTY_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    state.difficulties = Object.entries(config).map(([id, data], index) => ({
      id,
      name: data.name || id,
      desc: data.desc || "",
      index
    }));
  } catch {
    state.difficulties = ["ember", "neon", "overclock", "singularity", "apocalypse", "void_crown"].map((id, index) => ({
      id,
      name: id,
      desc: "",
      index
    }));
  }
}

function setConfig(config, status, shouldRender = true) {
  state.config = clone(config);
  state.originalConfig = clone(config);
  state.selectedId = Object.keys(state.config)[0] || "";
  state.page = 1;
  state.dirty = false;
  dom.statusText.textContent = status;
  renderBehaviorOptions();
  renderWaveControls();
  renderWeightMatrix();
  if (shouldRender) renderAll();
}

function renderAll() {
  renderEnemyList();
  fillFormFromSelected();
  updatePreviewFromForm();
  updateButtons();
}

function renderEnemyList() {
  const entries = filteredEntries();
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pageCount);
  const start = (state.page - 1) * PAGE_SIZE;
  const visible = entries.slice(start, start + PAGE_SIZE);

  dom.enemyList.innerHTML = "";
  dom.pageInfo.textContent = `${state.page} / ${pageCount} · ${entries.length}`;
  dom.prevPageButton.disabled = state.page <= 1;
  dom.nextPageButton.disabled = state.page >= pageCount;

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "enemy-card";
    empty.innerHTML = "<strong>没有匹配条目</strong><span>调整搜索或筛选条件</span>";
    dom.enemyList.appendChild(empty);
    return;
  }

  visible.forEach(([id, enemy], visibleIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `enemy-card${id === state.selectedId ? " active" : ""}`;
    button.style.setProperty("--enemy-color", enemy.color || "#42e8ff");
    button.innerHTML = `
      <small>#${String(start + visibleIndex + 1).padStart(3, "0")}</small>
      <strong>${escapeHtml(enemy.name || id)}</strong>
      <span>${escapeHtml(id)} · ${escapeHtml(enemy.behavior || "unknown")}</span>
      <em>${enemy.boss ? "Boss" : "小怪"} · ${waveSummary(enemy)}</em>
    `;
    button.addEventListener("click", () => selectEnemy(id));
    dom.enemyList.appendChild(button);
  });
}

function filteredEntries() {
  return Object.entries(state.config).filter(([id, enemy]) => {
    if (state.filter === "boss" && !enemy.boss) return false;
    if (state.filter === "normal" && enemy.boss) return false;
    if (!state.query) return true;
    const haystack = [id, enemy.name, enemy.category, enemy.trait, enemy.behavior, enemy.desc].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(state.query);
  });
}

function selectEnemy(id) {
  state.selectedId = id;
  renderAll();
}

function fillFormFromSelected() {
  const enemy = currentEnemy();
  const form = dom.enemyForm;
  dom.selectedTitle.textContent = enemy ? `${enemy.name || state.selectedId} / ${state.selectedId}` : "未选择敌人";
  form.reset();
  if (!enemy) return;

  form.elements.id.value = state.selectedId;
  for (const field of TEXT_FIELDS) {
    if (form.elements[field]) form.elements[field].value = enemy[field] ?? defaultValueFor(field);
  }
  for (const field of NUMBER_FIELDS) {
    if (form.elements[field]) form.elements[field].value = enemy[field] ?? "";
  }
  form.elements.boss.checked = Boolean(enemy.boss);
  setWaveControlsFromEnemy(enemy);
  setDifficultyControlsFromEnemy(enemy);
  setWeightControlsFromEnemy(enemy);
}

function applyForm() {
  const parsed = readEnemyFromForm();
  if (!parsed.ok) {
    setMessage(parsed.error, "error");
    return;
  }

  const nextId = parsed.id;
  if (nextId !== state.selectedId && state.config[nextId]) {
    setMessage(`ID “${nextId}” 已存在，请换一个 id。`, "error");
    return;
  }

  if (nextId !== state.selectedId) {
    const entries = Object.entries(state.config).map(([id, enemy]) => id === state.selectedId ? [nextId, parsed.enemy] : [id, enemy]);
    state.config = Object.fromEntries(entries);
    state.selectedId = nextId;
  } else {
    state.config[state.selectedId] = parsed.enemy;
  }

  markDirty(`已应用 ${nextId}。记得导出或保存 JSON。`);
  renderBehaviorOptions();
  renderAll();
}

function readEnemyFromForm() {
  const form = dom.enemyForm;
  const id = form.elements.id.value.trim();
  if (!/^[a-z0-9_]+$/.test(id)) {
    return { ok: false, error: "ID 只能使用小写字母、数字和下划线。" };
  }

  const previous = state.config[state.selectedId] || {};
  const enemy = clone(previous);
  for (const field of [...TEXT_FIELDS, ...NUMBER_FIELDS, ...DIFFICULTY_FIELDS, "spawnWeight", "weight"]) delete enemy[field];
  delete enemy.boss;
  for (const field of TEXT_FIELDS) {
    const value = form.elements[field]?.value?.trim();
    if (value) enemy[field] = value;
  }

  for (const field of NUMBER_FIELDS) {
    const raw = form.elements[field]?.value;
    if (raw !== "") enemy[field] = Number(raw);
  }

  if (form.elements.boss.checked) enemy.boss = true;
  applyWaveSelection(enemy);
  applyDifficultySelection(enemy);
  applyWeightSelection(enemy);
  return { ok: true, id, enemy };
}

function renderWaveControls() {
  const count = maxWaveCount();
  dom.wavePicker.innerHTML = "";
  for (let wave = 1; wave <= count; wave += 1) {
    const row = document.createElement("label");
    row.className = "wave-cell";
    row.innerHTML = `
      <strong>${wave}</strong>
      <input type="checkbox" data-wave="${wave}" data-wave-kind="include" aria-label="第 ${wave} 波出现" />
      <input type="checkbox" data-wave="${wave}" data-wave-kind="exclude" aria-label="第 ${wave} 波排除" />
    `;
    dom.wavePicker.appendChild(row);
  }
}

function renderWaveScopeTabs() {
  const scopes = [{ id: "default", label: "默认波次", sub: "通用" }]
    .concat(state.difficulties.map((difficulty) => ({ id: difficulty.id, label: difficulty.name, sub: difficulty.id })));
  dom.waveScopeTabs.innerHTML = "";
  for (const scope of scopes) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wave-scope-button${scope.id === state.waveScope ? " active" : ""}`;
    button.dataset.scope = scope.id;
    button.innerHTML = `<strong>${escapeHtml(scope.label)}</strong><span>${escapeHtml(scope.sub)}</span>`;
    button.addEventListener("click", () => {
      state.waveScope = scope.id;
      renderWaveScopeTabs();
      setWaveControlsFromEnemy(currentEnemy() || {});
      updatePreviewFromForm();
    });
    dom.waveScopeTabs.appendChild(button);
  }
}

function renderWeightScopeTabs() {
  dom.weightScopeTabs.innerHTML = "";
  for (const difficulty of state.difficulties) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wave-scope-button${difficulty.id === state.weightScope ? " active" : ""}`;
    button.dataset.scope = difficulty.id;
    button.innerHTML = `<strong>${escapeHtml(difficulty.name)}</strong><span>${escapeHtml(difficulty.id)}</span>`;
    button.addEventListener("click", () => {
      state.weightScope = difficulty.id;
      renderWeightScopeTabs();
      setWeightControlsFromEnemy(currentEnemy() || {});
      updatePreviewFromForm();
    });
    dom.weightScopeTabs.appendChild(button);
  }
}

function renderWeightMatrix() {
  dom.weightMatrix.innerHTML = "";
  const count = maxWaveCount();
  for (let wave = 1; wave <= count; wave += 1) {
    const label = document.createElement("label");
    label.className = "weight-cell";
    label.innerHTML = `
      <span>${wave}</span>
      <input type="number" min="0" step="0.1" data-weight-wave="${wave}" placeholder="继承" />
    `;
    dom.weightMatrix.appendChild(label);
  }
}

function setWaveControlsFromEnemy(enemy) {
  const rules = waveRulesForCurrentScope(enemy);
  const included = wavesFromEnemyRules(enemy, rules, false);
  const excluded = wavesFromRule(rules.excludeWaves);
  dom.wavePicker.querySelectorAll("input[data-wave-kind]").forEach((input) => {
    const wave = Number(input.dataset.wave);
    input.checked = input.dataset.waveKind === "include" ? included.has(wave) : excluded.has(wave);
  });
}

function waveRulesForCurrentScope(enemy) {
  if (state.waveScope === "default") return enemy;
  const scoped = enemy.difficultyWaves?.[state.waveScope]
    || enemy.difficultyWaveRules?.[state.waveScope]
    || enemy.waveRulesByDifficulty?.[state.waveScope];
  return scoped || enemy;
}

function applyWaveSelection(enemy) {
  if (state.waveScope === "default") {
    for (const field of RULE_FIELDS) delete enemy[field];
    writeWaveSelectionTo(enemy, enemy);
    return;
  }

  enemy.difficultyWaves ||= {};
  const scopedRules = {};
  writeWaveSelectionTo(enemy, scopedRules);
  enemy.difficultyWaves[state.waveScope] = scopedRules;
}

function writeWaveSelectionTo(enemy, target) {
  for (const field of RULE_FIELDS) delete target[field];
  const included = checkedWaves("include");
  const excluded = checkedWaves("exclude");
  for (const wave of excluded) included.delete(wave);

  if (enemy.boss) {
    if (included.size === 1) target.bossWave = Array.from(included)[0];
    else if (included.size > 1) target.bossWaves = Array.from(included).sort((a, b) => a - b);
  } else if (included.size) {
    const list = Array.from(included).sort((a, b) => a - b);
    const range = continuousRange(list);
    if (range) target.waves = range;
    else target.spawnWaves = list;
  }

  if (excluded.size) target.excludeWaves = Array.from(excluded).sort((a, b) => a - b);
}

function checkedWaves(kind) {
  return new Set(Array.from(dom.wavePicker.querySelectorAll(`input[data-wave-kind="${kind}"]:checked`)).map((input) => Number(input.dataset.wave)));
}

function setWaveChecks(kind, checked) {
  dom.wavePicker.querySelectorAll(`input[data-wave-kind="${kind}"]`).forEach((input) => {
    input.checked = checked;
  });
  updatePreviewFromForm();
}

function renderDifficultyControls() {
  dom.difficultyPicker.innerHTML = "";
  for (const difficulty of state.difficulties) {
    const label = document.createElement("label");
    label.className = "difficulty-chip";
    label.innerHTML = `
      <input type="checkbox" data-difficulty-id="${difficulty.id}" />
      <span><strong>${escapeHtml(difficulty.name)}</strong><em>${escapeHtml(difficulty.id)}</em></span>
    `;
    dom.difficultyPicker.appendChild(label);
  }

  const minSelect = dom.enemyForm.elements.minDifficulty;
  const maxSelect = dom.enemyForm.elements.maxDifficulty;
  fillDifficultySelect(minSelect, "不限制最低");
  fillDifficultySelect(maxSelect, "不限制最高");
}

function fillDifficultySelect(select, emptyText) {
  select.innerHTML = `<option value="">${emptyText}</option>`;
  for (const difficulty of state.difficulties) {
    const option = document.createElement("option");
    option.value = difficulty.id;
    option.textContent = `${difficulty.name}（${difficulty.id}）`;
    select.appendChild(option);
  }
}

function setDifficultyControlsFromEnemy(enemy) {
  const allowed = difficultyAllowSet(enemy);
  dom.difficultyPicker.querySelectorAll("input[data-difficulty-id]").forEach((input) => {
    input.checked = allowed.has(input.dataset.difficultyId);
  });
  dom.enemyForm.elements.minDifficulty.value = enemy.minDifficulty || "";
  dom.enemyForm.elements.maxDifficulty.value = enemy.maxDifficulty || "";
}

function applyDifficultySelection(enemy) {
  for (const field of DIFFICULTY_FIELDS) delete enemy[field];
  const selected = Array.from(dom.difficultyPicker.querySelectorAll("input[data-difficulty-id]:checked")).map((input) => input.dataset.difficultyId);
  const allIds = state.difficulties.map((item) => item.id);
  if (selected.length && selected.length < allIds.length) enemy.difficulties = selected;
  if (!selected.length) enemy.difficulties = [];

  const minDifficulty = dom.enemyForm.elements.minDifficulty.value;
  const maxDifficulty = dom.enemyForm.elements.maxDifficulty.value;
  if (minDifficulty) enemy.minDifficulty = minDifficulty;
  if (maxDifficulty) enemy.maxDifficulty = maxDifficulty;
}

function setWeightControlsFromEnemy(enemy) {
  dom.enemyForm.elements.spawnWeight.value = enemy.spawnWeight ?? enemy.weight ?? "";
  const difficultyWeight = enemy.difficultyWeights?.[state.weightScope] ?? enemy.spawnWeightsByDifficulty?.[state.weightScope] ?? "";
  dom.difficultyWeightInput.value = difficultyWeight;
  const waveWeights = enemy.difficultyWaveWeights?.[state.weightScope] || enemy.waveWeightsByDifficulty?.[state.weightScope] || {};
  dom.weightMatrix.querySelectorAll("input[data-weight-wave]").forEach((input) => {
    input.value = waveWeights[input.dataset.weightWave] ?? "";
  });
}

function applyWeightSelection(enemy) {
  const base = dom.enemyForm.elements.spawnWeight.value;
  if (base !== "") enemy.spawnWeight = Number(base);
  else delete enemy.spawnWeight;

  const difficultyWeight = dom.difficultyWeightInput.value;
  if (state.weightScope && difficultyWeight !== "") {
    enemy.difficultyWeights ||= {};
    enemy.difficultyWeights[state.weightScope] = Number(difficultyWeight);
  } else if (state.weightScope && enemy.difficultyWeights) {
    delete enemy.difficultyWeights[state.weightScope];
    if (!Object.keys(enemy.difficultyWeights).length) delete enemy.difficultyWeights;
  }

  if (state.weightScope) {
    const entries = {};
    dom.weightMatrix.querySelectorAll("input[data-weight-wave]").forEach((input) => {
      if (input.value !== "") entries[input.dataset.weightWave] = Number(input.value);
    });
    if (Object.keys(entries).length) {
      enemy.difficultyWaveWeights ||= {};
      enemy.difficultyWaveWeights[state.weightScope] = entries;
    } else if (enemy.difficultyWaveWeights) {
      delete enemy.difficultyWaveWeights[state.weightScope];
      if (!Object.keys(enemy.difficultyWaveWeights).length) delete enemy.difficultyWaveWeights;
    }
  }
}

function fillVisibleWaveWeights() {
  const value = dom.difficultyWeightInput.value || dom.enemyForm.elements.spawnWeight.value || "1";
  dom.weightMatrix.querySelectorAll("input[data-weight-wave]").forEach((input) => {
    input.value = value;
  });
  updatePreviewFromForm();
}

function clearVisibleWaveWeights() {
  dom.weightMatrix.querySelectorAll("input[data-weight-wave]").forEach((input) => {
    input.value = "";
  });
  updatePreviewFromForm();
}

function difficultyAllowSet(enemy) {
  const all = new Set(state.difficulties.map((item) => item.id));
  const include = enemy.difficulties ?? enemy.difficultyIds ?? enemy.difficulty;
  const exclude = enemy.excludeDifficulties ?? enemy.disabledDifficulties;
  let allowed = include == null ? all : new Set(toList(include));
  if (exclude != null) for (const id of toList(exclude)) allowed.delete(id);
  return allowed;
}

function setDifficultyChecks(checked) {
  dom.difficultyPicker.querySelectorAll("input[data-difficulty-id]").forEach((input) => {
    input.checked = checked;
  });
  updatePreviewFromForm();
}

function updatePreviewFromForm() {
  const parsed = readEnemyFromForm();
  if (!parsed.ok) {
    setValidation([{ type: "error", text: parsed.error }]);
    return;
  }
  const enemy = parsed.enemy;
  const issues = validateEnemy(parsed.id, enemy);
  setValidation(issues);
  renderPreview(parsed.id, enemy);
  dom.rawPreview.textContent = JSON.stringify(enemy, null, 2);
}

function renderPreview(id, enemy) {
  const color = enemy.color || "#42e8ff";
  const size = Math.max(54, Math.min(132, (Number(enemy.radius) || 15) * (enemy.boss ? 2.2 : 4)));
  dom.enemyPreview.style.setProperty("--enemy-color", color);
  dom.enemyPreview.style.setProperty("--preview-size", `${size}px`);
  dom.enemyPreview.classList.toggle("boss", Boolean(enemy.boss));
  dom.enemyPreview.classList.toggle("normal", !enemy.boss);
  dom.enemyPreview.querySelector("strong").textContent = enemy.name || id || "未命名";
  dom.enemyPreview.querySelector("span").textContent = `${enemy.category || (enemy.boss ? "Boss" : "小怪")} · ${enemy.trait || enemy.behavior || "未定义"}`;
  dom.summaryHp.textContent = enemy.hp ?? "-";
  dom.summaryDamage.textContent = enemy.damage ?? "-";
  dom.summarySpeed.textContent = enemy.speed ?? "-";
  dom.summaryWave.textContent = waveSummaryForScope(enemy);
}

function setValidation(issues) {
  const normalized = issues.length ? issues : [{ type: "ok", text: "当前条目基础校验通过。" }];
  dom.validationList.innerHTML = "";
  for (const issue of normalized) {
    const li = document.createElement("li");
    li.className = issue.type || "ok";
    li.textContent = issue.text;
    dom.validationList.appendChild(li);
  }
}

function validateEnemy(id, enemy) {
  const issues = [];
  if (!id) issues.push({ type: "error", text: "缺少敌人 ID。" });
  if (!enemy.name) issues.push({ type: "warn", text: "建议填写显示名 name。" });
  if (!enemy.behavior) issues.push({ type: "warn", text: "建议填写 behavior，否则会走默认追逐逻辑。" });
  if (!enemy.color || !/^#[0-9a-fA-F]{6}$/.test(enemy.color)) issues.push({ type: "error", text: "color 必须是 #RRGGBB 格式。" });

  for (const field of ["hp", "speed", "damage", "xp", "radius"]) {
    if (!Number.isFinite(Number(enemy[field]))) issues.push({ type: "error", text: `${field} 必须是数字。` });
  }

  const hasNormalWave = enemy.waves != null || enemy.waveRanges != null || enemy.spawnWaves != null;
  const hasBossWave = enemy.bossWave != null || enemy.bossWaves != null || enemy.bossWaveRanges != null;
  if (enemy.boss && !hasBossWave && !hasNormalWave) issues.push({ type: "error", text: "Boss 至少要勾选一个出现波次。" });
  if (!enemy.boss && !hasNormalWave) issues.push({ type: "warn", text: "小怪没有勾选出现波次，普通刷怪不会选到它。" });
  if (enemy.boss && enemy.category !== "Boss") issues.push({ type: "warn", text: "boss 为 true 时，category 建议设置为 Boss。" });
  if (Array.isArray(enemy.difficulties) && !enemy.difficulties.length) issues.push({ type: "warn", text: "没有勾选任何难度，该敌人不会在任何难度出现。" });
  const baseWeight = enemy.spawnWeight ?? enemy.weight;
  if (baseWeight != null && (!Number.isFinite(Number(baseWeight)) || Number(baseWeight) < 0)) issues.push({ type: "error", text: "默认权重必须是大于等于 0 的数字。" });
  return issues;
}

function addEnemy() {
  const id = uniqueId("new_enemy");
  state.config[id] = clone(DEFAULT_ENEMY);
  state.selectedId = id;
  state.page = Math.ceil(Object.keys(state.config).length / PAGE_SIZE);
  markDirty("已新增敌人，请填写配置后应用。");
  renderAll();
}

function duplicateEnemy() {
  const enemy = currentEnemy();
  if (!enemy) return;
  const id = uniqueId(`${state.selectedId}_copy`);
  state.config[id] = { ...clone(enemy), name: `${enemy.name || state.selectedId} 复制` };
  state.selectedId = id;
  state.page = Math.ceil(Object.keys(state.config).length / PAGE_SIZE);
  markDirty(`已复制为 ${id}。`);
  renderAll();
}

function deleteEnemy() {
  if (!state.selectedId) return;
  const id = state.selectedId;
  if (!confirm(`确定删除 ${id}？此操作只影响当前编辑器内存，导出前不会写入文件。`)) return;
  delete state.config[id];
  state.selectedId = Object.keys(state.config)[0] || "";
  markDirty(`已删除 ${id}。`);
  renderAll();
}

function resetCurrentEnemy() {
  if (!state.selectedId) return;
  const original = state.originalConfig[state.selectedId];
  if (!original) {
    setMessage("原始配置中没有这个条目，无法恢复。", "error");
    return;
  }
  state.config[state.selectedId] = clone(original);
  markDirty(`已恢复 ${state.selectedId} 到加载时状态。`);
  renderAll();
}

async function importConfig() {
  const file = dom.fileInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    setConfig(JSON.parse(text), `已导入 ${file.name}`);
    setMessage("导入成功。", "success");
  } catch (error) {
    setMessage(`导入失败：${error.message}`, "error");
  } finally {
    dom.fileInput.value = "";
  }
}

async function copyConfig() {
  try {
    await navigator.clipboard.writeText(outputJson());
    setMessage("已复制完整 enemy-config.json。", "success");
  } catch {
    setMessage("复制失败，当前浏览器可能未授权剪贴板。", "error");
  }
}

function downloadConfig() {
  const blob = new Blob([outputJson()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "enemy-config.json";
  link.click();
  URL.revokeObjectURL(url);
  setMessage("已生成下载文件。", "success");
}

async function saveWithFilePicker() {
  if (!window.showSaveFilePicker) {
    downloadConfig();
    setMessage("当前浏览器不支持直接保存，已改为下载 JSON。", "error");
    return;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "enemy-config.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(outputJson());
    await writable.close();
    state.dirty = false;
    updateButtons();
    setMessage("已保存到文件。", "success");
  } catch (error) {
    if (error.name !== "AbortError") setMessage(`保存失败：${error.message}`, "error");
  }
}

function outputJson() {
  return `${JSON.stringify(state.config, null, 2)}\n`;
}

function markDirty(message) {
  state.dirty = true;
  dom.statusText.textContent = "配置已修改，尚未导出";
  setMessage(message, "success");
  updateButtons();
}

function updateButtons() {
  const hasSelection = Boolean(state.selectedId);
  dom.duplicateButton.disabled = !hasSelection;
  dom.deleteButton.disabled = !hasSelection;
  dom.resetButton.disabled = !hasSelection;
  dom.copyButton.disabled = !Object.keys(state.config).length;
  dom.downloadButton.disabled = !Object.keys(state.config).length;
  dom.saveFileButton.disabled = !Object.keys(state.config).length;
}

function renderBehaviorOptions() {
  const behaviors = Array.from(new Set(Object.values(state.config).map((enemy) => enemy.behavior).filter(Boolean))).sort();
  dom.behaviorOptions.innerHTML = "";
  for (const behavior of behaviors) {
    const option = document.createElement("option");
    option.value = behavior;
    dom.behaviorOptions.appendChild(option);
  }
}

function currentEnemy() {
  return state.selectedId ? state.config[state.selectedId] : null;
}

function maxWaveCount() {
  let max = BASE_WAVE_COUNT;
  for (const enemy of Object.values(state.config)) {
    const waves = new Set([...wavesFromEnemy(enemy, false), ...wavesFromRule(enemy.excludeWaves)]);
    for (const scoped of Object.values(enemy.difficultyWaves || {})) {
      for (const wave of wavesFromEnemyRules(enemy, scoped, true)) waves.add(wave);
      for (const wave of wavesFromRule(scoped.excludeWaves)) waves.add(wave);
    }
    for (const wave of waves) max = Math.max(max, wave);
  }
  return max;
}

function wavesFromEnemy(enemy, includeExcluded) {
  return wavesFromEnemyRules(enemy, enemy, includeExcluded);
}

function wavesFromEnemyRules(enemy, ruleSet, includeExcluded) {
  const rules = enemy.boss
    ? [ruleSet.bossWave, ruleSet.bossWaves, ruleSet.bossWaveRanges, ruleSet.waves, ruleSet.waveRanges, ruleSet.spawnWaves]
    : [ruleSet.waves, ruleSet.waveRanges, ruleSet.spawnWaves];
  const waves = new Set();
  for (const rule of rules) for (const wave of wavesFromRule(rule)) waves.add(wave);
  if (!includeExcluded) for (const wave of wavesFromRule(ruleSet.excludeWaves)) waves.delete(wave);
  return waves;
}

function wavesFromRule(rule) {
  const waves = new Set();
  collectWaves(rule, waves);
  return waves;
}

function collectWaves(rule, waves) {
  if (rule == null) return;
  if (typeof rule === "number") {
    if (Number.isFinite(rule) && rule > 0) waves.add(Math.round(rule));
    return;
  }
  if (!Array.isArray(rule)) return;
  if (rule.length === 2 && rule.every((value) => typeof value === "number")) {
    const start = Math.min(rule[0], rule[1]);
    const end = Math.max(rule[0], rule[1]);
    for (let wave = start; wave <= end; wave += 1) waves.add(wave);
    return;
  }
  for (const item of rule) collectWaves(item, waves);
}

function continuousRange(list) {
  if (!list.length) return null;
  const start = list[0];
  const end = list[list.length - 1];
  for (let index = 0; index < list.length; index += 1) {
    if (list[index] !== start + index) return null;
  }
  return [start, end];
}

function waveSummary(enemy) {
  const waves = Array.from(wavesFromEnemy(enemy, false)).sort((a, b) => a - b);
  return formatWaveList(waves);
}

function waveSummaryForScope(enemy) {
  const rules = waveRulesForCurrentScope(enemy);
  const waves = Array.from(wavesFromEnemyRules(enemy, rules, false)).sort((a, b) => a - b);
  return formatWaveList(waves);
}

function formatWaveList(waves) {
  if (!waves.length) return "-";
  const range = continuousRange(waves);
  return range ? `${range[0]}-${range[1]}` : waves.join(",");
}

function uniqueId(base) {
  const cleanBase = base.replace(/[^a-z0-9_]/g, "_") || "new_enemy";
  let next = cleanBase;
  let index = 2;
  while (state.config[next]) {
    next = `${cleanBase}_${index}`;
    index += 1;
  }
  return next;
}

function defaultValueFor(field) {
  if (field === "category") return "小怪";
  if (field === "color") return "#42e8ff";
  return "";
}

function toList(value) {
  return Array.isArray(value) ? value : [value];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setMessage(text, type = "") {
  dom.messageBox.textContent = text;
  dom.messageBox.className = `message-box ${type}`.trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
