import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const temporary = await mkdtemp(`${tmpdir()}/kowlo-offline-`);
const mode = `${temporary}/mode`;
await writeFile(mode, 'normal');
const server = spawn('python3', ['-u', '-c', [
  'from runpy import run_path', 'import sys', "globals().update(run_path('scripts/serve-diagnostic.py'))",
  'mode = Path(sys.argv[1])',
  'class TestHandler(DiagnosticHandler):',
  ' def do_GET(self):',
  '  state = mode.read_text()',
  "  if state == 'fail' and self.path == '/app/fonts/newsreader.ttf':",
  "   self.send_error(503); return",
  "  if state == 'update' and self.path == '/app/offline-worker.mjs':",
  "   body = (ROOT / 'app/offline-worker.mjs').read_text().replace('v1', 'v2').encode()",
  "   self.send_response(200); self.send_header('Content-Type', 'text/javascript'); self.end_headers(); self.wfile.write(body); return",
  '  super().do_GET()',
  "server = ThreadingHTTPServer(('127.0.0.1', 0), partial(TestHandler, directory=str(ROOT)))",
  "print('http://127.0.0.1:' + str(server.server_port), flush=True)", 'server.serve_forever()',
].join('\n'), mode], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
let browser;
const stopServer = async () => {
  if (server.exitCode === null && server.signalCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
};
try {
  const lines = createInterface({ input: server.stdout });
  const [origin] = await Promise.race([
    once(lines, 'line'), once(server, 'exit').then(() => { throw new Error('Server failed'); }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Startup timeout')), 10000).unref()),
  ]);
  browser = await chromium.launch({ headless: true });
  const checks = [];
  const failed = await browser.newContext();
  const failurePage = await failed.newPage();
  await writeFile(mode, 'fail');
  await failurePage.goto(`${origin}/app/index.html`);
  await failurePage.waitForFunction(() => /did not finish|unavailable/.test(document.querySelector('#offline-status').textContent));
  assert.equal(await failurePage.evaluate(() => navigator.serviceWorker.controller), null);
  assert.deepEqual(await failurePage.evaluate(() => caches.keys()), []);
  assert.equal(await failurePage.locator('.number').innerText(), '00 / 18');
  checks.push('Failed asset preparation leaves no partial cache or false ready state; the online journal still opens.');
  await failed.close();
  await writeFile(mode, 'normal');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let page = await context.newPage();
  const errors = [];
  const observe = page => page.on('pageerror', error => errors.push(error.message));
  observe(page);
  const ready = async () => {
    await page.waitForSelector('body[data-ready="true"]');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.evaluate(() => document.fonts.ready);
  };
  await page.goto(`${origin}/app/index.html#atlas`); await ready();
  await page.waitForFunction(() => document.querySelector('#offline-status').textContent.includes('Ready offline'));
  const cachePaths = await page.evaluate(async () => {
    const cache = await caches.open('kowlo-atlas-shell-v1');
    return (await cache.keys()).map(request => new URL(request.url).pathname).sort();
  });
  assert.equal(cachePaths.length, 14);
  assert(cachePaths.includes('/app/fonts/newsreader.ttf') && cachePaths.includes('/data/reference/hk-districts.geojson'));
  const id = await page.evaluate(async () => {
    const { LocalJournal } = await import('/src/journal/local-journal.mjs');
    const journal = new LocalJournal();
    await journal.activate({ kind: 'device', id: localStorage.getItem('hk-diagnostic-device-scope-v1') });
    const id = crypto.randomUUID();
    await journal.putObservation({ id, longitude: 114.1588, latitude: 22.2819, palette: { algorithm: 'rgb-histogram-v1', colors: ['#9A6959'] } });
    journal.close(); return id;
  });
  await page.goto(`${origin}/app/index.html#memory/${id}`);
  await page.getByLabel('A note to return to').fill('A draft kept through the update.');
  await page.evaluate(async () => { const cache = await caches.open('hk-photo-diagnostic-shell-sentinel'); await cache.put('/sentinel', new Response('separate scope')); });
  await writeFile(mode, 'update');
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
  await page.waitForFunction(() => document.querySelector('#offline-status').textContent.includes('Save any edits'));
  assert.match(await page.locator('#offline-status').innerText(), /Save any edits/);
  assert.equal(await page.getByLabel('A note to return to').inputValue(), 'A draft kept through the update.');
  assert(await page.evaluate(async () => (await caches.keys()).includes('kowlo-atlas-shell-v1')));
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Memory saved'));
  checks.push('An update waits while the atlas is open, preserves an unsaved note, and asks the user to save before closing tabs.');
  await page.close();
  page = await context.newPage(); observe(page);
  await page.goto(`${origin}/app/index.html#atlas`); await ready();
  await page.waitForFunction(async () => !(await caches.keys()).includes('kowlo-atlas-shell-v1'));
  assert.deepEqual((await page.evaluate(() => caches.keys())).sort(), ['hk-photo-diagnostic-shell-sentinel', 'kowlo-atlas-shell-v2']);
  assert.equal(await page.locator('.number').innerText(), '01 / 18');
  checks.push('After all atlas tabs close, the update activates and removes only its obsolete cache; saved journal and diagnostic cache survive.');
  await stopServer();
  assert(server.exitCode !== null || server.signalCode !== null);
  await context.setOffline(true);
  await page.reload(); await ready();
  assert.equal(await page.locator('.number').innerText(), '01 / 18');
  assert.equal(await page.locator('.mark[stroke="#9A6959"]').count(), 1);
  await page.waitForFunction(() => document.querySelector('#offline-status').textContent.includes('Ready offline'));
  assert.match(await page.locator('#offline-status').innerText(), /Ready offline/);
  const evidence = `${root}docs/evidence/atlas`;
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/offline-mobile.png`, fullPage: true });
  await page.getByRole('navigation').getByRole('link', { name: 'Chapters' }).click();
  await page.getByRole('link', { name: 'Central & Western' }).click();
  await page.locator(`a[href="#memory/${id}"]`).click();
  assert.equal(await page.getByLabel('A note to return to').inputValue(), 'A draft kept through the update.');
  await page.getByLabel('A note to return to').fill('Written without a connection.');
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Memory saved'));
  await page.reload(); await ready();
  assert.equal(await page.getByLabel('A note to return to').inputValue(), 'Written without a connection.');
  assert.match(await page.locator('dl').innerText(), /22.2819, 114.1588/);
  checks.push('With the server confirmed stopped, a full reload restores the coloured atlas, district, fonts and original GPS; offline note edits survive reload.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Remove saved location' }).click();
  await page.reload(); await ready();
  await page.getByLabel('A note to return to').waitFor();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove saved location' }).click();
  await page.waitForFunction(() => document.querySelector('h1').textContent === 'Yours to keep.');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export your local journal' }).click();
  const downloaded = await downloadEvent;
  const exported = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
  assert.equal(exported.observations.length, 0);
  assert.equal(exported.journalEntries[0].note, 'Written without a connection.');
  assert.equal(exported.journalEntries[0].observationId, null);
  await page.getByRole('navigation').getByRole('link', { name: 'Atlas', exact: true }).click();
  await page.reload(); await ready();
  assert.equal(await page.locator('.number').innerText(), '00 / 18');
  assert.equal(await page.locator('.mark').count(), 0);
  checks.push('Offline deletion cancellation preserves the memory; confirmation removes its mark and district after reload. Actual JSON download retains the detached note.');
  const forbidden = await page.evaluate(async () => {
    const results = [];
    for (const [url, options] of [
      ['/app/index.html?private=1', {}], ['/api/private', {}],
      ['/app/index.html', { method: 'POST', body: 'private' }],
      ['/app/index.html', { headers: { Authorization: 'Bearer synthetic-test' } }],
    ]) { try { await fetch(url, options); results.push('served'); } catch { results.push('unavailable'); } }
    return results;
  });
  assert.deepEqual(forbidden, Array(4).fill('unavailable'));
  const retained = await page.evaluate(async () => (await (await caches.open('kowlo-atlas-shell-v2')).keys()).map(request => new URL(request.url).pathname).sort());
  assert.deepEqual(retained, cachePaths);
  assert.deepEqual(errors, []);
  checks.push('Cache remains exactly 14 static resources. Queries, private endpoints, POST and authenticated requests are not served from the cache. No page errors.');
  const report = { result: 'PASS', browser: 'Chromium', checks, cachePaths, serverStopped: server.exitCode !== null || server.signalCode !== null, errors, data: 'Synthetic isolated browser records; no personal photos accessed.' };
  await writeFile(`${evidence}/offline-checks.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close(); await stopServer();
  await rm(temporary, { recursive: true, force: true });
}
