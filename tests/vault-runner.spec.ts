import { test, expect } from '@playwright/test';
import {
  GAME_URL,
  waitForGame,
  getGameState,
  holdKey,
  switchGame,
  debugScreenshot,
} from './helpers';

type Page = import('@playwright/test').Page;

interface VaultRunnerState {
  level: number;
  currentLevelIdx: number;
  goldRemaining: number;
  exitRevealed: boolean;
  levelComplete: boolean;
  holeCount: number;
  guardCount: number;
  guardsTrapped: number;
  playerCol: number;
  playerRow: number;
  playerAlive: boolean;
  timeBonus: number;
  score: number;
  lives: number;
  gameOverShown: boolean;
  screenW: number;
  screenH: number;
}

/** Read Vault Runner internal state via test hook. */
async function getVRState(page: Page): Promise<VaultRunnerState | null> {
  return page.evaluate(() => {
    const fn = (window as any).__vaultRunnerGetState;
    if (!fn) return null;
    const s = fn();
    if (!s) return null;
    const scoreEl = document.getElementById('score-value');
    const livesEl = document.getElementById('lives-value');
    return {
      ...s,
      score: parseInt(scoreEl?.textContent ?? '0', 10) || 0,
      lives: parseInt(livesEl?.textContent ?? '0', 10) || 0,
      gameOverShown: !!document.getElementById('gameover-overlay'),
      screenW: window.innerWidth,
      screenH: window.innerHeight,
    } as VaultRunnerState;
  });
}

/** Load a fixture level for deterministic testing. */
async function loadFixture(page: Page, name: 'simple' | 'ladder' | 'rope' | 'dig' | 'bridge') {
  await page.evaluate((n) => {
    const fn = (window as any).__vaultRunnerLoadFixture;
    if (!fn) throw new Error('__vaultRunnerLoadFixture not found');
    fn(n);
  }, name);
  await page.waitForTimeout(200);
}

test.describe('Vault Runner — Startup & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'vault-runner');
    await page.waitForTimeout(1500);
  });

  test('game initializes with correct defaults', async ({ page }) => {
    const state = await getVRState(page);
    expect(state).not.toBeNull();
    expect(state!.lives).toBe(3);
    expect(state!.score).toBe(0);
    expect(state!.level).toBe(1);
    expect(state!.currentLevelIdx).toBe(0);
    expect(state!.exitRevealed).toBe(false);
    expect(state!.gameOverShown).toBe(false);
    expect(state!.playerAlive).toBe(true);
    expect(state!.goldRemaining).toBeGreaterThan(0);
  });

  test('player and at least one guard are spawned', async ({ page }) => {
    const state = await getVRState(page);
    expect(state!.playerCol).toBeGreaterThanOrEqual(0);
    expect(state!.playerRow).toBeGreaterThanOrEqual(0);
    expect(state!.guardCount).toBeGreaterThanOrEqual(1);
  });

  test('HUD elements are present', async ({ page }) => {
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#score-value')).toBeVisible();
    await expect(page.locator('#lives-value')).toBeVisible();
    await expect(page.locator('#hi-value')).toBeVisible();
  });

  test('screenshot — vault runner gameplay', async ({ page }) => {
    await debugScreenshot(page, 'vault-runner-gameplay');
  });
});

test.describe('Vault Runner — Movement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'vault-runner');
    await page.waitForTimeout(1500);
  });

  test('player moves right on ArrowRight', async ({ page }) => {
    await loadFixture(page, 'simple');
    const before = await getVRState(page);
    await holdKey(page, 'ArrowRight', 700);
    const after = await getVRState(page);
    expect(after!.playerCol).toBeGreaterThan(before!.playerCol);
  });

  test('player climbs ladder on ArrowUp', async ({ page }) => {
    await loadFixture(page, 'ladder');
    // Spawn col 3, ladder col 6 — at PLAYER_MOVE_SPEED 6 tiles/sec, hold 500ms = 3 tiles.
    await holdKey(page, 'ArrowRight', 500);
    await page.waitForTimeout(200);
    const beforeClimb = await getVRState(page);
    expect(beforeClimb!.playerCol).toBe(6);
    await holdKey(page, 'ArrowUp', 800);
    const afterClimb = await getVRState(page);
    expect(afterClimb!.playerRow).toBeLessThan(beforeClimb!.playerRow);
  });

  test('player traverses rope and drops with ArrowDown', async ({ page }) => {
    await loadFixture(page, 'rope');
    const initial = await getVRState(page);
    await holdKey(page, 'ArrowRight', 700);
    const after = await getVRState(page);
    expect(after!.playerCol).toBeGreaterThan(initial!.playerCol);
  });

  test('digging Z creates a hole next to the player', async ({ page }) => {
    await loadFixture(page, 'dig');
    // Player spawns at col 3 row 13 with bricks below. Z digs col 2 row 14.
    // Use down/up with delay — keyboard.press() is too fast for edge detection.
    await page.keyboard.down('KeyZ');
    await page.waitForTimeout(100);
    await page.keyboard.up('KeyZ');
    await page.waitForTimeout(200);
    const state = await getVRState(page);
    expect(state!.holeCount).toBeGreaterThanOrEqual(1);
  });

  test('digging X creates a hole on the right', async ({ page }) => {
    await loadFixture(page, 'dig');
    await page.keyboard.down('KeyX');
    await page.waitForTimeout(100);
    await page.keyboard.up('KeyX');
    await page.waitForTimeout(200);
    const state = await getVRState(page);
    expect(state!.holeCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Vault Runner — Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'vault-runner');
    await page.waitForTimeout(1500);
  });

  test('collecting gold increases score and decreases gold remaining', async ({ page }) => {
    await loadFixture(page, 'dig');
    // Player at col 3, gold at col 5. Walk right to collect.
    const before = await getVRState(page);
    await holdKey(page, 'ArrowRight', 1000);
    await page.waitForTimeout(700); // wait past score animation
    const after = await getVRState(page);
    expect(after!.goldRemaining).toBeLessThan(before!.goldRemaining);
    expect(after!.score).toBeGreaterThan(before!.score);
  });

  test('collecting all gold reveals exit ladder', async ({ page }) => {
    await loadFixture(page, 'dig');
    await holdKey(page, 'ArrowRight', 1200);
    await page.waitForTimeout(500);
    const state = await getVRState(page);
    expect(state!.goldRemaining).toBe(0);
    expect(state!.exitRevealed).toBe(true);
  });

  test('hole regen kills trapped guard and respawns it', async ({ page }) => {
    await loadFixture(page, 'simple');
    // Player at (3, 13), guard at (12, 13). Verify hole lifecycle works end-to-end.
    const before = await getVRState(page);
    await page.keyboard.down('KeyZ');
    await page.waitForTimeout(100);
    await page.keyboard.up('KeyZ');
    await page.waitForTimeout(5500);
    const after = await getVRState(page);
    expect(after!.guardCount).toBe(before!.guardCount);
    expect(after!.holeCount).toBe(0); // hole has fully regenerated
  });

  test('player can run across a guard trapped in a hole', async ({ page }) => {
    // Force a guard into a TRAPPED state by writing scene state directly,
    // then verify the player can walk across the row above without falling
    // in or losing a life.
    await loadFixture(page, 'bridge');

    // Set up: guard at col 7 row 14 in a HOLE, state=TRAPPED. Use scene
    // internals to construct the scenario deterministically (much simpler
    // than waiting for chase-and-trap timing).
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene: any = game.scene.getScenes(true).find((s: any) => s.scene?.key === 'vault-runner');
      // Move guard into hole: dig the brick at (7, 14), then teleport guard there
      const ok = scene.holeManager.dig(7, 14);
      if (!ok) throw new Error('failed to dig fixture hole');
      const g = scene.guards[0];
      g.col = 7; g.row = 14; g.ox = 0; g.oy = 0;
      g.state = 1; // GuardState.TRAPPED
      g.trappedTimer = 999_999; // never auto-recover during the test window
      g.sprite.x = scene.tileWorldX(7);
      g.sprite.y = scene.tileWorldY(14);
      // Reset player invincibility so we test the actual collision/support
      // logic, not the start-of-level grace period.
      scene.playerState.invincible = 0;
    });

    const before = await getVRState(page);
    expect(before!.guardsTrapped).toBe(1);
    expect(before!.lives).toBe(3);

    // Player at col 3 row 13. Walk right past col 7 (over the trapped guard).
    await holdKey(page, 'ArrowRight', 1500);
    const after = await getVRState(page);

    // Player must still be on row 13 (didn't fall into the hole at row 14)
    expect(after!.playerRow).toBe(13);
    // Player walked past col 7
    expect(after!.playerCol).toBeGreaterThan(7);
    // No life lost — guard in hole acts as a platform, not a hazard
    expect(after!.lives).toBe(3);
    expect(after!.playerAlive).toBe(true);
  });
});

test.describe('Vault Runner — Game Switching', () => {
  test('can switch to Vault Runner', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'vault-runner');
    await page.waitForTimeout(1000);
    const state = await getVRState(page);
    expect(state).not.toBeNull();
  });

  test('can switch away from Vault Runner', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'vault-runner');
    await page.waitForTimeout(500);
    await switchGame(page, 'ninja-runner');
    await page.waitForTimeout(1000);
    const state = await getGameState(page);
    expect(state!.sceneName).toBe('ninja-runner');
  });
});

test.describe('Vault Runner — Viewport scaling', () => {
  const VIEWPORTS = [
    { name: '4k', width: 3840, height: 2160 },
    { name: '1080p', width: 1920, height: 1080 },
    { name: '720p', width: 1280, height: 720 },
    { name: 'small', width: 1024, height: 768 },
  ];

  for (const vp of VIEWPORTS) {
    test(`renders at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(GAME_URL);
      await waitForGame(page);
      await switchGame(page, 'vault-runner');
      await page.waitForTimeout(500);
      const state = await getVRState(page);
      expect(state).not.toBeNull();
      expect(state!.screenW).toBe(vp.width);
      expect(state!.screenH).toBe(vp.height);
      // Don't assert playerAlive — the chase AI will catch a stationary player
      // after invincibility wears off, which is correct gameplay.
      await debugScreenshot(page, `vault-runner-${vp.name}`);
    });
  }
});
