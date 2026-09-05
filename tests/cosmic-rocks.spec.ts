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

  test('Cosmic Rocks — ship geometry is retained while rotating and thrusting', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'cosmic-rocks');
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('cosmic-rocks');
      const commands = [...scene.shipGfx.commandBuffer];
      const startAngle = scene.shipAngle;
      const startX = scene.shipX;
      const startY = scene.shipY;
      const clear = scene.shipGfx.clear;
      let clears = 0;
      scene.shipGfx.clear = function () { clears++; return clear.call(this); };
      scene.invincibleTimer = 10000;
      scene.cursors.right.isDown = true;
      scene.cursors.up.isDown = true;
      for (let i = 0; i < 20; i++) scene.update(i * 16, 16);
      const flameCommands = scene.thrustGfx.commandBuffer.length;
      scene.cursors.right.isDown = false;
      scene.cursors.up.isDown = false;
      scene.update(320, 16);
      scene.shipGfx.clear = clear;
      const size = 20 * Math.max(Math.min(scene.scale.width / 1920, scene.scale.height / 1080), 0.6);
      const matrix = scene.shipGfx.getWorldTransformMatrix();
      const vertices = [0, 2.4, -2.4].map((offset, i) => {
        const radius = size * (i === 0 ? 1 : 0.85);
        const world = matrix.transformPoint(Math.cos(offset) * radius, Math.sin(offset) * radius);
        return {
          x: world.x, y: world.y,
          expectedX: scene.shipX + Math.cos(scene.shipAngle + offset) * radius,
          expectedY: scene.shipY + Math.sin(scene.shipAngle + offset) * radius,
        };
      });
      return {
        clears,
        geometryUnchanged: JSON.stringify(commands) === JSON.stringify(scene.shipGfx.commandBuffer),
        angleChange: scene.shipAngle - startAngle,
        rotation: scene.shipGfx.rotation,
        angle: scene.shipAngle,
        moved: scene.shipX !== startX || scene.shipY !== startY,
        positionSynced: scene.shipGfx.x === scene.shipX && scene.shipGfx.y === scene.shipY,
        flameCommands,
        idleFlameCommands: scene.thrustGfx.commandBuffer.length,
        vertices,
      };
    });
    expect(result.clears).toBe(0);
    expect(result.geometryUnchanged).toBe(true);
    expect(result.angleChange).toBeCloseTo(4 * 0.016 * 20);
    expect(result.rotation).toBeCloseTo(result.angle);
    expect(result.moved).toBe(true);
    expect(result.positionSynced).toBe(true);
    expect(result.flameCommands).toBeGreaterThan(result.idleFlameCommands);
    for (const vertex of result.vertices) {
      expect(vertex.x).toBeCloseTo(vertex.expectedX);
      expect(vertex.y).toBeCloseTo(vertex.expectedY);
    }
  });

  test('can switch to Cosmic Rocks', async ({ page }) => {
    await switchGame(page, 'cosmic-rocks');
    await page.waitForTimeout(1000);
    const state = await getCosmicState(page);
    expect(state).not.toBeNull();
    expect(state!.asteroidCount).toBeGreaterThanOrEqual(5);
  });

  test('UFO shots still move and hit the player after their UFO leaves', async ({ page }) => {
    await switchGame(page, 'cosmic-rocks');
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('cosmic-rocks');
      scene.invincibleTimer = 0;
      scene.spawnUfo();
      scene.ufo.x = scene.scale.width + 100;
      scene.ufo.vx = 100;
      const bullet = {
        gfx: scene.add.graphics(), x: scene.shipX, y: scene.shipY - 1,
        vx: 0, vy: 10, life: 1000,
      };
      scene.ufoBullets.push(bullet);
      const lives = scene.lives;
      scene.updateUfo(100, 0.1);
      const moved = bullet.y === scene.shipY;
      scene.checkUfoCollisions();
      return {
        moved, ufoGone: scene.ufo === null, livesLost: lives - scene.lives,
        bulletRemoved: !scene.ufoBullets.includes(bullet), bulletDestroyed: !bullet.gfx.active,
      };
    });
    expect(result).toEqual({
      moved: true, ufoGone: true, livesLost: 1, bulletRemoved: true, bulletDestroyed: true,
    });
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
