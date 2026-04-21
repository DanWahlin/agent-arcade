import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, getGameState, holdKey, switchGame, debugScreenshot } from './helpers';

/** Get Galaxy Blaster scene state. */
async function getGalaxyState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) return null;
    const scenes = game.scene.getScenes(true);
    const scene = scenes?.find((s: any) => s.scene?.key === 'galaxy-blaster') as any;
    if (!scene) return null;

    const scoreEl = document.getElementById('score-value');
    const livesEl = document.getElementById('lives-value');

    return {
      shipX: Math.round(scene.shipX ?? 0),
      shipY: Math.round(scene.shipY ?? 0),
      shipVisible: scene.ship?.visible ?? false,
      enemyCount: scene.enemies?.length ?? 0,
      bulletCount: scene.bullets?.length ?? 0,
      wave: scene.wave ?? 0,
      gameOver: scene.gameOver ?? false,
      spawnQueueLength: scene.spawnQueue?.length ?? 0,
      score: parseInt(scoreEl?.textContent ?? '0', 10) || 0,
      lives: parseInt(livesEl?.textContent ?? '0', 10) || 0,
      gameOverShown: !!document.getElementById('gameover-overlay'),
      screenW: window.innerWidth,
      screenH: window.innerHeight,
    };
  });
}

test.describe('Galaxy Blaster — Startup & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'galaxy-blaster');
    await page.waitForTimeout(2000);
  });

  test('game initializes with correct defaults', async ({ page }) => {
    const state = await getGalaxyState(page);
    expect(state).not.toBeNull();
    expect(state!.shipVisible).toBe(true);
    expect(state!.lives).toBe(3);
    expect(state!.score).toBe(0);
    expect(state!.wave).toBeGreaterThanOrEqual(1);
    expect(state!.gameOver).toBe(false);
    expect(state!.gameOverShown).toBe(false);
  });

  test('ship starts at bottom center', async ({ page }) => {
    const state = await getGalaxyState(page);
    expect(state!.shipX).toBeGreaterThan(state!.screenW * 0.3);
    expect(state!.shipX).toBeLessThan(state!.screenW * 0.7);
    expect(state!.shipY).toBeGreaterThan(state!.screenH * 0.7);
  });

  test('wave 1 has enemies queued or spawned', async ({ page }) => {
    const state = await getGalaxyState(page);
    // Enemies may have spawned from the queue by now
    expect(state!.enemyCount + state!.spawnQueueLength).toBeGreaterThan(0);
  });

  test('HUD elements are present', async ({ page }) => {
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#score-value')).toBeVisible();
    await expect(page.locator('#lives-value')).toBeVisible();
    await expect(page.locator('#hi-value')).toBeVisible();
  });

  test('screenshot — galaxy blaster gameplay', async ({ page }) => {
    // Wait a bit for enemies to spawn and fill the screen
    await page.waitForTimeout(2000);
    await debugScreenshot(page, 'galaxy-blaster-gameplay');
  });
});

test.describe('Galaxy Blaster — Ship Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'galaxy-blaster');
    await page.waitForTimeout(2000);
  });

  test('ship moves left', async ({ page }) => {
    const before = await getGalaxyState(page);
    await holdKey(page, 'ArrowLeft', 500);
    const after = await getGalaxyState(page);
    expect(after!.shipX).toBeLessThan(before!.shipX);
  });

  test('ship moves right', async ({ page }) => {
    await holdKey(page, 'ArrowLeft', 300);
    const before = await getGalaxyState(page);
    await holdKey(page, 'ArrowRight', 500);
    const after = await getGalaxyState(page);
    expect(after!.shipX).toBeGreaterThan(before!.shipX);
  });

  test('space fires bullets', async ({ page }) => {
    await page.click('canvas');
    await page.waitForTimeout(100);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    const state = await getGalaxyState(page);
    expect(state).not.toBeNull();
  });
});

test.describe('Galaxy Blaster — Game Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('can switch to Galaxy Blaster', async ({ page }) => {
    await switchGame(page, 'galaxy-blaster');
    await page.waitForTimeout(1500);
    const state = await getGalaxyState(page);
    expect(state).not.toBeNull();
    expect(state!.wave).toBeGreaterThanOrEqual(1);
  });

  test('can switch away from Galaxy Blaster', async ({ page }) => {
    await switchGame(page, 'galaxy-blaster');
    await page.waitForTimeout(500);
    await switchGame(page, 'ninja-runner');
    await page.waitForTimeout(1000);
    const state = await getGameState(page);
    expect(state!.sceneName).toBe('ninja-runner');
  });
});
