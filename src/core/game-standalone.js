(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const WORLD = 4800;
  const ZOOM = 1.28;
  const TOTAL_WAVES = 20;
  const WAVE_1 = 30;
  const WAVE_MAX = 60;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const ui = {
    hpBar: document.getElementById("hpBar"),
    hpText: document.getElementById("hpText"),
    xpBar: document.getElementById("xpBar"),
    levelText: document.getElementById("levelText"),
    timerText: document.getElementById("timerText"),
    waveText: document.getElementById("waveText"),
    killText: document.getElementById("killText"),
    coinText: document.getElementById("coinText"),
    fpsText: document.getElementById("fpsText"),
    startOverlay: document.getElementById("startOverlay"),
    levelOverlay: document.getElementById("levelOverlay"),
    endOverlay: document.getElementById("endOverlay"),
    levelEyebrow: document.querySelector("#levelOverlay .eyebrow"),
    levelTitle: document.querySelector("#levelOverlay h2"),
    choiceList: document.getElementById("choiceList"),
    startButton: document.getElementById("startButton"),
    restartButton: document.getElementById("restartButton"),
    pauseButton: document.getElementById("pauseButton"),
    muteButton: document.getElementById("muteButton"),
    bestText: document.getElementById("bestText"),
    endEyebrow: document.getElementById("endEyebrow"),
    endTitle: document.getElementById("endTitle"),
    endStats: document.getElementById("endStats"),
    touchStick: document.getElementById("touchStick"),
  };

  const enemyDefs = {
    zombie: ["僵尸", 44, 78, 14, 5, "#7ccf68", 1, 20, "melee"],
    lancer: ["突刺者", 52, 86, 18, 7, "#ff9f6e", 3, 20, "dash"],
    wisp: ["冰霜幽灵", 38, 70, 10, 8, "#9ff4ff", 4, 20, "ranged"],
    slime_large: ["大型史莱姆", 160, 45, 25, 16, "#77ff8a", 5, 20, "split"],
    blackhole_mage: ["黑洞法师", 62, 56, 10, 12, "#8d6bff", 7, 20, "hazard"],
    mech_worm: ["机械蠕虫", 76, 98, 17, 12, "#ff65d8", 8, 20, "melee"],
    embermine: ["余烬地雷兽", 55, 72, 16, 9, "#ff7a1a", 8, 20, "mine"],
    siege_pylon: ["攻城棱塔", 120, 28, 15, 15, "#42e8ff", 9, 20, "ranged"],
    razorbat: ["刃翼蝠", 36, 150, 13, 8, "#c7d2ff", 9, 20, "bat"],
    brood_seeder: ["巢种播撒者", 88, 55, 10, 16, "#a3e635", 10, 20, "summon"],
    shield_caster: ["护盾施术者", 72, 52, 7, 14, "#7dd3fc", 11, 20, "shield"],
    wizard: ["奥术巫师", 64, 50, 16, 14, "#b48cff", 12, 20, "ranged"],
    exploder: ["爆裂自毁者", 38, 104, 32, 9, "#ff4d6d", 12, 20, "explode"],
    tank: ["重甲蛮牛", 150, 48, 24, 15, "#b48cff", 6, 20, "melee"],
    gunner: ["几何枪手", 70, 62, 15, 13, "#f3f7ff", 13, 20, "ranged"],
    artillery: ["炮击方碑", 95, 34, 18, 18, "#f97316", 14, 20, "mine"],
  };
  const bossDefs = {
    5: ["风暴暴君", 2400, 54, 30, 58, "#42e8ff"],
    10: ["虚空巨像", 4200, 38, 36, 70, "#8d6bff"],
    15: ["几何吞噬者", 5600, 62, 40, 64, "#77ff8a"],
    20: ["暗晶裂境主", 7600, 44, 44, 76, "#ff4d6d"],
  };
  const starters = [
    ["bolt", "✦", "棱镜电弧", "自动锁定最近敌人，发射高亮能量弹。"],
    ["dagger", "⟡", "像素飞刀", "向移动方向发射穿透飞刀。"],
    ["ice", "❄", "霜晶追踪", "冰晶会自动转向追踪目标。"],
    ["missile", "◆", "核心飞弹", "追踪飞弹命中后范围爆炸。"],
    ["boomerang", "✧", "霓虹回旋刃", "飞出后返回，双向切割敌人。"],
    ["orb", "●", "星环旋转球", "能量球围绕玩家旋转并持续切割。"],
  ];

  const s = {
    mode: "menu", time: 0, wave: 1, waveLeft: WAVE_1, spawn: 0, kills: 0, gold: 0,
    camX: 0, camY: 0, shake: 0, flash: 0, boss: null, pendingNext: false, pendingWin: false,
  };
  const player = { x: 0, y: 0, r: 14, hp: 110, maxHp: 110, speed: 210, level: 1, xp: 0, xpNeed: 14, magnet: 92, inv: 0, dirX: 1, dirY: 0, dmg: 1 };
  const input = { up: false, down: false, left: false, right: false, vx: 0, vy: 0, pid: null };
  let weapons, enemies = [], bullets = [], enemyBullets = [], hazards = [], gems = [], particles = [], map = [], props = [];
  let W = 1, H = 1, DPR = 1, last = 0, fps = 60, muted = false, audio = null;

  function newWeapons() {
    return {
      bolt: { lv: 0, cd: .62, t: 0, dmg: 18, speed: 560 },
      dagger: { lv: 0, cd: 1.55, t: 1.3, count: 1, dmg: 18 },
      ice: { lv: 0, cd: 1.05, t: .8, count: 1, dmg: 16, speed: 430 },
      missile: { lv: 0, cd: 1.75, t: 1.2, dmg: 26, speed: 360 },
      boomerang: { lv: 0, cd: 1.9, t: 1.4, count: 1, dmg: 20, speed: 480 },
      orb: { lv: 0, angle: 0, count: 2, radius: 76, dmg: 20, hitCd: .22 },
      pulse: { lv: 0, cd: 3.4, t: 2.4, dmg: 24, radius: 102 },
    };
  }

  function start() {
    Object.assign(s, { mode: "choosing", time: 0, wave: 1, waveLeft: waveDuration(1), spawn: 0, kills: 0, gold: 0, camX: 0, camY: 0, shake: 0, flash: 0, boss: null, pendingNext: false, pendingWin: false });
    Object.assign(player, { x: 0, y: 0, hp: 110, maxHp: 110, speed: 210, level: 1, xp: 0, xpNeed: 14, magnet: 92, inv: 0, dirX: 1, dirY: 0, dmg: 1 });
    weapons = newWeapons();
    enemies = []; bullets = []; enemyBullets = []; hazards = []; gems = []; particles = [];
    makeMap();
    ui.startOverlay.classList.remove("active");
    ui.endOverlay.classList.remove("active");
    showChoices("STARTER WEAPON", "选择开局武器", pick(starters, 3).map(([id, icon, name, desc]) => ({ id, icon, name, desc })), (item) => {
      weapons[item.id].lv = 1;
      hideChoices();
      s.mode = "playing";
      tone(360, .08, "triangle");
    });
  }

  function update(dt) {
    if (s.mode !== "playing") return;
    s.time += dt; s.waveLeft = Math.max(0, s.waveLeft - dt); s.shake = Math.max(0, s.shake - dt * 20); s.flash = Math.max(0, s.flash - dt * 3);
    movePlayer(dt); spawnWave(dt); updateEnemies(dt); updateWeapons(dt); updateBullets(dt); updateEnemyAttacks(dt); updateGems(dt); updateParticles(dt); updateCamera(dt);
    checkLevel();
    if (player.hp <= 0) end(false);
    if (s.mode === "playing" && s.waveLeft <= 0) completeWave();
  }

  function movePlayer(dt) {
    let vx = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.vx;
    let vy = (input.down ? 1 : 0) - (input.up ? 1 : 0) + input.vy;
    const len = Math.hypot(vx, vy);
    if (len > .001) {
      vx /= len; vy /= len; player.dirX = vx; player.dirY = vy;
      player.x += vx * player.speed * dt; player.y += vy * player.speed * dt;
      if (Math.random() < .45) part("dust", player.x - vx * 12, player.y - vy * 12, "#8fa2a0", -vx * 40, -vy * 40, .35, 7);
    }
    const half = WORLD / 2 - 60; player.x = clamp(player.x, -half, half); player.y = clamp(player.y, -half, half);
    player.inv = Math.max(0, player.inv - dt);
  }

  function spawnWave(dt) {
    if (bossDefs[s.wave] && !s.boss) spawnBoss(s.wave);
    s.spawn += dt * (3.8 + s.wave * .55);
    while (s.spawn >= 1 && enemies.length < 420) { s.spawn--; spawnEnemy(randomEnemyId()); }
  }
  function randomEnemyId() {
    const ids = Object.keys(enemyDefs).filter((id) => s.wave >= enemyDefs[id][6] && s.wave <= enemyDefs[id][7]);
    return ids[Math.floor(Math.random() * ids.length)] || "zombie";
  }
  function spawnEnemy(id, x, y) {
    const d = enemyDefs[id] || enemyDefs.zombie, a = Math.random() * TAU, dist = 720 + Math.random() * 220, scale = 1 + s.wave * .08;
    const e = { id, name: d[0], x: x ?? player.x + Math.cos(a) * dist, y: y ?? player.y + Math.sin(a) * dist, hp: d[1] * scale, maxHp: d[1] * scale, speed: d[2], damage: d[3], r: d[4], xp: d[4] === 25 ? 16 : d[4], color: d[5], behavior: d[8], t: Math.random() * TAU, cd: .8 + Math.random(), flash: 0, hitCd: 0, flip: 1, dashState: "ready", dashCooldown: 0, dashWindup: 0, dashTime: 0, dashVx: 0, dashVy: 0 };
    clampEnemy(e); enemies.push(e);
  }
  function spawnBoss(wave) {
    const d = bossDefs[wave], a = Math.random() * TAU;
    const e = { id: "boss", name: d[0], x: player.x + Math.cos(a) * 760, y: player.y + Math.sin(a) * 760, hp: d[1], maxHp: d[1], speed: d[2], damage: d[3], r: d[4], xp: 180 + wave * 20, color: d[5], behavior: "boss", boss: true, t: 0, cd: 1, flash: 0, hitCd: 0, flip: 1 };
    clampEnemy(e); enemies.push(e); s.boss = e;
  }
  function clampEnemy(e) { const h = WORLD / 2; e.x = clamp(e.x, -h + e.r, h - e.r); e.y = clamp(e.y, -h + e.r, h - e.r); }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i]; e.t += dt * (2.4 + e.speed * .025); e.cd -= dt; e.flash = Math.max(0, e.flash - dt * 8); e.hitCd = Math.max(0, e.hitCd - dt);
      const dx = player.x - e.x, dy = player.y - e.y, dist = Math.max(1, Math.hypot(dx, dy)); e.flip = dx < 0 ? -1 : 1;
      if (e.behavior === "ranged") { e.x += dx / dist * e.speed * (dist < 360 ? -1 : .35) * dt; e.y += dy / dist * e.speed * (dist < 360 ? -1 : .35) * dt; if (e.cd <= 0) { e.cd = 1.2; enemyShot(e, Math.atan2(dy, dx)); } }
      else if (e.behavior === "hazard" || e.behavior === "mine") { chase(e, dx, dy, dist, dt, .65); if (e.cd <= 0) { e.cd = 1.8; hazards.push({ x: e.behavior === "hazard" ? player.x : e.x, y: e.behavior === "hazard" ? player.y : e.y, r: 56, color: e.color, damage: e.damage, life: 3, max: 3 }); } }
      else if (e.behavior === "blink" && e.cd <= 0) { e.cd = 1.8; e.x = player.x - player.dirX * 150; e.y = player.y - player.dirY * 150; ring(e.x, e.y, 42, e.color, .2); }
      else if (e.behavior === "summon" && e.cd <= 0) { e.cd = 2; spawnEnemy("zombie", e.x + rand(-60, 60), e.y + rand(-60, 60)); }
      else chase(e, dx, dy, dist, dt, e.behavior === "dash" ? 1.6 : e.behavior === "bat" ? 1.35 : 1);
      if (e.boss && e.cd <= 0) { e.cd = 1.2; for (let n = 0; n < 14; n++) enemyShot(e, n / 14 * TAU + e.t); }
      clampEnemy(e);
      if (dist < player.r + e.r && player.inv <= 0) { player.hp -= e.damage; player.inv = .55; s.shake = 8; burst(player.x, player.y, 10, "#ff4d6d", 120); if (e.behavior === "explode") damageEnemy(e, 9999, e.x, e.y); }
    }
  }
  function chase(e, dx, dy, d, dt, mul) { const wob = Math.sin(s.time * 2 + e.x * .01) * .18; e.x += (dx / d + -dy / d * wob) * e.speed * mul * dt; e.y += (dy / d + dx / d * wob) * e.speed * mul * dt; }
  function enemyShot(e, a) { enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, r: 5, color: e.color, damage: e.damage * .65, life: 4 }); }
  function damageEnemy(e, dmg, x, y) { e.hp -= dmg * player.dmg; e.flash = 1; burst(x, y, 3, e.color, 120); if (e.hp <= 0) killEnemy(e); }
  function killEnemy(e) { enemies.splice(enemies.indexOf(e), 1); if (s.boss === e) s.boss = null; s.kills++; gems.push({ x: e.x, y: e.y, value: e.xp || 5, phase: Math.random() * TAU }); burst(e.x, e.y, e.boss ? 40 : 12, e.color, e.boss ? 240 : 140); if (e.behavior === "split") for (let i = 0; i < 2; i++) spawnEnemy("zombie", e.x + rand(-40, 40), e.y + rand(-40, 40)); }

  function updateWeapons(dt) {
    fireAuto("bolt", dt, (w) => { const t = nearest(); if (t) fire(Math.atan2(t.y - player.y, t.x - player.x), w, "ball", "#42e8ff", 1, 4, 1.4); });
    fireAuto("dagger", dt, (w) => { const a = Math.atan2(player.dirY, player.dirX); for (let i = 0; i < w.count; i++) fire(a + (i - (w.count - 1) / 2) * .18, w, "dagger", "#f3f7ff", 3, 3, .8, 680); });
    fireAuto("ice", dt, (w) => { const t = nearest(); const a = t ? Math.atan2(t.y - player.y, t.x - player.x) : Math.atan2(player.dirY, player.dirX); for (let i = 0; i < w.count; i++) fire(a, w, "ice", "#9ff4ff", 1, 4, 2.2, w.speed, true); });
    fireAuto("missile", dt, (w) => { const t = nearest(); const a = t ? Math.atan2(t.y - player.y, t.x - player.x) : Math.atan2(player.dirY, player.dirX); fire(a, w, "missile", "#ffb347", 1, 5, 2.6, w.speed, true, 86); });
    fireAuto("boomerang", dt, (w) => { const a = Math.atan2(player.dirY, player.dirX); for (let i = 0; i < w.count; i++) fire(a + (i - (w.count - 1) / 2) * .35, w, "boomerang", "#ff65d8", 5, 5, 1.6, w.speed, false, 0, true); });
    updateOrbs(dt); updatePulse(dt);
  }
  function fireAuto(id, dt, fn) { const w = weapons[id]; if (!w || w.lv <= 0) return; w.t -= dt; if (w.t <= 0) { w.t += w.cd; fn(w); } }
  function fire(a, w, shape, color, pierce, r, life, speed = w.speed || 560, track = false, explode = 0, ret = false) { bullets.push({ x: player.x, y: player.y, px: player.x, py: player.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, a, dmg: w.dmg, pierce, r, life, max: life, color, shape, track, explode, ret, rt: 0, hits: new Set(), spin: Math.random() * TAU, trail: 0 }); ring(player.x, player.y, 18, color, .14); }
  function updateOrbs(dt) { const w = weapons.orb; if (!w.lv) return; w.angle += dt * (2.7 + w.lv * .25); for (let i = 0; i < w.count; i++) { const a = w.angle + i / w.count * TAU, x = player.x + Math.cos(a) * w.radius, y = player.y + Math.sin(a) * w.radius; trail(x, y, player.x + Math.cos(a - .16) * w.radius, player.y + Math.sin(a - .16) * w.radius, "#ffd166", 8); for (const e of enemies) if (e.hitCd <= 0 && dist2(x, y, e.x, e.y) < (16 + e.r) ** 2) { damageEnemy(e, w.dmg, x, y); e.hitCd = w.hitCd; ring(x, y, 24, "#ffd166", .12); } } }
  function updatePulse(dt) { const w = weapons.pulse; if (!w.lv) return; w.t -= dt; if (w.t > 0) return; w.t += w.cd; ring(player.x, player.y, w.radius, "#77ff8a", .34); for (const e of [...enemies]) if (dist2(player.x, player.y, e.x, e.y) < (w.radius + e.r) ** 2) damageEnemy(e, w.dmg, e.x, e.y); }
  function updateBullets(dt) { for (let i = bullets.length - 1; i >= 0; i--) { const b = bullets[i]; b.px = b.x; b.py = b.y; steer(b, dt); b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.trail -= dt; if (b.trail <= 0) { b.trail = .035; trail(b.x, b.y, b.px, b.py, b.color, b.shape === "dagger" ? 3 : 5); } for (const e of [...enemies]) if (b.pierce > 0 && !b.hits.has(e) && dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) { b.hits.add(e); b.pierce--; damageEnemy(e, b.dmg, b.x, b.y); burst(b.x, b.y, 8, b.color, 180); if (b.explode) { ring(b.x, b.y, b.explode, b.color, .25); for (const o of [...enemies]) if (!b.hits.has(o) && dist2(b.x, b.y, o.x, o.y) < (b.explode + o.r) ** 2) damageEnemy(o, b.dmg * .8, b.x, b.y); } } if (b.life <= 0 || b.pierce <= 0) bullets.splice(i, 1); } }
  function steer(b, dt) { if (b.track) { const t = nearest(b.x, b.y); if (t) turn(b, Math.atan2(t.y - b.y, t.x - b.x), dt, 4, b.speed); } if (b.ret) { b.rt += dt; if (b.rt > .32) turn(b, Math.atan2(player.y - b.y, player.x - b.x), dt, 4.8, b.speed); } b.a = Math.atan2(b.vy, b.vx); }
  function turn(b, target, dt, turnSpeed, speed) { let cur = Math.atan2(b.vy, b.vx), diff = target - cur; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU; cur += diff * Math.min(1, turnSpeed * dt); b.vx = Math.cos(cur) * speed; b.vy = Math.sin(cur) * speed; }

  function updateEnemyAttacks(dt) { for (let i = enemyBullets.length - 1; i >= 0; i--) { const b = enemyBullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (dist2(b.x, b.y, player.x, player.y) < (b.r + player.r) ** 2 && player.inv <= 0) { player.hp -= b.damage; player.inv = .45; enemyBullets.splice(i, 1); } else if (b.life <= 0) enemyBullets.splice(i, 1); } for (let i = hazards.length - 1; i >= 0; i--) { const h = hazards[i]; h.life -= dt; if (dist2(h.x, h.y, player.x, player.y) < (h.r + player.r) ** 2 && player.inv <= 0) { player.hp -= h.damage; player.inv = .35; } if (h.life <= 0) hazards.splice(i, 1); } }
  function updateGems(dt) { for (let i = gems.length - 1; i >= 0; i--) { const g = gems[i], dx = player.x - g.x, dy = player.y - g.y, d = Math.max(1, Math.hypot(dx, dy)); if (d < player.magnet) { const pull = (1 - d / player.magnet) * 520 + 120; g.x += dx / d * pull * dt; g.y += dy / d * pull * dt; } if (d < player.r + 12) { player.xp += g.value; gems.splice(i, 1); } } }
  function updateParticles(dt) { for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); } }
  function updateCamera(dt) { const tx = clampCamX(player.x), ty = clampCamY(player.y); s.camX += (tx - s.camX) * Math.min(1, dt * 8); s.camY += (ty - s.camY) * Math.min(1, dt * 8); }

  function completeWave() { s.pendingWin = s.wave >= TOTAL_WAVES; s.pendingNext = !s.pendingWin; for (const g of gems) { player.xp += g.value; } for (const e of enemies) { player.xp += e.xp || 5; } enemies = []; bullets = []; enemyBullets = []; hazards = []; gems = []; s.boss = null; if (!checkLevel()) finishWave(); }
  function finishWave() { if (s.pendingWin) return end(true); if (s.pendingNext) { s.pendingNext = false; s.wave++; s.waveLeft = waveDuration(s.wave); s.spawn = 0; s.mode = "playing"; } }
  function checkLevel() { if (player.xp < player.xpNeed) return false; player.xp -= player.xpNeed; player.level++; player.xpNeed = Math.floor(player.xpNeed * 1.22 + 8); showChoices("LEVEL UP", "选择一次强化", pick(upgrades(), 3), (item) => { item.apply(); hideChoices(); if (!checkLevel()) { s.mode = "playing"; finishWave(); } }); s.mode = "leveling"; return true; }
  function upgrades() { return [["bolt","✦","电弧超频","棱镜电弧伤害提高，冷却缩短。",()=>{ weapons.bolt.lv ||= 1; weapons.bolt.dmg+=7; weapons.bolt.cd=Math.max(.18,weapons.bolt.cd*.86);}],["dagger","⟡","飞刀矩阵","增加飞刀数量并提高伤害。",()=>{weapons.dagger.lv ||=1; weapons.dagger.count=Math.min(5,weapons.dagger.count+1); weapons.dagger.dmg+=4;}],["ice","❄","霜晶折射","冰晶数量和伤害提升。",()=>{weapons.ice.lv ||=1; weapons.ice.count=Math.min(4,weapons.ice.count+1); weapons.ice.dmg+=5;}],["missile","◆","飞弹裂变","飞弹爆炸更强。",()=>{weapons.missile.lv ||=1; weapons.missile.dmg+=8;}],["boomerang","✧","回旋增幅","回旋刃数量和伤害提高。",()=>{weapons.boomerang.lv ||=1; weapons.boomerang.count=Math.min(4,weapons.boomerang.count+1); weapons.boomerang.dmg+=5;}],["orb","●","星环聚变","旋转球数量和伤害提高。",()=>{weapons.orb.lv ||=1; weapons.orb.count=Math.min(8,weapons.orb.count+1); weapons.orb.dmg+=5;}],["pulse","◎","脉冲新星","周期性范围爆发。",()=>{weapons.pulse.lv ||=1; weapons.pulse.dmg+=9; weapons.pulse.radius+=16;}],["speed","↯","相位步","移动速度和拾取半径提高。",()=>{player.speed+=18; player.magnet+=10;}],["guard","▣","晶盾增幅","最大生命提高并恢复生命。",()=>{player.maxHp+=18; player.hp=Math.min(player.maxHp,player.hp+42);}]].map(([id,icon,name,desc,apply])=>({id,icon,name,desc,apply})); }

  function render() {
    const vw = W / ZOOM, vh = H / ZOOM, cx = clampViewX(s.camX - vw / 2), cy = clampViewY(s.camY - vh / 2);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = "#060912"; ctx.fillRect(0, 0, W, H); ctx.save(); ctx.scale(ZOOM, ZOOM); ctx.translate(-cx, -cy);
    drawMap(cx, cy, vw, vh); drawBounds(); drawGems(); drawBullets(); for (const e of enemies) drawEnemy(e); drawOrbs(); drawPlayer(); drawEnemyStuff(); drawParticles(); ctx.restore(); drawBossBar(); drawHud();
  }
  function drawMap(cx, cy, vw, vh) { for (const t of map) { if (t.x > cx + vw + 128 || t.x + 128 < cx - 128 || t.y > cy + vh + 128 || t.y + 128 < cy - 128) continue; ctx.fillStyle = t.c; ctx.fillRect(t.x,t.y,128,128); ctx.fillStyle=t.d>.5?"rgba(255,255,255,.035)":"rgba(0,0,0,.08)"; ctx.fillRect(t.x+8,t.y+8,112,112);} ctx.strokeStyle="rgba(66,232,255,.09)";ctx.lineWidth=1;ctx.beginPath(); for(let x=Math.floor(cx/64)*64;x<cx+vw+64;x+=64){ctx.moveTo(x,cy-64);ctx.lineTo(x,cy+vh+64);} for(let y=Math.floor(cy/64)*64;y<cy+vh+64;y+=64){ctx.moveTo(cx-64,y);ctx.lineTo(cx+vw+64,y);}ctx.stroke(); for(const p of props){ if(p.x<cx-80||p.x>cx+vw+80||p.y<cy-80||p.y>cy+vh+80)continue; ctx.fillStyle=p.c; diamondAt(p.x,p.y+Math.sin(s.time*3+p.p)*2,p.z);} }
  function drawBounds(){const h=WORLD/2;ctx.strokeStyle="rgba(255,77,109,.45)";ctx.lineWidth=4;ctx.strokeRect(-h,-h,WORLD,WORLD);}
  function drawPlayer(){
    const moving=input.up||input.down||input.left||input.right||Math.abs(input.vx)>.05||Math.abs(input.vy)>.05;
    const hurt=player.inv>0, low=player.hp/player.maxHp<.35;
    const mood=hurt?"hurt":low?"worried":moving?"happy":Math.floor(s.time*1.15)%4===0?"blink":Math.floor(s.time*1.15)%4===1?"smile":Math.floor(s.time*1.15)%4===2?"curious":"happy";
    const bob=Math.sin(s.time*7)*(moving?2.2:1.1), squash=1+Math.sin(s.time*5)*.025;
    ctx.save();
    ctx.translate(player.x,player.y+bob);
    ctx.fillStyle="rgba(0,0,0,.26)";
    ctx.beginPath();ctx.ellipse(0,20,24,8,0,0,TAU);ctx.fill();
    glow(0,0,24,hurt?.32:.42,hurt?"#ff9ab0":"#ffd6a8");
    ctx.scale(1.02, squash);

    ctx.fillStyle=hurt?"#ffd7dd":"#ffd6a8";
    ctx.beginPath();ctx.arc(0,0,22,0,TAU);ctx.fill();
    ctx.fillStyle="#ffbd8a";
    ctx.beginPath();ctx.arc(-13,5,5,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(13,5,5,0,TAU);ctx.fill();
    ctx.fillStyle="#fff4d8";
    ctx.beginPath();ctx.arc(-7,-9,7,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(7,-9,7,0,TAU);ctx.fill();

    drawPlayerEyes(mood);
    drawPlayerMouth(mood);

    ctx.fillStyle="rgba(255,255,255,.65)";
    ctx.beginPath();ctx.arc(-8,-13,4,0,TAU);ctx.fill();
    ctx.fillStyle="#f3b05f";
    ctx.beginPath();ctx.arc(0,-1,2.4,0,TAU);ctx.fill();
    ctx.strokeStyle="#7b4a2b";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,22,0,TAU);ctx.stroke();
    ctx.restore();
  }

  function drawPlayerEyes(mood){
    ctx.strokeStyle="#2a1d18";ctx.fillStyle="#2a1d18";ctx.lineWidth=2.4;ctx.lineCap="round";
    if(mood==="blink"){
      ctx.beginPath();ctx.moveTo(-12,-5);ctx.lineTo(-5,-5);ctx.moveTo(5,-5);ctx.lineTo(12,-5);ctx.stroke();return;
    }
    if(mood==="happy"){
      ctx.beginPath();ctx.arc(-8,-6,4,Math.PI*.08,Math.PI*.92);ctx.stroke();ctx.beginPath();ctx.arc(8,-6,4,Math.PI*.08,Math.PI*.92);ctx.stroke();return;
    }
    if(mood==="hurt"){
      ctx.beginPath();ctx.moveTo(-12,-9);ctx.lineTo(-5,-3);ctx.moveTo(-5,-9);ctx.lineTo(-12,-3);ctx.moveTo(5,-9);ctx.lineTo(12,-3);ctx.moveTo(12,-9);ctx.lineTo(5,-3);ctx.stroke();return;
    }
    if(mood==="worried"){
      ctx.fillRect(-11,-6,5,6);ctx.fillRect(6,-6,5,6);ctx.strokeStyle="#7b4a2b";ctx.beginPath();ctx.moveTo(-13,-12);ctx.lineTo(-5,-10);ctx.moveTo(5,-10);ctx.lineTo(13,-12);ctx.stroke();return;
    }
    ctx.beginPath();ctx.arc(-8,-6,3.3,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(8,-6,3.3,0,TAU);ctx.fill();
    ctx.fillStyle="#fff";ctx.fillRect(-7,-8,1.6,1.6);ctx.fillRect(9,-8,1.6,1.6);
  }

  function drawPlayerMouth(mood){
    ctx.strokeStyle="#7b2f2f";ctx.fillStyle="#7b2f2f";ctx.lineWidth=2;ctx.lineCap="round";
    if(mood==="hurt"){ctx.beginPath();ctx.arc(0,8,4,0,TAU);ctx.stroke();return;}
    if(mood==="worried"){ctx.beginPath();ctx.arc(0,12,6,Math.PI*1.15,Math.PI*1.85);ctx.stroke();return;}
    if(mood==="curious"){ctx.beginPath();ctx.arc(0,8,3,0,TAU);ctx.fill();return;}
    ctx.beginPath();ctx.arc(0,4,8,Math.PI*.18,Math.PI*.82);ctx.stroke();
  }
  function drawEnemy(e){
    ctx.save();
    ctx.translate(e.x,e.y);
    if(e.boss){
      ctx.rotate(e.t*.25);
      poly(0,0,e.r,8,0,e.flash>0?"#fff":e.color,true);
      poly(0,0,e.r,8,0,"#fff",false);
    }else if(e.behavior==="split"){
      drawSlimeEnemy(e);
    }else{
      drawZombieEnemy(e);
    }
    ctx.restore();
  }

  function drawZombieEnemy(e){
    const visualScale=e.id==="zombie"?2:1.75;
    const z=e.r/14*visualScale, walk=Math.sin(e.t*5), bob=Math.sin(e.t*10)*1.2*z, lean=Math.sin(e.t*2.2)*1.8*z;
    const flash=e.flash>0, skin=flash?"#ffffff":zombieSkin(e), dark=flash?"#dfefff":"#315436", cloth=flash?"#ffffff":zombieCloth(e);
    ctx.scale(e.flip||1,1);
    ctx.translate(lean,bob);
    ctx.fillStyle="rgba(0,0,0,.30)";
    ctx.fillRect(-10*z,11*z,22*z,5*z);

    ctx.fillStyle=dark;
    ctx.fillRect(-8*z,-2*z+walk*2.2*z,5*z,18*z);
    ctx.fillRect(3*z,-2*z-walk*2.2*z,5*z,18*z);
    ctx.fillStyle="#1b2530";
    ctx.fillRect(-9*z,13*z+walk*2.2*z,7*z,4*z);
    ctx.fillRect(2*z,13*z-walk*2.2*z,7*z,4*z);

    ctx.fillStyle=cloth;
    ctx.fillRect(-11*z,-14*z,22*z,25*z);
    ctx.fillStyle="rgba(0,0,0,.28)";
    ctx.fillRect(-9*z,-5*z,18*z,5*z);
    ctx.fillStyle="#ff4d6d";
    ctx.fillRect(2*z,-11*z,7*z,9*z);
    ctx.fillStyle=dark;
    ctx.fillRect(-12*z,5*z,7*z,5*z);
    ctx.fillRect(4*z,7*z,7*z,4*z);

    ctx.fillStyle=skin;
    ctx.fillRect(-18*z,-13*z+walk*3.4*z,9*z,6*z);
    ctx.fillRect(9*z,-14*z-walk*3.4*z,9*z,6*z);
    ctx.fillRect(-20*z,-11*z+walk*3.4*z,5*z,5*z);
    ctx.fillRect(15*z,-12*z-walk*3.4*z,5*z,5*z);

    ctx.translate(Math.sin(e.t*3)*1.3*z,-1.5*z);
    ctx.fillStyle=skin;
    ctx.fillRect(-8*z,-30*z,17*z,17*z);
    ctx.fillStyle=dark;
    ctx.fillRect(-9*z,-31*z,8*z,5*z);
    ctx.fillRect(-10*z,-24*z,4*z,7*z);
    ctx.fillStyle="#182018";
    ctx.fillRect(-4*z,-24*z,3*z,3*z);
    ctx.fillRect(4*z,-24*z,3*z,3*z);
    ctx.fillStyle="#f3f7ff";
    ctx.fillRect(4*z,-25*z,2*z,2*z);
    ctx.fillStyle="#ff4d6d";
    ctx.fillRect(-2*z,-17*z,8*z,2*z);
    ctx.fillRect(6*z,-20*z,3*z,4*z);

    ctx.strokeStyle=flash?"#ffffff":"rgba(8,18,14,.65)";
    ctx.lineWidth=1.5*z;
    ctx.strokeRect(-11*z,-14*z,22*z,25*z);
    ctx.strokeRect(-8*z,-30*z,17*z,17*z);
  }

  function drawSlimeEnemy(e){
    const p=1+Math.sin(e.t*5)*.08, flash=e.flash>0;
    ctx.scale(p,1/p);
    ctx.fillStyle="rgba(0,0,0,.25)";
    ctx.fillRect(-e.r*.85,e.r*.55,e.r*1.7,e.r*.25);
    ctx.fillStyle=flash?"#fff":e.color;
    ctx.beginPath();ctx.arc(0,0,e.r,0,TAU);ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.35)";
    ctx.beginPath();ctx.arc(-e.r*.25,-e.r*.25,e.r*.22,0,TAU);ctx.fill();
    ctx.fillStyle="#173b1c";
    ctx.fillRect(-e.r*.35,-e.r*.05,4,4);
    ctx.fillRect(e.r*.22,-e.r*.05,4,4);
  }

  function zombieSkin(e){
    if(e.behavior==="ranged")return"#9fe7df";
    if(e.behavior==="blink")return"#b991ff";
    if(e.behavior==="mine"||e.behavior==="explode")return"#ffb06e";
    return"#7ccf68";
  }
  function zombieCloth(e){
    if(e.id==="tank")return"#6d5bbf";
    if(e.behavior==="dash")return"#d6b64f";
    if(e.behavior==="ranged")return"#2b8da4";
    if(e.behavior==="hazard")return"#5f4aa8";
    if(e.behavior==="summon")return"#4d7c0f";
    return"#345a78";
  }
  function drawBullets(){for(const b of bullets){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a);glow(0,0,b.r+4,.35,b.color); if(b.shape==="boomerang") star(0,0,b.r*2,b.color); else diamond(0,0,b.r*2.6,b.r,b.color);ctx.restore();}}
  function drawOrbs(){const w=weapons?.orb;if(!w?.lv)return;for(let i=0;i<w.count;i++){const a=w.angle+i/w.count*TAU,x=player.x+Math.cos(a)*w.radius,y=player.y+Math.sin(a)*w.radius;glow(x,y,14,.6,"#ffd166");ctx.fillStyle="#ffd166";ctx.beginPath();ctx.arc(x,y,12,0,TAU);ctx.fill();ctx.strokeStyle="#fff";ctx.stroke();}}
  function drawGems(){for(const g of gems){ctx.fillStyle=g.value>=15?"#b48cff":g.value>=8?"#77ff8a":"#42e8ff";diamondAt(g.x,g.y+Math.sin(s.time*6+g.phase)*2,6);}}
  function drawEnemyStuff(){for(const b of enemyBullets){ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill();}for(const h of hazards){ctx.fillStyle=rgba(h.color,.18*h.life/h.max);ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,TAU);ctx.fill();ctx.strokeStyle=rgba(h.color,.65);ctx.stroke();}}
  function drawParticles(){for(const p of particles){const a=Math.max(0,p.life/p.max); if(p.kind==="ring"){ctx.strokeStyle=rgba(p.color,a*.75);ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1-a*.16),0,TAU);ctx.stroke();}else if(p.kind==="trail"){ctx.strokeStyle=rgba(p.color,a*.55);ctx.lineWidth=p.size*a;ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(p.x,p.y);ctx.stroke();}else{ctx.fillStyle=rgba(p.color,a);ctx.fillRect(p.x,p.y,p.size,p.size);}}}
  function drawBossBar(){if(!s.boss)return;const b=s.boss,w=Math.min(620,W-48),x=(W-w)/2,y=72;ctx.fillStyle="rgba(6,9,18,.78)";ctx.fillRect(x,y,w,18);ctx.fillStyle="#ff4d6d";ctx.fillRect(x+2,y+2,(w-4)*Math.max(0,b.hp/b.maxHp),14);ctx.strokeStyle="rgba(255,255,255,.7)";ctx.strokeRect(x,y,w,18);ctx.fillStyle="#fff";ctx.font="13px sans-serif";ctx.textAlign="center";ctx.fillText(b.name,W/2,y-8);}
  function drawHud(){ui.hpBar.style.transform=`scaleX(${Math.max(0,player.hp/player.maxHp)})`;ui.xpBar.style.transform=`scaleX(${Math.max(0,player.xp/player.xpNeed)})`;ui.hpText.textContent=Math.ceil(Math.max(0,player.hp));ui.levelText.textContent=`Lv.${player.level}`;ui.timerText.textContent=fmt(s.waveLeft);ui.waveText.textContent=`第 ${s.wave}/${TOTAL_WAVES} 波`;ui.killText.textContent=`击败 ${s.kills}`;ui.coinText.textContent=`金币 ${s.gold}`;ui.fpsText.textContent=`${Math.round(fps)} fps`;}

  function showChoices(eyebrow,title,items,onPick){ui.levelEyebrow.textContent=eyebrow;ui.levelTitle.textContent=title;ui.choiceList.innerHTML="";for(const item of items){const b=document.createElement("button");b.type="button";b.className="choice-card";b.innerHTML=`<i>${item.icon}</i><strong>${item.name}</strong><p>${item.desc}</p>`;b.onclick=()=>onPick(item);ui.choiceList.appendChild(b);}ui.levelOverlay.classList.add("active");}
  function hideChoices(){ui.levelOverlay.classList.remove("active");}
  function end(win){s.mode="ended";ui.endEyebrow.textContent=win?"VICTORY":"RUN COMPLETE";ui.endTitle.textContent=win?TOTAL_WAVES+" 波已完成":"生存结束";ui.endStats.innerHTML="";[`时间 ${fmt(s.time)}`,`等级 ${player.level}`,`击败 ${s.kills}`,`金币 ${s.gold}`].forEach(t=>{const el=document.createElement("span");el.textContent=t;ui.endStats.appendChild(el);});ui.endOverlay.classList.add("active");}

  function bind(){const keys=new Map([["KeyW","up"],["ArrowUp","up"],["KeyS","down"],["ArrowDown","down"],["KeyA","left"],["ArrowLeft","left"],["KeyD","right"],["ArrowRight","right"]]);window.onkeydown=e=>{const a=keys.get(e.code);if(a){input[a]=true;e.preventDefault();}if(e.code==="KeyP"||e.code==="Escape")togglePause();if(e.code==="Space"&&s.mode==="menu")start();};window.onkeyup=e=>{const a=keys.get(e.code);if(a){input[a]=false;e.preventDefault();}};ui.startButton.onclick=start;ui.restartButton.onclick=start;ui.pauseButton.onclick=togglePause;ui.muteButton.onclick=()=>{muted=!muted;ui.muteButton.textContent=muted?"×":"♪";};canvas.onpointerdown=e=>{if(s.mode==="menu")return;input.pid=e.pointerId;stick(e);canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(e.pointerId===input.pid)stick(e);};canvas.onpointerup=clearStick;canvas.onpointercancel=clearStick;}
  function stick(e){const max=42,bx=78,by=H-78,dx=e.clientX-bx,dy=e.clientY-by,len=Math.hypot(dx,dy),sc=len>max?max/len:1;input.vx=clamp(dx/max,-1,1);input.vy=clamp(dy/max,-1,1);ui.touchStick.querySelector("i").style.transform=`translate(${dx*sc}px, ${dy*sc}px)`;}
  function clearStick(e){if(e.pointerId!==input.pid)return;input.pid=null;input.vx=0;input.vy=0;ui.touchStick.querySelector("i").style.transform="translate(0,0)";}
  function togglePause(){if(s.mode==="playing"){s.mode="paused";ui.pauseButton.textContent="▶";}else if(s.mode==="paused"){s.mode="playing";ui.pauseButton.textContent="II";}}

  function resize(){DPR=Math.min(devicePixelRatio||1,2);W=Math.max(320,innerWidth);H=Math.max(420,innerHeight);canvas.width=Math.floor(W*DPR);canvas.height=Math.floor(H*DPR);canvas.style.width=W+"px";canvas.style.height=H+"px";ctx.setTransform(DPR,0,0,DPR,0,0);ctx.imageSmoothingEnabled=false;}
  function makeMap(){map=[];props=[];const pal=["#0d1f2a","#12313a","#163b34","#213646","#20213a"];for(let y=-WORLD/2;y<WORLD/2;y+=128)for(let x=-WORLD/2;x<WORLD/2;x+=128){map.push({x,y,c:pal[Math.floor(Math.random()*pal.length)],d:Math.random()});if(Math.random()>.9)props.push({x:x+rand(20,108),y:y+rand(20,108),z:rand(10,28),c:["#42e8ff","#77ff8a","#ffd166"][Math.floor(Math.random()*3)],p:Math.random()*TAU});}}
  function loop(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);render();requestAnimationFrame(loop);}
  function nearest(x=player.x,y=player.y){let best=null,bd=900*900;for(const e of enemies){const d=dist2(x,y,e.x,e.y);if(d<bd){bd=d;best=e;}}return best;}
  function part(kind,x,y,color,vx=0,vy=0,life=.35,size=4){particles.push({kind,x,y,px:x,py:y,vx,vy,life,max:life,size,color,r:size*4});if(particles.length>520)particles.shift();}
  function burst(x,y,n,color,sp){for(let i=0;i<n;i++){const a=Math.random()*TAU,speed=sp*(.35+Math.random()*.9);part("spark",x,y,color,Math.cos(a)*speed,Math.sin(a)*speed,.28+Math.random()*.35,2+Math.random()*5);}}
  function ring(x,y,r,color,life){particles.push({kind:"ring",x,y,px:x,py:y,vx:0,vy:0,life,max:life,size:2,color,r});}
  function trail(x,y,px,py,color,size){particles.push({kind:"trail",x,y,px,py,vx:0,vy:0,life:.18,max:.18,size,color,r:1});}
  function poly(x,y,r,sides,ang,color,fill){ctx.beginPath();for(let i=0;i<sides;i++){const a=ang+i/sides*TAU,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();if(fill){ctx.fillStyle=color;ctx.fill();}else{ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();}}
  function diamond(x,y,l,w,c){ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x+l,y);ctx.lineTo(x,y+w);ctx.lineTo(x-l*.35,y);ctx.lineTo(x,y-w);ctx.closePath();ctx.fill();ctx.strokeStyle="#fff";ctx.stroke();}
  function diamondAt(x,y,r){ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();ctx.fill();}
  function star(x,y,r,c){ctx.fillStyle=c;ctx.beginPath();for(let i=0;i<4;i++){const a=i/4*TAU,rr=i%2?r*.35:r,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();ctx.fill();ctx.strokeStyle="#fff";ctx.stroke();}
  function glow(x,y,r,a,c){for(let i=3;i>=1;i--){ctx.fillStyle=rgba(c,a/(i*2.2));ctx.beginPath();ctx.arc(x,y,r*(1+i*.32),0,TAU);ctx.fill();}}
  function rgba(hex,a){const v=parseInt(hex.slice(1),16);return`rgba(${v>>16&255},${v>>8&255},${v&255},${a})`;}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));} function rand(a,b){return a+Math.random()*(b-a);} function dist2(ax,ay,bx,by){const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;} function waveDuration(w){return Math.min(WAVE_MAX,WAVE_1+(w-1)*2);} function fmt(sec){const t=Math.max(0,Math.ceil(sec));return`${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;} function pick(arr,n){const p=[...arr],r=[];while(r.length<n&&p.length)r.push(p.splice(Math.floor(Math.random()*p.length),1)[0]);return r;} function clampCamX(x){const h=WORLD/2,v=W/ZOOM/2;return clamp(x,-h+v,h-v);} function clampCamY(y){const h=WORLD/2,v=H/ZOOM/2;return clamp(y,-h+v,h-v);} function clampViewX(x){const h=WORLD/2;return clamp(x,-h,h-W/ZOOM);} function clampViewY(y){const h=WORLD/2;return clamp(y,-h,h-H/ZOOM);} function tone(f,d,type){if(muted)return;try{audio||=new(AudioContext||webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=f;g.gain.value=.035;g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+d);}catch{muted=true;}}

  resize(); addEventListener("resize",resize); bind(); makeMap(); weapons=newWeapons(); ui.bestText.textContent="最佳纪录 00:00"; requestAnimationFrame(loop);
})();
