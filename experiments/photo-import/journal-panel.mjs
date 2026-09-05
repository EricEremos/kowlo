import { LocalJournal } from '../../src/journal/local-journal.mjs';
import { journalGeoJSON } from '../../src/journal/geojson-export.mjs';
import { paletteSwatch } from './palette.mjs';
import { DISTRICT_SOURCE_SHA256, createDistrictClassifier, countDistrictMilestones, districtChapters } from './districts.mjs';
import { createPlaceCatalog } from '../../src/geography/place-catalog.mjs';
import { createNearbyPlaceFinder } from '../../src/geography/nearby-places.mjs';

const byId = id => document.getElementById(id);
const journal = new LocalJournal();
let pending = [];
let ready = false;
let busy = false;
let importing = false;
let classify;
let findPlaces;
let downloadURL;
let geoJSONURL;
let editor;

function controls() {
  const locked = !ready || busy || Boolean(editor);
  byId('save-journal').disabled = locked || importing || !pending.length;
  byId('export-journal').disabled = locked;
  byId('clear-journal').disabled = locked;
  for (const button of document.querySelectorAll('#saved-locations button, #retained-notes button')) button.disabled = locked;
  byId('note-fields').disabled = busy;
}

function openEditor(observationId, entry) {
  if (!ready || busy || editor) return;
  editor = { id: entry?.id ?? crypto.randomUUID(), observationId };
  byId('note-title').textContent = entry ? 'Edit your journal entry' : 'Write a journal entry';
  byId('note-context').textContent = observationId
    ? 'Linked to the original photo coordinates. Your place label does not change GPS or district progress.'
    : 'Retained note: its saved location has been deleted.';
  byId('note-text').value = entry?.note ?? '';
  byId('note-place').value = entry?.correctedPlaceLabel ?? '';
  byId('note-text').setCustomValidity('');
  byId('note-place').setCustomValidity('');
  byId('note-editor').hidden = false;
  controls();
  byId('note-text').focus();
}

function closeEditor() {
  editor = undefined;
  byId('note-editor').hidden = true;
  byId('note-text').value = '';
  byId('note-place').value = '';
  controls();
}

function confirmDeletion(message, action) {
  if (!ready || busy || editor || !window.confirm(message)) return;
  void operate(action);
}

function entryRow(entry) {
  const row = document.createElement('li');
  row.dataset.entryId = entry.id;
  const label = document.createElement('p');
  label.textContent = entry.correctedPlaceLabel ? `Your place label: ${entry.correctedPlaceLabel}` : 'Journal note';
  const note = document.createElement('p');
  note.className = 'note-body';
  note.textContent = entry.note;
  const edit = document.createElement('button');
  edit.textContent = 'Edit note';
  edit.addEventListener('click', () => openEditor(entry.observationId, entry));
  const remove = document.createElement('button');
  remove.textContent = 'Delete note';
  remove.addEventListener('click', () => confirmDeletion(
    'Delete this journal note and its personal place label? This cannot be undone. The saved location and downloaded copies remain.', async () => {
    clearExport();
    await journal.deleteJournalEntry(entry.id);
    await render();
    return 'Journal note deleted. Saved photo coordinates and district progress are unchanged.';
  }));
  row.append(label, note, edit, remove);
  return row;
}

function localityDetails(record) {
  const details = document.createElement('details');
  details.className = 'saved-locality';
  const summary = document.createElement('summary');
  const locality = findPlaces?.(record.longitude, record.latitude);
  summary.textContent = locality?.status === 'suggestions'
    ? 'Nearby names · unconfirmed' : 'Nearby names unavailable or unconfirmed';
  const meaning = document.createElement('p');
  meaning.textContent = locality
    ? `${locality.meaning}. Search radius: ${locality.radiusMetres} m. Recomputed from the original GPS; these suggestions are not saved as visits.`
    : 'Verified references are unavailable. Saved GPS and personal notes remain usable.';
  details.append(summary, meaning);
  if (locality) {
    const candidates = document.createElement('ul');
    for (const candidate of locality.candidates) {
      const item = document.createElement('li');
      item.textContent = `${candidate.name.en} · ${candidate.name.zhHant} · ${candidate.distanceMetres} m to label point`;
      candidates.append(item);
    }
    const evidence = document.createElement('pre');
    evidence.textContent = JSON.stringify({ status: locality.status, method: locality.method, source: locality.source }, null, 2);
    details.append(candidates, evidence);
  }
  return details;
}

function clearExport() {
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  if (geoJSONURL) URL.revokeObjectURL(geoJSONURL);
  downloadURL = undefined;
  geoJSONURL = undefined;
  byId('journal-download').hidden = true;
  byId('journal-download').removeAttribute('href');
  byId('geojson-download').hidden = true;
  byId('geojson-download').removeAttribute('href');
  byId('journal-export').hidden = true;
  byId('journal-export').textContent = '';
}

async function render() {
  const snapshot = await journal.snapshot();
  byId('saved-locations').replaceChildren();
  byId('retained-notes').replaceChildren();
  const results = snapshot.observations.map(record => ({
    ...record, status: 'accepted', district: classify?.(record.longitude, record.latitude),
  }));
  byId('journal-milestones').textContent = classify
    ? `${results.length} saved observations · ${countDistrictMilestones(results)} / 18 districts represented. Familiar places grow richer; repeated locations count toward the same district.`
    : `${results.length} saved observations. District boundaries unavailable; milestones are not counted.`;
  const chapters = districtChapters(results);
  byId('district-chapters').replaceChildren();
  byId('district-chapters-section').hidden = !chapters.length;
  for (const chapter of chapters) {
    const row = document.createElement('li');
    row.dataset.districtId = chapter.id;
    const title = document.createElement('h4');
    title.textContent = chapter.name;
    const detail = document.createElement('p');
    detail.textContent = `${chapter.observationCount} saved ${chapter.observationCount === 1 ? 'observation' : 'observations'} · ${chapter.paletteCount} with photo colours`;
    row.append(title, detail);
    if (chapter.colors.length) row.append(paletteSwatch(chapter));
    else {
      const neutral = document.createElement('p');
      neutral.className = 'hint';
      neutral.textContent = 'Your locations are here. Photo colours are optional.';
      row.append(neutral);
    }
    byId('district-chapters').append(row);
  }
  for (const record of results) {
    const row = document.createElement('li');
    row.dataset.observationId = record.id;
    const label = document.createElement('p');
    const place = record.district?.status === 'assigned' ? record.district.matches[0].name : 'District not confirmed';
    label.textContent = `${place} · ${record.latitude.toFixed(6)}, ${record.longitude.toFixed(6)}`;
    const time = document.createElement('p');
    time.textContent = `Capture time: ${record.captureTime.local ?? record.captureTime.status}${record.captureTime.offset ? ` ${record.captureTime.offset}` : record.captureTime.local ? ` (${record.captureTime.status})` : ''}`;
    const remove = document.createElement('button');
    remove.textContent = 'Delete saved location';
    remove.setAttribute('aria-label', `Delete saved location ${record.id}`);
    remove.addEventListener('click', () => confirmDeletion(
      'Delete this saved location? This cannot be undone. Linked notes will be kept without coordinates, and district progress will be recalculated. Original photos and downloaded copies remain.', async () => {
      clearExport();
      await journal.deleteObservation(record.id);
      await render();
      return 'Location deleted. Any linked journal notes are retained.';
    }));
    const write = document.createElement('button');
    write.textContent = 'Write a note';
    write.addEventListener('click', () => openEditor(record.id));
    row.append(label, time, localityDetails(record), write, remove);
    if (record.palette) row.append(paletteSwatch(record.palette));
    const notes = document.createElement('ul');
    for (const entry of snapshot.journalEntries.filter(entry => entry.observationId === record.id)) notes.append(entryRow(entry));
    row.append(notes);
    byId('saved-locations').append(row);
  }
  const retained = snapshot.journalEntries.filter(entry => entry.observationId === null);
  for (const entry of retained) byId('retained-notes').append(entryRow(entry));
  byId('retained-notes-section').hidden = !retained.length;
}

byId('note-editor').addEventListener('submit', event => {
  event.preventDefault();
  if (!editor || busy) return;
  const note = byId('note-text').value;
  const correctedPlaceLabel = byId('note-place').value.trim() || null;
  byId('note-text').setCustomValidity([...note].length > 4000 ? 'Use at most 4,000 characters.'
    : !note.trim() && !correctedPlaceLabel ? 'Write a note or a personal place label.' : '');
  byId('note-place').setCustomValidity(correctedPlaceLabel && [...correctedPlaceLabel].length > 160 ? 'Use at most 160 characters.' : '');
  if (!byId('note-editor').reportValidity()) return;
  void operate(async () => {
    clearExport();
    await journal.putJournalEntry({ ...editor, note, correctedPlaceLabel });
    closeEditor();
    await render();
    return 'Journal entry saved locally. Your label remains separate from the original GPS and nearby suggestions.';
  });
});
for (const id of ['note-text', 'note-place']) byId(id).addEventListener('input', () => {
  byId('note-text').setCustomValidity('');
  byId('note-place').setCustomValidity('');
});
byId('cancel-note').addEventListener('click', () => { if (!busy) closeEditor(); });

async function operate(action) {
  if (!ready || busy) return;
  busy = true;
  controls();
  try { byId('journal-status').textContent = await action(); }
  catch {
    byId('journal-status').textContent = editor
      ? 'The note could not be saved. Your draft is still in the editor; retry when local storage is available.'
      : 'The local operation could not finish. Committed records are retained; remaining locations can be retried.';
    try { await render(); } catch { /* Retain the last visible state if storage is unavailable. */ }
  } finally { busy = false; controls(); }
}

export const journalPanel = {
  reset() { pending = []; importing = true; controls(); },
  add(result) {
    if (result.status !== 'accepted') return;
    const record = {
      id: crypto.randomUUID(), longitude: result.longitude, latitude: result.latitude,
      captureTime: result.captureTime,
    };
    pending.push(record);
    return record;
  },
  finish() { importing = false; controls(); },
};

byId('save-journal').addEventListener('click', () => operate(async () => {
  clearExport();
  const batch = [...pending];
  for (const record of batch) {
    await journal.putObservation(record);
    pending = pending.filter(item => item.id !== record.id);
  }
  await render();
  return `${batch.length} locations saved locally. Reopening this browser restores them. No photographs were stored.`;
}));

byId('export-journal').addEventListener('click', () => operate(async () => {
  clearExport();
  const snapshot = await journal.snapshot();
  const json = JSON.stringify(snapshot, null, 2);
  const geojson = JSON.stringify(journalGeoJSON(snapshot), null, 2);
  downloadURL = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  geoJSONURL = URL.createObjectURL(new Blob([geojson], { type: 'application/geo+json' }));
  byId('journal-download').href = downloadURL;
  byId('journal-download').hidden = false;
  byId('geojson-download').href = geoJSONURL;
  byId('geojson-download').hidden = false;
  byId('journal-export').textContent = json;
  byId('journal-export').hidden = false;
  return 'JSON and GeoJSON ready below from the same saved snapshot. They contain private coordinates and notes. Downloaded copies remain until you delete them yourself.';
}));

byId('clear-journal').addEventListener('click', () => confirmDeletion(
  'Delete all saved locations and journal notes in this browser? This cannot be undone. Original photos, unsaved import results and downloaded copies remain. This diagnostic does not delete cloud data.', async () => {
  clearExport();
  await journal.deleteAll();
  await render();
  return 'All saved records in this local diagnostic journal deleted. Unsaved import results and downloaded copies are separate.';
}));

async function initialize() {
  try {
    const key = 'hk-diagnostic-device-scope-v1';
    let id = localStorage.getItem(key);
    if (id === null) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    await journal.activate({ kind: 'device', id });
    try {
      const response = await fetch('/data/reference/hk-districts.geojson');
      if (!response.ok) throw new Error('District data unavailable');
      const bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== DISTRICT_SOURCE_SHA256) throw new Error('District data changed');
      classify = createDistrictClassifier(JSON.parse(new TextDecoder().decode(bytes)));
    } catch { /* Stored coordinates remain usable without verified district boundaries. */ }
    try {
      const bytes = await Promise.all(['hk-place-points.geojson', 'hk-place-names.json'].map(async name => {
        const response = await fetch(`/data/reference/${name}`);
        if (!response.ok) throw new Error('Place references unavailable');
        return response.arrayBuffer();
      }));
      const catalog = await createPlaceCatalog(...bytes);
      findPlaces = createNearbyPlaceFinder(catalog, classify, { radiusMetres: 1000 });
    } catch { /* Suggestions are optional; their failure cannot hide the private journal. */ }
    await render();
    ready = true;
    byId('journal-status').textContent = 'Local journal reopened. Imports are saved only when you choose Save.';
  } catch {
    byId('journal-status').textContent = 'Local journal unavailable. Photo inspection still works; no persistent save is available.';
  }
  controls();
}

void initialize();
