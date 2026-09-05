import { test as base, expect, type Page } from '@playwright/test';
import { createReadStream, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { GAME_URL, waitForGame, dismissReadyScreen } from './helpers';

type Arcade = {
  url: string;
  restart: () => Promise<void>;
  reopen: (gameKey: string) => Promise<void>;
};

const test = base.extend<{ arcade: Arcade; realAssets: boolean }>({
  realAssets: [false, { option: true }],
  arcade: async ({ realAssets }, use) => {
    const filename = path.resolve('.github/extensions/arcade-canvas/extension.mjs');
    const source = readFileSync(filename, 'utf8')
      .replace(/^import .+;\r?\n/gm, '')
      .replace('import.meta.url', JSON.stringify(pathToFileURL(filename).href));
    let canvas: any;
    // Exercise the real server and bootstrap without loading the SDK runtime.
    const html = `<!doctype html><html><head></head><body>
      <select id="game-select">
        <option value="ninja-runner">Ninja Runner</option>
        <option value="cosmic-rocks">Cosmic Rocks</option>
        <option value="surface-defense">Surface Defense</option>
      </select>
      <script>window.__agentArcadeSwitchGame = function () {};</script>
      <script src="./hud.js"></script>
    </body></html>`;
    await runInNewContext(`(async () => { ${source} })()`, {
      createServer,
      createReadStream,
      path,
      fileURLToPath,
      URL,
      readFile: realAssets ? readFile : async () => html,
      stat: realAssets ? stat : async () => undefined,
      CanvasError: class extends Error {},
      createCanvas: (definition: any) => definition,
      joinSession: async (definition: any) => { canvas = definition.canvases[0]; },
    });
    const instanceId = 'regression-test';
    const opened = await canvas.open({ instanceId, input: { defaultGame: 'ninja-runner' } });
    try {
      await use({
        url: opened.url,
        restart: async () => {
          await canvas.actions.find((action: any) => action.name === 'restart_game').handler({ instanceId });
        },
        reopen: async (gameKey) => {
          await canvas.open({ instanceId, input: { defaultGame: gameKey } });
        },
      });
    } finally {
      await canvas.onClose({ instanceId });
    }
  },
});

async function expectShooterLayout(page: Page, width: number, height: number, canvas: boolean) {
  await page.selectOption('#game-select', 'alien-onslaught');
  await dismissReadyScreen(page);
  const alien = await page.evaluate(() => {
    const scene = (window as any).__phaserGame.scene.getScene('alien-onslaught');
    return {
      cellWidth: scene.alienCellW,
      playerY: scene.playerY,
      gridY: scene.alienGridY,
      blockHeight: scene.shields[0][0].h,
      shieldTop: scene.shieldTop,
      bulletWidth: scene.bulletW,
      bulletHeight: scene.bulletH,
    };
  });
  const playfieldHeight = canvas ? Math.min(height, width * 3 / 4) : height;
  const playfieldTop = (height - playfieldHeight) / 2;
  const cellWidth = Math.round(width * (canvas ? 0.068 : 0.055));
  const playerHeight = Math.round(Math.round(cellWidth * 0.85) * 0.55);
  const playerY = playfieldTop + playfieldHeight * (canvas ? 0.95 : 0.92);
  const blockHeight = Math.max(2, Math.round(playfieldHeight * (canvas ? 0.065 : 0.055) / 16));
  const scale = Math.max(canvas ? 1.25 : 0.5, Math.min(width / 1920, height / 1080));
  expect(alien).toEqual({
    cellWidth,
    playerY,
    gridY: canvas ? Math.max(playfieldTop + playfieldHeight * 0.10, 80) : Math.max(height * 0.20, 120),
    blockHeight,
    shieldTop: playerY - playerHeight - blockHeight * 16 - 20,
    bulletWidth: Math.round(4 * scale),
    bulletHeight: Math.round(12 * scale),
  });

  await page.selectOption('#game-select', 'galaxy-blaster');
  await dismissReadyScreen(page);
  const galaxy = await page.evaluate(() => {
    const scene = (window as any).__phaserGame.scene.getScene('galaxy-blaster');
    scene.fireEnemyBullet(scene.shipX, 0);
    return {
      opponentSize: scene.formation[0].y,
      shipY: scene.shipY,
      shipWidth: scene.normalShipWidth,
      shipHeight: scene.normalShipHeight,
      bulletSpeed: scene.enemyBullets[scene.enemyBullets.length - 1].vy,
    };
  });
  const galaxyScale = Math.max(canvas ? 1.7 : 0, Math.min(width / 500, height / 500));
  const opponentSize = canvas
    ? Math.max(54, Math.min(32 * galaxyScale, width / 24))
    : Math.min(32 * galaxyScale, width / 35);
  expect(galaxy.opponentSize).toBe(opponentSize);
  expect(galaxy.shipY).toBe(height - opponentSize * 3);
  expect(galaxy.shipWidth).toBe(opponentSize * 1.2);
  expect(galaxy.shipHeight).toBe(opponentSize * 0.9);
  expect(galaxy.bulletSpeed).toBeCloseTo(300 * galaxyScale);
}

test('invalid selection bodies preserve the current game and leave the server responsive', async ({ arcade, request }) => {
  const selected = await request.post(`${arcade.url}select-game`, { data: { gameKey: 'cosmic-rocks' } });
  expect(selected.ok()).toBe(true);
  for (const body of ['', '{', 'null', '[]', '42', '"ninja-runner"', '{}', '{"gameKey":null}', '{"gameKey":"unknown"}']) {
    const response = await request.post(`${arcade.url}select-game`, {
      data: body,
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status(), body).toBe(400);
    const state = await request.get(`${arcade.url}state`);
    expect((await state.json()).selectedGame).toBe('cosmic-rocks');
  }
  const valid = await request.post(`${arcade.url}select-game`, { data: { gameKey: 'surface-defense' } });
  expect((await valid.json()).selectedGame).toBe('surface-defense');
});

test('dropdown selections survive restart and reopening updates the existing canvas', async ({ arcade, page, request }) => {
  await page.route('**/hud.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(arcade.url);
  // The bootstrap also restores the initial game after 300ms.
  await page.waitForTimeout(400);
  await page.selectOption('#game-select', 'cosmic-rocks');
  await expect.poll(async () => (await (await request.get(`${arcade.url}state`)).json()).selectedGame)
    .toBe('cosmic-rocks');
  await Promise.all([
    page.waitForEvent('load'),
    arcade.restart(),
  ]);
  await expect(page.locator('#game-select')).toHaveValue('cosmic-rocks');
  await page.waitForTimeout(400);
  await arcade.reopen('surface-defense');
  await expect(page.locator('#game-select')).toHaveValue('surface-defense');
  await page.close();
});

test.describe('packaged canvas', () => {
  test.use({ realAssets: true });

  test('generated games boot, switch and restart through the actual canvas server', async ({ arcade, page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(arcade.url);
    await waitForGame(page);
    await page.selectOption('#game-select', 'cosmic-rocks');
    await dismissReadyScreen(page);
    await expect.poll(() => page.evaluate(() =>
      (window as any).__phaserGame.scene.isActive('cosmic-rocks'))).toBe(true);
    await Promise.all([page.waitForEvent('load'), arcade.restart()]);
    await waitForGame(page);
    await expect(page.locator('#game-select')).toHaveValue('cosmic-rocks');
    expect(errors).toEqual([]);
    await page.close();
  });

  test('compact canvas resizes below desktop thresholds but ignores HUD-only heights', async ({ arcade, page }) => {
    await page.setViewportSize({ width: 640, height: 480 });
    await page.goto(arcade.url);
    await waitForGame(page);
    const gameSize = () => page.evaluate(() => {
      const game = (window as any).__phaserGame;
      return { width: game.scale.width, height: game.scale.height };
    });
    await page.setViewportSize({ width: 600, height: 240 });
    await expect.poll(gameSize).toEqual({ width: 600, height: 240 });
    await page.setViewportSize({ width: 500, height: 220 });
    await page.waitForTimeout(250);
    expect(await gameSize()).toEqual({ width: 600, height: 240 });
    await page.setViewportSize({ width: 640, height: 480 });
    await expect.poll(gameSize).toEqual({ width: 640, height: 480 });
    await page.close();
  });
});

// These are browser user-agent checks, not substitutes for native OS/Wayland testing.
for (const [platform, userAgent] of [
  ['Linux', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36'],
  ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36'],
  ['macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36'],
] as const) {
  test.describe(`runtime layout on ${platform}`, () => {
    test.use({ realAssets: true, userAgent });

    for (const viewport of [{ width: 640, height: 480 }, { width: 600, height: 900 }]) {
      test(`canvas profile preserves shooter sizing at ${viewport.width}×${viewport.height}`, async ({ arcade, page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize(viewport);
        await page.goto(arcade.url);
        await waitForGame(page);
        expect(await page.evaluate(() => (window as any).__agentArcadeLayoutProfile)).toBe('canvas');
        await expectShooterLayout(page, viewport.width, viewport.height, true);
        expect(errors).toEqual([]);
        await page.close();
      });
    }

    test('desktop default preserves startup thresholds and shooter sizing', async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 480 });
      await page.goto(GAME_URL);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => !!(window as any).__phaserGame)).toBe(false);
      expect(await page.evaluate(() => (window as any).__agentArcadeLayoutProfile)).toBeUndefined();
      await page.setViewportSize({ width: 1024, height: 768 });
      await waitForGame(page);
      await expectShooterLayout(page, 1024, 768, false);
      const size = () => page.evaluate(() => {
        const game = (window as any).__phaserGame;
        return { width: game.scale.width, height: game.scale.height };
      });
      await page.setViewportSize({ width: 800, height: 400 });
      await page.waitForTimeout(250);
      expect(await size()).toEqual({ width: 1024, height: 768 });
    });
  });
}
