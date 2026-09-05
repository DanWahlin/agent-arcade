import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, switchGame } from './helpers';

test.describe('Planet Guardian — Rendering regressions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'defender');
  });

  test('uses loaded sprites and only changes the ship texture on reversal', async ({ page }) => {
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('defender') as any;
      scene.facingRight = true;
      scene.renderPlayer(scene.gameGfx);
      const original = scene.shipSprite.setTexture;
      let changes = 0;
      scene.shipSprite.setTexture = function (key: string) {
        changes++;
        return original.call(this, key);
      };
      try {
        for (let i = 0; i < 10; i++) scene.renderPlayer(scene.gameGfx);
        const unchanged = changes;
        scene.facingRight = false;
        scene.renderPlayer(scene.gameGfx);
        const leftTexture = scene.shipSprite.texture.key;
        scene.facingRight = true;
        scene.renderPlayer(scene.gameGfx);
        return {
          unchanged, changes, leftTexture,
          rightTexture: scene.shipSprite.texture.key,
          enemies: scene.enemies.every((enemy: any) => enemy.sprite.texture.key === `def-${enemy.type}`),
          humanoids: scene.humanoids.every((human: any) => human.sprite.texture.key === 'def-humanoid'),
          enemyCount: scene.enemies.length,
          humanCount: scene.humanoids.length,
        };
      } finally {
        scene.shipSprite.setTexture = original;
      }
    });
    expect(result).toEqual({
      unchanged: 0, changes: 2, leftTexture: 'def-ship-l', rightTexture: 'def-ship-r',
      enemies: true, humanoids: true, enemyCount: 5, humanCount: 10,
    });
  });

  test('smart bomb graphics refresh on use and respawn, not unchanged frames', async ({ page }) => {
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('defender') as any;
      scene.renderSmartBombHUD();
      const original = scene.hudExtraGfx.clear;
      let redraws = 0;
      scene.hudExtraGfx.clear = function () { redraws++; return original.call(this); };
      try {
        for (let i = 0; i < 10; i++) scene.renderSmartBombHUD();
        const unchanged = redraws;
        scene.useSmartBomb();
        scene.renderSmartBombHUD();
        const used = { redraws, bombs: scene.smartBombs };
        scene.respawnPlayer();
        scene.renderSmartBombHUD();
        return { unchanged, used, respawned: { redraws, bombs: scene.smartBombs } };
      } finally {
        scene.hudExtraGfx.clear = original;
      }
    });
    expect(result).toEqual({
      unchanged: 0, used: { redraws: 1, bombs: 2 }, respawned: { redraws: 2, bombs: 3 },
    });
  });

  test('terrain fill reuses the exact mountain samples from its outline', async ({ page }) => {
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('defender') as any;
      const originalGraphics = scene.terrainGfx;
      const originalTerrainY = scene.getTerrainY;
      let samples = 0;
      let points: number[][] = [];
      let outline: number[][] = [];
      let fill: number[][] = [];
      scene.terrainGfx = {
        clear() {}, lineStyle() {}, fillStyle() {}, closePath() {},
        beginPath() { points = []; },
        moveTo(x: number, y: number) { points.push([x, y]); },
        lineTo(x: number, y: number) { points.push([x, y]); },
        strokePath() { outline = points.map(point => [...point]); },
        fillPath() { fill = points.map(point => [...point]); },
      };
      scene.getTerrainY = function (x: number) { samples++; return originalTerrainY.call(this, x); };
      try {
        scene.renderTerrain();
        return { samples, outline, fill, width: Number(scene.game.config.width), height: Number(scene.game.config.height) };
      } finally {
        scene.terrainGfx = originalGraphics;
        scene.getTerrainY = originalTerrainY;
      }
    });
    expect(result.samples).toBe(result.outline.length);
    expect(result.samples).toBeGreaterThan(100);
    expect(result.fill).toEqual([
      ...result.outline,
      [result.width + 20, result.height],
      [-20, result.height],
    ]);
  });

  test('returning to the scene redraws the smart bomb HUD', async ({ page }) => {
    await switchGame(page, 'cosmic-rocks');
    await switchGame(page, 'defender');
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('defender') as any;
      scene.renderSmartBombHUD();
      return { bombs: scene.smartBombs, hasCommands: scene.hudExtraGfx.commandBuffer.length > 0 };
    });
    expect(result).toEqual({ bombs: 3, hasCommands: true });
  });

  test('a lander can carry a humanoid past the radar and become a mutant', async ({ page }) => {
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScene('defender');
      const human = scene.humanoids[0];
      const lander = scene.createEnemy('lander', human.x, 200);
      lander.hasHumanoid = true;
      lander.targetHumanoid = 0;
      human.state = 'grabbed';
      const enemies = scene.enemies;
      scene.enemies = [lander];
      try {
        for (let i = 0; i < 100 && lander.type === 'lander'; i++) {
          scene.updateEnemies(1 / 60);
        }
        return {
          type: lander.type, texture: lander.sprite.texture.key,
          humanState: human.state, humanSprite: human.sprite,
          carrying: lander.hasHumanoid,
        };
      } finally {
        scene.enemies = enemies;
        lander.sprite.destroy();
      }
    });
    expect(result).toEqual({
      type: 'mutant', texture: 'def-mutant', humanState: 'dead',
      humanSprite: null, carrying: false,
    });
  });
});
