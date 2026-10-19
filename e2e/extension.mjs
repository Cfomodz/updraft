// End-to-end check in real Chromium: loads dist/ as an unpacked extension, serves the hand-written
// feed fixtures at https://www.linkedin.com/feed/ (no real LinkedIn traffic), scrolls, and asserts
// the side panel ranks the captured posts. Run: npm run build && node e2e/extension.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const dist = resolve('dist');
const idAt = (ms) => (BigInt(ms) << 22n).toString();
const now = Date.now();
const fresh = idAt(now - 40 * 60_000);
const rising = idAt(now - 3 * 3_600_000);
const fixture = (name, ids) => {
  let html = readFileSync(`test/fixtures/${name}`, 'utf8');
  for (const [k, v] of Object.entries(ids)) html = html.replaceAll(k, v);
  return html;
};
// Tall spacer so the IntersectionObserver has to see posts scroll into view.
const page = `<!doctype html><html><body><div style="height:1500px">top</div>${fixture('classic-feed.html', { __ID1__: fresh })}<div style="height:1500px"></div>${fixture('sdui-feed.html', { __ID2__: rising })}<div style="height:1500px"></div></body></html>`;

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'updraft-')), {
  executablePath,
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
try {
  let blocked = 0;
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('https://www.linkedin.com/feed')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (url.startsWith('chrome-extension://')) return route.continue();
    blocked++;
    return route.abort();
  });

  let [worker] = ctx.serviceWorkers();
  worker ??= await ctx.waitForEvent('serviceworker');
  const extId = new URL(worker.url()).host;

  const feed = await ctx.newPage();
  await feed.goto('https://www.linkedin.com/feed/');
  for (let y = 0; y <= 6000; y += 400) {
    await feed.mouse.wheel(0, 400);
    await feed.waitForTimeout(120);
  }
  await feed.waitForTimeout(2600); // content script batches every 2 s

  const stored = await worker.evaluate(async () => (await chrome.storage.local.get('posts')).posts ?? {});
  const keys = Object.keys(stored).sort();
  console.log('captured keys:', keys);
  assert.deepEqual(keys, ['ck:expandedFeedType_MAIN_FEED_noid', fresh, rising].sort());
  assert.equal(stored[fresh].snapshots[0].reactions, 1204);
  assert.equal(stored[rising].snapshots[0].comments, 230);

  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await panel.waitForSelector('article.card');
  const authors = await panel.$$eval('article.card .author', (els) => els.map((e) => e.textContent));
  console.log('rising order:', authors);
  assert.ok(authors.includes('Grace Halloway'));
  // 1,204 reactions in 40 min with a light thread beats 1.2K in 3 h with 230 comments already.
  assert.deepEqual(authors.slice(0, 2), ['Priya Raghunath', 'Tom Brackley']);

  // Drafting without a key fails with a readable message and makes no network call.
  await panel.click('article.card:first-child button.primary');
  await panel.waitForSelector('article.card:first-child .error');
  console.log('draft without key:', await panel.textContent('article.card:first-child .error'));

  // Marking as commented moves the post and counts toward the weekly goal.
  await panel.click('article.card:first-child >> text=I commented');
  await panel.waitForFunction(() => document.querySelector('#progress')?.textContent?.startsWith('1/5'));
  await panel.click('button[data-tab="commented"]');
  const commented = await panel.$$eval('article.card .author', (els) => els.map((e) => e.textContent));
  assert.deepEqual(commented, ['Priya Raghunath']);
  await panel.setViewportSize({ width: 380, height: 900 });
  await panel.click('button[data-tab="rising"]');
  await panel.screenshot({ path: 'e2e/sidepanel.png', fullPage: true });

  console.log(`blocked non-fixture requests: ${blocked}`);
  console.log('E2E OK');
} finally {
  await ctx.close();
}
