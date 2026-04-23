# Copilot Instructions for Agent Arcade

These instructions apply to all Copilot interactions in this repository — Chat, code completions, PR reviews, and CLI.

For project structure, build commands, and release process, see [AGENTS.md](../AGENTS.md).

## TypeScript Conventions

- Target: ES2022 with `verbatimModuleSyntax` (use `import type` for type-only imports)
- Strict mode enabled — no `any` types without justification
- Module resolution: `bundler`
- All game code lives under `src/game/`

## Phaser 4 Patterns

- Use Arcade physics (`this.physics.add.*`) for game objects
- Prefer Phaser Groups for managing collections of similar objects
- Use `this.time.addEvent()` for timed events, not `setTimeout`
- Use `this.tweens.add()` for animations
- Access the game instance via `this.game` within scenes

## BaseScene Contract

Every game scene MUST:
1. Extend `BaseScene` from `./BaseScene`
2. Call `super('<scene-key>')` in the constructor
3. Implement `get displayName(): string`
4. Call `this.initBase()` as the FIRST line of `create()`
5. Use `this.addScore(points)` for scoring (includes animation)
6. Call `this.showGameOver()` when the game ends

BaseScene provides: score/lives/level state, HUD sync, score animation, game-over overlay with leaderboard, pause/resume, starfield helpers, wave banner, backdrop transparency.

## Screen Size Rules

- Import `W`, `H` from `./BaseScene` for screen dimensions
- ALWAYS derive layout positions from `W`/`H` proportionally: `W * 0.5` not `960`
- NEVER cache screen-dependent values at module level — compute them in `create()`
- The game resizes via `game.scale.resize(W, H)` on window resize events

## Game Registry

- Games are registered in `src/game/game.ts` in the `GAMES` array
- Each entry: `{ key: '<kebab-name>', scene: SceneClass, label: '<Display Name>' }`
- The key must match what's passed to `super()` in the scene constructor
- The dropdown UI is built automatically from `GAMES`

## Asset Conventions

- Assets live in `assets/<kebab-name>/` with sounds in `assets/<kebab-name>/sounds/`
- Audio formats: `.m4a` or `.ogg`
- Sprite sheets and images go in the game's root asset folder
- Some sounds are shared across games (e.g., `sfx_laser`, `sfx_zap`)

## Test Conventions

- Tests use Playwright with Chromium
- Access Phaser state via `window.__phaserGame` (exposed on the window object)
- Switch games via `window.__agentArcadeSwitchGame(key)`
- HUD selectors: `#score-value`, `#lives-value`, `#hi-value`, `#level-value`
- Score has a 450ms count-up animation — wait ~500ms after score-triggering actions before asserting score values
- Test server runs on `localhost:4173` (served by `python3 -m http.server`)
- Each game should have viewport tests at multiple resolutions (4K, 1080p, 720p, 1024×768)

## Code Style

- Prefer procedural graphics (Phaser Graphics) when possible — reduces asset dependencies
- Keep game-specific logic in the scene file; only add to BaseScene if it's shared across 2+ games
- Use descriptive variable names for game objects (`player`, `enemies`, `bullets`, not `p`, `e`, `b`)

## Keeping Docs and Templates in Sync

When adding a new game or modifying existing game features, also update:

- **`.github/ISSUE_TEMPLATE/bug-report.yml`** — add new games to the "Affected Game" dropdown
- **`AGENTS.md`** — update the game count, game names, and scene file list in the project overview and repo structure
- **`README.md`** — add/update controls tables and game descriptions
- **Tests** — add or update Playwright tests for any new or changed gameplay mechanics, and ensure viewport tests cover the change
