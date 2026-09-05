import { DISTRICT_SOURCE_SHA256, countDistrictMilestones } from './districts.mjs';
import { journalPanel } from './journal-panel.mjs';
import { paletteSwatch } from './palette.mjs';

const byId = id => document.getElementById(id);
let worker;
let sequence = 0;
let active = false;
let rejectPending;
let districtCollection;
let placeBytes;

async function loadPlaces() {
  if (placeBytes) return;
  placeBytes = await Promise.all(['hk-place-points.geojson', 'hk-place-names.json'].map(async name => {
    const response = await fetch(`/data/reference/${name}`);
    if (!response.ok) throw new Error('Place reference unavailable');
    return response.arrayBuffer();
  }));
}

async function loadDistricts() {
  if (districtCollection) return;
  const response = await fetch('/data/reference/hk-districts.geojson');
  if (!response.ok) throw new Error('District data unavailable');
  const bytes = await response.arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== DISTRICT_SOURCE_SHA256) throw new Error('District data changed');
  districtCollection = JSON.parse(new TextDecoder().decode(bytes));
}

function createWorker() {
  const instance = new Worker('./worker.mjs', { type: 'module' });
  instance.postMessage({ type: 'initialize-geography', collection: districtCollection,
    pointBytes: placeBytes?.[0], nameBytes: placeBytes?.[1] });
  return instance;
}

function cancel() {
  sequence++;
  active = false;
  worker?.terminate();
  rejectPending?.(new Error('cancelled'));
  rejectPending = undefined;
  byId('cancel').disabled = true;
  byId('fixtures').disabled = false;
  byId('files').disabled = false;
  journalPanel.finish();
}

function parseFile(file, includeCaptureTime, id, type = 'metadata') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      worker = createWorker();
      rejectPending = undefined;
      resolve({ status: 'parse-timeout' });
    }, 10000);
    rejectPending = error => { clearTimeout(timer); reject(error); };
    worker.onmessage = event => {
      if (event.data.id !== id) return;
      clearTimeout(timer);
      rejectPending = undefined;
      resolve(event.data.result);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      rejectPending = undefined;
      resolve({ status: 'worker-error' });
    };
    worker.postMessage({ id, file, includeCaptureTime, type });
  });
}

async function run(files, expectations) {
  cancel();
  const token = sequence;
  active = true;
  journalPanel.reset();
  byId('results').replaceChildren();
  byId('cancel').disabled = false;
  byId('fixtures').disabled = true;
  byId('files').disabled = true;
  const dates = byId('dates').checked;
  const colours = byId('colours').checked;
  let passed = 0;
  let processed = 0;
  const results = [];
  byId('milestones').textContent = 'No districts counted yet.';
  try {
    byId('status').textContent = 'Loading district boundaries and nearby-place references…';
    // Independent reference failures must not prevent local GPS inspection.
    await Promise.allSettled([loadDistricts(), loadPlaces()]);
    if (!active || token !== sequence) return;
    worker = createWorker();
    for (const [index, file] of files.entries()) {
      if (!active || token !== sequence) return;
      byId('status').textContent = `Reading ${index + 1} of ${files.length} locally…`;
      const result = await parseFile(file, dates, index);
      if (token !== sequence) return;
      let verdict = '';
      if (expectations) {
        const expected = expectations[index];
        const ok = result.status === expected.status && (expected.latitude === undefined || (Math.abs(result.latitude - expected.latitude) < 1e-7 && Math.abs(result.longitude - expected.longitude) < 1e-7)) && (expected.districtStatus === undefined || (result.district?.status === expected.districtStatus && result.district?.milestoneDistrictId === expected.districtId));
        passed += Number(ok);
        verdict = ok ? 'PASS · ' : 'FAIL · ';
      }
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = `${verdict}${file.name}`;
      const detail = document.createElement('pre');
      detail.textContent = JSON.stringify(result, null, 2);
      row.append(title, detail);
      byId('results').append(row);
      results.push(result);
      const staged = journalPanel.add(result);
      byId('milestones').textContent = `${countDistrictMilestones(results)} / 18 districts represented by unique interior GPS matches. Repeats count once; ambiguous points count zero. This is not land coverage or verified venue attendance.`;
      processed++;
      if (colours && result.status === 'accepted') {
        result.palette = await parseFile(file, false, `palette-${index}`, 'palette');
        if (token !== sequence) return;
        if (result.palette.status === 'ready') {
          staged.palette = { algorithm: result.palette.algorithm, colors: result.palette.colors };
          row.append(paletteSwatch(staged.palette));
        }
        detail.textContent = JSON.stringify(result, null, 2);
      }
    }
    byId('status').textContent = expectations ? `${passed}/${files.length} fixture checks passed. Images stayed local.` : `${processed} files inspected locally. No records saved.`;
  } catch {
    if (token === sequence) byId('status').textContent = 'Import could not finish. Completed results remain visible.';
  } finally {
    if (token === sequence) cancel();
    const resources = performance.getEntriesByType('resource');
    byId('environment').textContent = JSON.stringify({ userAgent: navigator.userAgent, origin: location.origin, secureContext: isSecureContext, requestOrigins: [...new Set(resources.map(r => new URL(r.name).origin))], note: 'Resource timing is supporting evidence, not a complete network capture. Worker response CSP blocks connections; server rejects writes.' }, null, 2);
  }
}

byId('files').addEventListener('change', event => run([...event.target.files]));
byId('cancel').addEventListener('click', () => {
  cancel();
  byId('status').textContent = 'Cancelled. Completed results remain visible; no records saved.';
});
byId('fixtures').addEventListener('click', async () => {
  byId('fixtures').disabled = true;
  try {
    const cases = await (await fetch('./fixtures/manifest.json')).json();
    const files = await Promise.all(cases.map(async item => new File([await (await fetch(`./fixtures/${item.file}`)).blob()], item.file)));
    await run(files, cases);
  } catch {
    byId('status').textContent = 'Fixture loading failed. Run npm run fixtures and reload.';
    byId('fixtures').disabled = false;
  }
});
