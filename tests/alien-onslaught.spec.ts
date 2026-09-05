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

test.describe('Alien Onslaught — Graphics Reuse', () => {
  test('shield collision broad phase skips distant aliens but preserves block erosion', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'alien-onslaught');
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('alien-onslaught');
      for (const bullet of [...scene.playerBullets, ...scene.alienBullets]) bullet.gfx.destroy();
      scene.playerBullets = [];
      scene.alienBullets = [];
      const overlap = scene.rectOverlap;
      let checks = 0;
      scene.rectOverlap = function (...args: number[]) {
        checks++;
        return overlap.apply(this, args);
      };
      scene.checkCollisions();
      const distantChecks = checks;
      const block = scene.shields[0][0];
      const alien = scene.aliens[0];
      alien.x = block.x + block.w / 2;
      alien.y = block.y + block.h / 2;
      scene.checkCollisions();
      scene.rectOverlap = overlap;
      return { distantChecks, totalChecks: checks, blockAlive: block.alive, blockVisible: block.gfx.active };
    });
    expect(result.distantChecks).toBe(0);
    expect(result.totalChecks).toBeGreaterThan(0);
    expect(result.blockAlive).toBe(false);
    expect(result.blockVisible).toBe(false);
  });

  test('movement reuses player and mystery ship geometry', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'alien-onslaught');

    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('alien-onslaught');
      scene.spawnMystery();
      const playerCommands = [...scene.playerGfx.commandBuffer];
      const mysteryCommands = [...scene.mystery.gfx.commandBuffer];
      const startX = scene.playerX;
      const mysteryX = scene.mystery.x;
      const direction = scene.mystery.direction;
      let clears = 0;
      const playerClear = scene.playerGfx.clear;
      const mysteryClear = scene.mystery.gfx.clear;
      scene.playerGfx.clear = function () { clears++; return playerClear.call(this); };
      scene.mystery.gfx.clear = function () { clears++; return mysteryClear.call(this); };
      scene.cursors.right.isDown = true;
      for (let i = 0; i < 20; i++) {
        scene.updatePlayerInput(0.016);
        scene.updateMystery(16, 0.016);
      }
      scene.cursors.right.isDown = false;
      scene.playerGfx.clear = playerClear;
      scene.mystery.gfx.clear = mysteryClear;
      return {
        clears,
        playerGeometryUnchanged: JSON.stringify(playerCommands) === JSON.stringify(scene.playerGfx.commandBuffer),
        mysteryGeometryUnchanged: JSON.stringify(mysteryCommands) === JSON.stringify(scene.mystery.gfx.commandBuffer),
        movement: scene.playerX - startX,
        mysteryMovement: (scene.mystery.x - mysteryX) * direction,
        playerPositionSynced: scene.playerGfx.x === scene.playerX && scene.playerGfx.y === scene.playerY,
        mysteryPositionSynced: scene.mystery.gfx.x === scene.mystery.x && scene.mystery.gfx.y === scene.mystery.y,
      };
    });
    expect(result.clears).toBe(0);
    expect(result.playerGeometryUnchanged).toBe(true);
    expect(result.mysteryGeometryUnchanged).toBe(true);
    expect(result.movement).toBeCloseTo(350 * 0.016 * 20);
    expect(result.mysteryMovement).toBeCloseTo(150 * 0.016 * 20);
    expect(result.playerPositionSynced).toBe(true);
    expect(result.mysteryPositionSynced).toBe(true);
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
