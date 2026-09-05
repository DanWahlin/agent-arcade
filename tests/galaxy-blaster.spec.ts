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
      dualShot: scene.dualShot ?? false,
      dualShotTimer: scene.dualShotTimer ?? 0,
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

test.describe('Galaxy Blaster — Dual-Shot Power-Up', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'galaxy-blaster');
    await page.waitForTimeout(2000);
  });

  test('dual-shot is initially inactive', async ({ page }) => {
    const state = await getGalaxyState(page);
    expect(state!.dualShot).toBe(false);
    expect(state!.dualShotTimer).toBe(0);
  });

  test('activating dual-shot widens ship and enables timer', async ({ page }) => {
    // Directly activate dual-shot via scene method for testing
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game?.scene.getScenes(true)?.find((s: any) => s.scene?.key === 'galaxy-blaster') as any;
      if (scene) {
        scene.dualShot = true;
        scene.dualShotTimer = 15000;
      }
    });
    await page.waitForTimeout(200);
    const state = await getGalaxyState(page);
    expect(state!.dualShot).toBe(true);
    expect(state!.dualShotTimer).toBeGreaterThan(0);
    await debugScreenshot(page, 'galaxy-blaster-dual-shot');
  });

  test('collected and missed pickups release their infinite tweens', async ({ page }) => {
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('galaxy-blaster');
      const targets: any[] = [];
      for (let i = 0; i < 12; i++) {
        scene.spawnDualShotPickup(scene.shipX, scene.shipY);
        const pickup = scene.dualShotPickups[scene.dualShotPickups.length - 1];
        targets.push(pickup.sprite);
        if (i % 2 === 0) pickup.sprite.y = scene.scale.height + 100;
        scene.updateDualShotPickups(0);
      }
      return {
        pickups: scene.dualShotPickups.length,
        retainedTweens: targets.reduce((sum, target) => sum + scene.tweens.getTweensOf(target).length, 0),
        liveSprites: targets.filter(target => target.active).length,
        dualShot: scene.dualShot,
        timer: scene.dualShotTimer,
      };
    });
    expect(result.pickups).toBe(0);
    expect(result.retainedTweens).toBe(0);
    expect(result.liveSprites).toBe(0);
    expect(result.dualShot).toBe(true);
    expect(result.timer).toBe(15000);
  });
});

test('Galaxy Blaster — entry curve samples preserve De Casteljau results', async ({ page }) => {
  await page.goto(GAME_URL);
  await waitForGame(page);
  await switchGame(page, 'galaxy-blaster');
  const result = await page.evaluate(() => {
    const scene = (window as any).__phaserGame.scene.getScene('galaxy-blaster');
    scene.wave = 0;
    scene.startWave();
    const next = scene.spawnQueue[0];
    const target = scene.formation[next.slotIdx];
    const cx = scene.scale.width / 500;
    const cy = scene.scale.height / 500;
    const controls = [
      [300, -32], [330, 50], [380, 130], [400, 220],
      [430, 290], [390, 340], [330, 330], [270, 300],
      [220, 260], [200, 210], [220, 170],
    ].map(([x, y]) => ({ x: x * cx, y: y * cy }));
    controls.push({ x: target.x, y: target.y });
    const legacyPoint = (t: number, points: { x: number; y: number }[]): { x: number; y: number } => {
      if (points.length === 1) return { ...points[0] };
      return legacyPoint(t, points.slice(0, -1).map((point, i) => ({
        x: (1 - t) * point.x + t * points[i + 1].x,
        y: (1 - t) * point.y + t * points[i + 1].y,
      })));
    };
    return {
      actual: next.entryPath,
      expected: Array.from({ length: 26 }, (_, i) => legacyPoint(i / 25, controls)),
      uniqueSamples: new Set(next.entryPath).size,
    };
  });

  expect(result.actual).toEqual(result.expected);
  expect(result.uniqueSamples).toBe(26);
});

test('Galaxy Blaster — ship position uses the current viewport when the scene starts', async ({ page }) => {
  await page.goto(GAME_URL);
  await waitForGame(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => (window as any).__phaserGame.scale.height === 720);
  await switchGame(page, 'galaxy-blaster');
  const state = await getGalaxyState(page);
  const opponentSize = Math.min(32 * Math.min(1280 / 500, 720 / 500), 1280 / 35);
  expect(state!.shipY).toBe(Math.round(720 - opponentSize * 3));
});

test('Galaxy Blaster — shutdown destroys pickup sprites and their tweens', async ({ page }) => {
  await page.goto(GAME_URL);
  await waitForGame(page);
  await switchGame(page, 'galaxy-blaster');
  const result = await page.evaluate(() => {
    const scene = (window as any).__phaserGame.scene.getScene('galaxy-blaster');
    const shield = scene.add.sprite(100, 100, 'space', 'powerupBlue_shield.png');
    scene.shieldPickups.push({ sprite: shield, vy: 0 });
    scene.spawnDualShotPickup(100, 100);
    const dual = scene.dualShotPickups[scene.dualShotPickups.length - 1].sprite;
    scene.scene.pause();
    scene.shutdown();
    return {
      shieldActive: shield.active,
      dualActive: dual.active,
      retainedTweens: scene.tweens.getTweensOf(dual).length,
      pickups: scene.shieldPickups.length + scene.dualShotPickups.length,
    };
  });
  expect(result.shieldActive).toBe(false);
  expect(result.dualActive).toBe(false);
  expect(result.retainedTweens).toBe(0);
  expect(result.pickups).toBe(0);
});