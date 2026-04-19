import { test, expect } from '@playwright/test';
import {
  GAME_URL, waitForGame, getGameState, getSceneState, getGroundInfo,
  holdKey, moveAndJump, debugScreenshot, switchGame, killPlayer,
  setInvincible, setLives, getSceneProperty
} from './helpers';

test.describe('Ninja Runner — Startup & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('game initializes with correct defaults', async ({ page }) => {
    const state = await getGameState(page);
    expect(state).not.toBeNull();
    expect(state.hasPlayer).toBe(true);
    expect(state.playerVisible).toBe(true);
    expect(state.lives).toBe(3);
    expect(state.score).toBe(0);
    expect(state.gameOverShown).toBe(false);
    expect(state.canvasWidth).toBeGreaterThan(800);
    expect(state.canvasHeight).toBeGreaterThan(500);
  });

  test('player starts above ground, not at top of screen', async ({ page }) => {
    const state = await getGameState(page);
    // Player should be in the lower portion of the screen (near ground)
    expect(state.playerY).toBeGreaterThan(state.canvasHeight * 0.5);
    expect(state.playerY).toBeLessThan(state.canvasHeight);
  });

  test('ground row reaches bottom of canvas', async ({ page }) => {
    const info = await getGroundInfo(page);
    expect(info).not.toBeNull();
    expect(info.groundBottom).toBeGreaterThan(info.canvasH - 10);
    expect(info.groundBottom).toBeLessThanOrEqual(info.canvasH + 5);
  });

  test('HUD elements are present', async ({ page }) => {
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#score-value')).toBeVisible();
    await expect(page.locator('#lives-value')).toBeVisible();
    await expect(page.locator('#hi-value')).toBeVisible();
    await expect(page.locator('#game-select')).toBeVisible();
    await expect(page.locator('#help-btn')).toBeVisible();
  });

  test('level generates content (coins, enemies, blocks)', async ({ page }) => {
    const scene = await getSceneState(page);
    expect(scene).not.toBeNull();
    expect(scene.groundCount).toBeGreaterThan(10);
    expect(scene.coinCount).toBeGreaterThan(0);
  });

  test('screenshot baseline — initial view', async ({ page }) => {
    await debugScreenshot(page, 'baseline-start');
  });
});

test.describe('Ninja Runner — Player Movement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('player moves right', async ({ page }) => {
    const before = await getGameState(page);
    await holdKey(page, 'ArrowRight', 1000);
    const after = await getGameState(page);
    expect(after.playerX).toBeGreaterThan(before.playerX + 50);
  });

  test('player moves left', async ({ page }) => {
    // First move right, then move left
    await holdKey(page, 'ArrowRight', 500);
    const before = await getGameState(page);
    await holdKey(page, 'ArrowLeft', 500);
    const after = await getGameState(page);
    expect(after.playerX).toBeLessThan(before.playerX);
  });

  test('player runs faster with shift held', async ({ page }) => {
    // Walk without shift
    const startWalk = await getGameState(page);
    await holdKey(page, 'ArrowRight', 500);
    const afterWalk = await getGameState(page);
    const walkDist = afterWalk.playerX - startWalk.playerX;

    // Restart measurement — walk with shift
    await page.waitForTimeout(200);
    const startRun = await getGameState(page);
    await page.keyboard.down('Shift');
    await holdKey(page, 'ArrowRight', 500);
    await page.keyboard.up('Shift');
    const afterRun = await getGameState(page);
    const runDist = afterRun.playerX - startRun.playerX;

    expect(runDist).toBeGreaterThan(walkDist * 1.2);
  });

  test('jump while moving covers horizontal distance', async ({ page }) => {
    const before = await getGameState(page);
    await moveAndJump(page, 'ArrowRight', 800);
    const after = await getGameState(page);
    expect(after.playerX).toBeGreaterThan(before.playerX + 80);
  });
});

test.describe('Ninja Runner — Invincible Traversal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('player survives 5 seconds of walking right', async ({ page }) => {
    await setInvincible(page);
    await holdKey(page, 'ArrowRight', 5000);
    const state = await getGameState(page);
    expect(state.lives).toBeGreaterThan(0);
    expect(state.playerX).toBeGreaterThan(1000);
  });

  test('player survives 10 seconds with jumping', async ({ page }) => {
    await setInvincible(page);
    for (let i = 0; i < 8; i++) {
      await moveAndJump(page, 'ArrowRight', 1200);
    }
    const state = await getGameState(page);
    expect(state.lives).toBeGreaterThan(0);
    expect(state.playerX).toBeGreaterThan(2000);
    await debugScreenshot(page, 'survival-10s');
  });

  test('player stays within canvas bounds vertically', async ({ page }) => {
    await setInvincible(page);
    for (let i = 0; i < 5; i++) {
      await moveAndJump(page, 'ArrowRight', 1000);
      const state = await getGameState(page);
      expect(state.playerY).toBeGreaterThan(0);
      expect(state.playerY).toBeLessThan(state.canvasHeight + 50);
    }
  });
});

test.describe('Ninja Runner — Death & Respawn', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('player loses a life on death', async ({ page }) => {
    const before = await getGameState(page);
    expect(before.lives).toBe(3);
    await killPlayer(page);
    await page.waitForTimeout(2000);
    const after = await getGameState(page);
    expect(after.lives).toBe(2);
  });

  test('game over shows after losing all lives', async ({ page }) => {
    await setLives(page, 1);
    await killPlayer(page);
    await page.waitForTimeout(3000);
    const state = await getGameState(page);
    expect(state.gameOverShown).toBe(true);
    await debugScreenshot(page, 'game-over');
  });

  test('game over dialog dismisses with Space', async ({ page }) => {
    await setLives(page, 1);
    await killPlayer(page);
    await page.waitForTimeout(3000);
    // Verify overlay is visible
    await expect(page.locator('#gameover-overlay')).toBeVisible();
    // Wait for the 500ms input delay then press Space
    await page.waitForTimeout(600);
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    // Overlay should be gone
    await expect(page.locator('#gameover-overlay')).not.toBeVisible();
    // Game should restart with 3 lives
    const state = await getGameState(page);
    expect(state.lives).toBe(3);
    expect(state.score).toBe(0);
  });
});

test.describe('Ninja Runner — Level Generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('level generates new content as player moves forward', async ({ page }) => {
    await setInvincible(page);
    const before = await getSceneState(page);
    // Walk far right to trigger level generation
    for (let i = 0; i < 5; i++) {
      await holdKey(page, 'ArrowRight', 1500);
    }
    const after = await getSceneState(page);
    expect(after.groundCount).toBeGreaterThan(before.groundCount);
  });

  test('platforms and blocks are generated', async ({ page }) => {
    await setInvincible(page);
    for (let i = 0; i < 5; i++) {
      await holdKey(page, 'ArrowRight', 1500);
    }
    const scene = await getSceneState(page);
    // Should have various block types
    expect(scene.brickCount + scene.qblockCount).toBeGreaterThan(0);
  });

  test('enemies are generated', async ({ page }) => {
    await setInvincible(page);
    for (let i = 0; i < 5; i++) {
      await holdKey(page, 'ArrowRight', 1500);
    }
    const scene = await getSceneState(page);
    expect(scene.enemyCount).toBeGreaterThan(0);
  });

  test('ground blocks are within valid Y range', async ({ page }) => {
    const positions = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      if (!game) throw new Error('Phaser game not found');
      const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).groundGroup);
      if (!scene) throw new Error('No scene with groundGroup');
      const children = (scene as any).groundGroup.getChildren();
      return children.map((g: any) => Math.round(g.y));
    });
    expect(positions.length).toBeGreaterThan(0);
    const canvasH = (await getGameState(page)).canvasHeight;
    for (const y of positions) {
      // Ground blocks should be in the lower portion of the screen
      expect(y).toBeGreaterThan(canvasH * 0.7);
      expect(y).toBeLessThanOrEqual(canvasH + 10);
    }
  });
});

test.describe('Ninja Runner — Visual Effects', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('spike glow effects exist when spikes present', async ({ page }) => {
    await setInvincible(page);
    // Walk until we find spikes
    for (let i = 0; i < 10; i++) {
      await holdKey(page, 'ArrowRight', 1500);
    }
    const hasGlows = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game?.scene.getScenes(true)?.find((s: any) => (s as any).fireGroup);
      if (!scene) return false;
      const fires = (scene as any).fireGroup.getChildren();
      return fires.some((f: any) => f.getData('hasGlow') === true);
    });
    // Spikes with glows should exist somewhere in the level
    const scene = await getSceneState(page);
    if (scene.fireCount > 0) {
      expect(hasGlows).toBe(true);
    }
  });
});

test.describe('Ninja Runner — Combat & Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('collecting a coin increases score', async ({ page }) => {
    const scoreBefore = (await getGameState(page)).score;
    // Spawn a coin right in front of the player
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      if (!game) throw new Error('Phaser game not found');
      const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player) as any;
      if (!scene) throw new Error('No active scene with player');
      const c = scene.coinGroup.create(scene.player.x + 50, scene.player.y - 20, 'coin0');
      c.setDisplaySize(24, 31);
      c.body.setAllowGravity(false);
      c.body.setSize(12, 18);
    });
    await holdKey(page, 'ArrowRight', 600);
    await page.waitForTimeout(500); // Wait for score count-up animation (450ms)
    const scoreAfter = (await getGameState(page)).score;
    expect(scoreAfter).toBeGreaterThanOrEqual(scoreBefore + 100);
  });

  test('stomping an enemy awards points', async ({ page }) => {
    // Clear initial invincibility and stomp grace so onPlayerEnemy runs
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      if (!game) throw new Error('Phaser game not found');
      const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player) as any;
      if (!scene) throw new Error('No active scene with player');
      scene.invincible = 0;
      scene.stompGrace = 0;
      scene.shrinkTimer = 0;
      scene.isBig = false;
      // Remove existing enemies near the player to avoid interference
      (scene.enemyGroup.getChildren() as any[])
        .filter((e: any) => Math.abs(e.x - scene.player.x) < 400)
        .forEach((e: any) => e.destroy());
    });

    const scoreBefore = (await getGameState(page)).score;

    // Spawn a stationary goomba ahead of the player
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player) as any;
      const BLOCK = 48;
      const GROUND_Y = game.config.height - BLOCK;
      const e = scene.enemyGroup.create(scene.player.x + 100, GROUND_Y, 'enemy', 0);
      e.setOrigin(0.5, 1);
      e.setDisplaySize(BLOCK, BLOCK);
      e.body.setGravityY(1800);
      e.body.setAllowGravity(true);
      e.setVelocityX(0);
      e.setData('kind', 'goomba');
      e.setData('enemyType', 'goomba');
      e.setData('state', 'walk');
      e.setData('timer', 0);
      e.setData('baseY', GROUND_Y);
    });

    // Jump and move right to stomp the enemy
    await moveAndJump(page, 'ArrowRight', 1000);
    await page.waitForTimeout(300);

    const scoreAfter = (await getGameState(page)).score;
    // Goomba stomp awards 200 points via killGoomba
    expect(scoreAfter).toBeGreaterThan(scoreBefore);
  });

  test('collecting a mushroom powers up the player', async ({ page }) => {
    // Ensure player is NOT already big and clear invincibility
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      if (!game) throw new Error('Phaser game not found');
      const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player) as any;
      if (!scene) throw new Error('No active scene with player');
      scene.invincible = 0;
      scene.isBig = false;
    });

    const isBigBefore = await getSceneProperty<boolean>(page, 'isBig');
    expect(isBigBefore).toBe(false);

    // Spawn a mushroom right in front of the player
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player) as any;
      const m = scene.mushroomGroup.create(scene.player.x + 50, scene.player.y - 20, 'mushroom');
      m.setDisplaySize(48, 48);
      m.body.setAllowGravity(false);
    });

    await holdKey(page, 'ArrowRight', 600);

    const isBigAfter = await getSceneProperty<boolean>(page, 'isBig');
    expect(isBigAfter).toBe(true);

    // Verify glow effect was added
    const hasGlow = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player) as any;
      return scene.player.getData('hasGlow') === true;
    });
    expect(hasGlow).toBe(true);
  });

  test('enemy hit without invincibility costs a life', async ({ page }) => {
    // Clear all protective state so the hit registers
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      if (!game) throw new Error('Phaser game not found');
      const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player) as any;
      if (!scene) throw new Error('No active scene with player');
      scene.invincible = 0;
      scene.stompGrace = 0;
      scene.shrinkTimer = 0;
      scene.isBig = false;
      // Remove existing enemies to isolate the test
      (scene.enemyGroup.getChildren() as any[])
        .filter((e: any) => Math.abs(e.x - scene.player.x) < 400)
        .forEach((e: any) => e.destroy());
    });

    const livesBefore = (await getGameState(page)).lives;

    // Spawn an enemy right in front at ground level — player will walk into it
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player) as any;
      const BLOCK = 48;
      const GROUND_Y = game.config.height - BLOCK;
      const e = scene.enemyGroup.create(scene.player.x + 60, GROUND_Y, 'enemy', 0);
      e.setOrigin(0.5, 1);
      e.setDisplaySize(BLOCK, BLOCK);
      e.body.setGravityY(1800);
      e.body.setAllowGravity(true);
      e.setVelocityX(0);
      e.setData('kind', 'goomba');
      e.setData('enemyType', 'goomba');
      e.setData('state', 'walk');
      e.setData('timer', 0);
      e.setData('baseY', GROUND_Y);
    });

    // Walk into the enemy (no jump — ensures it's not a stomp)
    await holdKey(page, 'ArrowRight', 800);
    await page.waitForTimeout(1500);

    const livesAfter = (await getGameState(page)).lives;
    expect(livesAfter).toBeLessThan(livesBefore);
  });
});

test.describe('Game Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('can switch to Cosmic Rocks', async ({ page }) => {
    await switchGame(page, 'cosmic-rocks');
    const state = await getGameState(page);
    expect(state).not.toBeNull();
    expect(state.sceneName).toBe('cosmic-rocks');
    await debugScreenshot(page, 'cosmic-rocks');
  });

  test('can switch to Galaxy Shooter', async ({ page }) => {
    await switchGame(page, 'galaxy-shooter');
    const state = await getGameState(page);
    expect(state).not.toBeNull();
    expect(state.sceneName).toBe('galaxy-shooter');
    await debugScreenshot(page, 'galaxy-shooter');
  });

  test('can switch back to Ninja Runner', async ({ page }) => {
    await switchGame(page, 'cosmic-rocks');
    await switchGame(page, 'ninja-runner');
    const state = await getGameState(page);
    expect(state.sceneName).toBe('ninja-runner');
    expect(state.lives).toBe(3);
  });
});

test.describe('HUD & UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('lives display updates on death', async ({ page }) => {
    const livesBefore = await page.locator('#lives-value').textContent();
    expect(livesBefore?.trim()).toBe('3');
    await killPlayer(page);
    await page.waitForTimeout(2000);
    const livesAfter = await page.locator('#lives-value').textContent();
    expect(livesAfter?.trim()).toBe('2');
  });

  test('help overlay opens and closes', async ({ page }) => {
    await expect(page.locator('#help-overlay')).not.toBeVisible();
    await page.locator('#help-btn').click();
    await expect(page.locator('#help-overlay')).toBeVisible();
    await page.locator('#help-close').click();
    await expect(page.locator('#help-overlay')).not.toBeVisible();
  });

  test('game dropdown has all three games', async ({ page }) => {
    const options = await page.locator('#game-select option').allTextContents();
    expect(options).toHaveLength(3);
    expect(options.join(',')).toContain('Cosmic Rocks');
    expect(options.join(',')).toContain('Galaxy Shooter');
    expect(options.join(',')).toContain('Ninja Runner');
  });
});
