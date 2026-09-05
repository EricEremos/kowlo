import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPlaceCatalog } from '../src/geography/place-catalog.mjs';

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
  const page = await browser.newPage();
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  await page.goto(`${origin}/experiments/photo-import/index.html`);
  const actual = await page.evaluate(async () => {
    const { createPlaceCatalog } = await import('/src/geography/place-catalog.mjs');
    const bytes = await Promise.all(['hk-place-points.geojson', 'hk-place-names.json'].map(async file => {
      const response = await fetch(`/data/reference/${file}`);
      if (!response.ok) throw new Error(`Reference HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    }));
    const catalog = await createPlaceCatalog(...bytes);
    const modified = bytes[1].slice();
    modified[100] ^= 1;
    let rejection;
    try { await createPlaceCatalog(bytes[0], modified); }
    catch (error) { rejection = error.message; }
    let immutable = false;
    try { catalog.get('146').longitude = 0; }
    catch { immutable = true; }
    // Assignment may fail silently in a non-strict browser evaluate function.
    immutable ||= catalog.get('146').longitude !== 0;
    return { places: catalog.places, source: catalog.source, rejection, immutable };
  });
  const expected = await createPlaceCatalog(
    await readFile(`${root}data/reference/hk-place-points.geojson`),
    await readFile(`${root}data/reference/hk-place-names.json`));
  assert.deepEqual(actual.places, expected.places);
  assert.deepEqual(actual.source, expected.source);
  assert.equal(actual.rejection, 'Place names source hash mismatch');
  assert.equal(actual.immutable, true);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  const paths = ['src/geography/place-catalog.mjs', 'experiments/photo-import/place-catalog.test.mjs',
    'scripts/place-catalog-browser-checks.mjs', 'scripts/serve-diagnostic.py',
    'data/reference/hk-place-points.geojson', 'data/reference/hk-place-names.json'];
  const files = Object.fromEntries(await Promise.all(paths.map(async path => [path,
    createHash('sha256').update(await readFile(`${root}${path}`)).digest('hex')])));
  const report = { status: 'passed', verifiedAt: new Date().toISOString(), browser: browser.version(),
    places: actual.places.length, aliases: actual.places.reduce((n, p) => n + p.aliases.length, 0),
    fullNodeBrowserParity: true, changedSourceRejected: true, immutable: actual.immutable,
    source: actual.source, files, pageErrors: errors, externalRequests,
    scope: 'Real Chromium loads both public source files through the diagnostic HTTP allowlist. Reference catalog only; no photo assignment, production UI, hosted service or physical device claim.' };
  await writeFile(`${root}docs/evidence/place-catalog-browser.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
  }
}
