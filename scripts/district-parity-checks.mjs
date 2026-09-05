import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const databaseBytes = await readFile(`${root}docs/evidence/district-postgis-results.json`);
const database = JSON.parse(databaseBytes);
assert.equal(database.status, 'passed');
assert.equal(database.districts.oracleCount, 684);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  const externalRequests = [];
  const origin = 'http://127.0.0.1:8787';
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  await page.goto(`${origin}/experiments/photo-import/index.html`);
  const actual = await page.evaluate(async () => {
    const { createDistrictClassifier, countDistrictMilestones, DISTRICT_SOURCE_SHA256 } = await import('./districts.mjs');
    const response = await fetch('/data/reference/hk-districts.geojson');
    if (!response.ok) throw new Error('District source unavailable');
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
    if (digest !== DISTRICT_SOURCE_SHA256) throw new Error('District source mismatch');
    const classify = createDistrictClassifier(JSON.parse(new TextDecoder().decode(bytes)));
    const oracleResponse = await fetch('./fixtures/district-oracle.json');
    if (!oracleResponse.ok) throw new Error('Oracle unavailable');
    const oracle = await oracleResponse.json();
    const results = oracle.cases.map(test => ({ name: test.name, result: classify(test.longitude, test.latitude) }));
    const boundary = results.find(test => test.result.status === 'ambiguous');
    if (!boundary) throw new Error('Boundary control missing');
    const central = classify(114.154, 22.281);
    const shaTin = classify(114.2, 22.38);
    const outside = classify(114.4, 22.08);
    const progress = districts => countDistrictMilestones(districts.map(district => ({ status: 'accepted', district })));
    return {
      sourceSha256: digest, results,
      invalid: [[null,22], [114,null], [NaN,22], [114,Infinity], [-Infinity,22], [181,22], [114,-91]]
        .map(([longitude, latitude]) => classify(longitude, latitude)),
      achievements: {
        repeated: progress([central, central, central, central]),
        uncertain: progress([central, central, boundary.result, outside]),
        newDistrict: progress([central, central, boundary.result, outside, shaTin]),
        editedBackToCentral: progress([central, central, boundary.result, outside, central]),
        empty: progress([]),
      },
    };
  });
  assert.equal(actual.sourceSha256, database.districts.sourceSha256);
  assert.deepEqual(actual.results, database.districts.results);
  for (const invalid of actual.invalid) {
    assert.deepEqual(invalid, { status: 'invalid-coordinate', matches: [], milestoneDistrictId: null });
  }
  assert.deepEqual(actual.achievements, { repeated: 1, uncertain: 1, newDistrict: 2, editedBackToCentral: 1, empty: 0 });
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  const files = ['experiments/photo-import/districts.mjs',
    'node_modules/point-in-polygon-hao/dist/pointInPolygon.js',
    'scripts/private_district_checks.py', 'scripts/test-private-journal.py',
    'scripts/district-parity-checks.mjs', 'scripts/generate-district-seed.py',
    'supabase/migrations/202609060004_district_classification.sql',
    'supabase/migrations/202609060005_district_reference_seed.sql'];
  const hashes = Object.fromEntries(await Promise.all(files.map(async path => [path,
    createHash('sha256').update(await readFile(`${root}${path}`)).digest('hex')])));
  const report = {
    status: 'passed', verifiedAt: new Date().toISOString(), browser: browser.version(),
    sourceSha256: actual.sourceSha256, geographicCases: actual.results.length,
    invalidCases: actual.invalid.length, achievements: actual.achievements,
    databaseChecks: database.checks, postgis: database.postgis,
    databaseReportSha256: createHash('sha256').update(databaseBytes).digest('hex'),
    files: hashes, pageErrors: errors, externalRequests,
    scope: 'Real local Chromium module vs real isolated PostGIS and the existing GEOS oracle. Synthetic controls, not GPS ground truth, hosted Supabase, physical devices, or production UI.',
  };
  await writeFile(`${root}docs/evidence/district-browser-postgis-parity.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
