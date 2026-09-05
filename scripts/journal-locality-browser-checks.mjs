import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  const pageErrors = [], externalRequests = [], nonGetRequests = [], checks = [], screenshots = [];
  const watch = page => {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
      if (request.method() !== 'GET') nonGetRequests.push(request.method());
    });
  };
  const url = `${origin}/experiments/photo-import/index.html`;
  const ready = page => page.waitForFunction(() => document.getElementById('journal-status').textContent.startsWith('Local journal reopened.'));
  const importPhoto = async (page, name) => {
    await page.locator('#files').setInputFiles(`${root}experiments/photo-import/fixtures/${name}`);
    await page.waitForFunction(() => /inspected locally/.test(document.getElementById('status').textContent));
    await page.locator('#save-journal').click();
    await page.waitForFunction(() => /locations saved locally/.test(document.getElementById('journal-status').textContent));
  };
  const exported = async page => {
    await page.locator('#export-journal').click();
    await page.waitForFunction(() => document.getElementById('journal-export').textContent.length > 0);
    return JSON.parse(await page.locator('#journal-export').innerText());
  };
  const deleteDecision = async (page, button, message, accept) => {
    const event = page.waitForEvent('dialog');
    const clicked = button.click();
    const dialog = await event;
    const observed = { type: dialog.type(), message: dialog.message() };
    if (accept) await dialog.accept(); else await dialog.dismiss();
    await clicked;
    assert.equal(observed.type, 'confirm');
    assert.match(observed.message, message);
  };
  const cancelDeletion = async (page, button, message) => {
    const before = await exported(page);
    const links = await page.locator('.journal-downloads a').evaluateAll(items => items.map(item => item.href));
    await deleteDecision(page, button, message, false);
    assert.deepEqual(await page.locator('.journal-downloads a').evaluateAll(items => items.map(item => item.href)), links);
    assert.deepEqual(JSON.parse(await page.locator('#journal-export').innerText()), before);
    assert.deepEqual(await exported(page), before);
    checks.push('Cancelling deletion preserves saved records, notes and prepared export links.');
  };
  const downloaded = async (page, selector, filename) => {
    const event = page.waitForEvent('download');
    await page.locator(selector).click();
    const download = await event;
    assert.equal(download.suggestedFilename(), filename);
    assert.equal(await download.failure(), null);
    return JSON.parse(await readFile(await download.path(), 'utf8'));
  };
  const checkMapDownload = async page => {
    const journal = await exported(page);
    assert.deepEqual(await downloaded(page, '#journal-download', 'photo-location-journal.json'), journal);
    const geojson = await downloaded(page, '#geojson-download', 'photo-location-journal.geojson');
    assert.equal(geojson.type, 'FeatureCollection');
    assert.equal(geojson.journalExport.schemaVersion, 1);
    const points = geojson.features.filter(feature => feature.geometry !== null);
    assert.equal(points.length, journal.observations.length);
    for (const record of journal.observations) {
      const feature = points.find(item => item.properties.observationId === record.id);
      assert.equal(feature.geometry.type, 'Point');
      assert.deepEqual(feature.geometry.coordinates, [record.longitude, record.latitude]);
      assert.deepEqual(feature.properties.captureTime, record.captureTime);
      assert.equal(feature.properties.coordinateSource, 'photo-gps-metadata');
      assert.equal(feature.properties.locationAccuracy, 'unknown');
      if (record.palette) assert.deepEqual(feature.properties.palette.colors, record.palette.colors);
    }
    const notes = geojson.features.flatMap(feature => feature.geometry === null
      ? [feature.properties] : feature.properties.journalEntries);
    assert.equal(notes.length, journal.journalEntries.length);
    for (const record of journal.journalEntries) {
      const note = notes.find(item => item.id === record.id);
      assert.equal(note.note, record.note);
      assert.equal(note.observationId, record.observationId);
      assert.equal(note.source, 'user-authored');
      assert.equal(note.personalPlaceLabel?.value ?? null, record.correctedPlaceLabel);
      if (record.correctedPlaceLabel) assert.equal(note.personalPlaceLabel.verified, false);
    }
    assert.doesNotMatch(JSON.stringify(geojson), /candidates|milestoneDistrictId|filename|imageBytes/);
    return geojson;
  };
  const saveNote = async page => {
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page.locator('#note-editor').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.getElementById('journal-status').textContent.startsWith('Journal entry saved locally.'));
  };
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  watch(page);
  await page.goto(url);
  await ready(page);
  await page.locator('#colours').check();
  await importPhoto(page, 'gps-dated.jpg');
  const original = (await exported(page)).observations[0];
  assert.ok(original.palette);
  const saved = page.locator('#saved-locations > li').first();
  await saved.locator('summary').click();
  const nearby = await saved.locator('.saved-locality').innerText();
  assert.match(nearby, /haversine-label-point-v1/);
  assert.match(nearby, /pointsSha256/);
  assert.match(nearby, /m to label point/);
  checks.push('Saved coordinates recompute nearby names with method, source pins and uncertainty.');

  await saved.getByRole('button', { name: 'Write a note', exact: true }).click();
  assert.equal(await page.locator('#note-text').evaluate(node => node === document.activeElement), true);
  assert.equal(await page.locator('#clear-journal').isDisabled(), true);
  assert.equal(await saved.getByRole('button', { name: /^Delete saved location/ }).isDisabled(), true);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  assert.match(await page.locator('#note-text').evaluate(node => node.validationMessage), /Write a note/);
  await page.locator('#note-text').fill('x'.repeat(4001));
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  assert.match(await page.locator('#note-text').evaluate(node => node.validationMessage), /4,000/);
  const noteText = 'Evening colours by the harbour.\n<img src=x onerror=alert(1)>';
  await page.locator('#note-text').fill(noteText);
  await page.locator('#note-place').fill('x'.repeat(161));
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  assert.match(await page.locator('#note-place').evaluate(node => node.validationMessage), /160/);
  await page.locator('#note-place').fill('My harbour corner');
  await page.evaluate(async () => {
    const { LocalJournal } = await import('/src/journal/local-journal.mjs');
    const save = LocalJournal.prototype.putJournalEntry;
    LocalJournal.prototype.putJournalEntry = async function (record) {
      LocalJournal.prototype.putJournalEntry = save;
      throw new DOMException('Synthetic save failure', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('journal-status').textContent.startsWith('The note could not be saved.'));
  assert.equal(await page.locator('#note-text').inputValue(), noteText);
  assert.equal(await page.locator('#note-place').inputValue(), 'My harbour corner');
  await saveNote(page);
  let snapshot = await exported(page);
  const entryId = snapshot.journalEntries[0].id;
  assert.deepEqual(snapshot.observations, [original]);
  assert.equal(snapshot.journalEntries[0].note, noteText);
  assert.equal(snapshot.journalEntries[0].correctedPlaceLabel, 'My harbour corner');
  assert.equal(await page.locator('#saved-locations img').count(), 0);
  assert.match(await page.locator('#journal-milestones').innerText(), /1 \/ 18/);
  checks.push('Empty/overlong input rejected; simulated save failure retains draft; retry stores escaped note and separate label without changing GPS, palette or milestones.');

  await saved.getByRole('button', { name: 'Edit note', exact: true }).click();
  await page.locator('#note-text').fill('Discard this edit');
  await page.locator('#cancel-note').click();
  assert.equal((await exported(page)).journalEntries[0].note, noteText);
  await saved.getByRole('button', { name: 'Edit note', exact: true }).click();
  const revised = 'A little more of my Hong Kong. 香港 · 나의 기록';
  await page.locator('#note-text').fill(revised);
  await page.locator('#note-place').fill('My evening chapter');
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#note-editor').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const path = `docs/evidence/journal-locality-${name}.png`;
    await page.screenshot({ path: `${root}${path}` });
    screenshots.push(path);
  }
  await saveNote(page);
  await page.reload();
  await ready(page);
  await saved.locator('summary').click();
  assert.equal(await saved.locator('.saved-locality').innerText(), nearby);
  snapshot = await exported(page);
  assert.equal(snapshot.journalEntries[0].id, entryId);
  assert.equal(snapshot.journalEntries[0].note, revised);
  assert.deepEqual(snapshot.observations, [original]);
  assert.doesNotMatch(JSON.stringify(snapshot), /pointsSha256|candidates|locality/);
  checks.push('Cancel discards only the edit; saving preserves entry ID; reload preserves text, label and original metadata; suggestions are derived, not exported as visits.');
  await checkMapDownload(page);
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#geojson-download').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const selector of ['#journal-download', '#geojson-download']) {
      assert.ok((await page.locator(selector).boundingBox()).height >= 44);
    }
    const path = `docs/evidence/journal-geojson-${name}.png`;
    await page.screenshot({ path: `${root}${path}` });
    screenshots.push(path);
  }
  checks.push('Actual JSON and GeoJSON downloads preserve the same snapshot, original coordinates, palette, time and user-authored notes/labels; export controls fit desktop/mobile.');

  await context.route('**/data/reference/hk-place-names.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.reload();
  await ready(page);
  await saved.locator('summary').click();
  assert.match(await saved.locator('.saved-locality').innerText(), /Verified references are unavailable/);
  assert.equal((await exported(page)).journalEntries[0].note, revised);
  assert.match(await page.locator('#journal-milestones').innerText(), /1 \/ 18/);
  await context.unroute('**/data/reference/hk-place-names.json');
  await page.reload();
  await ready(page);
  await importPhoto(page, 'gps-undated.jpg');
  assert.match(await page.locator('#journal-milestones').innerText(), /2 saved observations · 1 \/ 18/);
  const deleteOriginal = page.locator(`[data-observation-id="${original.id}"]`).getByRole('button', { name: /^Delete saved location/ });
  await cancelDeletion(page, deleteOriginal, /Linked notes will be kept without coordinates/);
  await deleteDecision(page, deleteOriginal, /district progress will be recalculated/, true);
  await page.locator('#retained-notes-section').waitFor({ state: 'visible' });
  assert.match(await page.locator('#journal-milestones').innerText(), /1 saved observations · 1 \/ 18/);
  snapshot = await exported(page);
  assert.equal(snapshot.journalEntries[0].observationId, null);
  assert.equal(snapshot.journalEntries[0].id, entryId);
  await deleteDecision(page, page.locator('#saved-locations').getByRole('button', { name: /^Delete saved location/ }), /Delete this saved location/, true);
  await page.waitForFunction(() => document.getElementById('journal-milestones').textContent.startsWith('0 saved observations'));
  assert.match(await page.locator('#journal-milestones').innerText(), /0 \/ 18/);
  assert.equal(await page.locator('#geojson-download').isHidden(), true);
  assert.equal(await page.locator('#geojson-download').getAttribute('href'), null);
  const retainedExport = await checkMapDownload(page);
  assert.equal(retainedExport.features.length, 1);
  assert.equal(retainedExport.features[0].geometry, null);
  await page.locator('#retained-notes').getByRole('button', { name: 'Edit note', exact: true }).click();
  await page.locator('#note-text').fill('Retained and editable without a location.');
  await saveNote(page);
  await page.reload();
  await ready(page);
  assert.match(await page.locator('#retained-notes').innerText(), /Retained and editable/);
  const deleteNote = page.locator('#retained-notes').getByRole('button', { name: 'Delete note', exact: true });
  await cancelDeletion(page, deleteNote, /note and its personal place label/);
  await deleteDecision(page, deleteNote, /saved location and downloaded copies remain/, true);
  await page.locator('#retained-notes-section').waitFor({ state: 'hidden' });
  assert.equal((await exported(page)).journalEntries.length, 0);
  checks.push('Corrupt reference cannot erase notes/GPS or district progress; duplicate district remains one; deletion unlinks notes, removes only the final district instance, and retained notes remain editable/deletable.');
  await context.close();

  const offlineContext = await browser.newContext();
  const offlinePage = await offlineContext.newPage();
  watch(offlinePage);
  await offlinePage.goto(url);
  await ready(offlinePage);
  await offlinePage.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const assets = await offlinePage.evaluate(async () => {
    const keys = await caches.keys();
    if (keys.length !== 1 || keys[0] !== 'hk-photo-diagnostic-shell-v10') throw new Error('Unexpected cache release');
    return (await (await caches.open(keys[0])).keys()).map(request => new URL(request.url).pathname);
  });
  assert.equal(assets.length, 18);
  assert.ok(assets.includes('/src/journal/geojson-export.mjs'));
  await importPhoto(offlinePage, 'gps-dated.jpg');
  await stopServer();
  await offlineContext.setOffline(true);
  await offlinePage.reload();
  await ready(offlinePage);
  await offlinePage.locator('#saved-locations summary').click();
  assert.match(await offlinePage.locator('.saved-locality').innerText(), /m to label point/);
  await offlinePage.getByRole('button', { name: 'Write a note', exact: true }).click();
  await offlinePage.locator('#note-text').fill('Written while the server was stopped.');
  await offlinePage.locator('#note-place').fill('Offline chapter');
  await saveNote(offlinePage);
  await offlinePage.reload();
  await ready(offlinePage);
  const offlineExport = await exported(offlinePage);
  assert.equal(offlineExport.journalEntries[0].note, 'Written while the server was stopped.');
  assert.equal(offlineExport.journalEntries[0].correctedPlaceLabel, 'Offline chapter');
  assert.equal(offlineExport.observations.length, 1);
  await checkMapDownload(offlinePage);
  await cancelDeletion(offlinePage, offlinePage.locator('#clear-journal'), /all saved locations and journal notes in this browser/);
  await deleteDecision(offlinePage, offlinePage.locator('#clear-journal'), /does not delete cloud data/, true);
  await offlinePage.waitForFunction(() => document.getElementById('journal-status').textContent.startsWith('All saved records'));
  await offlinePage.reload();
  await ready(offlinePage);
  assert.deepEqual(await exported(offlinePage), { schemaVersion: 1, observations: [], journalEntries: [] });
  assert.deepEqual((await checkMapDownload(offlinePage)).features, []);
  checks.push('With server stopped and browser offline, v10 restores suggestions, saves a note/label, downloads matching JSON/GeoJSON, and downloads an empty collection after durable deletion. Orphan notes have null geometry and deletion invalidates prior download links.');
  await offlineContext.close();
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(nonGetRequests, []);
  const paths = ['experiments/photo-import/journal-panel.mjs', 'experiments/photo-import/index.html',
    'experiments/photo-import/style.css', 'experiments/photo-import/offline-worker.mjs',
    'experiments/photo-import/offline-worker.test.mjs', 'src/journal/local-journal.mjs',
    'src/geography/place-catalog.mjs', 'src/geography/nearby-places.mjs', 'scripts/journal-locality-browser-checks.mjs',
    'src/journal/geojson-export.mjs', 'experiments/photo-import/geojson-export.test.mjs', 'scripts/serve-diagnostic.py'];
  const files = Object.fromEntries(await Promise.all(paths.map(async path => [path,
    createHash('sha256').update(await readFile(`${root}${path}`)).digest('hex')])));
  const report = { status: 'passed', verifiedAt: new Date().toISOString(), browser: browser.version(), checks,
    offline: { serverStopped: true, assets }, screenshots, noHorizontalOverflow: true,
    pageErrors, externalRequests, nonGetRequests, files,
    scope: 'Real Chromium diagnostic with synthetic photos and notes. Save failure is injected. No native library, physical device, production UI or hosted sync claim.' };
  await writeFile(`${root}docs/evidence/journal-locality-browser.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, browser: report.browser, checks, pageErrors, externalRequests, nonGetRequests }, null, 2));
} finally {
  if (browser) await browser.close();
  await stopServer();
}
