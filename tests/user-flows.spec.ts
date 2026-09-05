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
    let shortcuts = { toggle: 'Ctrl+Alt+M', pause: 'Escape', unpause: 'Ctrl+Escape' };
    (window as any).__mockShortcuts = shortcuts;
    (window as any).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: any) => {
        calls.push({ cmd, args: args ?? {} });
        if (cmd === 'get_cursor_in_window') {
          return Promise.resolve((window as any).__mockCursor);
        }
        if (cmd === 'restore_shortcuts') {
          const values = Object.values(args.shortcuts);
          if (new Set(values).size !== 3) return Promise.reject(new Error('Duplicate shortcuts'));
          shortcuts = { ...args.shortcuts };
          (window as any).__mockShortcuts = shortcuts;
          return Promise.resolve(shortcuts);
        }
        const getters: Record<string, keyof typeof shortcuts> = {
          get_toggle_shortcut: 'toggle', get_pause_shortcut: 'pause', get_unpause_shortcut: 'unpause',
        };
        if (getters[cmd]) return Promise.resolve(shortcuts[getters[cmd]]);
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
    if (!isOver) {
      (window as any).__mockCursor = null;
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 1,
        clientY: window.innerHeight - 1,
      }));
      return;
    }
    const r = document.getElementById('hud')!.getBoundingClientRect();
    const x = (r.left + r.right) / 2;
    const y = (r.top + r.bottom) / 2;
    (window as any).__mockCursor = [x, y];
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
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

test.describe('User flows — startup shortcut restore', () => {
  test('restores swapped pause and resume bindings through one transaction', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('agentArcade_pauseKey', 'Ctrl+Escape');
      localStorage.setItem('agentArcade_unpauseKey', 'Escape');
    });
    await page.reload();
    await expect.poll(async () => (await getInvokeCalls(page)).filter(c => c.cmd === 'restore_shortcuts').length)
      .toBe(1);
    const calls = await getInvokeCalls(page);
    expect(calls.find(c => c.cmd === 'restore_shortcuts')?.args).toEqual({
      shortcuts: { toggle: 'Ctrl+Alt+M', pause: 'Ctrl+Escape', unpause: 'Escape' },
    });
    expect(calls.filter(c => /^set_(toggle|pause|unpause)_shortcut$/.test(c.cmd))).toEqual([]);
    expect(await page.evaluate(() => (window as any).__mockShortcuts)).toEqual({
      toggle: 'Ctrl+Alt+M', pause: 'Ctrl+Escape', unpause: 'Escape',
    });
    await expect(page.locator('#pause-hotkey-display')).toHaveValue('Ctrl+Escape');
    await expect(page.locator('#unpause-hotkey-display')).toHaveValue('Escape');
    await expect(page.locator('#pause-hotkey-status')).toHaveText('');
  });

  test('rejected duplicate startup bindings report failure and retain active defaults', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('agentArcade_pauseKey', 'Ctrl+Escape');
      localStorage.setItem('agentArcade_unpauseKey', 'Ctrl+Escape');
    });
    await page.reload();
    await expect(page.locator('#pause-hotkey-status')).toHaveText('Saved shortcuts unavailable');
    await expect(page.locator('#pause-hotkey-display')).toHaveValue('Escape');
    await expect(page.locator('#unpause-hotkey-display')).toHaveValue('Ctrl+Escape');
    expect(await page.evaluate(() => (window as any).__mockShortcuts)).toEqual({
      toggle: 'Ctrl+Alt+M', pause: 'Escape', unpause: 'Ctrl+Escape',
    });
    expect(await page.evaluate(() => localStorage.getItem('agentArcade_pauseKey'))).toBe('Ctrl+Escape');
    await expect(page.locator('#help-pause-keys')).toHaveText('Esc');
  });
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
  test('hover detection still works after pausing and resuming with cursor over HUD', async ({ page }, testInfo) => {
    // 1. Cursor over HUD during play → tracker enters event mode (click-through OFF).
    await setMockCursorOverHud(page, true);
    await waitForClickThrough(page, false);

    // 2. Pause with the cursor still over the HUD (the Resume-button scenario).
    await pauseViaHud(page);

    // 3. Resume via the HUD button. Pre-fix, the tracker was stranded here:
    //    isOverHud stuck true with polling stopped and no mousemove events.
    await resumeViaHudButton(page);

    await clearInvokeCalls(page);
    if (testInfo.project.name === 'linux') {
      // Linux resets to event tracking after the delayed resume restoration.
      await page.waitForTimeout(400);
      await setMockCursorOverHud(page, true);
    }
    // Other platforms retain the mocked cursor position and poll after reset.
    await waitForClickThrough(page, false);
  });
});

test.describe('User flows — settings', () => {
  for (const overlay of ['help', 'settings']) {
    test(`repeated ${overlay} activation still resumes the scene on close`, async ({ page }) => {
      await page.click(`#${overlay}-btn`);
      await expect.poll(() => page.evaluate(() =>
        (window as any).__phaserGame.scene.isPaused('ninja-runner'))).toBe(true);
      await page.keyboard.press('Enter');
      await page.click(`#${overlay}-close`);
      await expect.poll(() => page.evaluate(() =>
        (window as any).__phaserGame.scene.isActive('ninja-runner'))).toBe(true);
    });
  }

  test('zero background opacity survives reload', async ({ page }) => {
    await page.click('#settings-btn');
    await page.locator('#bg-transparency').fill('0');
    await page.reload();
    await waitForGame(page);
    await page.click('#settings-btn');
    await expect(page.locator('#bg-transparency')).toHaveValue('0');
    await expect(page.locator('#bg-transparency-value')).toHaveText('0%');
    expect(await page.evaluate(() =>
      (window as any).__phaserGame.scene.getScene('ninja-runner')._backdrop.alpha)).toBeCloseTo(0.01);
  });

  test('a rejected hotkey keeps the saved value and help text', async ({ page }) => {
    await page.evaluate(() => {
      const ti = (window as any).__TAURI_INTERNALS__;
      const invoke = ti.invoke;
      ti.invoke = (cmd: string, args?: any) =>
        cmd === 'set_toggle_shortcut' ? Promise.reject(new Error('Shortcut taken')) : invoke(cmd, args);
    });
    await page.click('#settings-btn');
    await page.click('#hotkey-record-btn');
    await page.keyboard.press('Control+Alt+K');
    await expect(page.locator('#hotkey-status')).toHaveText('Taken!');
    await expect(page.locator('#hotkey-display')).toHaveValue('Ctrl+Alt+M');
    await page.click('#hotkey-record-btn');
    await page.click('#hotkey-record-btn');
    await expect(page.locator('#hotkey-display')).toHaveValue('Ctrl+Alt+M');
    expect(await page.locator('#help-toggle-keys kbd').allTextContents()).toEqual(['⌃', '⌥', 'M']);
    expect(await page.evaluate(() => localStorage.getItem('agentArcade_hotkey'))).toBeNull();
  });

  test('closing settings stops hotkey recording and Escape does not pause the game', async ({ page }) => {
    await page.click('#settings-btn');
    await page.click('#hotkey-record-btn');
    await page.click('#settings-close');
    await page.keyboard.press('Control+Alt+K');
    expect(await page.evaluate(() => localStorage.getItem('agentArcade_hotkey'))).toBeNull();
    await page.click('#settings-btn');
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-overlay')).not.toHaveClass(/show/);
    await expect(page.locator('body')).not.toHaveClass(/paused/);
    await expect.poll(() => page.evaluate(() =>
      (window as any).__phaserGame.scene.isActive('ninja-runner'))).toBe(true);
  });

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
    expect(optionCount).toBe(6);

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
