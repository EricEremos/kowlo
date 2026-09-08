import { LocalJournal } from '../src/journal/local-journal.mjs';
import { memoryPrint } from '../src/geography/memory-print.mjs';
import { createDistrictClassifier, districtChapters, DISTRICT_SOURCE_SHA256 } from '../experiments/photo-import/districts.mjs';

const main = document.querySelector('main');
const status = document.querySelector('#status');
const journal = new LocalJournal();
const svgNS = 'http://www.w3.org/2000/svg';
let classify, ready = false, revision = 0, exportURL, renderedRoute;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motion = new Set();
function stopMotion() {
  for (const animation of motion) animation.cancel();
  motion.clear();
}
reducedMotion.addEventListener('change', stopMotion);
function animate(node, frames, options) {
  if (reducedMotion.matches || !node?.animate) return;
  const animation = node.animate(frames, options);
  motion.add(animation);
  animation.finished.then(() => motion.delete(animation), () => motion.delete(animation));
}
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const link = (text, href, className) => {
  const node = el('a', text, className);
  node.href = href;
  return node;
};
const svg = (tag, attrs) => {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const heading = (title, subtitle) => {
  const block = el('div', undefined, 'intro');
  block.append(el('h1', title));
  if (subtitle) block.append(el('p', subtitle));
  return block;
};
function palettes(colors) {
  const node = el('span', undefined, 'swatches');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', colors.length ? `Photo colours: ${colors.join(', ')}` : 'No photo colours saved');
  for (const color of colors) {
    const dot = svg('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' });
    dot.append(svg('circle', { cx: 7, cy: 7, r: 6, fill: color }));
    node.append(dot);
  }
  return node;
}
function map(snapshot) {
  const print = memoryPrint(snapshot);
  const figure = el('figure', undefined, 'atlas-figure');
  const drawing = svg('svg', { viewBox: '0 0 1000 845', class: 'atlas-map', role: 'img', 'aria-label': `Hong Kong overview with ${count(print.displayedObservationCount, 'saved location')}. Original coordinates are available in the memory list.` });
  drawing.append(svg('image', { href: '/docs/design-assets/memory-print-empty.svg', width: 1000, height: 845 }));
  for (const mark of print.marks) {
    const colors = mark.colors.length ? mark.colors : ['#263B3E'];
    const group = svg('g', { 'data-cell': mark.id });
    for (let i = 0; i < colors.length; i++) {
      const x = mark.x + (i - (colors.length - 1) / 2) * 3;
      const y = mark.y;
      group.append(svg('path', { d: `M${x - 3},${y + 3}l3,-6l3,6M${x},${y - 3}v7`, stroke: colors[i], class: 'mark' }));
    }
    drawing.append(group);
  }
  const caption = el('figcaption');
  caption.append(el('span', 'HONG KONG'), el('span', count(print.marks.length, 'memory mark')));
  figure.append(drawing, caption);
  if (print.outsideViewport.length) figure.append(el('p', `${count(print.outsideViewport.length, 'location')} beyond this cropped overview. All remain in your memory lists.`, 'notice'));
  return figure;
}
function chapterRows(chapters) {
  const list = el('ul', undefined, 'chapter-list');
  for (const chapter of chapters) {
    const row = el('li');
    row.append(link(chapter.name, `#district/${chapter.id}`, 'text-link chapter-title'));
    const meta = el('div', undefined, 'chapter-meta');
    meta.append(el('span', count(chapter.observationCount, 'saved location')), palettes(chapter.colors));
    row.append(meta);
    list.append(row);
  }
  return list;
}
function memoryRows(records, snapshot) {
  const list = el('ul', undefined, 'memory-list');
  records.forEach((record, index) => {
    const row = el('li');
    const personal = snapshot.journalEntries.find(note => note.observationId === record.id && note.correctedPlaceLabel)?.correctedPlaceLabel;
    row.append(link(personal || `Memory ${String(index + 1).padStart(2, '0')}`, `#memory/${record.id}`, 'text-link chapter-title'));
    const meta = el('div', undefined, 'chapter-meta');
    meta.append(el('span', `${record.latitude}, ${record.longitude}`), palettes(record.palette?.colors ?? []));
    row.append(meta);
    list.append(row);
  });
  return list;
}
function sourceNotice() {
  const disclosure = el('details');
  disclosure.append(el('summary', 'How your atlas works'), el('p', 'Marks group photo coordinates; they do not measure area explored or GPS accuracy. Saved photo colours make each mark yours. Locations without colours still count.', 'notice'));
  return disclosure;
}
function atlas(snapshot, chapters, unassigned) {
  const layout = el('div', undefined, 'atlas-layout');
  layout.append(heading('Hong Kong,\nin your colours.'), map(snapshot));
  const details = el('section', undefined, 'atlas-details');
  const summary = el('div', undefined, 'summary');
  const total = el('div', undefined, 'district-total');
  total.append(el('strong', classify ? `${String(chapters.length).padStart(2, '0')} / 18` : '— / 18', 'number'), el('span', classify ? 'districts with memories' : 'district data unavailable', 'count-label'));
  summary.append(total, el('p', count(snapshot.observations.length, 'saved photo location')));
  details.append(summary);
  if (chapters.length) details.append(link(chapters[0].name, `#district/${chapters[0].id}`, 'text-link chapter-title'));
  else {
    const empty = el('div', undefined, 'empty');
    empty.append(el('h2', snapshot.observations.length ? 'Your memories are here.' : 'Your Hong Kong begins with you.'), el('p', snapshot.observations.length ? 'Explore your saved locations below. District matches will appear when the reference data is available.' : 'Your existing photographs will give this city its colours. The automatic phone-library connection is still being built.', 'notice'));
    details.append(empty);
  }
  if (unassigned.length) details.append(link(`${count(unassigned.length, 'location')} without a district chapter`, '#unassigned', 'text-link'));
  details.append(link('Explore all chapters', '#chapters', 'text-link'));
  layout.append(details);
  main.append(layout);
}
function collection(snapshot, chapters, unassigned) {
  main.append(heading('Your chapters.'));
  if (chapters.length) main.append(chapterRows(chapters));
  else main.append(el('p', snapshot.observations.length ? 'No confirmed district chapters yet.' : 'Your first chapter is waiting for your photographs.'));
  if (unassigned.length) main.append(link(`${count(unassigned.length, 'location')} without a confirmed district`, '#unassigned', 'text-link'));
}
function district(id, snapshot, classified, chapters) {
  const chapter = chapters.find(item => item.id === id);
  if (!chapter) return missing();
  const records = classified.filter(item => item.district?.milestoneDistrictId === id);
  main.append(link('← All chapters', '#chapters', 'back'));
  const layout = el('div', undefined, 'atlas-layout');
  layout.append(heading(chapter.name, `${count(records.length, 'saved location')} in this chapter.`), map({ ...snapshot, observations: records }));
  const detail = el('div', undefined, 'atlas-details');
  detail.append(el('h2', 'Your colours.'), palettes(chapter.colors));
  if (!chapter.paletteCount) detail.append(el('p', 'No photo colours saved yet.'));
  layout.append(detail);
  main.append(layout, memoryRows(records, snapshot));
}
function missing() {
  main.append(heading('This memory has moved on.', 'It may have been removed from this browser.'), link('Return to your atlas', '#atlas', 'text-link'));
}
function detail(record, snapshot) {
  if (!record) return missing();
  const saved = snapshot.journalEntries.filter(note => note.observationId === record.id);
  const first = saved[0];
  const section = el('section', undefined, 'detail');
  section.append(link('← Your chapter', record.district?.milestoneDistrictId ? `#district/${record.district.milestoneDistrictId}` : '#unassigned', 'back'));
  section.append(heading(first?.correctedPlaceLabel || 'A moment, kept.', record.district?.status === 'assigned' ? record.district.matches[0].name : 'District not confirmed'));
  const evidence = el('dl', undefined, 'evidence');
  const facts = [
    ['Original photo coordinates', `${record.latitude}, ${record.longitude}`],
    ['Location accuracy', 'Not supplied by the saved metadata'],
    ['Capture time', record.captureTime.status === 'not-requested' ? 'Not imported' : record.captureTime.local ? `${record.captureTime.local} · ${record.captureTime.offset ?? (record.captureTime.status === 'invalid-offset' ? 'invalid timezone offset' : 'timezone unknown')}` : record.captureTime.status],
    ['District match', !classify ? 'Reference data unavailable' : record.district.status === 'assigned' ? 'Inside one district boundary' : record.district.status === 'ambiguous' ? 'Boundary match — needs review' : 'Outside the district reference dataset'],
  ];
  for (const [name, value] of facts) { const group = el('div'); group.append(el('dt', name), el('dd', value)); evidence.append(group); }
  section.append(palettes(record.palette?.colors ?? []));
  const locationDetails = el('details');
  locationDetails.append(el('summary', 'Location details'), evidence);
  section.append(locationDetails);
  const form = el('form');
  const label = el('label', 'Your name for this memory'); label.htmlFor = 'place-label';
  const input = el('input'); input.id = 'place-label'; input.maxLength = 160; input.value = first?.correctedPlaceLabel ?? '';
  const noteLabel = el('label', 'A note to return to'); noteLabel.htmlFor = 'memory-note';
  const note = el('textarea'); note.id = 'memory-note'; note.maxLength = 4000; note.value = first?.note ?? '';
  const save = el('button', 'Save memory', 'primary'); save.type = 'submit';
  form.append(label, input, noteLabel, note, save);
  form.addEventListener('input', () => { form.dataset.dirty = 'true'; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      await journal.putJournalEntry({ id: first?.id ?? crypto.randomUUID(), observationId: record.id, note: note.value, correctedPlaceLabel: input.value.trim() || null });
      await render(); status.textContent = 'Memory saved on this browser.';
      document.querySelector('#memory-note')?.focus();
    } catch { status.textContent = 'This memory could not be saved. Your draft is still here; try again.'; save.disabled = false; }
  });
  section.append(form);
  for (const extra of saved.slice(1)) section.append(el('p', extra.correctedPlaceLabel ?? 'Another note', 'eyebrow'), el('p', extra.note, 'note'));
  const remove = el('button', 'Remove saved location', 'danger');
  remove.addEventListener('click', async () => {
    if (!confirm('Remove this saved location from this browser? Its journal notes will be kept under You. Original photographs and cloud data are not deleted.')) return;
    remove.disabled = true;
    try { await journal.deleteObservation(record.id); location.hash = '#you'; status.textContent = 'Location removed. Any journal notes are kept under You.'; }
    catch { status.textContent = 'The location could not be removed. Try again.'; remove.disabled = false; }
  });
  section.append(remove); main.append(section);
}
function you(snapshot) {
  main.append(heading('Yours to keep.'), el('p', `${count(snapshot.observations.length, 'location')} and ${count(snapshot.journalEntries.length, 'journal note')} saved on this browser.`));
  const download = link('Export your local journal', '#you', 'download');
  download.addEventListener('click', event => {
    if (exportURL) URL.revokeObjectURL(exportURL);
    exportURL = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    download.href = exportURL; download.download = 'kowlo-local-journal.json';
    event.stopPropagation();
  });
  main.append(download, el('p', 'The export includes exact coordinates and your notes. Keep the downloaded file somewhere private.', 'notice'));
  const orphaned = snapshot.journalEntries.filter(note => note.observationId === null);
  if (orphaned.length) {
    main.append(el('h2', 'Notes you kept.', 'section-space'));
    for (const note of orphaned) {
      const article = el('article'); article.append(el('h3', note.correctedPlaceLabel || 'A saved note', 'section-space'), el('p', note.note, 'note'));
      main.append(article);
    }
  }
  const preview = el('details');
  preview.append(el('summary', 'Photo access & storage'), el('p', 'Locations, colours and notes stay in this browser. Original photographs are not stored here. Automatic photo-library access, accounts and cloud sync are still in development.', 'notice'));
  main.append(preview, sourceNotice());
}
async function render(focus = false) {
  if (!ready) return;
  const current = ++revision;
  try {
    const snapshot = await journal.snapshot();
    if (current !== revision) return;
    if (exportURL) { URL.revokeObjectURL(exportURL); exportURL = undefined; }
    const classified = snapshot.observations.map(item => ({ ...item, status: 'accepted', district: classify?.(item.longitude, item.latitude) }));
    const chapters = districtChapters(classified);
    const unassigned = classified.filter(item => !item.district?.milestoneDistrictId);
    const [route, id] = location.hash.slice(1).split('/');
    const routeKey = location.hash || '#atlas';
    const changedRoute = renderedRoute !== undefined && renderedRoute !== routeKey;
    const previousMarks = new Map([...main.querySelectorAll('[data-cell]')].map(node => [node.dataset.cell, node.innerHTML]));
    stopMotion();
    main.replaceChildren();
    if (!route || route === 'atlas') atlas(snapshot, chapters, unassigned);
    else if (route === 'chapters') collection(snapshot, chapters, unassigned);
    else if (route === 'district') district(id, snapshot, classified, chapters);
    else if (route === 'memory') detail(classified.find(item => item.id === id), snapshot);
    else if (route === 'unassigned') main.append(link('← All chapters', '#chapters', 'back'), heading('Every memory belongs.', 'These locations do not yet have a confirmed district chapter.'), memoryRows(unassigned, snapshot));
    else if (route === 'you') you(snapshot);
    else missing();
    const navigation = document.querySelector('.main-navigation');
    for (const [index, a] of [...navigation.querySelectorAll('a')].entries()) {
      const active = a.hash === `#${!route ? 'atlas' : ['district', 'memory', 'unassigned'].includes(route) ? 'chapters' : route}`;
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      if (active) navigation.style.setProperty('--selected-tab', index);
    }
    navigation.dataset.hasSelection = String(!!navigation.querySelector('[aria-current]'));
    if (changedRoute) animate(main.querySelector('.intro'), [{ opacity: .6 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.22,1,.36,1)' });
    if (!changedRoute) {
      const changedMarks = [...main.querySelectorAll('[data-cell]')].filter(node => previousMarks.get(node.dataset.cell) !== node.innerHTML);
      changedMarks.forEach((node, index) => animate(node, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: Math.min(index * 12, 120), fill: 'backwards', easing: 'cubic-bezier(.22,1,.36,1)' }));
    }
    renderedRoute = routeKey;
    document.title = `${main.querySelector('h1')?.textContent ?? 'Your atlas'} · KOWLO`;
    if (focus) { main.focus(); window.scrollTo(0, 0); }
  } catch { status.textContent = 'Your local journal could not be read. Reload to try again.'; }
}
async function initialize() {
  try {
    const key = 'hk-diagnostic-device-scope-v1';
    let id = localStorage.getItem(key);
    if (id === null) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
    await journal.activate({ kind: 'device', id });
    try {
      const response = await fetch('/data/reference/hk-districts.geojson');
      if (!response.ok) throw new Error('District reference unavailable');
      const bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== DISTRICT_SOURCE_SHA256) throw new Error('District reference changed');
      classify = createDistrictClassifier(JSON.parse(new TextDecoder().decode(bytes)));
    } catch { status.textContent = 'District reference unavailable. Your saved locations remain accessible.'; }
    ready = true;
    await render();
    document.body.dataset.ready = 'true';
  } catch {
    main.replaceChildren(heading('Your journal could not open.', 'This browser may be blocking local storage. Allow site storage and reload to try again.'));
  }
}
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); main.focus(); });
window.addEventListener('hashchange', () => { void render(true); });
const refresh = () => { if (!document.querySelector('form[data-dirty="true"]')) void render(); };
window.addEventListener('pageshow', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
void initialize();
