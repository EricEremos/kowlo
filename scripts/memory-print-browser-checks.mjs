import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = spawn('python3', ['-u', '-c', [
  'from runpy import run_path', "globals().update(run_path('scripts/serve-diagnostic.py'))",
  "server = ThreadingHTTPServer(('127.0.0.1', 0), partial(DiagnosticHandler, directory=str(ROOT)))",
  "print('http://127.0.0.1:' + str(server.server_port), flush=True)", 'server.serve_forever()',
].join('\n')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErrors = '', browser;
server.stderr.on('data', chunk => { serverErrors = (serverErrors + chunk).slice(-2000); });
try {
  const lines = createInterface({ input: server.stdout });
  const [origin] = await Promise.race([
    once(lines, 'line'),
    once(server, 'exit').then(([code]) => { throw new Error(`Server exited ${code}: ${serverErrors}`); }),
    new Promise((_, reject) => { setTimeout(() => reject(new Error('Server startup timed out')), 10000).unref(); }),
  ]);
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(), errors = [], networkViolations = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== origin || request.method() !== 'GET') networkViolations.push(request.url());
  });
  await page.goto(`${origin}/experiments/photo-import/index.html`);
  const result = await page.evaluate(async () => {
    const { extractMetadata } = await import('/experiments/photo-import/metadata.mjs');
    const { decodePalette } = await import('/experiments/photo-import/palette.mjs');
    const { LocalJournal } = await import('/src/journal/local-journal.mjs');
    const { memoryPrint } = await import('/src/geography/memory-print.mjs');
    const photo = await (await fetch('/experiments/photo-import/fixtures/gps-dated.jpg')).blob();
    const metadata = await extractMetadata(new Uint8Array(await photo.arrayBuffer()));
    const palette = await decodePalette(photo);
    if (metadata.status !== 'accepted' || palette.status !== 'ready') throw new Error('Fixture extraction failed');
    const journal = new LocalJournal(), scope = { kind: 'device', id: crypto.randomUUID() };
    await journal.activate(scope);
    try {
      const first = crypto.randomUUID(), second = crypto.randomUUID();
      await journal.putObservation({ id: first, longitude: metadata.longitude, latitude: metadata.latitude,
        palette: { algorithm: palette.algorithm, colors: palette.colors } });
      await journal.putObservation({ id: second, longitude: metadata.longitude, latitude: metadata.latitude });
      const initial = memoryPrint(await journal.snapshot());
      journal.close();
      await journal.activate(scope);
      const reopened = memoryPrint(await journal.snapshot());
      let badInputRejected = false;
      try { memoryPrint({ schemaVersion: 1, observations: [{ id: 'bad', longitude: NaN, latitude: 22 }], journalEntries: [] }); }
      catch (error) { badInputRejected = error instanceof TypeError; }
      return { metadata, palette, initial, reopened, scope, first, badInputRejected };
    } finally { journal.close(); }
  });
  assert.equal(result.initial.marks.length, 1);
  assert.equal(result.initial.marks[0].observationCount, 2);
  assert.equal(result.initial.marks[0].paletteCount, 1);
  assert.deepEqual(result.initial.marks[0].colors, [...result.palette.colors].sort());
  assert.equal(result.initial.marks[0].members[0].longitude, result.metadata.longitude);
  assert.equal(result.initial.marks[0].members[0].latitude, result.metadata.latitude);
  assert.deepEqual(result.reopened, result.initial);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const stopped = once(server, 'exit');
  server.kill('SIGTERM');
  await stopped;
  await page.reload();
  const offline = await page.evaluate(async ({ scope, first }) => {
    const { LocalJournal } = await import('/src/journal/local-journal.mjs');
    const { memoryPrint } = await import('/src/geography/memory-print.mjs');
    const journal = new LocalJournal();
    await journal.activate(scope);
    try {
      const restored = memoryPrint(await journal.snapshot());
      await journal.deleteObservation(first);
      const afterDelete = memoryPrint(await journal.snapshot());
      await journal.deleteAll();
      const emptied = memoryPrint(await journal.snapshot());
      const cache = await caches.open('hk-photo-diagnostic-shell-v12');
      const cachedPaths = (await cache.keys()).map(request => new URL(request.url).pathname);
      return { restored, afterDelete, emptied, cachedPaths };
    } finally { journal.close(); }
  }, { scope: result.scope, first: result.first });
  assert.deepEqual(offline.restored, result.initial);
  assert.equal(offline.afterDelete.marks[0].observationCount, 1);
  assert.deepEqual(offline.afterDelete.marks[0].colors, []);
  assert.equal(offline.emptied.observationCount, 0);
  assert.deepEqual(offline.emptied.marks, []);
  assert.equal(offline.cachedPaths.length, 19);
  assert.ok(offline.cachedPaths.includes('/src/geography/memory-print.mjs'));
  assert.ok(offline.cachedPaths.every(path => !/fixtures|\.jpe?g|rest\/|auth\//i.test(path)));
  assert.equal(result.badInputRejected, true);
  assert.deepEqual(errors, []);
  assert.deepEqual(networkViolations, []);
  console.log('PASS: JPEG GPS + decoded palette → IndexedDB → memory print → server stopped → offline reload → delete colour source → delete all; v12 caches 19 static assets without photos; invalid coordinates rejected; no page errors or external/non-GET requests.');
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
  }
}
