/**
 * Playwright test helpers for Agent Arcade.
 * Injected at runtime — NOT included in production builds.
 */

type Page = import('@playwright/test').Page;

const GAME_URL = 'http://localhost:4173/game/index.html';
export { GAME_URL };

/** Wait for the Phaser game to be fully loaded */
export async function waitForGame(page: Page) {
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(2000);
}

/** Get current game state from Phaser internals */
export async function getGameState(page: Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) return null;
    const scenes = game.scene.getScenes(true);
    if (!scenes || scenes.length === 0) return null;

    let player: any = null;
    let scene: any = null;
    for (const s of scenes) {
      if ((s as any).player) { player = (s as any).player; scene = s; break; }
      if ((s as any).ship) { player = (s as any).ship; scene = s; break; }
    }
    if (!scene) scene = scenes[0];

    const scoreEl = document.getElementById('score-value');
    const livesEl = document.getElementById('lives-value');
    return {
      sceneName: scene.scene?.key ?? '',
      playerX: player ? Math.round(player.x) : 0,
      playerY: player ? Math.round(player.y) : 0,
      playerVisible: player?.visible ?? false,
      hasPlayer: !!player,
      score: parseInt(scoreEl?.textContent ?? '0', 10) || 0,
      lives: parseInt(livesEl?.textContent ?? '0', 10) || 0,
      gameOverShown: !!document.getElementById('gameover-overlay'),
      canvasWidth: game.config.width,
      canvasHeight: game.config.height,
    };
  });
}

/** Get extended scene state (NinjaRunner-specific properties) */
export async function getSceneState(page: Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) return null;
    const scenes = game.scene.getScenes(true);
    const scene = scenes?.find((s: any) => (s as any).player);
    if (!scene) return null;
    const s = scene as any;
    return {
      dead: s.dead ?? false,
      isBig: s.isBig ?? false,
      parachuteMode: s.parachuteMode ?? false,
      warping: s.warping ?? false,
      invincible: s.invincible ?? 0,
      coinCount: s.coinGroup?.getChildren()?.length ?? 0,
      enemyCount: s.enemyGroup?.getChildren()?.length ?? 0,
      fireCount: s.fireGroup?.getChildren()?.length ?? 0,
      groundCount: s.groundGroup?.getChildren()?.length ?? 0,
      brickCount: s.brickGroup?.getChildren()?.length ?? 0,
      qblockCount: s.qblockGroup?.getChildren()?.length ?? 0,
      pipeCount: s.pipeGroup?.getChildren()?.length ?? 0,
      bridgeCount: s.bridgeGroup?.getChildren()?.length ?? 0,
      gapCount: s.gaps?.length ?? 0,
    };
  });
}

/** Hold a key for a duration */
export async function holdKey(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Hold a key while also pressing another key */
export async function moveAndJump(page: Page, direction: string, ms: number) {
  await page.keyboard.down(direction);
  await page.waitForTimeout(100);
  await page.keyboard.press('Space');
  await page.waitForTimeout(ms);
  await page.keyboard.up(direction);
}

/** Take a labeled screenshot for debugging */
export async function debugScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `tests/screenshots/${name}.png` });
}

/** Switch to a specific game scene (polls until the scene is active). */
export async function switchGame(page: Page, key: string) {
  await page.evaluate((k) => {
    const switchFn = (window as any).__agentArcadeSwitchGame;
    if (!switchFn) throw new Error('__agentArcadeSwitchGame not found on window');
    switchFn(k);
  }, key);
  await page.waitForFunction(
    (expectedKey: string) => {
      const game = (window as any).__phaserGame;
      if (!game) return false;
      const scenes = game.scene.getScenes(true);
      return scenes?.some((s: any) => s.scene?.key === expectedKey) ?? false;
    },
    key,
    { timeout: 5000, polling: 100 },
  );
}

/** Trigger player death by moving them off-screen. Throws if game/scene/player is missing. */
export async function killPlayer(page: Page) {
  await page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) throw new Error('Phaser game not found on window.__phaserGame');
    const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player);
    if (!scene) throw new Error('No active scene with a player found');
    (scene as any).player.y = 9999;
  });
  await page.waitForTimeout(500);
}

/** Give the player invincibility for testing. Throws if game/scene is missing. */
export async function setInvincible(page: Page, frames = 9999) {
  await page.evaluate((f) => {
    const game = (window as any).__phaserGame;
    if (!game) throw new Error('Phaser game not found on window.__phaserGame');
    const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player);
    if (!scene) throw new Error('No active scene with a player found');
    (scene as any).invincible = f;
  }, frames);
}

/** Set player lives. Throws if game/scene is missing. */
export async function setLives(page: Page, lives: number) {
  await page.evaluate((l) => {
    const game = (window as any).__phaserGame;
    if (!game) throw new Error('Phaser game not found on window.__phaserGame');
    const scene = game.scene.getScenes(true)?.find((s: any) => (s as any).player);
    if (!scene) throw new Error('No active scene with a player found');
    (scene as any).lives = l;
    (scene as any).syncLivesToHUD();
  }, lives);
}

/** Read a single property from the active player scene. Throws if scene not found. */
export async function getSceneProperty<T = unknown>(page: Page, property: string): Promise<T> {
  return page.evaluate((prop: string) => {
    const game = (window as any).__phaserGame;
    if (!game) throw new Error('Phaser game not found on window.__phaserGame');
    const scenes = game.scene.getScenes(true);
    const scene = scenes?.find((s: any) => (s as any).player);
    if (!scene) throw new Error('No active scene with a player found');
    return (scene as any)[prop];
  }, property) as Promise<T>;
}

/** Get the player's ground position relative to canvas height */
export async function getGroundInfo(page: Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const scenes = game?.scene.getScenes(true);
    if (!scenes?.length) return null;
    const scene = scenes[0] as any;
    const groundGroup = scene.groundGroup;
    let maxY = 0;
    if (groundGroup) {
      for (const g of groundGroup.getChildren()) {
        const bottom = g.y + g.displayHeight / 2;
        if (bottom > maxY) maxY = bottom;
      }
    }
    return {
      groundBottom: Math.round(maxY),
      canvasH: game.config.height,
      gap: game.config.height - Math.round(maxY),
    };
  });
}
