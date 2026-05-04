# AGENTS.md

## Project Overview

Agent Arcade is a retro arcade game that runs as a transparent desktop overlay, built with **Tauri v2** (Rust backend) + **Phaser 4** (game engine) + **TypeScript**. It includes six mini-games: Alien Onslaught, Cosmic Rocks, Galaxy Blaster, Ninja Runner, Planet Guardian, and Vault Runner.

## Repository Structure

```
src/game/          — Frontend game code (TypeScript, Phaser scenes)
src/game/scenes/   — Game scenes: BaseScene.ts, NinjaRunner.ts, GalaxyBlaster.ts, CosmicRocks.ts, AlienOnslaught.ts, PlanetGuardian.ts, VaultRunner.ts
src/game/scenes/vault-runner/  — Vault Runner subsystems (levels, tiles, holeManager, guardAI, types)
src/game/game.ts   — Game bootstrap, scene registry, and game switcher
src-tauri/         — Tauri v2 Rust backend (window management, tray icon, overlay)
docs/              — GitHub Pages website (static HTML/CSS/JS)
assets/            — Sprite sheets, sounds, and game assets
assets/defender/   — Planet Guardian sprites (PNG) and sounds (WAV)
scripts/           — Build and release scripts (release.js)
tests/             — Playwright end-to-end tests (7 spec files, 80 tests)
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
npx playwright test             # Run all tests (80 tests across 7 files)
npx playwright test --headed    # Run with visible browser
```

The Playwright `webServer` config serves `dist/` via `python3 -m http.server 4173`. The score HUD has a 450ms count-up animation — tests should wait ~500ms after score-triggering actions before asserting score values.

Tests automatically dismiss the ready screen overlay via the `dismissReadyScreen()` helper in `tests/helpers.ts`. The `waitForGame()` and `switchGame()` helpers handle this automatically — individual tests do not need to dismiss it manually.

## Website

The `docs/` directory contains the project landing page deployed to [danwahlin.github.io/agent-arcade](https://danwahlin.github.io/agent-arcade). It is a single-page static site (`index.html`, `style.css`, `script.js`) with no build step. Changes to `docs/` on `main` trigger the `deploy-pages.yml` workflow.

## Key Patterns

- All game scenes extend `BaseScene` which provides shared HUD, scoring, pause/resume, ready screen, game over, and lifecycle logic.
- `game.ts` maintains a `GAMES` registry array; adding a game means adding a scene class and a registry entry.
- The Phaser game instance is exposed on `window.__phaserGame` for Playwright test access.
- Tauri window is configured as transparent, undecorated, always-on-top, and non-resizable (see `tauri.conf.json`).
- `BaseScene` provides optional overrides: `getControls()` (keyboard hints on ready screen) and `getDescription()` (one-line game description on ready screen).
- `BaseScene.create()` must call `this.initBase()` first and `this.startWithReadyScreen()` last.
- Do NOT call `addCapture('SPACE')` before the ready screen — it blocks the document keydown listener that dismisses it.

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

## Vault Runner (Lode Runner-style game)

Vault Runner (`src/game/scenes/VaultRunner.ts`) is a tile-grid puzzle-platformer inspired by the 1983 Brøderbund Lode Runner. The runner navigates a 28×16 grid, collects all gold, digs holes to trap guards, and escapes via a revealed ladder. Five hand-crafted levels.

- **Tile grid** — 28 cols × 16 rows. Tile size auto-fits viewport: `tileSize = floor(min(W/28, (H-HUD_PAD)/16))`.
- **Tile kinds** — EMPTY, BRICK (diggable), CONCRETE (indestructible), LADDER, ROPE, GOLD, EXIT_LADDER (hidden until all gold collected), HOLE (transient).
- **Manual physics** — no Phaser bodies. Player and guards tracked as grid coords + sub-tile offset; sprites synced each frame.
- **Programmatic graphics** — all textures generated at runtime via `Graphics.generateTexture()` in `tiles.ts`. No PNG assets required for the game itself; SFX reused from Cosmic Rocks (`assets/cosmic-rocks/sounds/`).
- **Subsystems** — split out under `src/game/scenes/vault-runner/`:
  - `levels.ts` — 5 hand-crafted level strings + `parseLevel()` + `validateLevel()` (catches missing player spawn, no gold, no exit, broken bottom row, unknown chars).
  - `tiles.ts` — texture generation + tile predicate helpers.
  - `holeManager.ts` — dig/regen state machine: BRICK→DIGGING→OPEN→WARNING→REGEN→BRICK (~4.5s cycle). On regen, fires `onActorCrushed` if anyone occupies the tile.
  - `guardAI.ts` — BFS pathfinder over the 28×16 grid (recomputed every 200ms).
  - `types.ts` — shared interfaces and constants.
- **Hole edge cases** — player can only dig while standing on solid ground (not falling/climbing/roping); guard standing in hole at regen dies and respawns at original spawn tile (+250 score); player crushed by regen loses a life.
- **Scoring** — gold +100, level clear +1000, guard kill +250, per-level time bonus (5000 → 0 over 60s, paused during ready/pause).
- **Test hooks** — `window.__vaultRunnerLoadFixture(name)` loads a tiny fixture level for deterministic AI tests; `window.__vaultRunnerGetState()` returns level/gold/hole/guard state.

## CI/CD

- **Build & Release** (`build.yml`): Triggered by `v*` tags. Builds for macOS (universal), Windows, and Linux, then creates a GitHub Release with installers. Release notes are auto-generated by git-cliff.
- **Deploy Pages** (`deploy-pages.yml`): Triggered by pushes to `main` that change `docs/`. Deploys `docs/` to GitHub Pages.

## Releasing

To cut a new release, run a single command:

```bash
npm run release <version>    # e.g. npm run release 0.3.0
```

This script (`scripts/release.js`) handles everything:
1. Bumps the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
2. Generates/updates `CHANGELOG.md` via git-cliff (config: `cliff.toml`)
3. Commits all changes, creates a git tag (`v<version>`), and pushes to origin
4. CI automatically builds installers and creates the GitHub Release with auto-generated notes

**Important:** Version must be updated in all three config files for installer filenames to be correct. The release script does this automatically — do not manually tag without bumping versions first.
