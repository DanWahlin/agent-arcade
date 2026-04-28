# Copilot Instructions — Agent Arcade

## Language & Framework Conventions

### TypeScript

- Target **ES2022** with strict mode (`tsconfig.renderer.json`).
- Use `declare const Phaser: any;` — Phaser is loaded as a global via a `<script>` tag, not imported as a module.
- Prefer explicit types over `any` for game objects; use `any` only for Phaser API boundaries where typings aren't available.
- Use `.js` extensions in import paths (TypeScript compiles to ES modules served directly by the browser).
- No bundler — the project uses plain `tsc` output served as ES modules.

### Rust (Tauri backend)

- Rust code lives in `src-tauri/`. Follow standard Rust idioms (snake_case, `Result` error handling).
- Never call `global_shortcut().register()` or `unregister()` from within a shortcut handler callback — it deadlocks. Use `std::thread::spawn` to defer.
- Tauri v2 APIs — use `tauri::Manager` trait for window access, `tauri::tray::TrayIconBuilder` for tray icons.

## Game Scene Patterns

Every mini-game is a Phaser Scene that extends `BaseScene` (`src/game/scenes/BaseScene.ts`).

### Creating a new scene

1. `create()` must call `this.initBase()` **first** and `this.startWithReadyScreen()` **last**.
2. Override `getControls()` to return keyboard hints shown on the ready screen.
3. Override `getDescription()` to return a one-line game description.
4. Do **NOT** call `this.input.keyboard.addCapture('SPACE')` before `startWithReadyScreen()` — it blocks the document keydown listener that dismisses the ready screen.

### Game registry

`src/game/game.ts` maintains a `GAMES` array. To add a new game:

1. Create the scene class in `src/game/scenes/`.
2. Import it in `game.ts` and add an entry to the `GAMES` array with `{ key, scene, label }`.
3. The key must be unique and kebab-case.

### Sprite & asset conventions

- Sprite sheets go in `assets/` or a sub-directory named for the game (e.g., `assets/defender/` for Planet Guardian).
- PNG for sprites, WAV for sounds.
- Use `this.load.spritesheet()` or `this.load.image()` in the scene's `preload()`.
- Wrap sound playback in `try/catch` — audio can fail in headless/test environments.

### Physics

- Most games use Phaser Arcade physics (velocity, overlap, colliders).
- Planet Guardian uses manual position tracking (no Phaser bodies) with a toroidal world wrap.

## Test Conventions

- **Runner:** Playwright (Chromium, headless).
- **Test files:** `tests/<game-name>.spec.ts` — one spec file per game, plus `app.spec.ts` for app-level tests.
- **Helpers:** `tests/helpers.ts` exports `waitForGame()`, `switchGame()`, and `dismissReadyScreen()`. Use these; don't reimplement ready-screen dismissal in individual tests.
- **Build first:** Always run `npm run build:frontend` before tests. The test webServer serves from `dist/`.
- **Score assertions:** The HUD has a 450ms count-up animation. Wait **~500ms** after score-triggering actions before reading `#score-value`.
- **Viewport:** Tests use a fixed 1920×1080 viewport. Design games to scale to this resolution.
- **Run tests:** `npm test` (builds + runs all), or `npx playwright test tests/<file>.spec.ts` after a manual build.

## Code Style

- No linter or formatter config exists — keep code consistent with existing style.
- Use single quotes for strings in TypeScript.
- Keep scene files self-contained — each scene owns its own sprites, physics, and logic.
- Comment only when the logic is non-obvious; don't over-comment.

## Asset & Content Rules

- **Sprites:** PNG files. Use linear texture filtering for detailed sprites (override global `pixelArt: true` per-texture).
- **Sounds:** WAV files. Place in `assets/` or a game-specific sub-directory.
- **Naming:** lowercase-kebab-case for asset filenames (e.g., `player-ship.png`, `explosion.wav`).
- **Game-specific sub-dirs:** When a game has many assets (like Planet Guardian with 20+ files), create a dedicated directory under `assets/`.

## Maintenance Matrix

| Change Made | Files to Update |
|---|---|
| **New game scene added** | Create `src/game/scenes/<Name>.ts` extending `BaseScene`, add import + entry in `src/game/game.ts` `GAMES` array, add test file `tests/<name>.spec.ts`, add assets to `assets/`, update `AGENTS.md` |
| **Existing scene modified** | Update corresponding test file in `tests/`, verify no regression with `npm test` |
| **BaseScene changed** | Run full test suite — all 5 games depend on it. Check HUD, scoring, pause, ready screen, game-over flow |
| **Assets added/changed** | Place in correct `assets/` sub-dir, verify `preload()` loads them, run `npm run build:frontend` to copy to `dist/assets/` |
| **Tauri config changed** | Update `src-tauri/tauri.conf.json`. If window behavior changed, verify on macOS + Windows |
| **Rust backend changed** | `cd src-tauri && cargo build` to verify. Check shortcut registration (deadlock risk) |
| **Version bumped** | Must update all three: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`. Use `npm run release <version>` — never manually tag |
| **docs/ website changed** | Push to `main` triggers `deploy-pages.yml`. Preview locally with `python3 -m http.server -d docs` |
| **CI workflows changed** | Test with `workflow_dispatch` trigger or a dry-run branch push |
| **CHANGELOG updated** | Managed by git-cliff via `npm run release`. Do not manually edit unless fixing a typo |
| **Project structure changed** | Update `AGENTS.md` repo structure section, update `README.md` if user-facing |
