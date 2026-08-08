# Survivor 项目说明

`Survivor` 是一个原生 HTML/CSS/JavaScript（ES Modules）的 2D 像素风弹幕生存游戏。项目无需构建工具，浏览器直接加载 `src` 下的模块。

- 页面入口：`index.html`
- 样式入口：`styles.css`
- 游戏入口：`src/core/game.js`
- 主循环：`src/core/main.js`
- 当前版本：读取 `src/config/game-config.json`，目前为 `beta 0.11`

## 本地运行

推荐使用无缓存启动脚本：

```powershell
.\start.cmd
```

浏览器访问：

```text
http://127.0.0.1:5000/
```

`start.cmd` 会调用 `scripts/start.ps1`，自动检测 Python，寻找可用端口，并通过 `scripts/no_cache_server.py` 为 HTML、JS、CSS、JSON、图片和音乐资源返回无缓存响应：

```http
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
```

也可以手动启动：

```powershell
python .\scripts\no_cache_server.py 5000 --bind 127.0.0.1
```

### Radmin 局域网双人联机

主机在 Radmin VPN 已连接的前提下运行：

```powershell
.\start.cmd -Lan
```

启动脚本会优先识别 Radmin IPv4，并以该地址打开游戏。进入大厅的“协同通信塔”后创建局域网房间，复制邀请链接发送给伙伴；伙伴打开链接、进入大厅后点击“加入局域网房间”即可。临时服务只在主机电脑内存中交换 WebRTC 配对信息，战斗数据仍通过 P2P DataChannel 传输。

若未自动识别 Radmin 地址，明确指定它：

```powershell
.\start.cmd -Lan -AdvertiseHost 26.x.x.x
```

不建议日常开发直接使用 `python -m http.server`，因为它可能返回 `304 Not Modified`，导致浏览器继续使用旧资源。

## 主要玩法与系统

- 20 波生存流程：战斗、升级、波次商店、Boss 波和结算。
- 作战配置：开局前选择难度和初始武器，武器预览会实时播放。
- 难度进度：完成当前难度后解锁下一难度，配置来自 `src/config/difficulty-config.json`。
- 武器槽：最多 6 个武器槽，支持不同品质的同类武器独立结算。
- 品质体系：`common`、`uncommon`、`rare`、`epic`、`legendary`。
- 商店：支持武器、道具、锁定、刷新、购买、出售、售罄、唯一道具和同品质合成。
- 背包：展示玩家属性、武器槽、道具、出售和合成入口。
- 图鉴：记录已解锁的敌人、武器和道具，并提供详情和 Canvas 预览。
- 彩蛋与特殊波次：部分快捷键、Boss 标记和 `ember` 难度波次会触发特殊效果。
- 移动端：提供触控摇杆和响应式 HUD/Overlay。

## 当前内容概览

### 武器

武器默认数据在 `src/config/editableGameData.js`，外部可编辑配置在 `src/config/weapon-config.json`。

当前武器 id：

```text
arc, ice, missile, boomerang, drone,
prism_railgun, void_singularity, tesla_mine_chain,
starfall_scepter, phase_needler, echo_tuning_fork, rift_loom
```

核心逻辑：

- `src/systems/weapons.js`：武器更新、投射物、命中特效、品质差异。
- `src/economy/inventory.js`：武器槽、品质、合成、装备重算。
- `src/ui/weaponPreview.js`：开局配置和图鉴中的武器预览。

### 道具

道具默认数据在 `src/config/editableGameData.js`，外部可编辑配置在 `src/config/item-config.json`。

当前道具 id：

```text
heart_container, healing_potion, shackles, dodge_cloak, bait,
magnet, speed_boots, rapid_cord, fang, split_shot,
lucky_clover, gloves, knife, healing_aura, tardigrade,
heavy_armor, turret, thief_mark, star_cloak, landmine, airburst
```

核心逻辑：

- `src/systems/items.js`：购买效果、周期效果、受击/命中效果、波次开始效果、道具实体。
- `src/economy/shop.js`：道具商品生成、品质、价格、唯一道具限制。
- `src/ui/inventoryUi.js`：背包道具展示和出售。

### 敌人与 Boss

敌人配置在 `src/config/enemy-config.json`，注册表在 `src/systems/enemyRegistry.js`，类文件在 `src/enemies/`。

当前敌人配置共 39 个 id，包括基础敌人、史莱姆变体、功能型敌人和 Boss：

```text
zombie, lancer, wisp, slime_large, slime_medium, slime_small,
blackhole_mage, mech_worm, doctor, embermine, exploder, tank,
pyromancer, laser_eye, razorbat, wizard, pentastar, gearfiend,
prism_medic, phase_mirage, magnet_raider, magma_beetle,
siege_pylon, brood_seeder, line_raider, shield_caster,
gunner, artillery, storm_tyrant, polar_crystal_wraith,
storm_rail_devourer, twin_abyssal_eyes,
slime_diamond, slime_gold, slime_glow, slime_weeping,
slime_devil, slime_angel, thief
```

配置支持：

- 普通波次：`waves`、`waveRanges`、`spawnWaves`、`excludeWaves`
- Boss 波次：`bossWave`、`bossWaves`、`bossWaveRanges`
- 难度过滤：`difficulties`、`excludeDifficulties`、`minDifficulty`、`maxDifficulty`
- 难度独立波次：`difficultyWaves`
- 出现权重：`spawnWeight`、`difficultyWeights`、`difficultyWaveWeights`

### `ember` 波次场景

`ember` 难度使用手工波次场景：

- 配置：`src/config/ember-wave-scenarios.js`
- 系统：`src/systems/waveScenarios.js`

场景可以指定每波敌人池、刷怪倍率、Boss、精英单位、奖励波和特殊效果，例如黑暗视野、冰面移动、齿轮怪模式等。

## 目录结构

- `index.html`：Canvas、HUD、开始菜单、作战配置、商店、背包、图鉴、暂停和结算 DOM。
- `styles.css`：全局像素霓虹 UI、Overlay、HUD、移动端适配。
- `assets/`：音乐、截图、图标等静态资源。
- `deploy/`：Nginx 部署配置。
- `scripts/`：启动脚本和无缓存静态服务。
- `tools/`：独立工具页面。
- `tests/`：测试或验证脚本。
- `src/core/`：游戏启动与主循环。
- `src/config/`：敌人、难度、武器、道具、版本和波次场景配置。
- `src/systems/`：输入、实体、武器、道具、渲染、地图、光照、敌人注册、图鉴、彩蛋、波次场景。
- `src/enemies/`：敌人类。
- `src/economy/`：商店、背包、品质、出售、合成。
- `src/ui/`：HUD、商店、背包、图鉴、武器预览。
- `src/state.js`：全局运行状态和 `resetRun()`。
- `src/effects.js`：粒子、轨迹、脉冲、伤害文字和屏幕反馈。
- `src/audio.js`：音效和音乐播放。

## 敌人配置编辑器

项目提供独立的可视化敌人配置编辑器：

```text
http://127.0.0.1:5000/tools/enemy-config-editor.html
```

也可以双击：

```text
enemy-config-editor.cmd
```

编辑器能力：

- 读取 `src/config/enemy-config.json`
- 编辑敌人基础信息、战斗数值、波次规则、难度限制和权重
- 支持默认波次、难度独立波次、Boss 波次和排除波次
- 支持搜索、筛选、分页、序号跳转
- 支持新增、复制、删除、恢复单个敌人
- 支持导入 JSON、复制 JSON、下载 JSON
- 在支持 File System Access API 的浏览器中可直接保存到文件

浏览器通常不能静默改写本地项目文件。如果“保存到文件”不可用，请下载或复制生成的 JSON，再覆盖 `src/config/enemy-config.json`。

## 配置文件说明

### `src/config/difficulty-config.json`

顶层键是难度 id。顺序会影响难度卡片展示和解锁顺序。

常用字段：

- `name`：难度显示名
- `desc`：难度描述
- `enemyLimit`：同屏敌人上限
- `spawnRate`：刷怪预算倍率
- `enemyHp` / `enemyDamage` / `enemySpeed` / `enemyAttackSpeed`：普通敌人倍率
- `bossHp` / `bossDamage`：Boss 倍率
- `coinGain` / `xpGain`：收益倍率

### `src/config/enemy-config.json`

顶层键是敌人 id，必须和 `src/enemies/<id>.js` 以及 `src/systems/enemyRegistry.js` 注册 id 对齐。

常用字段：

- `name`、`category`、`trait`、`desc`、`tip`
- `hp`、`speed`、`damage`、`xp`、`radius`、`color`
- `behavior`
- `boss`
- `spawnWeight`
- `difficultyWeights`
- `difficultyWaveWeights`
- `waves`、`waveRanges`、`spawnWaves`、`excludeWaves`
- `bossWave`、`bossWaves`、`bossWaveRanges`
- `difficultyWaves`
- `difficulties`、`excludeDifficulties`、`minDifficulty`、`maxDifficulty`

### `src/config/weapon-config.json`

用于覆盖武器和品质数据：

- `qualityInfo`：品质名称、颜色、倍率。
- `info`：武器 icon、名称、描述、标签。
- `baseStats`：武器基础数值。

启动时会和 `src/config/editableGameData.js` 的默认值合并。

### `src/config/item-config.json`

用于覆盖道具数据：

- `rarityWeights`：商店道具品质权重。
- `definitions`：道具定义列表。

道具定义常用字段：

- `id`
- `icon`
- `name`
- `basePrice`
- `desc`
- `singleQuality`
- `fixedQuality`
- `unique`

### `src/config/game-config.json`

保存版本号等轻量配置。当前页面菜单版本文本会读取这里。

## 新增内容接入清单

### 新增敌人

1. 在 `src/enemies/` 新增 `<id>.js` 类文件。
2. 在 `src/systems/enemyRegistry.js` 导入并注册该 id。
3. 在 `src/config/enemy-config.json` 增加同 id 配置。
4. 配置波次、难度、权重和描述。
5. 如果是 Boss，设置 `boss: true` 和 Boss 波次规则。
6. 检查图鉴预览和死亡/命中特效。

### 新增武器

1. 在 `src/config/editableGameData.js` 添加默认基础数据和展示信息。
2. 如需外部调参，在 `src/config/weapon-config.json` 补充覆盖。
3. 在 `src/systems/weapons.js` 接入更新、投射物和命中特效。
4. 在 `src/ui/weaponPreview.js` 添加预览。
5. 检查商店、背包、合成、出售、开局武器列表和图鉴展示。

### 新增道具

1. 在 `src/config/editableGameData.js` 添加默认定义。
2. 如需外部调参，在 `src/config/item-config.json` 补充覆盖。
3. 在 `src/systems/items.js` 接入购买效果、波次效果、周期效果或事件效果。
4. 检查商店权重、唯一道具限制、背包展示、出售价格和图鉴展示。

## 部署

项目内置部署文件：

- Nginx：`deploy/nginx/survivor.conf`
- Docker：`Dockerfile`、`docker-compose.yml`
- 详细说明：`DEPLOY.md`

Docker 启动：

```bash
docker compose up -d --build
```

访问：

```text
http://127.0.0.1:5000/
```

## 验证

### JavaScript 语法检查

```powershell
Get-ChildItem -Path src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

### JSON 合法性检查

```powershell
node -e "for (const f of ['src/config/enemy-config.json','src/config/difficulty-config.json','src/config/weapon-config.json','src/config/item-config.json','src/config/game-config.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('json ok')"
```

### Diff 空白错误检查

```powershell
git diff --check
```

默认文档和配置修改只需要静态验证。浏览器验证仅在用户明确要求或 UI/交互改动风险较高时执行。
