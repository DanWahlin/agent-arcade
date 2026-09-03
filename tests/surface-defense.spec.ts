import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, holdKey, switchGame, debugScreenshot } from './helpers';

async function getSurfaceDefenseState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) return null;
    const scene = game.scene.getScenes(true)
      ?.find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
    if (!scene) return null;

    return {
      cursorX: Math.round(scene.cursorX ?? 0),
      cursorY: Math.round(scene.cursorY ?? 0),
      citiesAlive: scene.cities?.filter((city: any) => city.alive).length ?? 0,
      batteriesAlive: scene.batteries?.filter((battery: any) => battery.alive).length ?? 0,
      batteryAmmo: scene.batteries?.map((battery: any) => battery.ammo) ?? [],
      enemyCount: scene.enemyMissiles?.length ?? 0,
      enemyReserve: scene.enemyReserve ?? 0,
      interceptorCount: scene.interceptors?.length ?? 0,
      explosionCount: scene.explosions?.length ?? 0,
      activeAircraft: scene.aircraft?.filter((craft: any) => craft.active).length ?? 0,
      aircraftKinds: scene.aircraft?.filter((craft: any) => craft.active).map((craft: any) => craft.kind) ?? [],
      longestMissileTrail: Math.max(0, ...(scene.enemyMissiles ?? []).map((missile: any) => missile.trail?.length ?? 0)),
      wave: scene.wave ?? 0,
      waveActive: scene.waveActive ?? false,
      gameOverFlag: scene.gameOverFlag ?? false,
      score: parseInt(document.getElementById('score-value')?.textContent ?? '0', 10) || 0,
      lives: parseInt(document.getElementById('lives-value')?.textContent ?? '0', 10) || 0,
      gameOverShown: !!document.getElementById('gameover-overlay'),
      screenW: window.innerWidth,
      screenH: window.innerHeight,
      groundY: scene.groundY ?? 0,
      soundsLoaded: [
        'sd_launch',
        'sd_airburst',
        'sd_impact',
        'sd_wave',
        'sd_bonus',
        'sd_aircraft',
        'sd_noAmmo',
        'sd_gameOver',
      ].every(key => game.cache.audio.exists(key)),
    };
  });
}

test.describe('Surface Defense — Startup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'surface-defense');
    await page.waitForTimeout(1200);
  });

  test('initializes six cities and three armed batteries', async ({ page }) => {
    const state = await getSurfaceDefenseState(page);
    expect(state).not.toBeNull();
    expect(state!.citiesAlive).toBe(6);
    expect(state!.lives).toBe(6);
    expect(state!.batteriesAlive).toBe(3);
    expect(state!.batteryAmmo).toEqual([10, 10, 10]);
    expect(state!.wave).toBe(1);
    expect(state!.waveActive).toBe(true);
    expect(state!.enemyCount + state!.enemyReserve).toBeGreaterThan(0);
    expect(state!.soundsLoaded).toBe(true);
    await debugScreenshot(page, 'surface-defense-startup');
  });

  test('renders the shared HUD', async ({ page }) => {
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#score-value')).toBeVisible();
    await expect(page.locator('#lives-value')).toHaveText('6');
  });

  test('uses the shared backdrop transparency setting', async ({ page }) => {
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)
        .find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
      scene.setBackdropAlpha(25);
    });
    const alpha = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)
        .find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
      return scene._backdrop?.alpha;
    });
    expect(alpha).toBeCloseTo(0.25, 2);
  });
});

test.describe('Surface Defense — Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'surface-defense');
    await page.waitForTimeout(800);
    await page.locator('canvas').focus();
  });

  test('arrow keys move the targeting cursor', async ({ page }) => {
    const before = await getSurfaceDefenseState(page);
    await holdKey(page, 'ArrowRight', 350);
    await holdKey(page, 'ArrowUp', 250);
    const after = await getSurfaceDefenseState(page);
    expect(after!.cursorX).toBeGreaterThan(before!.cursorX);
    expect(after!.cursorY).toBeLessThan(before!.cursorY);
  });

  test('mouse movement aims and click fires the nearest battery', async ({ page }) => {
    const before = await getSurfaceDefenseState(page);
    await page.mouse.move(before!.screenW * 0.25, before!.screenH * 0.3);
    await page.mouse.click(before!.screenW * 0.25, before!.screenH * 0.3);
    await page.waitForTimeout(100);
    const after = await getSurfaceDefenseState(page);
    expect(after!.cursorX).toBeCloseTo(before!.screenW * 0.25, -1);
    expect(after!.batteryAmmo.reduce((sum: number, ammo: number) => sum + ammo, 0)).toBe(29);
  });

  test('mouse aiming recovers after the canvas is temporarily hidden', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScene('surface-defense') as any;
      const canvas = game.canvas as HTMLCanvasElement;

      scene.canvasBounds = undefined;
      canvas.style.display = 'none';
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
      const cachedWhileHidden = scene.canvasBounds;

      canvas.style.display = '';
      const x = window.innerWidth * 0.7;
      const y = window.innerHeight * 0.3;
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));

      return {
        cachedWhileHidden: !!cachedWhileHidden,
        cursorX: scene.cursorX,
        cursorY: scene.cursorY,
        expectedX: x,
        expectedY: y,
      };
    });

    expect(result.cachedWhileHidden).toBe(false);
    expect(result.cursorX).toBeCloseTo(result.expectedX, -1);
    expect(result.cursorY).toBeCloseTo(result.expectedY, -1);
  });

  test('mouse aiming remains active on later waves', async ({ page }) => {
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)
        .find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
      scene.startWave();
      scene.startWave();
    });

    const before = await getSurfaceDefenseState(page);
    await page.mouse.move(before!.screenW * 0.72, before!.screenH * 0.26);
    await page.waitForTimeout(100);
    const after = await getSurfaceDefenseState(page);

    expect(after!.wave).toBe(3);
    expect(after!.cursorX).toBeCloseTo(before!.screenW * 0.72, -1);
    expect(after!.cursorY).toBeCloseTo(before!.screenH * 0.26, -1);
  });

  test('A, S, and D fire their matching batteries', async ({ page }) => {
    await holdKey(page, 'a', 100);
    await page.waitForTimeout(180);
    await holdKey(page, 's', 100);
    await page.waitForTimeout(180);
    await holdKey(page, 'd', 100);
    await page.waitForTimeout(100);
    const state = await getSurfaceDefenseState(page);
    expect(state!.batteryAmmo).toEqual([9, 9, 9]);
  });
});

test.describe('Surface Defense — Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'surface-defense');
    await page.waitForTimeout(800);
  });

  test('airbursts destroy enemy missiles and award points', async ({ page }) => {
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)
        .find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
      scene.enemyMissiles.push({
        x: window.innerWidth * 0.5,
        y: window.innerHeight * 0.35,
        startX: window.innerWidth * 0.5,
        startY: window.innerHeight * 0.1,
        targetX: window.innerWidth * 0.5,
        targetY: scene.groundY,
        speed: 1,
        targetKind: 'city',
        targetIndex: 0,
        smart: false,
        split: false,
        splitDone: false,
        color: 0xff4b8b,
        trail: [{ x: window.innerWidth * 0.5, y: window.innerHeight * 0.1 }],
      });
      scene.createExplosion(window.innerWidth * 0.5, window.innerHeight * 0.35, true, 0x7df9ff);
    });
    await page.waitForTimeout(650);
    const state = await getSurfaceDefenseState(page);
    expect(state!.score).toBeGreaterThanOrEqual(25);
  });

  test('includes bomber and satellite aircraft', async ({ page }) => {
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)
        .find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
      scene.aircraft = [];
      scene.spawnAircraft('bomber');
      scene.spawnAircraft('satellite');
      scene.aircraft[0].x = window.innerWidth * 0.35;
      scene.aircraft[1].x = window.innerWidth * 0.65;
    });
    const state = await getSurfaceDefenseState(page);
    expect(state!.activeAircraft).toBe(2);
    expect(state!.aircraftKinds.sort()).toEqual(['bomber', 'satellite']);
    await debugScreenshot(page, 'surface-defense-aircraft');
  });

  test('aircraft can deploy attacking missiles', async ({ page }) => {
    const before = await getSurfaceDefenseState(page);
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)
        .find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
      scene.aircraft = [];
      scene.spawnAircraft('satellite');
      scene.aircraft[0].x = window.innerWidth * 0.5;
      scene.aircraft[0].dropTimer = 0;
      scene.updateAircraft(16, 0.016);
    });
    const after = await getSurfaceDefenseState(page);
    expect(after!.enemyCount).toBeGreaterThan(before!.enemyCount);
  });

  test('banks a bonus city every 10,000 points and rebuilds a city between waves', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)
        .find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
      scene.cities[0].alive = false;
      scene.score = 9990;
      scene.nextBonusCityScore = 10000;
      scene.addScore(50);
      scene.checkBonusCity();
      const banked = scene.bonusCityReserve;
      const livesWithBank = scene.lives;
      scene.restoreCitiesFromReserve();
      return {
        banked,
        livesWithBank,
        cityAlive: scene.cities[0].alive,
        reserveAfter: scene.bonusCityReserve,
      };
    });
    expect(result.banked).toBe(1);
    expect(result.livesWithBank).toBe(6);
    expect(result.cityAlive).toBe(true);
    expect(result.reserveAfter).toBe(0);
  });

  test('a banked bonus city prevents game over when the last city falls', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)
        .find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
      scene.cities.forEach((city: any) => { city.alive = false; });
      scene.bonusCityReserve = 1;
      scene.syncLives();
      return { lives: scene.lives, gameOver: scene.gameOverFlag };
    });
    expect(result.lives).toBe(1);
    expect(result.gameOver).toBe(false);
  });

  test('losing all cities shows the shared game-over screen', async ({ page }) => {
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)
        .find((candidate: any) => candidate.scene?.key === 'surface-defense') as any;
      scene.cities.forEach((city: any) => { city.alive = false; });
      scene.lives = 0;
      scene.syncLivesToHUD();
      scene.endGame();
    });
    await page.waitForTimeout(1000);
    const state = await getSurfaceDefenseState(page);
    expect(state!.gameOverFlag).toBe(true);
    expect(state!.gameOverShown).toBe(true);
  });
});

test.describe('Surface Defense — Game Switching', () => {
  test('switches to and away from the scene', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'surface-defense');
    expect(await getSurfaceDefenseState(page)).not.toBeNull();
    await switchGame(page, 'cosmic-rocks');
    const activeKey = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      return game.scene.getScenes(true)?.[0]?.scene?.key ?? '';
    });
    expect(activeKey).toBe('cosmic-rocks');
  });
});

const VIEWPORTS = [
  { name: '4k', width: 3840, height: 2160 },
  { name: '1080p', width: 1920, height: 1080 },
  { name: '720p', width: 1280, height: 720 },
  { name: 'small', width: 1024, height: 768 },
];

for (const viewport of VIEWPORTS) {
  test(`Surface Defense renders at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'surface-defense');
    await page.waitForTimeout(700);

    const state = await getSurfaceDefenseState(page);
    expect(state).not.toBeNull();
    expect(state!.citiesAlive).toBe(6);
    expect(state!.batteriesAlive).toBe(3);
    expect(state!.cursorX).toBeGreaterThan(0);
    expect(state!.cursorX).toBeLessThan(viewport.width);
    expect(state!.cursorY).toBeGreaterThan(0);
    expect(state!.cursorY).toBeLessThan(state!.groundY);
    expect(state!.groundY).toBeGreaterThan(viewport.height * 0.7);
    expect(state!.groundY).toBeLessThan(viewport.height);
  });
}
