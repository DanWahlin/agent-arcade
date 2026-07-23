/**
 * End-user flow tests: mute/unmute, pause/resume via HUD buttons, settings
 * changes, cursor-tracker recovery after resume, and a full user journey.
 *
 * Approach mirrors focus-clickthrough.spec.ts: inject a mock
 * __TAURI_INTERNALS__ before hud.js loads so the Tauri bridge activates and
 * records invoke() calls. Rust-originated callbacks (window resize → resume
 * eval) are simulated by calling the __agentArcade* hooks directly, exactly
 * as the real Rust side does via win.eval().
 *
 * The mock's get_cursor_in_window returns window.__mockCursor, letting tests
 * steer the HUD hover-polling loop deterministically.
 */
import { test, expect, Page } from '@playwright/test';
import { GAME_URL, waitForGame } from './helpers';

async function setupTauriMock(page: Page) {
  await page.addInitScript(() => {
    const calls: { cmd: string; args: any }[] = [];
    (window as any).__tauriMockCalls = calls;
    (window as any).__mockCursor = null;
    (window as any).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: any) => {
        calls.push({ cmd, args: args ?? {} });
        if (cmd === 'get_cursor_in_window') {
          return Promise.resolve((window as any).__mockCursor);
        }
        return Promise.resolve(null);
      },
    };
  });
}

async function getInvokeCalls(page: Page): Promise<{ cmd: string; args: any }[]> {
  return page.evaluate(() => (window as any).__tauriMockCalls ?? []);
}

async function clearInvokeCalls(page: Page) {
  await page.evaluate(() => { (window as any).__tauriMockCalls.length = 0; });
}

/** Point the mocked cursor at the center of the HUD bar (or off it). */
async function setMockCursorOverHud(page: Page, over: boolean) {
  await page.evaluate((isOver) => {
    if (!isOver) { (window as any).__mockCursor = null; return; }
    const r = document.getElementById('hud')!.getBoundingClientRect();
    (window as any).__mockCursor = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
  }, over);
}

/** Wait until a set_click_through call with the given value is recorded. */
async function waitForClickThrough(page: Page, enabled: boolean) {
  await page.waitForFunction(
    (want) => ((window as any).__tauriMockCalls ?? [])
      .some((c: any) => c.cmd === 'set_click_through' && c.args.enabled === want),
    enabled,
    { timeout: 3000, polling: 100 },
  );
}

/** Pause the way the in-page UI does, resume the way the Resume button does. */
async function pauseViaHud(page: Page) {
  await page.evaluate(() => {
    // In-page pause path (scene pause + set_paused invoke)...
    (window as any).__agentArcadePause(true);
    // ...plus the callback the real Rust set_paused handler evals in the
    // webview, which applies the paused CSS state.
    (window as any).__agentArcadeOnPause();
  });
  await expect(page.locator('body')).toHaveClass(/paused/);
}

async function resumeViaHudButton(page: Page) {
  await page.click('#resume-btn');
  // The real Rust set_paused(false) handler evals __agentArcadeOnResume;
  // simulate that callback here.
  await page.evaluate(() => (window as any).__agentArcadeOnResume());
  await expect(page.locator('body')).not.toHaveClass(/paused/);
}

test.beforeEach(async ({ page }) => {
  await setupTauriMock(page);
  await page.goto(GAME_URL);
  await waitForGame(page);
});

test.describe('User flows — mute/unmute', () => {
  test('mute button silences audio, updates UI, and persists', async ({ page }) => {
    await page.click('#mute-btn');
    await expect(page.locator('#mute-btn')).toHaveText('🔇');
    await expect(page.locator('#mute-btn')).toHaveClass(/muted/);
    const state = await page.evaluate(() => ({
      gain: (window as any).__phaserGame?.sound?.masterMuteNode?.gain?.value ?? null,
      stored: localStorage.getItem('agentArcade_muted'),
      audioToggle: (document.getElementById('audio-toggle') as HTMLInputElement)?.checked,
    }));
    if (state.gain !== null) expect(state.gain).toBe(0);
    expect(state.stored).toBe('1');
    expect(state.audioToggle).toBe(false);
  });

  test('unmute restores audio and UI state', async ({ page }) => {
    await page.click('#mute-btn');
    await page.click('#mute-btn');
    await expect(page.locator('#mute-btn')).toHaveText('🔊');
    const state = await page.evaluate(() => ({
      gain: (window as any).__phaserGame?.sound?.masterMuteNode?.gain?.value ?? null,
      stored: localStorage.getItem('agentArcade_muted'),
    }));
    if (state.gain !== null) expect(state.gain).toBe(1);
    expect(state.stored).toBe('0');
  });

  test('mute state survives a game switch', async ({ page }) => {
    await page.click('#mute-btn');
    await page.selectOption('#game-select', { index: 1 });
    await page.waitForTimeout(2500);
    await expect(page.locator('#mute-btn')).toHaveText('🔇');
    expect(await page.evaluate(() => localStorage.getItem('agentArcade_muted'))).toBe('1');
  });
});

test.describe('User flows — pause/resume via HUD', () => {
  test('pausing notifies Rust, shows Resume button, and pauses the scene', async ({ page }) => {
    await clearInvokeCalls(page);
    await pauseViaHud(page);
    const calls = await getInvokeCalls(page);
    expect(calls.some(c => c.cmd === 'set_paused' && c.args.paused === true)).toBe(true);
    await expect(page.locator('#resume-btn')).toBeVisible();
  });

  test('Resume button notifies Rust and restores play state', async ({ page }) => {
    await pauseViaHud(page);
    await clearInvokeCalls(page);
    await resumeViaHudButton(page);
    const calls = await getInvokeCalls(page);
    expect(calls.some(c => c.cmd === 'set_paused' && c.args.paused === false)).toBe(true);
    await expect(page.locator('#resume-btn')).not.toBeVisible();
  });
});

test.describe('User flows — HUD stays clickable after resume (tracker regression)', () => {
  test('hover detection still works after pausing and resuming with cursor over HUD', async ({ page }) => {
    // 1. Cursor over HUD during play → tracker enters event mode (click-through OFF).
    await setMockCursorOverHud(page, true);
    await waitForClickThrough(page, false);

    // 2. Pause with the cursor still over the HUD (the Resume-button scenario).
    await pauseViaHud(page);

    // 3. Resume via the HUD button. Pre-fix, the tracker was stranded here:
    //    isOverHud stuck true with polling stopped and no mousemove events.
    await resumeViaHudButton(page);
    // restoreAfterResume runs on a 300ms delay inside onResume.
    await page.waitForTimeout(400);

    // 4. With the cursor still over the HUD, the poller must re-detect it and
    //    disable click-through again. This times out on the pre-fix code.
    await clearInvokeCalls(page);
    await waitForClickThrough(page, false);
  });
});

test.describe('User flows — settings', () => {
  test('settings opens, transparency change applies and persists, settings closes', async ({ page }) => {
    await page.click('#settings-btn');
    await expect(page.locator('#settings-overlay')).toHaveClass(/show/);

    await page.locator('#bg-transparency').fill('60');
    await expect(page.locator('#bg-transparency-value')).toHaveText(/60/);
    expect(await page.evaluate(() => localStorage.getItem('agentArcade_bgTransparency'))).toBe('60');

    await page.click('#settings-close');
    await expect(page.locator('#settings-overlay')).not.toHaveClass(/show/);
  });

  test('audio toggle in settings mirrors the mute button', async ({ page }) => {
    await page.click('#settings-btn');
    // The checkbox input is visually hidden behind a styled switch, so drive
    // it directly instead of relying on Playwright actionability checks.
    await page.evaluate(() => {
      const t = document.getElementById('audio-toggle') as HTMLInputElement;
      t.checked = false;
      t.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('#settings-close');
    await expect(page.locator('#mute-btn')).toHaveText('🔇');
  });
});

test.describe('User flows — full user journey', () => {
  test('switch games, mute, pause, resume, unmute across games', async ({ page }) => {
    const select = page.locator('#game-select');
    const optionCount = await select.locator('option').count();
    expect(optionCount).toBe(5);

    await page.click('#mute-btn');

    for (const index of [1, 2]) {
      await select.selectOption({ index });
      await page.waitForTimeout(2500);
      expect(await page.evaluate(() => !!(window as any).__phaserGame)).toBe(true);

      await pauseViaHud(page);
      await resumeViaHudButton(page);
      await expect(page.locator('#mute-btn')).toHaveText('🔇');
    }

    await page.click('#mute-btn');
    await expect(page.locator('#mute-btn')).toHaveText('🔊');
  });
});
