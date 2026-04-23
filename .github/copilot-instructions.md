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
- **Prefer procedural/generated graphics** — this avoids licensing issues entirely
- Image formats: PNG for sprites, WebP for larger images

## Asset and Image Review Rules

When any images, sprites, sounds, or visual assets are added or contributed, verify ALL of these:

- **Appropriate**: No violent, offensive, or disturbing content beyond cartoon/retro arcade level
- **Suitable for work**: Content must be appropriate for professional environments
- **Legally usable**: License must permit use in a free, open-source app (CC0, CC-BY, MIT, public domain, or original work). Do not use assets ripped from commercial games.
- **Properly attributed**: Source and license must be noted in the PR description and in `README.md` under `## Credits`
- **Relevant**: Art style should be consistent with the retro arcade theme of the project
- **Right format**: PNG for sprites, WebP for larger images; keep file sizes reasonable

## License Rules

- Game names must be **original** — do not use trademarked names (Pac-Man, Galaga, Space Invaders, Pitfall, etc.)
- Game mechanics may be inspired by classics (side-scrolling platformer is a genre, not a trademark) but do not copy specific copyrighted elements
- Any third-party code or assets must have a license compatible with this project
- All sources must be credited in `README.md` under `## Credits`

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

## Maintenance Matrix — What to Update When Code Changes

Every code change must keep the full project in sync. Use this matrix to determine what else needs updating:

### When a new game is added

| Artifact | What to update |
|----------|----------------|
| `src/game/game.ts` | Add import + GAMES registry entry |
| `tests/<game>.spec.ts` | Create game-specific tests (startup, controls, switching, viewport) |
| `assets/<game>/` | Create asset folder structure |
| `.github/ISSUE_TEMPLATE/bug-report.yml` | Add game to "Affected Game" dropdown |
| `AGENTS.md` | Update game count, game names, repo structure scene list |
| `README.md` | Add controls table, game screenshot/description |
| `docs/` | Update website if it lists games |

### When an existing game is modified

| Artifact | What to update |
|----------|----------------|
| `tests/<game>.spec.ts` | Add/update tests covering new or changed mechanics |
| `tests/viewport-test.spec.ts` | Update if layout or positioning changed |
| `README.md` | Update controls table if controls changed |
| `AGENTS.md` | Update if architectural patterns or conventions changed |
| `.github/copilot-instructions.md` | Update if new coding conventions were established |

### When BaseScene is modified

| Artifact | What to update |
|----------|----------------|
| All game scenes | Verify compatibility with BaseScene changes |
| All game tests | Run full test suite — shared behavior may have changed |
| `.github/copilot-instructions.md` | Update BaseScene contract section |
| `.github/skills/new-game.md` | Update template code and API reference table |
| `AGENTS.md` | Update game creation guide if lifecycle changed |

### When build, CI, or tooling changes

| Artifact | What to update |
|----------|----------------|
| `AGENTS.md` | Update build/test/release commands |
| `.github/copilot-setup-steps.yml` | Update cloud agent environment setup |
| `.github/workflows/ci.yml` | Update CI steps to match |
| `.github/copilot-instructions.md` | Update if conventions or patterns changed |

### When project structure changes

| Artifact | What to update |
|----------|----------------|
| `AGENTS.md` | Update repo structure section |
| `.github/copilot-instructions.md` | Update path references |
| `.github/CODEOWNERS` | Update ownership mappings |
