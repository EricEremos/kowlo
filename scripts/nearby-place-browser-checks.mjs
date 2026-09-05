import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPlaceCatalog } from '../src/geography/place-catalog.mjs';
import { createNearbyPlaceFinder } from '../src/geography/nearby-places.mjs';
import { createDistrictClassifier } from '../experiments/photo-import/districts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = spawn('python3', ['-u', '-c', [
  'from runpy import run_path', "globals().update(run_path('scripts/serve-diagnostic.py'))",
  "server = ThreadingHTTPServer(('127.0.0.1', 0), partial(DiagnosticHandler, directory=str(ROOT)))",
  "print('http://127.0.0.1:' + str(server.server_port), flush=True)",
  'server.serve_forever()',
].join('\n')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErrors = '';
server.stderr.on('data', chunk => { serverErrors = (serverErrors + chunk).slice(-2000); });
const stopServer = async () => {
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
  }
};
let browser;
try {
  const lines = createInterface({ input: server.stdout });
  const [origin] = await Promise.race([
    once(lines, 'line'),
    once(server, 'exit').then(([code]) => { throw new Error(`Server exited: ${code}: ${serverErrors}`); }),
    new Promise((_, reject) => { setTimeout(() => reject(new Error('Server startup timed out')), 10000).unref(); }),
  ]);
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  const externalRequests = [];
  const nonGetRequests = [];
  const watch = page => {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
      if (request.method() !== 'GET') nonGetRequests.push(request.method());
    });
  };
  const url = `${origin}/experiments/photo-import/index.html`;
  const fixture = name => `${root}experiments/photo-import/fixtures/${name}`;
  const results = page => page.locator('#results pre').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent)));
  const waitForImport = page => page.waitForFunction(() => /inspected locally|fixture checks passed/.test(document.getElementById('status').textContent));
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  watch(page);
  await page.goto(url);
  const workerResponse = await page.request.get(`${origin}/experiments/photo-import/worker.mjs`);
  assert.match(workerResponse.headers()['content-security-policy'], /connect-src 'none'/);
  await page.locator('#fixtures').click();
  await waitForImport(page);
  assert.match(await page.locator('#status').innerText(), /^10\/10/);
  const imported = await results(page);
  const accepted = imported.filter(result => result.status === 'accepted');
  assert.equal(accepted.length, 5);
  assert.equal(accepted.filter(result => result.locality.status === 'suggestions').length, 4);
  assert.equal(accepted.filter(result => result.locality.status === 'outside-dataset').length, 1);
  assert.match(await page.locator('#milestones').innerText(), /^1 \/ 18/);
  assert.ok(accepted[0].locality.source.pointsSha256);
  assert.equal(accepted[0].locality.candidates[0].confirmed, false);
  assert.equal(typeof accepted[0].locality.candidates[0].distanceMetres, 'number');
  await page.locator('#files').setInputFiles(fixture('gps-dated.heic'));
  await waitForImport(page);
  assert.equal((await results(page))[0].locality.status, 'suggestions');

  const coordinates = [[114.154, 22.281], [114.2, 22.38], [113.9439, 22.288], [114.028, 22.208], [114.17, 22.29], [114.4, 22.08]];
  const radii = [250, 500, 1000, 2000];
  const benchmark = await page.evaluate(async ({ coordinates, radii }) => {
    const { createPlaceCatalog } = await import('/src/geography/place-catalog.mjs');
    const { createNearbyPlaceFinder } = await import('/src/geography/nearby-places.mjs');
    const { createDistrictClassifier } = await import('/experiments/photo-import/districts.mjs');
    const bytes = await Promise.all(['hk-place-points.geojson', 'hk-place-names.json'].map(async name => (await fetch(`/data/reference/${name}`)).arrayBuffer()));
    const catalog = await createPlaceCatalog(...bytes);
    const classify = createDistrictClassifier(await (await fetch('/data/reference/hk-districts.geojson')).json());
    return radii.map(radiusMetres => ({ radiusMetres, results: coordinates.map(coordinate => createNearbyPlaceFinder(catalog, classify, { radiusMetres })(...coordinate)) }));
  }, { coordinates, radii });
  const catalog = await createPlaceCatalog(await readFile(`${root}data/reference/hk-place-points.geojson`), await readFile(`${root}data/reference/hk-place-names.json`));
  const classify = createDistrictClassifier(JSON.parse(await readFile(`${root}data/reference/hk-districts.geojson`)));
  assert.deepEqual(benchmark, radii.map(radiusMetres => ({ radiusMetres, results: coordinates.map(coordinate => createNearbyPlaceFinder(catalog, classify, { radiusMetres })(...coordinate)) })));
  const screenshots = [];
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#results-heading').scrollIntoViewIfNeeded();
    const path = `docs/evidence/nearby-places-${name}.png`;
    await page.screenshot({ path: `${root}${path}` });
    screenshots.push(path);
  }
  await context.close();

  const fallbacks = [];
  for (const failure of ['missing', 'corrupt']) {
    const isolated = await browser.newContext({ serviceWorkers: 'block' });
    await isolated.route('**/data/reference/hk-place-names.json', route => route.fulfill({
      status: failure === 'missing' ? 404 : 200,
      contentType: 'application/json', body: '{}',
    }));
    const fallbackPage = await isolated.newPage();
    watch(fallbackPage);
    await fallbackPage.goto(url);
    await fallbackPage.locator('#files').setInputFiles(fixture('gps-dated.jpg'));
    await waitForImport(fallbackPage);
    const [result] = await results(fallbackPage);
    assert.equal(result.status, 'accepted');
    assert.equal(result.district.milestoneDistrictId, 'A');
    assert.deepEqual(result.locality, { status: 'reference-unavailable', candidates: [] });
    fallbacks.push({ failure, status: result.status, locality: result.locality.status, district: result.district.milestoneDistrictId });
    await isolated.close();
  }

  const offlineContext = await browser.newContext();
  const offlinePage = await offlineContext.newPage();
  watch(offlinePage);
  await offlinePage.goto(url);
  await offlinePage.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cached = await offlinePage.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open('hk-photo-diagnostic-shell-v10');
    return { keys, assets: (await cache.keys()).map(request => new URL(request.url).pathname) };
  });
  assert.deepEqual(cached.keys, ['hk-photo-diagnostic-shell-v10']);
  assert.equal(cached.assets.length, 18);
  assert.ok(cached.assets.includes('/src/geography/nearby-places.mjs'));
  assert.ok(cached.assets.includes('/data/reference/hk-place-names.json'));
  assert.ok(!cached.assets.some(path => /fixtures|jpe?g|heic/.test(path)));
  await stopServer();
  await offlineContext.setOffline(true);
  await offlinePage.reload();
  await offlinePage.locator('#files').setInputFiles(fixture('gps-dated.jpg'));
  await waitForImport(offlinePage);
  const [offlineResult] = await results(offlinePage);
  assert.equal(offlineResult.locality.status, 'suggestions');
  assert.deepEqual(offlineResult.locality, accepted[0].locality);
  assert.match(await offlinePage.locator('#milestones').innerText(), /^1 \/ 18/);
  await offlinePage.locator('#save-journal').click();
  await offlinePage.waitForFunction(() => document.querySelectorAll('#saved-locations > li').length === 1);
  await offlinePage.locator('#export-journal').click();
  await offlinePage.waitForFunction(() => document.getElementById('journal-export').textContent.length > 0);
  assert.doesNotMatch(await offlinePage.locator('#journal-export').innerText(), /locality|candidates|pointsSha256/);
  await offlinePage.locator('#clear-journal').click();
  await offlinePage.waitForFunction(() => document.querySelectorAll('#saved-locations > li').length === 0);
  await offlinePage.reload();
  await offlinePage.waitForFunction(() => /^0 saved observations/.test(document.getElementById('journal-milestones').textContent));
  await offlineContext.close();
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(nonGetRequests, []);
  const paths = ['src/geography/nearby-places.mjs', 'src/geography/place-catalog.mjs',
    'experiments/photo-import/nearby-places.test.mjs', 'experiments/photo-import/worker.mjs',
    'experiments/photo-import/diagnostic.mjs', 'experiments/photo-import/index.html',
    'experiments/photo-import/offline-worker.mjs', 'experiments/photo-import/offline-worker.test.mjs',
    'scripts/serve-diagnostic.py', 'scripts/nearby-place-browser-checks.mjs'];
  const files = Object.fromEntries(await Promise.all(paths.map(async path => [path,
    createHash('sha256').update(await readFile(`${root}${path}`)).digest('hex')])));
  const report = { status: 'passed', verifiedAt: new Date().toISOString(), browser: browser.version(),
    fixtures: '10/10', accepted: 5, suggestions: 4, uniqueDistricts: 1,
    heicFileInput: true, workerConnectionsBlockedByCSP: true, fallbacks,
    source: catalog.source, coordinates, benchmark, nodeBrowserParity: true,
    offline: { serverStopped: true, assets: cached.assets, importSuggestions: true, saveExportDeleteReload: true, suggestionsNotPersisted: true },
    screenshots, noHorizontalOverflow: true, pageErrors, externalRequests, nonGetRequests, files,
    scope: 'Diagnostic Chromium only. Sample coordinates are scenario controls, not surveyed ground truth. Radius is exploratory; no locality containment, measured GPS accuracy, native library access, production Figma or hosted sync claim.' };
  await writeFile(`${root}docs/evidence/nearby-place-browser.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, browser: report.browser, fixtures: report.fixtures, fallbacks, offline: report.offline, pageErrors, externalRequests }, null, 2));
} finally {
  if (browser) await browser.close();
  await stopServer();
}
