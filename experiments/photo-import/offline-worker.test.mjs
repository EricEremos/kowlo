import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./offline-worker.mjs', import.meta.url), 'utf8');
function harness({ installFails = false } = {}) {
  const handlers = {};
  const removed = [];
  const requests = [];
  let claimed = false;
  const cachedResponse = new Response('cached shell');
  const cache = {
    addAll: async entries => {
      requests.push(...entries);
      if (installFails) throw new Error('one asset unavailable');
    },
    match: async () => cachedResponse,
  };
  vm.runInNewContext(source, {
    URL, Request,
    self: {
      location: { origin: 'https://atlas.test' },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      clients: { claim: async () => { claimed = true; } },
    },
    caches: {
      open: async () => cache,
      keys: async () => ['hk-photo-diagnostic-shell-old', ...Array.from({ length: 12 }, (_, index) => `hk-photo-diagnostic-shell-v${index + 1}`), 'other-application-cache'],
      delete: async name => { removed.push(name); },
    },
    fetch: () => { throw new Error('unexpected network'); },
  });
  return { handlers, removed, requests, cachedResponse, claimed: () => claimed };
}

test('service worker leaves photo, private, cross-origin and non-GET requests untouched', () => {
  const { handlers } = harness();
  const base = 'https://atlas.test';
  const cases = [
    new Request(`${base}/experiments/photo-import/fixtures/gps-dated.jpg`),
    new Request(`${base}/rest/v1/observations`),
    new Request(`${base}/photo-location-journal.json`),
    new Request(`${base}/photo-location-journal.geojson`),
    new Request(`${base}/experiments/photo-import/index.html?private=1`),
    new Request('https://other.test/experiments/photo-import/index.html'),
    new Request(`${base}/experiments/photo-import/index.html`, { method: 'POST', body: 'private' }),
    new Request(`${base}/experiments/photo-import/index.html`, { headers: { Authorization: 'test-only' } }),
  ];
  for (const request of cases) handlers.fetch({ request, respondWith: () => assert.fail(`Intercepted ${request.url}`) });
});

test('precache contains static assets only and uses credential-free requests', async () => {
  const { handlers, requests, cachedResponse } = harness();
  let installation;
  handlers.install({ waitUntil: promise => { installation = promise; } });
  await installation;
  assert.ok(requests.length > 0);
  assert.ok(requests.some(request => new URL(request.url).pathname === '/src/geography/memory-print.mjs'));
  for (const request of requests) {
    assert.equal(request.credentials, 'omit');
    assert.equal(request.redirect, 'error');
    assert.equal(request.cache, 'reload');
    assert.doesNotMatch(request.url, /fixtures|\.jpe?g|\.heic|rest\/|auth\/|\?/i);
    const path = new URL(request.url).pathname;
    await assert.doesNotReject(readFile(new URL(`../..${path}`, import.meta.url)));
  }
  let response;
  handlers.fetch({ request: new Request('https://atlas.test/experiments/photo-import/index.html'), respondWith: promise => { response = promise; } });
  assert.equal(await response, cachedResponse);
});

test('failed installation removes its cache and rejects activation prerequisite', async () => {
  const { handlers, removed, claimed } = harness({ installFails: true });
  let installation;
  handlers.install({ waitUntil: promise => { installation = promise; } });
  await assert.rejects(installation, /unavailable/);
  assert.deepEqual(removed, ['hk-photo-diagnostic-shell-v12']);
  assert.equal(claimed(), false);
});

test('activation retains other application caches and the current release', async () => {
  const { handlers, removed, claimed } = harness();
  let activation;
  handlers.activate({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.deepEqual(removed, ['hk-photo-diagnostic-shell-old', ...Array.from({ length: 11 }, (_, index) => `hk-photo-diagnostic-shell-v${index + 1}`)]);
  assert.equal(claimed(), true);
});
