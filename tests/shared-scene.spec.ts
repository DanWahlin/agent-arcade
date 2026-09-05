import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, dismissReadyScreen } from './helpers';

test.describe('Shared scene rendering and lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('starfield updates each moving layer once and leaves static layers unchanged', async ({ page }) => {
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScenes(true)[0];
      scene.scene.pause();
      const stars = scene.createStarfield([
        { count: 2, speed: 0, size: 1, alpha: 0.2 },
        { count: 3, speed: 20, size: 2, alpha: 0.5 },
        { count: 4, speed: 40, size: 3, alpha: 0.8 },
      ]);
      const graphics = [...new Set<any>(stars.map((star: any) => star.gfx))];
      const clears = [0, 0, 0];
      const circles = [0, 0, 0];
      graphics.forEach((gfx, index) => {
        const clear = gfx.clear.bind(gfx);
        const fillCircle = gfx.fillCircle.bind(gfx);
        gfx.clear = () => { clears[index]++; return clear(); };
        gfx.fillCircle = (x: number, y: number, radius: number) => {
          circles[index]++;
          return fillCircle(x, y, radius);
        };
      });
      stars.forEach((star: any) => { star.y = window.innerHeight - 5; });
      scene.updateStarfield(stars, 0);
      const zeroDeltaClears = [...clears];
      scene.updateStarfield(stars, 500);
      const ys = stars.map((star: any) => star.y);
      graphics.forEach(gfx => gfx.destroy());
      return { clears, circles, zeroDeltaClears, ys, height: window.innerHeight };
    });
    expect(result.zeroDeltaClears).toEqual([0, 0, 0]);
    expect(result.clears).toEqual([0, 1, 1]);
    expect(result.circles).toEqual([0, 3, 4]);
    expect(result.ys).toEqual([result.height - 5, result.height - 5, 5, 5, 5, 15, 15, 15, 15]);
  });

  test('unchanged HUD values do not create DOM mutations', async ({ page }) => {
    const mutations = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScenes(true)[0];
      scene.scene.pause();
      scene.syncScoreToHUD();
      scene.syncHighScoreToHUD();
      scene.syncLivesToHUD();
      const observer = new MutationObserver(() => {});
      observer.observe(document.getElementById('hud')!, { childList: true, subtree: true });
      for (let i = 0; i < 60; i++) {
        scene.syncScoreToHUD();
        scene.syncHighScoreToHUD();
        scene.syncLivesToHUD();
      }
      const count = observer.takeRecords().length;
      observer.disconnect();
      return count;
    });
    expect(mutations).toBe(0);
  });

  test('high scores persist even when the score display is absent', async ({ page }) => {
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScenes(true)[0];
      scene.scene.pause();
      document.getElementById('score-value')!.remove();
      scene.addScore(100);
      return {
        score: scene.score,
        highScore: scene.highScore,
        saved: localStorage.getItem('agentArcade_hi_' + scene.scene.key),
      };
    });
    expect(result.highScore).toBe(result.score);
    expect(result.saved).toBe(String(result.score));
  });

  test('scene shutdown removes wave banners and cancels their timers', async ({ page }) => {
    const result = await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScenes(true)[0];
      scene.showWaveBanner(2);
      const oldTimer = scene.waveBannerTimer;
      const cleared: number[] = [];
      const clear = window.clearTimeout;
      window.clearTimeout = (id?: number) => {
        if (id !== undefined) cleared.push(id);
        clear(id);
      };
      try {
        scene.showWaveBanner(3);
        const newTimer = scene.waveBannerTimer;
        scene.scene.manager.stop(scene.scene.key);
        return {
          bannerPresent: !!document.getElementById('wave-banner'),
          oldTimerCleared: cleared.includes(oldTimer),
          newTimerCleared: cleared.includes(newTimer),
        };
      } finally {
        window.clearTimeout = clear;
      }
    });
    expect(result).toEqual({ bannerPresent: false, oldTimerCleared: true, newTimerCleared: true });
  });

  test('settings keys do not dismiss game over', async ({ page }) => {
    await page.evaluate(() => {
      const scene = (window as any).__phaserGame.scene.getScenes(true)[0];
      (window as any).__restartCount = 0;
      scene.showGameOver(0, () => { (window as any).__restartCount++; });
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById('settings-btn')!.click());
    await page.keyboard.press('Space');
    await expect(page.locator('#gameover-overlay')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__restartCount)).toBe(0);
    await page.evaluate(() => document.getElementById('settings-close')!.click());
    await page.keyboard.press('Space');
    await expect(page.locator('#gameover-overlay')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__restartCount)).toBe(1);
  });
});

for (const overlay of ['help', 'settings']) {
  test(`${overlay} does not start a game that is waiting on the ready screen`, async ({ page }) => {
    await page.goto(GAME_URL);
    await expect(page.locator('#ready-overlay')).toBeVisible();
    await page.locator(`#${overlay}-btn`).click();
    await expect(page.locator(`#${overlay}-overlay`)).toHaveClass(/show/);
    await page.keyboard.press('a');
    await page.locator(`#${overlay}-close`).click();
    expect(await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      return { active: game.scene.getScenes(true).length, paused: game.scene.isPaused('ninja-runner') };
    })).toEqual({ active: 0, paused: true });
    await expect(page.locator('#ready-overlay')).toBeVisible();
    await dismissReadyScreen(page);
    await expect.poll(() => page.evaluate(() =>
      (window as any).__phaserGame.scene.isActive('ninja-runner'))).toBe(true);
  });
}

test('pause and resume preserve the ready screen', async ({ page }) => {
  await page.goto(GAME_URL);
  await expect(page.locator('#ready-overlay')).toBeVisible();
  await page.evaluate(() => (window as any).__agentArcadePauseScene(true));
  await expect(page.locator('#ready-overlay')).toHaveCount(0);
  await page.evaluate(() => (window as any).__agentArcadePauseScene(false));
  await expect(page.locator('#ready-overlay')).toBeVisible();
  expect(await page.evaluate(() =>
    (window as any).__phaserGame.scene.isPaused('ninja-runner'))).toBe(true);
  await dismissReadyScreen(page);
});
