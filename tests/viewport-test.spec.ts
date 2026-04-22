import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, switchGame } from './helpers';

const VIEWPORTS = [
  { name: '4k',       width: 3840, height: 2160 },
  { name: '1440p',    width: 2560, height: 1440 },
  { name: '1080p',    width: 1920, height: 1080 },
  { name: '720p',     width: 1280, height: 720 },
  { name: 'macbook',  width: 1440, height: 900 },
  { name: 'laptop',   width: 1366, height: 768 },
  { name: 'small',    width: 1024, height: 768 },
];

for (const vp of VIEWPORTS) {
  test(`Alien Onslaught renders at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'alien-onslaught');
    await page.waitForTimeout(2000);

    // Verify game state
    const state = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      if (!game) return null;
      const scenes = game.scene.getScenes(true);
      const scene = scenes?.find((s: any) => s.scene?.key === 'alien-onslaught') as any;
      if (!scene) return null;

      const alive = scene.aliens?.filter((a: any) => a.alive) ?? [];
      // Check if aliens are within viewport bounds
      let aliensOutOfBounds = 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const a of alive) {
        if (a.x < 0 || a.x > window.innerWidth) aliensOutOfBounds++;
        if (a.y < 0 || a.y > window.innerHeight) aliensOutOfBounds++;
        minX = Math.min(minX, a.x);
        maxX = Math.max(maxX, a.x);
        minY = Math.min(minY, a.y);
        maxY = Math.max(maxY, a.y);
      }

      // Check shields
      let shieldsOutOfBounds = 0;
      for (const shield of scene.shields ?? []) {
        for (const block of shield) {
          if (!block.alive) continue;
          if (block.x < 0 || block.x > window.innerWidth) shieldsOutOfBounds++;
          if (block.y < 0 || block.y > window.innerHeight) shieldsOutOfBounds++;
        }
      }

      return {
        playerX: scene.playerX,
        playerY: scene.playerY,
        playerAlive: scene.playerAlive,
        aliensAlive: alive.length,
        aliensOutOfBounds,
        alienBoundsX: [Math.round(minX), Math.round(maxX)],
        alienBoundsY: [Math.round(minY), Math.round(maxY)],
        shieldsOutOfBounds,
        shieldCount: scene.shields?.length ?? 0,
        screenW: window.innerWidth,
        screenH: window.innerHeight,
      };
    });

    expect(state).not.toBeNull();
    expect(state!.playerAlive).toBe(true);
    expect(state!.aliensAlive).toBe(55);

    // Player should be in lower portion
    expect(state!.playerX).toBeGreaterThan(0);
    expect(state!.playerX).toBeLessThan(state!.screenW);
    expect(state!.playerY).toBeGreaterThan(state!.screenH * 0.5);
    expect(state!.playerY).toBeLessThan(state!.screenH);

    // All aliens should be on screen
    expect(state!.aliensOutOfBounds).toBe(0);
    expect(state!.alienBoundsX[0]).toBeGreaterThan(0);
    expect(state!.alienBoundsX[1]).toBeLessThan(state!.screenW);
    expect(state!.alienBoundsY[0]).toBeGreaterThan(0);

    // Shields should be on screen
    expect(state!.shieldsOutOfBounds).toBe(0);
    expect(state!.shieldCount).toBe(4);

    await page.screenshot({ path: `tests/screenshots/viewport-${vp.name}.png` });
  });
}
