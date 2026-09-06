import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const profile = await mkdtemp(`${tmpdir()}/kowlo-install-`);
const server = spawn('python3', ['-u', '-c', [
  'from runpy import run_path', "globals().update(run_path('scripts/serve-diagnostic.py'))",
  "server = ThreadingHTTPServer(('127.0.0.1', 0), partial(DiagnosticHandler, directory=str(ROOT)))",
  "print('http://127.0.0.1:' + str(server.server_port), flush=True)", 'server.serve_forever()',
].join('\n')], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
let context, protocol, manifestId, installed = false;
const stopServer = async () => {
  if (server.exitCode === null && server.signalCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
};
try {
  const lines = createInterface({ input: server.stdout });
  const [origin] = await Promise.race([
    once(lines, 'line'), once(server, 'exit').then(() => { throw new Error('Server failed'); }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Startup timeout')), 10000).unref()),
  ]);
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: false, viewport: { width: 1000, height: 850 } });
  const page = await context.newPage();
  const errors = [], violations = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Content Security Policy/.test(message.text())) violations.push(message.text()); });
  await page.goto(`${origin}/app/index.html#atlas`);
  await page.waitForFunction(() => navigator.serviceWorker.controller && document.body.dataset.ready === 'true');
  protocol = await context.newCDPSession(page);
  const parsed = await protocol.send('Page.getAppManifest');
  assert.deepEqual(parsed.errors, []);
  const manifest = JSON.parse(parsed.data);
  manifestId = new URL(manifest.id, origin).href;
  assert.equal(manifestId, `${origin}/app/`);
  assert.equal(manifest.start_url, '/app/index.html#atlas');
  assert.equal(manifest.display, 'standalone');
  const response = await page.request.get(`${origin}/app/manifest.webmanifest`);
  assert.match(response.headers()['content-type'], /application\/manifest\+json/);
  const installability = await protocol.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors, []);
  checks.push('Chromium parses the manifest without errors, reports no installability errors, and receives the correct manifest MIME type.');
  const icons = await page.evaluate(async () => {
    const result = [];
    for (const size of [180, 192, 512]) {
      const img = new Image(); img.src = `/app/icons/kowlo-${size}.png`; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      let maxRadius = 0, transparent = 0, foreground = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        if (pixels[index + 3] !== 255) transparent++;
        if (pixels[index] > 80) { foreground++; maxRadius = Math.max(maxRadius, Math.hypot(x + .5 - size / 2, y + .5 - size / 2) / size); }
      }
      result.push({ size, width: img.naturalWidth, height: img.naturalHeight, maxRadius, transparent, foreground });
    }
    return result;
  });
  for (const icon of icons) { assert.equal(icon.width, icon.size); assert.equal(icon.height, icon.size); assert.equal(icon.transparent, 0); assert(icon.foreground > 0); assert(icon.maxRadius < .4); }
  checks.push('All three PNGs decode at their declared dimensions; opaque icons keep the entire Harbour K inside the maskable safe circle.');
  await page.evaluate(async () => {
    const { LocalJournal } = await import('/src/journal/local-journal.mjs');
    const journal = new LocalJournal();
    await journal.activate({ kind: 'device', id: localStorage.getItem('hk-diagnostic-device-scope-v1') });
    await journal.putObservation({ id: crypto.randomUUID(), longitude: 114.1588, latitude: 22.2819, palette: { algorithm: 'rgb-histogram-v1', colors: ['#9A6959'] } }); journal.close();
  });
  await protocol.send('PWA.install', { manifestId, installUrlOrBundleUrl: `${origin}/app/index.html` });
  installed = true;
  // DevTools installation defaults to a browser tab; apply the user's app-window preference.
  await protocol.send('PWA.changeAppUserSettings', { manifestId, displayMode: 'standalone' });
  const launchedApp = context.waitForEvent('page');
  await protocol.send('PWA.launch', { manifestId });
  const app = await launchedApp;
  await app.waitForFunction(() => document.body.dataset.ready === 'true');
  assert(await app.evaluate(() => matchMedia('(display-mode: standalone)').matches));
  assert.equal(await app.locator('.number').innerText(), '01 / 18');
  checks.push('An actual isolated Chromium PWA installation launches in standalone display mode and reads the same saved local journal.');
  await app.close();
  await stopServer();
  const nextApp = context.waitForEvent('page');
  await protocol.send('PWA.launch', { manifestId });
  const offline = await nextApp;
  await offline.waitForFunction(() => document.body.dataset.ready === 'true');
  assert(await offline.evaluate(() => matchMedia('(display-mode: standalone)').matches));
  assert.equal(await offline.locator('.number').innerText(), '01 / 18');
  await offline.getByRole('navigation').getByRole('link', { name: 'Chapters' }).click();
  await offline.getByRole('link', { name: 'Central & Western' }).click();
  await offline.getByRole('navigation').getByRole('link', { name: 'Atlas', exact: true }).click();
  assert.equal(await offline.locator('.mark[stroke="#9A6959"]').count(), 1);
  const evidence = `${root}docs/evidence/atlas`;
  await mkdir(evidence, { recursive: true });
  await offline.screenshot({ path: `${evidence}/installed-offline.png`, fullPage: true });
  checks.push('After closing the app and terminating the server, a fresh standalone launch restores the coloured atlas and district navigation.');
  assert.deepEqual(errors, []); assert.deepEqual(violations, []);
  await protocol.send('PWA.uninstall', { manifestId }); installed = false;
  const report = { result: 'PASS', browser: await context.browser().version(), checks, icons, errors, violations, standalone: true, serverStopped: true, testInstallationRemoved: true, data: 'Isolated temporary browser profile and synthetic location only.' };
  await writeFile(`${evidence}/install-checks.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (installed) await protocol.send('PWA.uninstall', { manifestId }).catch(error => console.error('Test installation cleanup failed:', error.message));
  await context?.close(); await stopServer(); await rm(profile, { recursive: true, force: true });
}
