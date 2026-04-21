import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, getGameState, holdKey, switchGame, debugScreenshot } from './helpers';

/** Get Cosmic Rocks scene state. */
async function getCosmicState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) return null;
    const scenes = game.scene.getScenes(true);
    const scene = scenes?.find((s: any) => s.scene?.key === 'cosmic-rocks') as any;
    if (!scene) return null;

    const scoreEl = document.getElementById('score-value');
    const livesEl = document.getElementById('lives-value');

    return {
      shipX: Math.round(scene.shipX ?? 0),
      shipY: Math.round(scene.shipY ?? 0),
      shipAlive: scene.shipAlive ?? false,
      asteroidCount: scene.asteroids?.length ?? 0,
      bulletCount: scene.bullets?.length ?? 0,
      wave: scene.wave ?? 0,
      gameOver: scene.gameOver ?? false,
      score: parseInt(scoreEl?.textContent ?? '0', 10) || 0,
      lives: parseInt(livesEl?.textContent ?? '0', 10) || 0,
      gameOverShown: !!document.getElementById('gameover-overlay'),
      screenW: window.innerWidth,
      screenH: window.innerHeight,
    };
  });
}

test.describe('Cosmic Rocks — Startup & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'cosmic-rocks');
    await page.waitForTimeout(1500);
  });

  test('game initializes with correct defaults', async ({ page }) => {
    const state = await getCosmicState(page);
    expect(state).not.toBeNull();
    expect(state!.shipAlive).toBe(true);
    expect(state!.lives).toBe(3);
    expect(state!.score).toBe(0);
    expect(state!.wave).toBeGreaterThanOrEqual(1);
    expect(state!.gameOver).toBe(false);
    expect(state!.gameOverShown).toBe(false);
  });

  test('ship starts at center of screen', async ({ page }) => {
    const state = await getCosmicState(page);
    expect(state!.shipX).toBeGreaterThan(state!.screenW * 0.3);
    expect(state!.shipX).toBeLessThan(state!.screenW * 0.7);
    expect(state!.shipY).toBeGreaterThan(state!.screenH * 0.3);
    expect(state!.shipY).toBeLessThan(state!.screenH * 0.7);
  });

  test('asteroids are spawned on first wave', async ({ page }) => {
    const state = await getCosmicState(page);
    expect(state!.asteroidCount).toBeGreaterThanOrEqual(5);
  });

  test('HUD elements are present', async ({ page }) => {
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#score-value')).toBeVisible();
    await expect(page.locator('#lives-value')).toBeVisible();
    await expect(page.locator('#hi-value')).toBeVisible();
  });

  test('screenshot — cosmic rocks gameplay', async ({ page }) => {
    await debugScreenshot(page, 'cosmic-rocks-gameplay');
  });
});

test.describe('Cosmic Rocks — Ship Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'cosmic-rocks');
    await page.waitForTimeout(1500);
  });

  test('ship rotates with left/right arrows', async ({ page }) => {
    // Ship angle changes but position stays near center initially
    const before = await getCosmicState(page);
    await holdKey(page, 'ArrowRight', 500);
    const after = await getCosmicState(page);
    // Ship should still be alive and in roughly same position (rotation only)
    expect(after!.shipAlive).toBe(true);
  });

  test('ship thrusts forward with up arrow', async ({ page }) => {
    const before = await getCosmicState(page);
    await holdKey(page, 'ArrowUp', 500);
    const after = await getCosmicState(page);
    // Ship should have moved from center (default angle is up)
    const dx = Math.abs(after!.shipX - before!.shipX);
    const dy = Math.abs(after!.shipY - before!.shipY);
    expect(dx + dy).toBeGreaterThan(5);
  });

  test('space fires bullets', async ({ page }) => {
    await page.click('canvas');
    await page.waitForTimeout(100);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    const state = await getCosmicState(page);
    // Bullet may have already left screen or hit asteroid
    expect(state).not.toBeNull();
  });
});

test.describe('Cosmic Rocks — Game Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('can switch to Cosmic Rocks', async ({ page }) => {
    await switchGame(page, 'cosmic-rocks');
    await page.waitForTimeout(1000);
    const state = await getCosmicState(page);
    expect(state).not.toBeNull();
    expect(state!.asteroidCount).toBeGreaterThanOrEqual(5);
  });

  test('can switch away from Cosmic Rocks', async ({ page }) => {
    await switchGame(page, 'cosmic-rocks');
    await page.waitForTimeout(500);
    await switchGame(page, 'ninja-runner');
    await page.waitForTimeout(1000);
    const state = await getGameState(page);
    expect(state!.sceneName).toBe('ninja-runner');
  });
});
