# Skill: Scaffold a New Agent Arcade Game

## Description

Create a new mini-game for the Agent Arcade project. This skill walks through every file that must be created or modified to add a fully integrated, tested game scene.

## Trigger

Use when the user asks to "add a new game", "create a game", "scaffold a game", or similar.

## Inputs

Ask the user for:
- **Game name** — a short display name (e.g. "Meteor Dash")
- **Brief description** — one-line gameplay concept

Derive from the display name:
- `<PascalName>` — PascalCase with `Scene` suffix (e.g. `MeteorDashScene`)
- `<kebab-name>` — lowercase kebab-case (e.g. `meteor-dash`)
- `<Display Name>` — the user-provided label with an emoji prefix (e.g. `🌠 Meteor Dash`)

---

## Procedure

### Step 1 — Create the scene file

Create `src/game/scenes/<PascalName>.ts`.

All games extend `BaseScene`. The constructor key and folder name must use `<kebab-name>`.

```ts
declare const Phaser: any;

import { BaseScene, W, H } from './BaseScene.js';

export class <PascalName> extends BaseScene {
  // -- input --
  private cursors!: any;

  // -- game objects (add your own) --

  constructor() {
    super('<kebab-name>');
  }

  get displayName(): string {
    return '<Display Name>';
  }

  preload() {
    // Load assets from the kebab-name folder:
    // this.load.image('my-sprite', 'assets/<kebab-name>/my-sprite.png');
    // this.load.audio('my-sound', 'assets/<kebab-name>/sounds/my-sound.mp3');
  }

  create() {
    // ── MUST be first ──
    this.initBase();

    // Reset state
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.loadHighScore();
    this.syncScoreToHUD();
    this.syncLivesToHUD();
    this.syncLevelToHUD();

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // ── Layout — always derive from W and H ──
    // const centerX = W * 0.5;
    // const centerY = H * 0.5;
    // const groundY = H * 0.9;

    // TODO: set up game objects, physics groups, colliders
  }

  update(_time: number, delta: number) {
    // TODO: game loop logic (movement, spawning, collision, etc.)
  }
}
```

**Key points:**
- Import `W` and `H` from `'./BaseScene.js'` — these are the current viewport dimensions.
- Call `this.initBase()` as the **first** line of `create()`.
- Use `this.addScore(points, x, y)` for animated score bumps.
- Use `this.showGameOver(this.score, () => this.scene.restart())` when the player dies.
- Use `this.showWaveBanner(n)` for wave/level transitions.
- Use `this.createStarfield(layers)` / `this.updateStarfield(stars, delta)` for space backgrounds.
- Use `this.ensureSparkTexture()` before emitting spark particles.

### Step 2 — Create the asset folder

```
assets/<kebab-name>/sounds/
```

Create the directory. Place sprite sheets, images, and audio files here. Sounds go in the `sounds/` subdirectory.

### Step 3 — Register in game.ts

Edit `src/game/game.ts`:

1. Add the import (keep alphabetical order with existing imports):

```ts
import { <PascalName> } from './scenes/<PascalName>.js';
```

2. Add an entry to the `GAMES` array:

```ts
{ key: '<kebab-name>', scene: <PascalName>, label: '<emoji> <Display Name>' },
```

The `key` must exactly match the string passed to `super()` in the scene constructor.

### Step 4 — Create the test file

Create `tests/<kebab-name>.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, getGameState, holdKey, switchGame, debugScreenshot } from './helpers';

/** Get <Display Name> scene state. */
async function get<PascalNameNoSuffix>State(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) return null;
    const scenes = game.scene.getScenes(true);
    const scene = scenes?.find((s: any) => s.scene?.key === '<kebab-name>') as any;
    if (!scene) return null;

    const scoreEl = document.getElementById('score-value');
    const livesEl = document.getElementById('lives-value');

    return {
      // Add game-specific state here (e.g. playerX, playerAlive, enemyCount)
      score: parseInt(scoreEl?.textContent ?? '0', 10) || 0,
      lives: parseInt(livesEl?.textContent ?? '0', 10) || 0,
      gameOverShown: !!document.getElementById('gameover-overlay'),
      screenW: window.innerWidth,
      screenH: window.innerHeight,
    };
  });
}

test.describe('<Display Name> — Startup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, '<kebab-name>');
    await page.waitForTimeout(1500);
  });

  test('game initializes with correct defaults', async ({ page }) => {
    const state = await get<PascalNameNoSuffix>State(page);
    expect(state).not.toBeNull();
    expect(state!.lives).toBe(3);
    expect(state!.score).toBe(0);
    expect(state!.gameOverShown).toBe(false);
  });

  test('HUD elements are present', async ({ page }) => {
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#score-value')).toBeVisible();
    await expect(page.locator('#lives-value')).toBeVisible();
    await expect(page.locator('#hi-value')).toBeVisible();
  });
});

test.describe('<Display Name> — Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, '<kebab-name>');
    await page.waitForTimeout(1500);
  });

  test('basic controls respond', async ({ page }) => {
    // TODO: verify that pressing a key changes game state
    // Example: hold ArrowRight and check player moved
    await holdKey(page, 'ArrowRight', 500);
    const state = await get<PascalNameNoSuffix>State(page);
    expect(state).not.toBeNull();
  });
});

test.describe('<Display Name> — Game Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('can switch to <Display Name>', async ({ page }) => {
    await switchGame(page, '<kebab-name>');
    await page.waitForTimeout(1000);
    const state = await get<PascalNameNoSuffix>State(page);
    expect(state).not.toBeNull();
  });

  test('can switch away from <Display Name>', async ({ page }) => {
    await switchGame(page, '<kebab-name>');
    await page.waitForTimeout(500);
    await switchGame(page, 'ninja-runner');
    await page.waitForTimeout(1000);
    const state = await getGameState(page);
    expect(state!.sceneName).toBe('ninja-runner');
  });
});
```

### Step 5 — Add viewport tests

Add a test block to the same file (or to `tests/viewport-test.spec.ts`):

```ts
const VIEWPORTS = [
  { name: '4k',    width: 3840, height: 2160 },
  { name: '1080p', width: 1920, height: 1080 },
  { name: '720p',  width: 1280, height: 720 },
  { name: 'small', width: 1024, height: 768 },
];

for (const vp of VIEWPORTS) {
  test(`<Display Name> renders at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, '<kebab-name>');
    await page.waitForTimeout(2000);

    const state = await get<PascalNameNoSuffix>State(page);
    expect(state).not.toBeNull();
    // Verify game objects are within the viewport bounds.
    // Add game-specific assertions here (e.g. player position, enemy bounds).
    expect(state!.screenW).toBe(vp.width);
    expect(state!.screenH).toBe(vp.height);

    await debugScreenshot(page, `<kebab-name>-${vp.name}`);
  });
}
```

### Step 6 — Update documentation and templates

When adding a new game, these files reference the game list and **must** be updated:

1. **`.github/ISSUE_TEMPLATE/bug-report.yml`** — add `<Display Name>` to the `options` list under the "Affected Game" dropdown.

2. **`AGENTS.md`** — update the project overview (line mentioning the mini-game count and names) and the repo structure (scene file list) to include the new game.

3. **`README.md`** — if the game has unique controls, add a controls table under `## Controls`.

### Step 7 — Build and test

```bash
npm run build:frontend
npx playwright test tests/<kebab-name>.spec.ts
```

Fix any failures before committing.

---

## Screen-Size Adaptation Rules (CRITICAL)

These rules apply to **all** code in the scene — `create()`, `update()`, helper functions, and spawners.

1. **Always derive layout from `W` and `H`** (exported from `BaseScene.ts` via `refreshDimensions()`).
2. **NEVER cache screen-dependent values at module level.** If you need a derived value (e.g. `groundY`), compute it inside `create()` or use a function:
   ```ts
   // ✅ Good — recomputed each time
   function getGroundY() { return H - 48; }

   // ❌ Bad — stale after resize
   const GROUND_Y = H - 48;
   ```
3. **Prefer proportional placement over magic pixels:**
   ```ts
   // ✅ Good
   const centerX = W * 0.5;
   const playerY = H * 0.85;

   // ❌ Bad
   const centerX = 960;
   const playerY = 918;
   ```
4. **Every game must pass viewport tests** at 4K (3840×2160), 1080p, 720p, and 1024×768.
5. Spawn bounds, movement limits, and wrap-around logic must all reference `W` and `H`, not hardcoded pixel values.

---

## BaseScene API Quick Reference

| Method / Property | Purpose |
|---|---|
| `this.initBase()` | **Must** call first in `create()`. Sets up pause bridge, shutdown listener, backdrop. |
| `this.score`, `this.lives`, `this.level` | Shared state fields |
| `this.addScore(pts, x?, y?)` | Animated score bump + floating "+N" popup |
| `this.syncScoreToHUD()` | Push score to `#score-value` |
| `this.syncLivesToHUD()` | Push lives to `#lives-value` |
| `this.syncLevelToHUD()` | Push level to `#level-value` |
| `this.syncHighScoreToHUD()` | Push high score to `#hi-value` |
| `this.loadHighScore()` | Load persisted high score from localStorage |
| `this.checkHighScore()` | Save high score if current score exceeds it |
| `this.showGameOver(score, restartFn)` | Full-screen game-over overlay with leaderboard |
| `this.showWaveBanner(n)` | Animated "WAVE N" banner |
| `this.createStarfield(layers)` | Create parallax starfield (returns `Star[]`) |
| `this.updateStarfield(stars, dt)` | Scroll starfield (call from `update()`) |
| `this.ensureSparkTexture()` | Create reusable 'spark' texture for particles |
| `this.createBackdrop()` | Already called by `initBase()` |
| `this.setBackdropAlpha(percent)` | Adjust background darkness (1–100) |
| `this.setupPauseBridge()` | Already called by `initBase()` |
| `this.pauseGame()` / `this.resumeGame()` | Override for custom pause/resume behavior |

---

## Common Pitfalls

1. **Forgetting `this.initBase()`.** The game will have no pause support, no backdrop, and no shutdown cleanup.
2. **Using `.js` extension in imports.** TypeScript source uses `.js` extensions for ESM compatibility — this is intentional. Write `import { BaseScene } from './BaseScene.js'`, not `./BaseScene.ts` or `./BaseScene`.
3. **Hardcoded pixel positions.** Any value derived from screen size must use `W`/`H`. Tests will catch this at non-1080p viewports.
4. **Missing `declare const Phaser: any;`** at the top of the scene file. Phaser is loaded via `<script>` tag, not as an npm module.
5. **Score animation timing.** The HUD score has a 450 ms count-up animation. Tests must wait **≥ 500 ms** after calling `addScore()` before asserting the displayed score.
6. **Not adding the scene to the `GAMES` array.** The scene won't appear in the game-switcher dropdown.
7. **Key mismatch.** The `super('<kebab-name>')` key, `GAMES` array key, test `switchGame()` key, and asset folder name must all be the same `<kebab-name>` string.
8. **Forgetting `this.loadHighScore()`** in `create()` — the HUD will show 0 for the high score even if there's a saved value.
9. **Not resetting state in `create()`.** Scenes can be restarted — always reset `score`, `lives`, `level`, and game-specific state at the top of `create()`.
10. **Asset paths.** Use relative paths from the project root: `'assets/<kebab-name>/sprite.png'`, not absolute paths.
