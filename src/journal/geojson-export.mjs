// Input is the validated, atomic LocalJournal.snapshot() contract, not arbitrary EXIF.
// RFC 7946: positions are [longitude, latitude]; unlocated features have null geometry.
export function journalGeoJSON(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.observations) ||
      !Array.isArray(snapshot.journalEntries)) throw new TypeError('Unsupported journal snapshot');
  const notes = new Map();
  const retained = [];
  for (const entry of snapshot.journalEntries) {
    const note = {
      id: entry.id,
      observationId: entry.observationId,
      note: entry.note,
      source: 'user-authored',
      personalPlaceLabel: entry.correctedPlaceLabel === null ? null
        : { value: entry.correctedPlaceLabel, source: 'user-authored', verified: false },
    };
    if (entry.observationId === null) retained.push(note);
    else {
      if (!notes.has(entry.observationId)) notes.set(entry.observationId, []);
      notes.get(entry.observationId).push(note);
    }
  }
  const ids = new Set();
  const features = snapshot.observations.map(record => {
    if (ids.has(record.id)) throw new TypeError('Duplicate observation');
    ids.add(record.id);
    const { longitude, latitude, captureTime } = record;
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
        !Number.isFinite(latitude) || Math.abs(latitude) > 90) throw new TypeError('Invalid coordinates');
    const properties = {
      kind: 'photo-observation', observationId: record.id,
      coordinateSource: 'photo-gps-metadata', locationAccuracy: 'unknown',
      captureTime: { status: captureTime.status }, journalEntries: notes.get(record.id) ?? [],
    };
    if (captureTime.local !== undefined) properties.captureTime.local = captureTime.local;
    if (captureTime.offset !== undefined) properties.captureTime.offset = captureTime.offset;
    if (record.palette) properties.palette = {
      algorithm: record.palette.algorithm, colors: [...record.palette.colors], source: 'photo-pixels',
    };
    return { type: 'Feature', id: `observation:${record.id}`,
      geometry: { type: 'Point', coordinates: [longitude, latitude] }, properties };
  });
  for (const id of notes.keys()) if (!ids.has(id)) throw new TypeError('Missing linked observation');
  for (const entry of retained) features.push({
    type: 'Feature', id: `journal-entry:${entry.id}`, geometry: null,
    properties: { kind: 'unlocated-journal-entry', ...entry },
  });
  return {
    type: 'FeatureCollection',
    journalExport: {
      schemaVersion: 1, sourceSchemaVersion: snapshot.schemaVersion,
      coordinates: 'WGS84 longitude, latitude in decimal degrees; original stored values',
      locationMeaning: 'Photo coordinates do not verify a venue visit or a travelled route.',
      unlocatedNotes: 'Retained without coordinates; some map viewers may hide these features.',
    },
    features,
  };
}
