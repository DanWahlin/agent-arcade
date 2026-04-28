# Skill: Add a New Game to Agent Arcade

Use this skill when a contributor or AI agent wants to add a new mini-game to Agent Arcade.

## Prerequisites

- Read `AGENTS.md` for project context
- Read `src/game/scenes/BaseScene.ts` for the shared scene API
- Look at an existing game (e.g., `src/game/scenes/CosmicRocks.ts`) as a reference

## Step 1 — Create the Scene File

Create `src/game/scenes/{GameName}.ts`:

```typescript
// {GameName} — brief description of the game.

declare const Phaser: any;

import { BaseScene, W, H } from './BaseScene.js';

let SCALE = Math.min(W / 1920, H / 1080);

export class {GameName}Scene extends BaseScene {
  constructor() {
    super('{game-key}');  // kebab-case key matching the GAMES registry
  }

  create() {
    this.initBase();       // MUST be first
    this.loadHighScore();

    // Recalculate scale for current screen size
    SCALE = Math.min(W / 1920, H / 1080);

    // --- Scene-specific setup ---
    // Create game objects, input handlers, physics, etc.
    // Use W, H, and SCALE for responsive positioning.
    // Use this.addScore(points, x, y) for scoring.
    // Use this.syncLivesToHUD() after changing this.lives.
    // Use this.syncLevelToHUD() after changing this.level.

    this.startWithReadyScreen();  // MUST be last
  }

  update(time: number, delta: number) {
    // Game loop logic
  }

  shutdown() {
    // Clean up timers, DOM elements, event listeners
    super.shutdown();
  }
}
```

### Important Lifecycle Rules

1. `this.initBase()` — **always first** in `create()`. Sets up pause bridge, shutdown listener, and backdrop.
2. `this.startWithReadyScreen()` — **always last** in `create()`. Shows the "Press SPACE to start" overlay.
3. `shutdown()` — clean up all timers (`clearTimeout`, `clearInterval`), remove DOM elements (wave banners), and call `super.shutdown()`.

### BaseScene API Quick Reference

| Method | Purpose |
|--------|---------|
| `this.initBase()` | Must be first in create() — registers pause/shutdown |
| `this.loadHighScore()` | Loads persisted high score from localStorage |
| `this.startWithReadyScreen()` | Must be last in create() — shows start overlay |
| `this.addScore(pts, x, y)` | Add points with floating text and HUD animation |
| `this.syncLivesToHUD()` | Push `this.lives` to the HUD |
| `this.syncLevelToHUD()` | Push `this.level` to the HUD |
| `this.checkHighScore()` | Save high score if current score exceeds it |
| `this.showGameOver()` | Display game-over overlay with restart prompt |
| `W`, `H` | Screen dimensions (import from BaseScene.js) |

## Step 2 — Register in game.ts

Edit `src/game/game.ts`:

1. Add the import at the top:
   ```typescript
   import { {GameName}Scene } from './scenes/{GameName}.js';
   ```

2. Add an entry to the `GAMES` array:
   ```typescript
   { key: '{game-key}', scene: {GameName}Scene, label: '{emoji} {Display Name}' },
   ```

## Step 3 — Add Assets (if needed)

- Create `assets/{game-key}/` for game-specific sprites
- Shared sounds go in `assets/sounds/`
- Use PNG for sprites, MP3 for audio
- Use `snake_case` file names
- Prefer procedural graphics (Phaser Graphics API) for simple shapes

## Step 4 — Write Playwright Tests

Create `tests/{game-key}.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, getGameState, holdKey, switchGame } from './helpers';

async function get{GameName}State(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) return null;
    const scenes = game.scene.getScenes(true);
    const scene = scenes?.find((s: any) => s.scene?.key === '{game-key}') as any;
    if (!scene) return null;
    const scoreEl = document.getElementById('score-value');
    const livesEl = document.getElementById('lives-value');
    return {
      score: parseInt(scoreEl?.textContent ?? '0', 10) || 0,
      lives: parseInt(livesEl?.textContent ?? '0', 10) || 0,
      // Add game-specific state fields
    };
  });
}

test.describe('{Display Name}', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, '{game-key}');
  });

  test('starts with default state', async ({ page }) => {
    const state = await get{GameName}State(page);
    expect(state).not.toBeNull();
    expect(state!.score).toBe(0);
    expect(state!.lives).toBe(3);
  });

  // Add more tests: movement, firing, scoring, game-over, game switching
});
```

### Testing Tips

- The score HUD has a 450ms count-up animation — wait ~500ms after score actions before asserting.
- Use `switchGame(page, '{game-key}')` to navigate to your game.
- Access scene state through `window.__phaserGame` and `game.scene.getScenes(true)`.

## Step 5 — Update Documentation

1. **README.md** — add your game to the Games table and add a Controls section
2. **AGENTS.md** — update the Repository Structure if new directories were added

## Step 6 — Verify

```bash
npm run build:frontend        # Must compile cleanly
npx playwright test            # All tests must pass
```

## Common Pitfalls

- **Forgetting `initBase()`** — scene won't respond to pause/resume and won't have the backdrop
- **Forgetting `startWithReadyScreen()`** — game starts immediately without the "Press SPACE" overlay
- **Not cleaning up in `shutdown()`** — timers and DOM elements leak when switching games
- **Not scaling to screen size** — always use `W`, `H`, and `SCALE` instead of hardcoded pixel values
- **Testing too fast** — the 450ms score animation means early assertions on score will fail
