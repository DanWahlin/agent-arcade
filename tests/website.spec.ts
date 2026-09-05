import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const SITE_URL = 'http://localhost:4173/site/';
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

async function loadWebsite(page: Page, failFirst = false) {
  const requests: string[] = [];
  await page.clock.install();
  await page.addInitScript(() => {
    const active = new Set<string>();
    (window as any).__activeGifUrls = active;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = create(blob);
      active.add(url);
      return url;
    };
    URL.revokeObjectURL = url => { active.delete(url); revoke(url); };
  });
  await page.route('https://**', route => route.abort());
  await page.route(`${SITE_URL}**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('.gif')) {
      requests.push(url.href);
      await route.fulfill({
        status: failFirst && requests.length === 1 ? 503 : 200,
        contentType: 'image/gif',
        body: GIF,
      });
    } else {
      const relative = url.pathname.slice('/site/'.length) || 'index.html';
      await route.fulfill({ path: resolve('docs', relative) });
    }
  });
  await page.goto(SITE_URL);
  await page.clock.runFor(400);
  return requests;
}

test('website reuses GIF downloads and releases playback URLs', async ({ page }) => {
  const requests = await loadWebsite(page);
  const display = page.locator('#gif-display');
  await expect(display).toHaveClass(/visible/);
  const firstUrl = await display.getAttribute('src');
  await page.locator('.gif-dot').nth(1).dispatchEvent('click');
  await page.clock.runFor(400);
  await expect(display).toHaveClass(/visible/);
  await page.locator('.gif-dot').nth(0).dispatchEvent('click');
  await page.clock.runFor(400);
  await expect(display).toHaveClass(/visible/);
  expect(await display.getAttribute('src')).not.toBe(firstUrl);
  expect(requests).toHaveLength(2);
  expect(requests.every(url => !url.includes('?'))).toBe(true);

  await display.dispatchEvent('click');
  await expect(page.locator('#lightbox')).toHaveClass(/open/);
  await expect.poll(() => page.evaluate(() =>
    (document.getElementById('lightbox-img') as HTMLImageElement).naturalWidth)).toBe(1);
  expect(requests).toHaveLength(2);
  await page.locator('.lightbox-close').dispatchEvent('click');
  await page.clock.runFor(400);
  await expect(display).toHaveClass(/visible/);
  expect(await page.evaluate(() => (window as any).__activeGifUrls.size)).toBe(1);
});

test('website cancels old GIF retries when a new game is selected', async ({ page }) => {
  const requests = await loadWebsite(page, true);
  await expect.poll(() => requests.length).toBe(1);
  await page.locator('.gif-dot').nth(1).dispatchEvent('click');
  await page.clock.runFor(400);
  await expect(page.locator('#gif-display')).toHaveClass(/visible/);
  const selectedLabel = await page.locator('#gif-label').textContent();
  await page.clock.runFor(1500);
  await expect(page.locator('#gif-label')).toHaveText(selectedLabel!);
  await expect(page.locator('.gif-dot').nth(1)).toHaveClass(/active/);
  expect(requests).toHaveLength(2);
});

test('website waits for a loaded GIF before starting its playback timer', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requests = await loadWebsite(page);
  await expect(page.locator('#gif-display')).toHaveClass(/visible/);
  // Register last so the delayed response overrides the normal fixture route.
  await page.route(`${SITE_URL}images/*.gif`, async route => {
    await gate;
    await route.fulfill({ contentType: 'image/gif', body: GIF });
  });
  await page.locator('.gif-dot').nth(1).dispatchEvent('click');
  await page.clock.runFor(400);
  const label = await page.locator('#gif-label').textContent();
  await page.clock.runFor(20000);
  await expect(page.locator('#gif-label')).toHaveText(label!);
  release();
  await expect(page.locator('#gif-display')).toHaveClass(/visible/);
  expect(requests).toHaveLength(1);
});
