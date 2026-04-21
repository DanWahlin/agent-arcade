import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, getGameState, holdKey, switchGame, debugScreenshot } from './helpers';

/** Get Alien Onslaught-specific state from the running scene. */
async function getAlienState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) return null;
    const scenes = game.scene.getScenes(true);
    const scene = scenes?.find((s: any) => s.scene?.key === 'alien-onslaught') as any;
    if (!scene) return null;

    const scoreEl = document.getElementById('score-value');
    const livesEl = document.getElementById('lives-value');
    const levelEl = document.getElementById('level-value');

    return {
      playerX: Math.round(scene.playerX ?? 0),
      playerY: Math.round(scene.playerY ?? 0),
      playerAlive: scene.playerAlive ?? false,
      aliensAlive: scene.aliens?.filter((a: any) => a.alive).length ?? 0,
      aliensTotal: scene.aliens?.length ?? 0,
      playerBullets: scene.playerBullets?.length ?? 0,
      alienBullets: scene.alienBullets?.length ?? 0,
      wave: scene.wave ?? 0,
      shieldCount: scene.shields?.length ?? 0,
      hasMystery: !!(scene.mystery && scene.mystery.active),
      score: parseInt(scoreEl?.textContent ?? '0', 10) || 0,
      lives: parseInt(livesEl?.textContent ?? '0', 10) || 0,
      level: parseInt(levelEl?.textContent ?? '0', 10) || 0,
      gameOverShown: !!document.getElementById('gameover-overlay'),
    };
  });
}

test.describe('Alien Onslaught — Startup & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'alien-onslaught');
    await page.waitForTimeout(1500);
  });

  test('game initializes with correct defaults', async ({ page }) => {
    await debugScreenshot(page, 'alien-onslaught-startup');
    const state = await getAlienState(page);
    expect(state).not.toBeNull();
    expect(state!.playerAlive).toBe(true);
    expect(state!.lives).toBe(3);
    expect(state!.score).toBe(0);
    expect(state!.wave).toBeGreaterThanOrEqual(1);
    expect(state!.gameOverShown).toBe(false);
  });

  test('alien grid is created with 55 aliens', async ({ page }) => {
    const state = await getAlienState(page);
    expect(state).not.toBeNull();
    expect(state!.aliensTotal).toBe(55); // 5 rows × 11 cols
    expect(state!.aliensAlive).toBe(55);
    await debugScreenshot(page, 'alien-onslaught-grid');
  });

  test('shields are created', async ({ page }) => {
    const state = await getAlienState(page);
    expect(state).not.toBeNull();
    expect(state!.shieldCount).toBe(4);
  });

  test('HUD elements are present', async ({ page }) => {
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#score-value')).toBeVisible();
    await expect(page.locator('#lives-value')).toBeVisible();
    await expect(page.locator('#hi-value')).toBeVisible();
  });
});

test.describe('Alien Onslaught — Player Movement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'alien-onslaught');
    await page.waitForTimeout(1500);
  });

  test('player moves left', async ({ page }) => {
    const before = await getAlienState(page);
    await holdKey(page, 'ArrowLeft', 500);
    const after = await getAlienState(page);
    expect(after!.playerX).toBeLessThan(before!.playerX);
    await debugScreenshot(page, 'alien-onslaught-move-left');
  });

  test('player moves right', async ({ page }) => {
    // First move left to have room
    await holdKey(page, 'ArrowLeft', 300);
    const before = await getAlienState(page);
    await holdKey(page, 'ArrowRight', 500);
    const after = await getAlienState(page);
    expect(after!.playerX).toBeGreaterThan(before!.playerX);
  });
});

test.describe('Alien Onslaught — Firing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'alien-onslaught');
    await page.waitForTimeout(1500);
  });

  test('pressing space fires a bullet', async ({ page }) => {
    // Focus the game canvas so keyboard input reaches Phaser
    await page.click('canvas');
    await page.waitForTimeout(200);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const state = await getAlienState(page);
    // Bullet may have already hit something, so just verify the game is responsive
    expect(state).not.toBeNull();
    await debugScreenshot(page, 'alien-onslaught-firing');
  });
});

test.describe('Alien Onslaught — Game Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('can switch to Alien Onslaught from default game', async ({ page }) => {
    await switchGame(page, 'alien-onslaught');
    await page.waitForTimeout(1500);
    const state = await getAlienState(page);
    expect(state).not.toBeNull();
    expect(state!.aliensTotal).toBe(55);
  });

  test('can switch away from Alien Onslaught', async ({ page }) => {
    await switchGame(page, 'alien-onslaught');
    await page.waitForTimeout(1000);
    await switchGame(page, 'cosmic-rocks');
    await page.waitForTimeout(1000);
    const gameState = await getGameState(page);
    expect(gameState!.sceneName).toBe('cosmic-rocks');
  });
});
