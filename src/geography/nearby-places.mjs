const EARTH_RADIUS_METRES = 6371008.8;
const radians = degrees => degrees * Math.PI / 180;

function distanceMetres(longitude, latitude, place) {
  const a = Math.sin(radians(place.latitude - latitude) / 2) ** 2
    + Math.cos(radians(latitude)) * Math.cos(radians(place.latitude))
    * Math.sin(radians(place.longitude - longitude) / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

/** Rank label points from a verified catalog; never infer containment or attendance. */
export function createNearbyPlaceFinder(catalog, classifyDistrict, { radiusMetres, limit = 3 }) {
  if (!Number.isFinite(radiusMetres) || radiusMetres <= 0 || !Number.isInteger(limit) || limit < 1) {
    throw new TypeError('A positive search radius and integer result limit are required');
  }
  const places = catalog.places.filter(place => place.placeClass === 'Settlement'
    || place.placeType === 'Island' || place.placeType === 'Islands');
  const policy = {
    method: 'haversine-label-point-v1',
    source: catalog.source,
    radiusMetres,
    limit,
    meaning: 'Unconfirmed nearby label points, not locality boundaries or verified visits',
  };
  return (longitude, latitude) => {
    const empty = status => ({ ...policy, status, candidates: [] });
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      return empty('invalid-coordinate');
    }
    if (!classifyDistrict) return empty('geography-unavailable');
    const district = classifyDistrict(longitude, latitude);
    if (district.status !== 'assigned') return empty(district.status);
    const candidates = places.map(place => ({ place, distance: distanceMetres(longitude, latitude, place) }))
      .filter(item => item.distance <= radiusMetres)
      .sort((a, b) => a.distance - b.distance || Number(a.place.id) - Number(b.place.id))
      .slice(0, limit)
      .map(({ place, distance }) => ({
        id: place.id,
        name: place.officialName,
        placeClass: place.placeClass,
        placeType: place.placeType,
        distanceMetres: Math.round(distance),
        confirmed: false,
      }));
    return { ...policy, status: candidates.length ? 'suggestions' : 'no-nearby-labels', candidates };
  };
}
