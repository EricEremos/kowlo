import { extractMetadata, MAX_FILE_BYTES } from './metadata.mjs';
import { createDistrictClassifier } from './districts.mjs';
import { decodePalette } from './palette.mjs';
import { createPlaceCatalog } from '../../src/geography/place-catalog.mjs';
import { createNearbyPlaceFinder } from '../../src/geography/nearby-places.mjs';

let classifyDistrict;
let findPlacesReady = Promise.resolve(null);

self.onmessage = async ({ data }) => {
  if (data.type === 'initialize-geography') {
    try {
      classifyDistrict = createDistrictClassifier(data.collection);
    } catch {
      classifyDistrict = undefined;
    }
    const classifier = classifyDistrict;
    findPlacesReady = createPlaceCatalog(data.pointBytes, data.nameBytes)
      .then(catalog => createNearbyPlaceFinder(catalog, classifier, { radiusMetres: 1000 }))
      .catch(() => null);
    return;
  }
  const { id, file, includeCaptureTime } = data;
  if (!(file instanceof Blob)) return self.postMessage({ id, result: { status: 'invalid-input' } });
  if (file.size > MAX_FILE_BYTES) return self.postMessage({ id, result: { status: 'too-large' } });
  if (data.type === 'palette') return self.postMessage({ id, result: await decodePalette(file) });
  try {
    const result = await extractMetadata(new Uint8Array(await file.arrayBuffer()), { includeCaptureTime });
    if (result.status === 'accepted') {
      result.district = classifyDistrict ? classifyDistrict(result.longitude, result.latitude) : { status: 'geography-unavailable', matches: [], milestoneDistrictId: null };
      const findPlaces = await findPlacesReady;
      result.locality = findPlaces ? findPlaces(result.longitude, result.latitude)
        : { status: 'reference-unavailable', candidates: [] };
    }
    self.postMessage({ id, result });
  } catch {
    self.postMessage({ id, result: { status: 'unreadable-file' } });
  }
};
