import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Set PLAYWRIGHT_MODULE to an existing Playwright entry point; this driver installs nothing.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const origin = 'http://127.0.0.1:8787';
const endpoint = 'https://sync-fixture.supabase.co';
const cases = [];
const pageErrors = [];
let identity;
let requests = [];
let respond;
const moduleSource = await readFile(new URL('../src/journal/sync-journal.mjs', import.meta.url), 'utf8');
page.on('pageerror', error => pageErrors.push(error.message));
await page.route(`${origin}/src/journal/sync-journal.mjs`, route => route.fulfill({ contentType: 'text/javascript', body: moduleSource }));
await page.route(`${origin}/experiments/offline-journal/index.html`, async route => {
  const response = await route.fetch();
  // Only this isolated test page may call the intercepted fixture host. Production CSP stays unchanged.
  const headers = { ...response.headers(), 'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'self'; connect-src ${endpoint}; img-src 'none'; base-uri 'none'` };
  await route.fulfill({ response, headers });
});
await page.route(`${endpoint}/**`, async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'apikey, authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS' };
  if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
  const body = request.postDataJSON();
  requests.push({ path, body, headers: request.headers() });
  const result = path === '/auth/v1/user' ? { json: { id: identity } } : await respond(path, body);
  if (result.abort) { await route.abort('failed'); return; }
  await route.fulfill({ status: result.status ?? 200, headers: { ...headers, ...result.headers }, contentType: 'application/json',
    body: result.raw ?? JSON.stringify(result.json) });
});
async function fresh() {
  requests = [];
  respond = async () => ({ json: [] });
  identity = await page.evaluate(async () => {
    window.fixture?.journal.close();
    const { LocalJournal } = await import('/src/journal/local-journal.mjs');
    const { syncJournal } = await import('/src/journal/sync-journal.mjs');
    const journal = new LocalJournal();
    const scope = { kind: 'account', id: crypto.randomUUID() };
    await journal.activate(scope);
    const point = { id: crypto.randomUUID(), longitude: 114.15, latitude: 22.28 };
    await journal.putObservation({ ...point, filename: 'must-stay-local.jpg', image: new Uint8Array([1, 2, 3]), ownerId: 'excluded' });
    window.fixture = { journal, scope, point, syncJournal };
    return scope.id;
  });
}
async function run(options = {}) {
  return page.evaluate(async options => {
    const { journal, syncJournal } = window.fixture;
    try {
      return await syncJournal({ journal, url: 'https://sync-fixture.supabase.co',
        publishableKey: 'sb_publishable_SYNTHETIC', accessToken: 'SYNTHETIC_USER_TOKEN', ...options });
    } catch (error) { return { error: error.name, message: error.message }; }
  }, options);
}
const accepted = (body, revision = '1') => ({ json: { status: 'accepted', token: body.p_token,
  store: body.p_store, id: body.p_id, revision, deleted: body.p_operation === 'delete' } });
const pull = '/rest/v1/rpc/pull_journal_changes';
const put = '/rest/v1/rpc/apply_journal_change';
const retire = '/rest/v1/rpc/retire_journal_put';
function passed(name) { cases.push(name); }

try {
  await page.goto(`${origin}/experiments/offline-journal/index.html`);
  await fresh();
  respond = async (path, body) => path === pull ? { json: [] } : accepted(body);
  assert.deepEqual(await run(), { status: 'caught-up', requests: 4, pulled: 0, accepted: 1, retired: 0 });
  assert.deepEqual(requests.map(row => row.path), ['/auth/v1/user', pull, put, pull]);
  const mutation = requests[2];
  assert.deepEqual(Object.keys(mutation.body).sort(), ['p_base_revision', 'p_id', 'p_operation', 'p_record', 'p_store', 'p_token']);
  assert.deepEqual(Object.keys(mutation.body.p_record).sort(), ['capture_local', 'capture_offset_minutes', 'capture_status', 'latitude', 'longitude', 'palette']);
  for (const request of requests) {
    assert.equal(request.headers.authorization, 'Bearer SYNTHETIC_USER_TOKEN');
    assert.equal(request.headers.apikey, 'sb_publishable_SYNTHETIC');
    assert.equal(request.headers.cookie, undefined);
    assert(!JSON.stringify(request.body).includes('must-stay-local'));
  }
  assert.equal(await page.evaluate(async () => (await fixture.journal.pendingChanges()).changes.length), 0);
  passed('Verified identity precedes RPCs; requests contain only allowed metadata and clear the matching outbox');

  await fresh();
  await page.evaluate(async () => {
    await fixture.journal.putObservation({ ...fixture.point,
      captureTime: { status: 'with-offset', local: '2026-09-05T18:30:00', offset: '+08:00' },
      palette: { algorithm: 'rgb-histogram-v1', colors: ['#275A4A', '#995D40'] } });
    await fixture.journal.putJournalEntry({ id: crypto.randomUUID(), observationId: fixture.point.id,
      note: 'Synthetic harbour note', correctedPlaceLabel: 'Synthetic label' });
  });
  let written = 0;
  respond = async (path, body) => path === pull ? { json: [] } : accepted(body, String(++written));
  assert.equal((await run()).accepted, 2);
  const linkedWrites = requests.filter(row => row.path === put).map(row => row.body);
  assert.deepEqual(linkedWrites.map(row => row.p_store), ['observations', 'journalEntries']);
  assert.equal(linkedWrites[0].p_record.capture_offset_minutes, 480);
  assert.deepEqual(linkedWrites[0].p_record.palette.colors, ['#275A4A', '#995D40']);
  assert.equal(linkedWrites[1].p_record.observation_id, linkedWrites[0].p_id);
  passed('Opted-in dates, palettes and authored notes transfer with observation creation before linked notes');

  await fresh();
  const incomingId = randomUUID();
  const incomingRecord = { longitude: 114.17, latitude: 22.30, capture_status: 'not-requested',
    capture_local: null, capture_offset_minutes: null, palette: null };
  respond = async (path, body) => path === pull ? { json: body.p_after === '0'
    ? [{ store: 'observations', id: incomingId, revision: '1', deleted: false, record: incomingRecord }] : [] }
    : accepted(body, '2');
  assert.equal((await run()).pulled, 1);
  const downloaded = await page.evaluate(async () => (await fixture.journal.snapshot()).observations);
  assert.equal(downloaded.find(row => row.id === incomingId).longitude, 114.17);
  assert.equal(requests.filter(row => row.path === put).length, 1);
  passed('Incoming coordinates reach the real local journal without being echoed back as a new upload');

  await fresh();
  identity = randomUUID();
  assert.equal((await run()).error, 'SecurityError');
  assert.equal(requests.length, 1);
  for (const options of [{ url: 'http://sync-fixture.supabase.co' }, { url: `${endpoint}/other` },
    { publishableKey: 'sb_secret_SYNTHETIC' }, { accessToken: 'bad\nheader' }, { maxRequests: 1 }]) {
    assert.equal((await run(options)).error, 'TypeError');
  }
  assert.equal(requests.length, 1);
  passed('Wrong account and unsafe configuration stop before metadata transfer');

  await fresh();
  let lostBody;
  respond = async (path, body) => {
    if (path === pull) return { json: [] };
    lostBody = body;
    return { abort: true };
  };
  assert.equal((await run()).message, 'Sync network request failed');
  await page.evaluate(async () => {
    await fixture.journal.activate(fixture.scope);
    await fixture.journal.putObservation({ ...fixture.point, longitude: 114.16 });
  });
  const bodies = [];
  respond = async (path, body) => {
    if (path === pull) return { json: [] };
    bodies.push(body);
    return accepted(body, String(bodies.length));
  };
  assert.equal((await run()).accepted, 2);
  assert.deepEqual(bodies[0], lostBody);
  assert.notEqual(bodies[1].p_token, lostBody.p_token);
  assert.equal(bodies[1].p_base_revision, '1');
  assert.equal(bodies[1].p_record.longitude, 114.16);
  passed('A lost response survives database reopening and retries identically before sending a later edit');

  await fresh();
  await page.evaluate(async () => {
    await fixture.journal.nextSyncRequest();
    await fixture.journal.deleteObservation(fixture.point.id);
  });
  respond = async (path, body) => {
    if (path === pull) return { json: [] };
    if (path === retire) return { json: { status: 'retired', token: body.p_token, store: body.p_store,
      id: body.p_id, revision: '0', deleted: false } };
    return accepted(body);
  };
  const retired = await run();
  assert.equal(retired.retired, 1);
  assert.equal(retired.accepted, 1);
  assert.deepEqual(Object.keys(requests.find(row => row.path === retire).body).sort(), ['p_id', 'p_store', 'p_token']);
  assert.equal(requests.find(row => row.path === put).body.p_operation, 'delete');
  assert.equal(requests.find(row => row.path === put).body.p_record, null);
  passed('Purged uploads send only retirement identifiers, followed by a version-checked deletion');

  await fresh();
  await page.evaluate(async () => {
    await fixture.journal.nextSyncRequest();
    await fixture.journal.deleteObservation(fixture.point.id);
  });
  respond = async (path, body) => {
    if (path === pull) return { json: [] };
    if (path === retire) return accepted({ ...body, p_operation: 'put' }, '9007199254740993');
    return accepted(body, '9007199254740994');
  };
  assert.equal((await run()).accepted, 2);
  assert.equal(requests.find(row => row.path === put).body.p_base_revision, '9007199254740993');
  assert.equal(await page.evaluate(async () => (await fixture.journal.snapshot()).observations.length), 0);
  passed('An already accepted retired upload supplies its exact revision to deletion without restoring photo content');

  await fresh();
  const rows = Array.from({ length: 500 }, (_, index) => ({ store: 'observations', id: randomUUID(),
    revision: String(9007199254740993n + BigInt(index)), deleted: true, record: null }));
  respond = async (path, body) => path === pull ? { json: body.p_after === '0' ? rows : [] } : accepted(body, '9007199254741493');
  assert.deepEqual(await run({ maxRequests: 2 }), { status: 'more', requests: 2, pulled: 500, accepted: 0, retired: 0 });
  assert(!requests.some(row => row.path === put));
  assert.equal(await page.evaluate(async () => (await fixture.journal.nextPullRequest()).after), rows.at(-1).revision);
  requests = [];
  assert.equal((await run()).status, 'caught-up');
  assert.equal(requests[1].body.p_after, rows.at(-1).revision);
  passed('Full pull pages stop at the request budget, retain exact large revisions and resume before writing');

  await fresh();
  const id = await page.evaluate(() => fixture.point.id);
  let conflict = false;
  respond = async (path) => {
    if (path === pull) return { json: conflict ? [{ store: 'observations', id, revision: '7', deleted: true, record: null }] : [] };
    conflict = true;
    return { json: { status: 'conflict', revision: '7', deleted: true } };
  };
  assert.equal((await run()).status, 'conflict');
  assert.equal(requests.filter(row => row.path === put).length, 1);
  assert.equal(await page.evaluate(async () => (await fixture.journal.nextSyncRequest()).state), 'conflict');
  assert.equal(await page.evaluate(async () => (await fixture.journal.snapshot()).observations.length), 1);
  passed('A conflict pulls the current remote version and preserves the local record for an explicit decision');

  await fresh();
  respond = async () => {
    await page.evaluate(async () => { await fixture.journal.activate({ kind: 'account', id: crypto.randomUUID() }); });
    return { json: [] };
  };
  assert.equal((await run()).error, 'AbortError');
  assert.equal(requests.length, 2);
  assert.equal(await page.evaluate(async () => (await fixture.journal.snapshot()).observations.length), 0);
  passed('An account change while pulling rejects the old response and prevents any write into the new session');

  await fresh();
  respond = async (path, body) => {
    if (path === pull) return { json: [] };
    await page.evaluate(async () => { await fixture.journal.activate({ kind: 'account', id: crypto.randomUUID() }); });
    return accepted(body);
  };
  assert.equal((await run()).error, 'AbortError');
  await page.evaluate(async () => { await fixture.journal.activate(fixture.scope); });
  assert.equal(await page.evaluate(async () => (await fixture.journal.pendingChanges()).changes.length), 1);
  passed('An account change during an upload cannot acknowledge the old session or lose its pending request');

  for (const response of [{ status: 401, raw: 'SYNTHETIC_PRIVATE_SERVER_BODY' }, { raw: 'invalid-json' }, { json: [{ revision: 1 }] }]) {
    await fresh();
    respond = async () => response;
    const failure = await run();
    assert(failure.error);
    assert(!failure.message.includes('SYNTHETIC_PRIVATE_SERVER_BODY'));
    assert.equal(await page.evaluate(async () => (await fixture.journal.pendingChanges()).changes.length), 1);
    assert.equal(await page.evaluate(async () => (await fixture.journal.nextPullRequest()).after), '0');
  }
  passed('Authorization, invalid JSON and malformed pages leave local work intact without echoing server content');

  await fresh();
  respond = async () => ({ status: 302, headers: { location: `${endpoint}/must-not-follow` }, raw: '' });
  assert.equal((await run()).message, 'Sync network request failed');
  assert(!requests.some(row => row.path === '/must-not-follow'));
  await page.evaluate(() => { fixture.cancel = new AbortController(); fixture.cancel.abort(); });
  const before = requests.length;
  const aborted = await page.evaluate(async () => {
    try { await fixture.syncJournal({ journal: fixture.journal, url: 'https://sync-fixture.supabase.co',
      publishableKey: 'sb_publishable_SYNTHETIC', accessToken: 'SYNTHETIC_USER_TOKEN', signal: fixture.cancel.signal }); }
    catch (error) { return error.name; }
  });
  assert.equal(aborted, 'AbortError');
  assert.equal(requests.length, before);
  passed('Redirects are rejected and cancellation stops before sending a request');

  assert.deepEqual(pageErrors, []);
  const report = { status: 'passed', checks: cases.length, cases, browser: await browser.version(),
    surface: 'Real Chromium fetch and IndexedDB; intercepted synthetic Auth/RPC endpoints, no hosted service', pageErrors };
  await page.evaluate(report => {
    document.querySelector('#status').textContent = `${report.checks} transport scenarios passed`;
    document.querySelector('#report').textContent = JSON.stringify(report, null, 2);
  }, report);
  await writeFile(new URL('../docs/evidence/sync-transport-result.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({ path: fileURLToPath(new URL('../docs/evidence/sync-transport-browser.png', import.meta.url)), fullPage: true });
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
