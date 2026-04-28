import { test, expect } from '@playwright/test';
import {
  GAME_URL, waitForGame, getGameState, debugScreenshot, switchGame, killPlayer,
} from './helpers';

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

  test('can switch to Galaxy Blaster', async ({ page }) => {
    await switchGame(page, 'galaxy-blaster');
    const state = await getGameState(page);
    expect(state).not.toBeNull();
    expect(state.sceneName).toBe('galaxy-blaster');
    await debugScreenshot(page, 'galaxy-blaster');
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

  test('game dropdown has all five games', async ({ page }) => {
    const options = await page.locator('#game-select option').allTextContents();
    expect(options).toHaveLength(5);
    expect(options.join(',')).toContain('Alien Onslaught');
    expect(options.join(',')).toContain('Cosmic Rocks');
    expect(options.join(',')).toContain('Galaxy Blaster');
    expect(options.join(',')).toContain('Ninja Runner');
    expect(options.join(',')).toContain('Planet Guardian');
  });
});
