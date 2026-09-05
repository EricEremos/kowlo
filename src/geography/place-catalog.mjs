// Refresh both pins only after repeating the source and join audit.
export const PLACE_SOURCE = Object.freeze({
  datasetId: 'landsd_rcd_1648571595120_89752',
  pointsSha256: '156ba14a179f8e9454616cb2035877cf64824bb5c31cd4c8e86316ec84e74952',
  namesSha256: '084ae525b636f94d65c45ad938e313779f0f7b735a74300efee2ee4177c60d33',
});

function snapshot(input) {
  if (input instanceof Uint8Array) return Uint8Array.from(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input).slice();
  throw new TypeError('Place source must be raw ArrayBuffer or Uint8Array bytes');
}

async function verifiedJson(bytes, expectedHash, label) {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw new Error(`Place ${label} source hash mismatch`);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Load the audited public reference. This does not assign photos or award visits. */
export async function createPlaceCatalog(pointBytes, nameBytes) {
  // Copy both before awaiting so callers cannot change what is parsed after hashing.
  const pointsSnapshot = snapshot(pointBytes);
  const namesSnapshot = snapshot(nameBytes);
  const [points, names] = await Promise.all([
    verifiedJson(pointsSnapshot, PLACE_SOURCE.pointsSha256, 'points'),
    verifiedJson(namesSnapshot, PLACE_SOURCE.namesSha256, 'names'),
  ]);
  const byId = new Map();
  for (const feature of points.features) {
    const properties = feature.properties;
    const id = properties.GEO_NAME_ID;
    if (byId.has(id)) throw new Error('Duplicate geographic ID');
    byId.set(id, {
      id,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
      placeClass: properties.PLACE_CLASS,
      placeType: properties.PLACE_TYPE,
      sourceDistrictCode: properties.DISTRICT,
      officialName: null,
      aliases: [],
      source: PLACE_SOURCE,
    });
  }
  for (const { attributes } of names.features) {
    const place = byId.get(attributes.GEO_NAME_ID);
    if (!place) throw new Error('Orphan place name');
    const name = Object.freeze({
      id: attributes.PLACE_NAME_ID,
      en: attributes.NAME_EN,
      zhHant: attributes.NAME_TC,
    });
    if (attributes.NAME_STATUS === 'Official') {
      if (place.officialName) throw new Error('Duplicate official place name');
      place.officialName = name;
    } else if (attributes.NAME_STATUS === 'Alias') {
      place.aliases.push(name);
    } else {
      throw new Error('Unknown place name status');
    }
  }
  const places = [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const place of places) {
    if (!place.officialName) throw new Error('Missing official place name');
    Object.freeze(place.aliases.sort((a, b) => a.id - b.id));
    Object.freeze(place);
  }
  return Object.freeze({
    source: PLACE_SOURCE,
    places: Object.freeze(places),
    // Geographic IDs remain strings, matching the source rather than a row index.
    get: id => byId.get(id) ?? null,
  });
}
