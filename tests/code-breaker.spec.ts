import { test, expect } from '@playwright/test';
import { GAME_URL, waitForGame, getGameState, switchGame, debugScreenshot } from './helpers';

/** Get Code Breaker scene state. */
async function getCBState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    if (!game) return null;
    const scenes = game.scene.getScenes(true);
    const scene = scenes?.find((s: any) => s.scene?.key === 'code-breaker') as any;
    if (!scene) return null;

    const scoreEl = document.getElementById('score-value');
    const livesEl = document.getElementById('lives-value');

    // Get keyboard key states
    const keyStates: Record<string, string> = {};
    if (scene.keys) {
      for (const [letter, key] of scene.keys) {
        keyStates[letter] = (key as any).state;
      }
    }

    return {
      targetWord: scene.targetWord ?? '',
      currentRow: scene.currentRow ?? 0,
      currentCol: scene.currentCol ?? 0,
      currentGuess: scene.currentGuess ?? '',
      gameWon: scene.gameWon ?? false,
      gameLost: scene.gameLost ?? false,
      wordNumber: scene.wordNumber ?? 0,
      isRevealing: scene.isRevealing ?? false,
      tileCount: scene.tiles?.length ?? 0,
      keyCount: scene.keys?.size ?? 0,
      keyStates,
      score: parseInt(scoreEl?.textContent ?? '0', 10) || 0,
      lives: parseInt(livesEl?.textContent ?? '0', 10) || 0,
      gameOverShown: !!document.getElementById('gameover-overlay'),
    };
  });
}

/** Type a word into the game. */
async function typeWord(page: import('@playwright/test').Page, word: string) {
  for (const letter of word) {
    await page.keyboard.press(letter.toUpperCase());
    await page.waitForTimeout(50);
  }
}

test.describe('Code Breaker — Startup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'code-breaker');
    await page.waitForTimeout(2000);
  });

  test('game initializes with correct defaults', async ({ page }) => {
    const state = await getCBState(page);
    expect(state).not.toBeNull();
    expect(state!.currentRow).toBe(0);
    expect(state!.currentCol).toBe(0);
    expect(state!.gameWon).toBe(false);
    expect(state!.gameLost).toBe(false);
    expect(state!.wordNumber).toBeGreaterThanOrEqual(1);
    expect(state!.lives).toBe(6);
    expect(state!.score).toBe(0);
    await debugScreenshot(page, 'code-breaker-startup');
  });

  test('grid has 6 rows of tiles', async ({ page }) => {
    const state = await getCBState(page);
    expect(state!.tileCount).toBe(6);
  });

  test('keyboard has all keys', async ({ page }) => {
    const state = await getCBState(page);
    // 26 letters + ENTER + backspace = 28
    expect(state!.keyCount).toBe(28);
  });

  test('target word is 5 letters', async ({ page }) => {
    const state = await getCBState(page);
    expect(state!.targetWord.length).toBe(5);
  });

  test('HUD elements are present', async ({ page }) => {
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#score-value')).toBeVisible();
    await expect(page.locator('#lives-value')).toBeVisible();
  });
});

test.describe('Code Breaker — Typing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'code-breaker');
    await page.waitForTimeout(2000);
  });

  test('typing letters fills tiles', async ({ page }) => {
    await typeWord(page, 'HELLO');
    const state = await getCBState(page);
    expect(state!.currentCol).toBe(5);
    expect(state!.currentGuess).toBe('HELLO');
    await debugScreenshot(page, 'code-breaker-typing');
  });

  test('backspace removes last letter', async ({ page }) => {
    await typeWord(page, 'HEL');
    await page.keyboard.press('Backspace');
    const state = await getCBState(page);
    expect(state!.currentCol).toBe(2);
    expect(state!.currentGuess).toBe('HE');
  });

  test('cannot type more than 5 letters', async ({ page }) => {
    await typeWord(page, 'HELLOO');
    const state = await getCBState(page);
    expect(state!.currentCol).toBe(5);
    expect(state!.currentGuess.length).toBe(5);
  });
});

test.describe('Code Breaker — Guessing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
    await switchGame(page, 'code-breaker');
    await page.waitForTimeout(2000);
  });

  test('submitting a valid word advances to next row', async ({ page }) => {
    // Get target word and make a guess with a known valid word
    const state = await getCBState(page);
    // Type a common word that should be in the valid list
    await typeWord(page, 'CRANE');
    await page.keyboard.press('Enter');
    // Wait for reveal animation
    await page.waitForTimeout(2500);
    const after = await getCBState(page);
    // Should have advanced (unless it was the correct word)
    expect(after!.currentRow + (after!.gameWon ? 0 : 0)).toBeGreaterThanOrEqual(1);
    await debugScreenshot(page, 'code-breaker-guess');
  });

  test('submitting incomplete word shows error', async ({ page }) => {
    await typeWord(page, 'HEL');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const state = await getCBState(page);
    // Should still be on row 0
    expect(state!.currentRow).toBe(0);
  });

  test('winning the game gives correct word', async ({ page }) => {
    // Cheat: get the target word and type it
    const state = await getCBState(page);
    const target = state!.targetWord.toUpperCase();
    await typeWord(page, target);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    const after = await getCBState(page);
    expect(after!.gameWon).toBe(true);
    expect(after!.score).toBeGreaterThan(0);
    await debugScreenshot(page, 'code-breaker-win');
  });

  test('keyboard keys update color after guess', async ({ page }) => {
    await typeWord(page, 'CRANE');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    const state = await getCBState(page);
    // At least some keys should no longer be 'unused'
    const usedKeys = Object.values(state!.keyStates).filter(s => s !== 'unused');
    expect(usedKeys.length).toBeGreaterThan(0);
    await debugScreenshot(page, 'code-breaker-keyboard');
  });
});

test.describe('Code Breaker — Game Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGame(page);
  });

  test('can switch to Code Breaker', async ({ page }) => {
    await switchGame(page, 'code-breaker');
    await page.waitForTimeout(1500);
    const state = await getCBState(page);
    expect(state).not.toBeNull();
    expect(state!.tileCount).toBe(6);
  });

  test('can switch away from Code Breaker', async ({ page }) => {
    await switchGame(page, 'code-breaker');
    await page.waitForTimeout(1000);
    await switchGame(page, 'ninja-runner');
    await page.waitForTimeout(1000);
    const state = await getGameState(page);
    expect(state!.sceneName).toBe('ninja-runner');
  });
});
