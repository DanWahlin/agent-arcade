/**
 * Focus / click-through system tests.
 *
 * These tests verify that the Tauri click-through and window-focus state machine
 * is correct in every interactive state: game over dialog, resume paths, HUD overlays.
 *
 * Approach: inject a mock __TAURI_INTERNALS__ via addInitScript (runs before hud.js)
 * so all ti.invoke() calls in hud.js are captured. Tests then assert that
 * set_click_through is called with the right `enabled` value at the right time.
 *
 * The mock returns null for get_cursor_in_window (cursor not over HUD), which keeps
 * the HUD hover system from interfering with set_click_through assertions.
 */

import { test, expect, type Page } from '@playwright/test';
import { GAME_URL, waitForGame, setLives, killPlayer } from './helpers';

// ── Mock Tauri bridge ──────────────────────────────────────────────────────────

/** Inject mock __TAURI_INTERNALS__ before hud.js loads so ti is our spy. */
async function setupTauriMock(page: Page) {
  await page.addInitScript(() => {
    const calls: { cmd: string; args: any }[] = [];
    (window as any).__tauriMockCalls = calls;
    (window as any).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: any) => {
        calls.push({ cmd, args: args ?? {} });
        // get_cursor_in_window → null (cursor not over HUD, keeps HUD hover idle)
        return Promise.resolve(null);
      },
    };
  });
}

/** Returns all recorded invoke calls. */
async function getInvokeCalls(page: Page): Promise<{ cmd: string; args: any }[]> {
  return page.evaluate(() => (window as any).__tauriMockCalls ?? []);
}

/** Clears the recorded invoke calls (to isolate assertions per action). */
async function clearInvokeCalls(page: Page) {
  // Mutate in-place so the invoke closure still references the same array.
  await page.evaluate(() => { (window as any).__tauriMockCalls.length = 0; });
}

/**
 * Returns the `enabled` value of the most recent set_click_through call,
 * or null if no such call was made.
 */
async function lastClickThrough(page: Page): Promise<boolean | null> {
  const calls = await getInvokeCalls(page);
  const ctCalls = calls.filter(c => c.cmd === 'set_click_through');
  return ctCalls.length > 0 ? ctCalls[ctCalls.length - 1].args.enabled : null;
}

/** Dismiss the "Press any key to start" ready screen if present. */
async function dismissReadyScreen(page: Page) {
  const overlay = page.locator('#ready-overlay');
  if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Space');
    await expect(overlay).not.toBeVisible({ timeout: 2000 });
  }
}

/** Trigger game over by setting 1 life then killing the player. */
async function triggerGameOver(page: Page) {
  await setLives(page, 1);
  await killPlayer(page);
  // Wait for the game over overlay to actually appear rather than a fixed timeout.
  await expect(page.locator('#gameover-overlay')).toBeVisible({ timeout: 5000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Focus / click-through — Game Over dialog', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriMock(page);
    await page.goto(GAME_URL);
    await waitForGame(page);
    await dismissReadyScreen(page);
  });

  test('game over overlay disables click-through when shown', async ({ page }) => {
    await triggerGameOver(page);
    await expect(page.locator('#gameover-overlay')).toBeVisible();
    const enabled = await lastClickThrough(page);
    expect(enabled).toBe(false);
  });

  test('RESTART button is clickable in game over overlay', async ({ page }) => {
    await triggerGameOver(page);
    // Wait for the 500ms input-guard delay inside showGameOver()
    await page.waitForTimeout(600);
    const restartBtn = page.locator('#gameover-overlay button');
    await expect(restartBtn).toBeVisible();
    await restartBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#gameover-overlay')).not.toBeVisible();
  });

  test('dismissing game over with Space re-enables click-through', async ({ page }) => {
    await triggerGameOver(page);
    await page.waitForTimeout(600); // input-guard delay
    await clearInvokeCalls(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const enabled = await lastClickThrough(page);
    expect(enabled).toBe(true);
  });

  test('dismissing game over with RESTART button re-enables click-through', async ({ page }) => {
    await triggerGameOver(page);
    await page.waitForTimeout(600);
    await clearInvokeCalls(page);
    await page.locator('#gameover-overlay button').click();
    await page.waitForTimeout(300);
    const enabled = await lastClickThrough(page);
    expect(enabled).toBe(true);
  });

  test('game restarts with 3 lives after RESTART button click', async ({ page }) => {
    await triggerGameOver(page);
    await page.waitForTimeout(600);
    await page.locator('#gameover-overlay button').click();
    await page.waitForTimeout(500);
    const livesEl = page.locator('#lives-value');
    await expect(livesEl).toHaveText('3');
  });
});

test.describe('Focus / click-through — Resume paths', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriMock(page);
    await page.goto(GAME_URL);
    await waitForGame(page);
    await dismissReadyScreen(page);
  });

  test('__agentArcadeResumeFromRust re-enables click-through when no overlay is showing', async ({ page }) => {
    await clearInvokeCalls(page);
    await page.evaluate(() => {
      (window as any).__agentArcadeResumeFromRust?.();
    });
    // Wait for the 300ms internal timer + margin
    await page.waitForTimeout(450);
    const enabled = await lastClickThrough(page);
    expect(enabled).toBe(true);
  });

  test('__agentArcadeResumeFromRust keeps click-through OFF when game over is showing', async ({ page }) => {
    await triggerGameOver(page);
    await expect(page.locator('#gameover-overlay')).toBeVisible();
    await clearInvokeCalls(page);
    // Simulate Ctrl+Escape resume while game over is on screen
    await page.evaluate(() => {
      (window as any).__agentArcadeResumeFromRust?.();
    });
    await page.waitForTimeout(450);
    const enabled = await lastClickThrough(page);
    // Game Over overlay still requires interaction — click-through must stay OFF
    expect(enabled).toBe(false);
  });

  test('__agentArcadeOnResume re-disables click-through when game over is showing', async ({ page }) => {
    await triggerGameOver(page);
    await expect(page.locator('#gameover-overlay')).toBeVisible();
    await clearInvokeCalls(page);
    // Simulate Resume-button path (HUD) while game over is on screen
    await page.evaluate(() => {
      (window as any).__agentArcadeOnResume?.();
    });
    await page.waitForTimeout(450);
    const enabled = await lastClickThrough(page);
    // Rust would have set click-through ON, but JS must override it back to OFF
    expect(enabled).toBe(false);
  });

  test('__agentArcadeOnResume re-enables click-through when no overlay', async ({ page }) => {
    await clearInvokeCalls(page);
    await page.evaluate(() => {
      (window as any).__agentArcadeOnResume?.();
    });
    await page.waitForTimeout(450);
    // Both resume paths now always call set_click_through; with no overlay it should be true.
    const enabled = await lastClickThrough(page);
    expect(enabled).toBe(true);
  });
});

test.describe('Focus / click-through — HUD overlays', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriMock(page);
    await page.goto(GAME_URL);
    await waitForGame(page);
    await dismissReadyScreen(page);
  });

  test('help overlay opens and closes without breaking state', async ({ page }) => {
    await expect(page.locator('#help-overlay')).not.toBeVisible();
    await page.locator('#help-btn').click();
    await expect(page.locator('#help-overlay')).toBeVisible();
    await page.locator('#help-close').click();
    await expect(page.locator('#help-overlay')).not.toBeVisible();
  });

  test('settings overlay opens and closes without breaking state', async ({ page }) => {
    await expect(page.locator('#settings-overlay')).not.toBeVisible();
    await page.locator('#settings-btn').click();
    await expect(page.locator('#settings-overlay')).toBeVisible();
    await page.locator('#settings-close').click();
    await expect(page.locator('#settings-overlay')).not.toBeVisible();
  });

  test('update banner is rendered in the DOM', async ({ page }) => {
    // Simulate Rust calling __agentArcadeUpdateAvailable with a version string
    await page.evaluate(() => {
      (window as any).__agentArcadeUpdateAvailable?.('9.9.9');
    });
    await page.waitForTimeout(700); // banner has 500ms fade-in delay
    await expect(page.locator('#update-banner')).toBeVisible();
  });

  test('update banner dismiss button hides the banner', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__agentArcadeUpdateAvailable?.('9.9.9');
    });
    await page.waitForTimeout(700);
    await page.locator('#update-dismiss').click();
    await expect(page.locator('#update-banner')).not.toBeVisible();
  });
});

test.describe('Focus / click-through — Blur handler', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriMock(page);
    await page.goto(GAME_URL);
    await waitForGame(page);
    await dismissReadyScreen(page);
  });

  test('window blur during gameplay calls request_focus', async ({ page }) => {
    await clearInvokeCalls(page);
    // Simulate OS handing focus to another window while the game is running.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(100);
    const calls = await getInvokeCalls(page);
    const focusCalls = calls.filter(c => c.cmd === 'request_focus');
    expect(focusCalls.length).toBeGreaterThan(0);
  });

  test('window blur while paused does NOT call request_focus', async ({ page }) => {
    // Pause the game (add CSS class that the blur guard checks).
    await page.evaluate(() => document.body.classList.add('paused'));
    await clearInvokeCalls(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(100);
    const calls = await getInvokeCalls(page);
    const focusCalls = calls.filter(c => c.cmd === 'request_focus');
    expect(focusCalls.length).toBe(0);
  });
});
