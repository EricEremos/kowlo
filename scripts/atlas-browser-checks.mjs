import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const engine = process.env.ATLAS_BROWSER === 'webkit' ? webkit : chromium;
const server = spawn('python3', ['-u', '-c', [
  'from runpy import run_path', "globals().update(run_path('scripts/serve-diagnostic.py'))",
  "server = ThreadingHTTPServer(('127.0.0.1', 0), partial(DiagnosticHandler, directory=str(ROOT)))",
  "print('http://127.0.0.1:' + str(server.server_port), flush=True)", 'server.serve_forever()',
].join('\n')], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
let browser;
try {
  const lines = createInterface({ input: server.stdout });
  const [origin] = await Promise.race([
    once(lines, 'line'), once(server, 'exit').then(() => { throw new Error('Server failed'); }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Startup timeout')), 10000).unref()),
  ]);
  browser = await engine.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [], external = [], checks = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { requests.push(request.method()); if (!request.url().startsWith(origin) && !request.url().startsWith('blob:')) external.push(request.url()); });
  const ready = async () => { await page.waitForSelector('body[data-ready="true"]'); await page.evaluate(() => document.fonts.ready); };
  const go = async hash => { await page.goto(`${origin}/app/index.html#${hash}`); await page.reload(); await ready(); };
  await go('atlas');
  assert.equal(await page.locator('.number').innerText(), '00 / 18');
  assert.equal(await page.locator('.mark').count(), 0);
  assert.match(await page.locator('main').innerText(), /automatic phone-library connection is still being built/);
  checks.push('Empty journal has zero districts and zero coloured marks; no false library permission flow.');
  const evidence = `${root}docs/evidence/atlas`;
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/empty-mobile.png`, fullPage: true });
  const ids = await page.evaluate(async () => {
    const { LocalJournal } = await import('/src/journal/local-journal.mjs');
    const journal = new LocalJournal();
    await journal.activate({ kind: 'device', id: localStorage.getItem('hk-diagnostic-device-scope-v1') });
    const positions = [[114.1588,22.2819], [114.1588,22.2819], [114.173,22.298], [0,0]];
    const ids = [];
    for (const [index, [longitude, latitude]] of positions.entries()) {
      const id = crypto.randomUUID(); ids.push(id);
      await journal.putObservation({ id, longitude, latitude,
        captureTime: { status: 'with-offset', local: '2026-09-06T18:30:00', offset: '+08:00' },
        ...(index === 0 ? { palette: { algorithm: 'rgb-histogram-v1', colors: ['#9A6959','#5A717A'] } } : {}) });
    }
    journal.close(); return ids;
  });
  await go('atlas');
  assert.equal(await page.locator('.number').innerText(), '02 / 18');
  assert.equal(await page.locator('[data-cell]').count(), 2);
  assert.match(await page.locator('main').innerText(), /1 location beyond this cropped overview/);
  await page.screenshot({ path: `${evidence}/atlas-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${evidence}/atlas-desktop.png`, fullPage: true });
  checks.push('Four real IndexedDB records produce two distinct districts and two map cells; repeated coordinates do not inflate district totals; outside-viewport memory remains listed.');
  await page.getByRole('navigation').getByRole('link', { name: 'Chapters' }).click();
  await page.getByRole('link', { name: 'Central & Western' }).click();
  await page.waitForFunction(() => document.querySelector('h1').textContent === 'Central & Western');
  assert.match(await page.locator('h1').innerText(), /Central & Western/);
  assert.equal(await page.locator('.memory-list li').count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${evidence}/district-mobile.png`, fullPage: true });
  await page.locator(`a[href="#memory/${ids[0]}"]`).click();
  await page.locator('#memory-note').waitFor();
  assert.match(await page.locator('dl').innerText(), /22.2819, 114.1588/);
  assert.match(await page.locator('dl').innerText(), /2026-09-06T18:30:00 · \+08:00/);
  const note = '<img src=x onerror=alert(1)> A harbour evening.';
  await page.getByLabel('Your name for this memory').fill('My harbour');
  await page.getByLabel('A note to return to').fill(note);
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); });
  assert.equal(await page.getByLabel('A note to return to').inputValue(), note);
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Memory saved'));
  await go(`memory/${ids[0]}`);
  assert.equal(await page.getByLabel('A note to return to').inputValue(), note);
  assert.equal(await page.locator('h1').innerText(), 'My harbour');
  assert.equal(await page.locator('img').count(), 0);
  await page.screenshot({ path: `${evidence}/memory-mobile.png`, fullPage: true });
  checks.push('Atlas → chapters → district → memory navigation works; original coordinates and timezone survive; authored label and literal HTML note persist after reload.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Remove saved location' }).click();
  assert.equal(await page.locator('h1').innerText(), 'My harbour');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove saved location' }).click();
  await page.waitForFunction(() => location.hash === '#you');
  await page.waitForFunction(() => document.querySelector('h1').textContent === 'Yours to keep.');
  assert.match(await page.locator('main').innerText(), /Notes you kept/);
  assert.match(await page.locator('.note').innerText(), /<img src=x onerror=alert\(1\)>/);
  const event = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export your local journal' }).click();
  const download = await event;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.observations.length, 3);
  assert.equal(exported.journalEntries[0].observationId, null);
  assert.equal(exported.journalEntries[0].note, note);
  await go('atlas');
  assert.equal(await page.locator('.number').innerText(), '02 / 18');
  assert.equal(await page.locator('.mark[stroke="#9A6959"]').count(), 0);
  checks.push('Cancel preserves memory; confirmed deletion removes its colours while preserving the remaining district and detached note; downloaded export reflects current saved data.');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const reference = await page.evaluate(async () => {
    const cache = await caches.open('kowlo-atlas-shell-v2');
    const response = await cache.match('/data/reference/hk-districts.geojson');
    const body = await response.text();
    await cache.put('/data/reference/hk-districts.geojson', new Response('{}'));
    return body;
  });
  await go('atlas');
  assert.equal(await page.locator('.number').innerText(), '— / 18');
  await page.getByRole('link', { name: /3 locations without a district chapter/ }).click();
  await page.locator('.memory-list').waitFor();
  assert.equal(await page.locator('.memory-list li').count(), 3);
  checks.push('Corrupted offline reference fails the hash check and suppresses unverified district achievements without hiding any saved record.');
  await page.evaluate(async body => {
    const cache = await caches.open('kowlo-atlas-shell-v2');
    await cache.put('/data/reference/hk-districts.geojson', new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  }, reference);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['atlas','chapters',`memory/${ids[1]}`,'you','unassigned']) {
      await go(route);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${route} overflow at ${width}`);
      assert.equal(await page.locator('h1').count(), 1);
    }
  }
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip to your atlas');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  assert.equal(await page.evaluate(() => location.hash), '#unassigned');
  checks.push('All five route types fit 320/390/768/1440px viewports; keyboard skip link moves focus into the main content.');
  assert.equal((await page.request.get(`${origin}/.git/config`)).status(), 404);
  assert.equal((await page.request.get(`${origin}/docs/FULL_PROJECT_PROMPT.md`)).status(), 404);
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert(requests.every(method => method === 'GET'));
  checks.push('No browser errors, external requests or non-GET requests; repository/configuration remain outside the local static allowlist.');
  const result = { browser: process.env.ATLAS_BROWSER ?? 'chromium', result: 'PASS', checks, errors, externalRequests: external, screenshots: ['empty-mobile','atlas-mobile','atlas-desktop','district-mobile','memory-mobile'].map(name => `${name}.png`), data: 'Synthetic records in an isolated temporary browser. No personal photo library accessed.' };
  await writeFile(`${evidence}/${result.browser}-checks.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
}
