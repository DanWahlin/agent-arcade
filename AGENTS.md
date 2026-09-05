# AGENTS.md

## Project Overview

Agent Arcade is a retro arcade game that runs as a transparent desktop overlay, built with **Tauri v2** (Rust backend) + **Phaser 4** (game engine) + **TypeScript**. It includes six mini-games: Alien Onslaught, Cosmic Rocks, Galaxy Blaster, Ninja Runner, Planet Guardian, and Surface Defense.

## Repository Structure

```
src/game/          — Frontend game code (TypeScript, Phaser scenes)
src/game/scenes/   — Game scenes: BaseScene.ts, NinjaRunner.ts, GalaxyBlaster.ts, CosmicRocks.ts, AlienOnslaught.ts, PlanetGuardian.ts, SurfaceDefense.ts
src/game/game.ts   — Game bootstrap, scene registry, and game switcher
src/game/layout.ts — Explicit desktop/canvas sizing profiles
src-tauri/         — Tauri v2 Rust backend (window management, tray icon, overlay)
docs/              — GitHub Pages website (static HTML/CSS/JS)
assets/            — Sprite sheets, sounds, and game assets
assets/defender/   — Planet Guardian sprites (PNG) and sounds (WAV)
assets/surface-defense/ — Surface Defense synthesized sound effects (WAV); graphics are procedural
scripts/           — Build and release scripts (release.js)
tests/             — Playwright end-to-end tests, including per-game and viewport coverage
.plans/            — Game design plans and future feature ideas
.github/workflows/ — CI: build.yml (Build & Release on tags), deploy-pages.yml (Pages deploy on docs/ changes)
```

## Tech Stack

- **Desktop shell:** Tauri v2 — transparent, always-on-top, click-through window
- **Game engine:** Phaser 4 with Arcade physics
- **Language:** TypeScript (ES2022 target, `tsconfig.renderer.json`)
- **Rust:** `src-tauri/` — handles window config, tray icon, system APIs
- **Website:** Static HTML/CSS/JS in `docs/`, deployed to GitHub Pages
- **Tests:** Playwright (Chromium, headless)

## Build & Run

```bash
npm install                     # Install dependencies
npm run build:frontend          # Build TypeScript + copy HTML/Phaser/assets to dist/
npm run build                   # Build frontend + Rust (cargo build)
npm start                       # Build frontend + launch Tauri dev mode
```

## Testing

```bash
npm run build:frontend          # Required before tests
npx playwright test             # Run all Playwright tests
npx playwright test --headed    # Run with visible browser
```

The Playwright `webServer` config serves `dist/` with the cross-platform `serve` package. The full suite runs with a Linux user agent, while HUD and user-flow specs also run with Windows and macOS user agents. These browser cases cover platform branches, not native desktop compositors. The score HUD has a 450ms count-up animation — tests should wait ~500ms after score-triggering actions before asserting score values.

Tests automatically dismiss the ready screen overlay via the `dismissReadyScreen()` helper in `tests/helpers.ts`. The `waitForGame()` and `switchGame()` helpers handle this automatically — individual tests do not need to dismiss it manually.

The frontend build rejects unused TypeScript locals and parameters. Remove unused code, or prefix an unused callback parameter with `_` when the API requires its position.

`tests/shared-scene.spec.ts` covers shared rendering, HUD updates, overlay input, and timer cleanup. Rendering regressions use Graphics-update and object-lifetime assertions rather than machine-dependent FPS thresholds.

After frontend changes, run `npm run build:canvas` to update the tracked canvas distribution. `tests/canvas-extension.spec.ts` covers its HTTP API, game selection, and startup with the generated game files.

The canvas bootstrap sets `window.__agentArcadeLayoutProfile = 'canvas'` before modules load. Desktop builds use the default profile. Keep layout differences in `src/game/layout.ts`; do not rewrite compiled JavaScript in the extension server.

## Website

The `docs/` directory contains the project landing page deployed to [danwahlin.github.io/agent-arcade](https://danwahlin.github.io/agent-arcade). It is a single-page static site (`index.html`, `style.css`, `script.js`) with no build step. Changes to `docs/` on `main` trigger the `deploy-pages.yml` workflow.

## Key Patterns

- All game scenes extend `BaseScene` which provides shared HUD, scoring, pause/resume, ready screen, game over, and lifecycle logic.
- `game.ts` maintains a `GAMES` registry array; adding a game means adding a scene class and a registry entry.
- The Phaser game instance is exposed on `window.__phaserGame` for Playwright test access.
- Tauri window is configured as transparent, undecorated, always-on-top, and non-resizable (see `tauri.conf.json`).
- Linux reserves a 40-pixel top inset by default; set `AGENT_ARCADE_TOP_INSET` to a value from 0–512 when the desktop panel uses a different height.
- `BaseScene` provides optional overrides: `getControls()` (keyboard hints on ready screen) and `getDescription()` (one-line game description on ready screen).
- `BaseScene.create()` must call `this.initBase()` first and `this.startWithReadyScreen()` last.
- Do NOT call `addCapture('SPACE')` before the ready screen — it blocks the document keydown listener that dismisses it.

## Ninja Runner (bounded scrolling world)

- Keep two screen widths behind the furthest camera position. The left camera/player boundary advances in tile-sized steps and never moves backward.
- `trimWorld()` releases expired terrain, decorations, hazards, pickups, owned effects, and tweens. It also removes obsolete gap records.
- `extendGround()` must not rebuild terrain left of `terrainStartX`. Respawn searches stay inside the retained world.
- Use `terrainDecorations` for generated water, bushes, spike images, and flag poles so they are removed with old terrain.
- Keep the initial parallax background separate: its object count is fixed and its coordinates do not match world scrolling.

## Planet Guardian (Defender-style game)

Planet Guardian (`src/game/scenes/PlanetGuardian.ts`) is a side-scrolling shooter inspired by the 1981 Williams Defender arcade game. Key implementation details:

- **Manual physics** — positions tracked as world coordinates, no Phaser bodies.
- **Sprites** — PNG files in `assets/defender/`, loaded in `preload()`. Uses linear texture filtering (overrides global `pixelArt: true`).
- **Sprite scale** — `spriteScale = max(0.35, 0.55 * SCALE)` where `SCALE = min(W/1920, H/1080)`.
- **Sounds** — 13 WAV files from the OpenDefender project in `assets/defender/sounds/`. Playback wrapped in `try/catch`.
- **World wrap** — toroidal world (`WORLD_W = W * 6`). Use `wrapDx()` helper for delta-X calculations.
- **Enemy types** — Lander, Mutant, Bomber, Pod, Swarmer, Baiter (6 types with distinct AI).
- **Humanoid rescue** — 10 humanoids walk on terrain. Landers grab them; player can catch falling humanoids. All humanoids dead triggers planet destruction.
- **Friendly fire** — Player bullets kill humanoids (matches OpenDefender behavior).
- **Cleanup** — `shutdown()` calls `this.time.removeAllEvents()` and `destroyObj()` on all sprites/emitters to prevent memory leaks on game switch.

## Surface Defense (missile-defense game)

Surface Defense (`src/game/scenes/SurfaceDefense.ts`) is a procedurally rendered missile-defense game inspired by classic trackball arcade mechanics.

- **Manual simulation** — missiles, interceptors, explosions, bombers, satellites, collisions, and trails are updated without Phaser physics bodies.
- **Defenses** — six persistent cities and three batteries with 10 interceptors each; batteries replenish each wave.
- **Input** — mouse or arrow keys move the targeting cursor. Click/Space fires the nearest battery; A/S/D selects a specific battery.
- **Escalation** — later waves add faster missiles, splitting warheads, smart warheads that steer around blasts, bombers, and hostile satellites.
- **Assets** — all graphics are drawn with Phaser Graphics. Original synthesized WAV effects live in `assets/surface-defense/sounds/` and can be regenerated with `node scripts/generate-surface-defense-audio.mjs`.

## CI/CD

- **Build & Release** (`build.yml`): Triggered by `v*` tags, or manually for build-only validation. Runs native Rust tests and builds for macOS (universal), Windows, and Linux. Tag runs create a GitHub Release with installers and git-cliff change notes.
- **Deploy Pages** (`deploy-pages.yml`): Triggered by pushes to `main` that change `docs/`. Deploys `docs/` to GitHub Pages.

## Releasing

To cut a new release, run a single command:

```bash
npm run release <version>    # e.g. npm run release 0.3.0
```

This script (`scripts/release.js`) handles everything:
1. Bumps the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, and synchronizes the root package versions in both lockfiles without changing dependencies
2. Generates/updates `CHANGELOG.md` via git-cliff (config: `cliff.toml`)
3. Commits all changes, creates a git tag (`v<version>`), and pushes to origin
4. CI automatically builds installers and creates the GitHub Release with auto-generated notes

**Important:** Version must be updated in all three config files for installer filenames to be correct. The release script does this automatically — do not manually tag without bumping versions first.
