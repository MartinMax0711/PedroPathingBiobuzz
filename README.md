<p align="center">
  <img src="public/icons/icon.svg" width="96" height="96" alt="BIOBUZZ Edition icon" />
</p>

<h1 align="center">Pedro Pathing Visualizer · BIOBUZZ Edition</h1>

<p align="center">
  FTC 2026-2027 <b>BIOBUZZ</b> 赛季的 Pedro Pathing 路径规划器 ·
  A Pedro Pathing path planner for the FTC 2026-2027 <b>BIOBUZZ</b> season
</p>

<p align="center">
  <a href="https://martinmax0711.github.io/PedroPathingBiobuzz/"><b>在线使用 / Live app →</b></a>
  &nbsp;·&nbsp;
  <a href="#中文">中文</a>
  &nbsp;·&nbsp;
  <a href="#english">English</a>
</p>

<p align="center">
  <a href="https://github.com/MartinMax0711/PedroPathingBiobuzz/actions/workflows/deploy.yml"><img src="https://github.com/MartinMax0711/PedroPathingBiobuzz/actions/workflows/deploy.yml/badge.svg" alt="Deploy to GitHub Pages" /></a>
</p>

---

## 中文

### 这是什么

本项目是 [Pedro Pathing Visualizer](https://github.com/Pedro-Pathing/Visualizer) 的 **BIOBUZZ 赛季版**。界面保持原版布局（顶部导航栏、左侧方形场地、右侧侧边栏、底部播放条），在此基础上加入了本赛季的场地、障碍物、起始位置规则检查和代码导出等功能。所有数据都保存在浏览器本地，无需登录。

在线地址：**https://martinmax0711.github.io/PedroPathingBiobuzz/**

### 功能

- **矢量场地图**：按 Competition Manual 尺寸生成的 BIOBUZZ 场地（`public/fields/biobuzz.svg`），任意缩放都清晰。
- **固定障碍物**：两根 HIVE 框架底座、四根向内倾斜的 A 字形支腿（按 18 in 以下高度建模）和四个 FLOWER 都是锁定障碍物；机器人可以从 HIVE 下方穿过，但要避开支腿附近。
- **G304 起始位置**：8 个合法预设起点（红/蓝各 4 个），并实时检查起始姿态是否合规（贴墙、不越过中线、不压 LOADING ZONE、不碰 FLOWER、避开 GARDEN 中预置的 POLLEN、18 in 尺寸限制 R102）。
- **180° 切换联盟**：BIOBUZZ 场地 180° 旋转对称，一键把整条路径在红/蓝之间转换。
- **AUTO 30 秒计时**：预计用时超过 AUTO 时长时，导航栏会出现 **AUTO** 提示并显示超出的秒数；没有超时就不显示。
- **碰撞警告**：沿路径扫描机器人外形，标出与 HIVE / FLOWER 相撞的路段。
- **场地标注**：可开关的格子坐标（A–F / 1–6）、联盟墙、区域名称和 AprilTag 编号。
- **代码导出**（导航栏 `</>`）：生成 Pedro Pathing 2.x 的 **Java** 或 **Kotlin** 代码。
  - *Paths only*：只有 PathChain 赋值，粘贴进已有构造函数；
  - *Paths class*：包含起始位姿 `startPose` 和所有路径链；
  - *Full OpMode*：完整的自动程序，状态机按侧边栏顺序执行路径和等待；
  - *Other alliance*：导出另一联盟（旋转 180°）的代码，不改动画面上的路径。
- 保留原版功能：撤销/重做、`.pp` 文件保存与读取、多路径模式、GIF/PNG 导出、路径优化、网格/尺子/量角器。

### 坐标约定

| 项目 | 约定 |
| --- | --- |
| 单位 | 英寸（in）；场地按 **141.5 in** 内边长建模（手册标称约 144 in，6 × 6 块泡沫地垫） |
| 原点 | 场地**左下角**，观众席在画面**下方** |
| 坐标轴 | +x 向右（指向蓝方墙），+y 向上（远离观众席） |
| 联盟 | **红方**联盟墙在**左侧**（x = 0），**蓝方**在右侧 |
| 朝向 | 0° = +x，逆时针为正，界面中显示/输入范围为 (-180°, 180°] |
| 机器人尺寸 | 设置中的**长度**沿机器人朝向（前↔后），**宽度**为左右方向；两者都不是竖直高度 |
| 导出代码 | 坐标原样输出，角度统一写成 `Math.toRadians(…)` |

### 场地几何与来源

| 元素 | 数值（约） | 手册章节（TU01） |
| --- | --- | --- |
| 场地 | 标称 ≈ 144 in（§9.2）；按 141.5 in 内边长建模（Pedro Pathing / CAD），地垫 ≈ 23.6 in | §9.2 |
| LOADING ZONE | ≈ 23 × 11 in，红方在左墙第 5 行，蓝方为 180° 对称位置 | §9.3 |
| GARDEN | ≈ 23 × 2 in，沿观众席墙红方角落；蓝方在后墙蓝方角落 | §9.3 |
| FLOWER | 4 个，装在墙上格线处（后墙 B\|C、蓝墙 4\|5、观众墙 D\|E、红墙 2\|3） | §9.7 |
| HIVE 结构 | 框架底座 ≈ 49.5 × 39 in，位于场地中央；最低点 ≈ 30.6 in，机器人可从下方通过，但四根向内倾斜的 A 字形支腿附近除外（按 18 in 以下高度的障碍物建模） | §9.6 |
| AprilTag | 位于 CELL 底面，按手册图 9-17 编号 | §9.9 |
| 得分物尺寸 | POLLEN ⌀ 2.8 in、NECTAR ⌀ 3.6 in | §9.8 |
| 预置得分物 | 每个 GARDEN 4 个 POLLEN；每个朝上的 CELL 3 个 NECTAR | §10.3.1 |
| 起始位置 | G304（A、C、D、E、G）与 R102（18 in） | G304 / R102 |

所有尺寸以 `src/biobuzz/field.ts` 为准；手册中的图示尺寸允许 **±1 in** 公差。

### 本地开发

需要 Node.js 22.18+（`npm run field:build` 直接运行 TypeScript 文件，依赖 Node 22.18 起内置的类型剥离）。

```bash
npm install          # 安装依赖
npm run dev          # 本地开发服务器（Vite）
npm test             # 单元测试（Vitest）
npm run build        # 生产构建，输出到 dist/
npm run field:build  # 由 src/biobuzz/field.ts 重新生成 public/fields/biobuzz.svg
```

### 部署到 GitHub Pages

1. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**（只需设置一次）。
2. 推送到 `main` 分支后，`.github/workflows/deploy.yml` 会自动运行单元测试、构建并发布。
3. 构建使用相对路径（`base: "./"`），所以在 `/PedroPathingBiobuzz/` 子路径下也能正常工作。
4. 离线缓存由 `public/sw.js` 提供（仅生产环境）。联网时应用主体和场地图总是先向服务器校验，新版本发布后下次打开即生效；离线时使用缓存。

### 致谢

- 基于 [Pedro-Pathing/Visualizer](https://github.com/Pedro-Pathing/Visualizer)（Apache-2.0，基线提交 `f54357e`），详见 `LICENSE` 与 `NOTICE`。改动过的上游文件开头带有 “Modified for the BIOBUZZ Edition” 注释，本版新增的文件列在 `NOTICE` 中。
- 特别感谢 **#16166 Watt's Up** 开发了原版可视化工具，我们非常感谢你们的工作。
- [Pedro Pathing](https://pedropathing.com/) 路径跟随库。

### 免责声明

本项目与 *FIRST*® 无关，也未获得其认可。场地数据根据 BIOBUZZ Competition Manual 整理，可能存在误差（手册尺寸本身有 ±1 in 公差）；比赛前请以官方手册和实际场地为准。

---

## English

### What it is

This is the **BIOBUZZ edition** of the [Pedro Pathing Visualizer](https://github.com/Pedro-Pathing/Visualizer). It keeps the original layout (navbar on top, square field on the left, sidebar on the right, playback bar at the bottom) and adds this season's field, obstacles, starting-pose rules and code export. Everything is stored locally in your browser; no account needed.

Live app: **https://martinmax0711.github.io/PedroPathingBiobuzz/**

### Features

- **Vector field art** drawn from the Competition Manual dimensions (`public/fields/biobuzz.svg`), sharp at any zoom.
- **Fixed obstacles**: the two HIVE frame rails, the four inward-leaning A-frame legs (modeled up to 18 in high) and the four FLOWERS are locked obstacles. Robots can drive under the HIVE, except near the legs.
- **G304 starting poses**: 8 legal presets (4 red, 4 blue) and a live legality check (touching the wall, own side of the field, not in a LOADING ZONE, not touching a FLOWER, clear of the POLLEN pre-staged in the GARDEN, 18 in size limit from R102).
- **180° alliance switch**: BIOBUZZ is rotationally symmetric, so a whole path converts between red and blue in one click.
- **30 s AUTO timer**: when the predicted routine runs longer than AUTO, an **AUTO** pill with the overrun in seconds appears in the navbar. It stays hidden while the routine fits.
- **Collision warnings**: sweeps the robot footprint along each path and highlights segments that hit a HIVE or a FLOWER.
- **Field overlays**: toggleable tile labels (A–F / 1–6), alliance walls, zone names and AprilTag IDs.
- **Code export** (navbar `</>`): **Java** or **Kotlin** for Pedro Pathing 2.x.
  - *Paths only*: PathChain assignments to paste into an existing constructor.
  - *Paths class*: the start pose (`startPose`) and every path chain.
  - *Full OpMode*: a complete autonomous whose state machine runs the sidebar sequence (paths and waits) in order.
  - *Other alliance*: export the 180°-rotated routine without changing the drawing.
- All original features are kept: undo/redo, `.pp` save/load, Multiple Paths mode, GIF/PNG export, the path optimizer, grid/ruler/protractor.

### Coordinate conventions

| Item | Convention |
| --- | --- |
| Units | inches; the field is modeled as **141.5 in** inside (≈ 144 in nominal in the manual, 6 × 6 foam tiles) |
| Origin | **bottom-left** corner, audience at the **bottom** of the screen |
| Axes | +x to the right (toward the blue wall), +y up (away from the audience) |
| Alliances | **red** alliance wall on the **left** (x = 0), **blue** on the right |
| Heading | 0° = +x, counter-clockwise positive, shown and entered in (-180°, 180°] |
| Robot size | in Settings, **length** runs along the heading (front↔back) and **width** is side to side; neither is the vertical height |
| Exported code | coordinates as shown; every angle written as `Math.toRadians(…)` |

### Field geometry and sources

| Element | Value (approx.) | Manual section (TU01) |
| --- | --- | --- |
| Field | ≈ 144 in nominal (§9.2); modeled as 141.5 in inside (Pedro Pathing / CAD), tiles ≈ 23.6 in | §9.2 |
| LOADING ZONE | ≈ 23 × 11 in; red on the left wall in tile row 5, blue rotated 180° | §9.3 |
| GARDEN | ≈ 23 × 2 in along the audience wall in the red corner; blue on the rear wall | §9.3 |
| FLOWER | 4, wall-mounted on tile seams (rear B\|C, blue wall 4\|5, audience D\|E, red wall 2\|3) | §9.7 |
| HIVE Structure | frame rails ≈ 49.5 × 39 in, centred; lowest point ≈ 30.6 in, so robots can pass underneath except near the four inward-leaning A-frame legs (modeled as obstacles up to 18 in high) | §9.6 |
| AprilTags | under each CELL, numbered as in Figure 9-17 | §9.9 |
| Scoring elements | POLLEN ⌀ 2.8 in, NECTAR ⌀ 3.6 in | §9.8 |
| Pre-staged elements | 4 POLLEN in each GARDEN; 3 NECTAR in each upward CELL | §10.3.1 |
| Starting pose | G304 (A, C, D, E, G) and R102 (18 in) | G304 / R102 |

`src/biobuzz/field.ts` is the single source of truth for every dimension. Illustrated manual dimensions carry a **±1 in** tolerance.

### Local development

Requires Node.js 22.18+ (`npm run field:build` runs a TypeScript file directly, using the type stripping built into Node from 22.18).

```bash
npm install          # install dependencies
npm run dev          # Vite dev server
npm test             # unit tests (Vitest)
npm run build        # production build into dist/
npm run field:build  # regenerate public/fields/biobuzz.svg from src/biobuzz/field.ts
```

### Deploying to GitHub Pages

1. In the repository, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions** (one-time setup).
2. Every push to `main` runs `.github/workflows/deploy.yml`: unit tests, build, publish.
3. The build uses relative paths (`base: "./"`), so it works under the `/PedroPathingBiobuzz/` sub-path.
4. Offline support comes from `public/sw.js` (production builds only). When online, the app shell and field art are always revalidated with the server, so a new deploy shows up on the next load; offline, the cached copy is used.

### Credits

- Based on [Pedro-Pathing/Visualizer](https://github.com/Pedro-Pathing/Visualizer) (Apache-2.0, base commit `f54357e`); see `LICENSE` and `NOTICE`. Upstream files changed for this edition start with a “Modified for the BIOBUZZ Edition” comment, and `NOTICE` lists the files this edition adds.
- Big thanks to **#16166 Watt's Up** for developing the original visualizer. We really appreciate your work.
- The [Pedro Pathing](https://pedropathing.com/) path-following library.

### Disclaimer

This project is not affiliated with or endorsed by *FIRST*®. Field data was compiled from the BIOBUZZ Competition Manual and may contain errors (the manual's own dimensions have a ±1 in tolerance). Always check against the official manual and the real field before an event.
