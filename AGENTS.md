# AGENTS.md

## Project Overview

Agent Arcade is a retro arcade game that runs as a transparent desktop overlay, built with **Tauri v2** (Rust backend) + **Phaser 4** (game engine) + **TypeScript**. It includes four mini-games: Alien Onslaught, Cosmic Rocks, Galaxy Blaster, and Ninja Runner.

## Repository Structure

```
src/game/          — Frontend game code (TypeScript, Phaser scenes)
src/game/scenes/   — Game scenes: BaseScene.ts, AlienOnslaught.ts, CosmicRocks.ts, GalaxyBlaster.ts, NinjaRunner.ts
src/game/game.ts   — Game bootstrap, scene registry, and game switcher
src-tauri/         — Tauri v2 Rust backend (window management, tray icon, overlay)
docs/              — GitHub Pages website (static HTML/CSS/JS)
assets/            — Sprite sheets, sounds, and game assets
scripts/           — Build and release scripts (release.js)
tests/             — Playwright end-to-end tests
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
npx playwright test             # Run all tests
npx playwright test --headed    # Run with visible browser
```

The Playwright `webServer` config serves `dist/` via `python3 -m http.server 4173`. The score HUD has a 450ms count-up animation — tests should wait ~500ms after score-triggering actions before asserting score values.

## Website

The `docs/` directory contains the project landing page deployed to [danwahlin.github.io/agent-arcade](https://danwahlin.github.io/agent-arcade). It is a single-page static site (`index.html`, `style.css`, `script.js`) with no build step. Changes to `docs/` on `main` trigger the `deploy-pages.yml` workflow.

## Key Patterns

- All game scenes extend `BaseScene` which provides shared HUD, scoring, pause/resume, and lifecycle logic.
- `game.ts` maintains a `GAMES` registry array; adding a game means adding a scene class and a registry entry.
- The Phaser game instance is exposed on `window.__phaserGame` for Playwright test access.
- Tauri window is configured as transparent, undecorated, always-on-top, and non-resizable (see `tauri.conf.json`).

## Adding a New Game

1. **Create the scene** — `src/game/scenes/{GameName}.ts` extending `BaseScene`. Call `this.initBase()` first and `this.startWithReadyScreen()` last in `create()`.
2. **Register it** — import the scene in `src/game/game.ts` and add an entry to the `GAMES` array with a kebab-case `key`, the scene class, and an emoji label.
3. **Add assets** — put sprites in `assets/{game-key}/` and shared sounds in `assets/sounds/`. Use PNG for sprites, MP3 for audio.
4. **Write tests** — create `tests/{game-key}.spec.ts` using helpers from `tests/helpers.ts`. Remember the 450ms score animation delay.
5. **Update docs** — add the game to the README Games table and Controls section.

See `.github/skills/new-game.md` for the full step-by-step guide with code templates.

## Documentation

- The `docs/` directory is a static HTML/CSS/JS landing page deployed to GitHub Pages via `deploy-pages.yml`.
- There is no docs build step — edit `docs/index.html`, `docs/style.css`, and `docs/script.js` directly.
- This project does not use a docs framework. All contributor documentation lives in `README.md` and `AGENTS.md`.

## Common Pitfalls

- **Build before test** — always run `npm run build:frontend` before `npx playwright test`. The tests serve from `dist/`.
- **Score animation timing** — the HUD score has a 450ms count-up animation. Tests must wait ~500ms after score-triggering actions before asserting.
- **Version in three places** — `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` must stay in sync. Use `npm run release <version>` to update all three automatically.
- **BaseScene lifecycle** — forgetting `initBase()` or `startWithReadyScreen()` in a scene's `create()` method causes subtle bugs (no pause support, no start overlay).
- **Shutdown cleanup** — scenes must clean up timers, DOM elements, and event listeners in `shutdown()` or they leak when switching games.
- **Import extensions** — TypeScript files must import with `.js` extensions (e.g., `import { BaseScene } from './BaseScene.js'`) for ES module resolution.

## CI/CD

- **CI** (`ci.yml`): Triggered on pull requests to `main`. Runs TypeScript type-checking, builds the frontend, and runs Playwright tests.
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
