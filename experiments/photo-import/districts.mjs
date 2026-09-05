// The published browser bundle includes its predicate dependency and also runs in Node ESM.
import '../../node_modules/point-in-polygon-hao/dist/pointInPolygon.js';

const inside = globalThis.pointInPolygon;
export const DISTRICT_SOURCE_SHA256 = 'e145cc41230d8215dfb0a797230a0c9671827c018ba608bfc3086966da4735c8';

export function createDistrictClassifier(collection) {
  if (collection?.type !== 'FeatureCollection' || collection.features?.length !== 18) {
    throw new Error('Unexpected district dataset');
  }
  const ids = new Set();
  const districts = collection.features.map(feature => {
    const id = feature.properties?.['地區號碼'];
    const rings = feature.geometry?.coordinates;
    if (typeof id !== 'string' || ids.has(id) || feature.geometry?.type !== 'Polygon' || !Array.isArray(rings) || !rings.length) {
      throw new Error('Unexpected district geometry');
    }
    ids.add(id);
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.some(point => !Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) {
        throw new Error('Invalid district ring');
      }
    }
    return { id, name: feature.properties.District, nameZh: feature.properties['地區'], rings };
  });

  return (longitude, latitude) => {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      return { status: 'invalid-coordinate', matches: [], milestoneDistrictId: null };
    }
    const matches = [];
    for (const { rings, ...district } of districts) {
      const relation = inside([longitude, latitude], rings);
      if (relation === true || relation === 0) matches.push({ ...district, relation: relation === 0 ? 'boundary' : 'interior' });
    }
    matches.sort((a, b) => a.id.localeCompare(b.id));
    const uniqueInterior = matches.length === 1 && matches[0].relation === 'interior';
    return {
      status: uniqueInterior ? 'assigned' : matches.length ? 'ambiguous' : 'outside-dataset',
      sourceSha256: DISTRICT_SOURCE_SHA256,
      matches,
      // A unique administrative match is not proof of GPS accuracy or a specific venue.
      milestoneDistrictId: uniqueInterior ? matches[0].id : null,
    };
  };
}

export function countDistrictMilestones(results) {
  return new Set(results.filter(result => result.status === 'accepted' && result.district?.status === 'assigned' && result.district?.milestoneDistrictId).map(result => result.district.milestoneDistrictId)).size;
}
