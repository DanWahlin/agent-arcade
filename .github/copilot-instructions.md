# Copilot Instructions — Agent Arcade

## Language & Style

- **TypeScript** for all frontend/game code (`src/game/`). Strict mode enabled (`tsconfig.renderer.json`).
- **Rust** for the Tauri backend (`src-tauri/`). Standard Rust conventions apply.
- Target **ES2022** with `"module": "ES2022"` — use modern syntax (optional chaining, nullish coalescing, `import type`).
- Use `declare const Phaser: any;` at the top of scene files — Phaser is loaded as a global script, not an npm import.
- Import from `.js` extensions in TypeScript (required for ES module resolution): `import { BaseScene } from './BaseScene.js';`
- Prefer `const` over `let`; never use `var`.
- No semicolons are enforced by convention — the codebase uses semicolons, so follow suit.

## Game Scene Patterns

Every game scene **must** extend `BaseScene` and follow this lifecycle:

```typescript
export class MyGameScene extends BaseScene {
  constructor() {
    super('my-game-key');  // kebab-case scene key
  }

  create() {
    this.initBase();       // MUST be first — sets up pause bridge, shutdown listener, backdrop
    this.loadHighScore();  // Load persisted high score from localStorage

    // ... scene-specific setup ...

    this.startWithReadyScreen();  // MUST be last — shows "Press SPACE to start" overlay
  }
}
```

- `initBase()` **must** be the first call in `create()` — it registers the pause bridge and shutdown listener.
- `startWithReadyScreen()` **must** be the last call in `create()` — it shows the "Press SPACE" overlay and pauses the scene until the player starts.
- Use `this.addScore(points, worldX, worldY)` for score changes — it handles the HUD animation and floating text.
- Use `this.syncLivesToHUD()` and `this.syncLevelToHUD()` after modifying `this.lives` or `this.level`.
- Screen dimensions are imported as `W` and `H` from `BaseScene.js` — use them for responsive positioning.
- All game objects must be scaled relative to `SCALE = Math.min(W / 1920, H / 1080)` for responsive sizing.

## Game Registry

Games are registered in `src/game/game.ts` in the `GAMES` array:

```typescript
const GAMES = [
  { key: 'my-game', scene: MyGameScene, label: '🎮 My Game' },
];
```

The `key` must be kebab-case and match the scene key passed to `super()`.

## Testing Patterns

- **Playwright** for all tests in `tests/`.
- Test files follow `{game-key}.spec.ts` naming.
- Use the shared helpers from `tests/helpers.ts`: `waitForGame()`, `getGameState()`, `holdKey()`, `switchGame()`, `debugScreenshot()`.
- Access game state via `window.__phaserGame` — the Phaser instance is exposed globally for tests.
- The score HUD has a 450ms count-up animation. **Wait ~500ms** after score-triggering actions before asserting score values.
- Viewport tests belong in `tests/viewport-test.spec.ts`.
- Each game-specific test file defines a `get{Game}State()` helper that evaluates scene state via `page.evaluate()`.

## Asset Conventions

- Sprite sheets live in `assets/{game-key}/` (e.g., `assets/ninja-runner/`, `assets/cosmic-rocks/`).
- Sound effects live in `assets/sounds/` (shared across games).
- Use PNG for sprites and sprite sheets.
- Use MP3 for audio.
- Asset file names use `snake_case` (e.g., `coin_sheet.png`, `enemy_strip.png`).
- Procedural graphics (drawn with Phaser Graphics API) are preferred for simple shapes — see Cosmic Rocks and Alien Onslaught for examples.

## Tauri Backend (Rust)

- All Rust code lives in `src-tauri/`.
- Window is configured as transparent, undecorated, always-on-top, and non-resizable (`tauri.conf.json`).
- Tauri plugins: `global-shortcut`, `single-instance`, `log`, `updater`, `opener`.
- Only modify Rust code when changing window behavior, system tray, or native OS integrations.

## Documentation

- Project docs live in `docs/` — a static HTML/CSS/JS site deployed to GitHub Pages.
- The `deploy-pages.yml` workflow auto-deploys on pushes to `main` that change `docs/`.
- README.md is the primary contributor-facing documentation.
- AGENTS.md provides full project context for AI agents.

## Maintenance Matrix

| Change Made | Files to Update |
|---|---|
| **New game added** | `src/game/scenes/{Game}.ts` (scene), `src/game/game.ts` (GAMES array import + entry), `tests/{game-key}.spec.ts` (tests), `assets/{game-key}/` (sprites if needed), `README.md` (Games table + Controls section), `AGENTS.md` (Repository Structure scenes list) |
| **Existing game modified** | `tests/{game-key}.spec.ts` (update/add tests), `README.md` (update description if behavior changed) |
| **BaseScene changed** | All scene files that call the changed API, all test files (verify no regressions) |
| **HUD changed** | `src/game/hud.js`, `src/game/index.html`, all test `getGameState()` helpers that read HUD elements |
| **Build or tooling changed** | `.github/workflows/build.yml`, `.github/workflows/ci.yml`, `.github/copilot-setup-steps.yml`, `AGENTS.md` (Build & Run section) |
| **New asset added** | `assets/{game-key}/` or `assets/sounds/`, verify `build:frontend` copies it (`cp -R assets dist/assets`) |
| **Version bumped** | `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` — use `npm run release <version>` to update all three automatically |
| **Website changed** | `docs/` directory only — changes auto-deploy via `deploy-pages.yml` |
| **Project structure changed** | `AGENTS.md` (Repository Structure), `README.md`, import paths in affected files |
