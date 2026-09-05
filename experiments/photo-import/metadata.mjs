import { parse } from '../../node_modules/exifr/dist/full.esm.mjs';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const GPS_TAGS = ['GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef'];
const DATE_TAGS = ['DateTimeOriginal', 'OffsetTimeOriginal'];

function coordinate(parts, ref, positive, negative, limit) {
  if (!Array.isArray(parts) || parts.length !== 3 || !parts.every(Number.isFinite)) return null;
  const [degrees, minutes, seconds] = parts;
  if (degrees < 0 || degrees > limit || minutes < 0 || minutes >= 60 || seconds < 0 || seconds > 60) return null;
  if (ref !== positive && ref !== negative) return null;
  const value = degrees + minutes / 60 + seconds / 3600;
  if (value > limit) return null;
  return value * (ref === negative ? -1 : 1);
}

export function captureTime(raw) {
  const value = raw.DateTimeOriginal;
  if (typeof value !== 'string') return { status: 'missing' };
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { status: 'invalid' };
  const [, year, month, day, hour, minute, second] = match;
  const local = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const probe = new Date(`${local}Z`);
  if (!Number.isFinite(probe.valueOf()) || probe.toISOString().slice(0, 19) !== local) return { status: 'invalid' };
  const offset = raw.OffsetTimeOriginal;
  if (offset === undefined) return { status: 'timezone-unknown', local };
  if (typeof offset !== 'string' || !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset) || (/^[+-]14:/.test(offset) && !offset.endsWith(':00'))) return { status: 'invalid-offset', local };
  return { status: 'with-offset', local, offset, instant: new Date(`${local}${offset}`).toISOString() };
}

// Only bytes are accepted: never allow the parser's URL or filesystem input paths.
export async function extractMetadata(bytes, { includeCaptureTime = false } = {}) {
  if (!(bytes instanceof Uint8Array)) return { status: 'invalid-input' };
  if (bytes.byteLength > MAX_FILE_BYTES) return { status: 'too-large' };
  if (bytes.byteLength < 12) return { status: 'malformed-file' };
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const header = String.fromCharCode(...bytes.subarray(4, 64));
  const heic = header.startsWith('ftyp') && /heic|heix|hevc|hevx|mif1/.test(header);
  if (!jpeg && !heic) return { status: 'unsupported-format' };
  try {
    const raw = await parse(bytes, {
      tiff: true, ifd0: false, ifd1: false, exif: includeCaptureTime,
      gps: true, interop: false, xmp: false, icc: false, iptc: false,
      jfif: false, ihdr: false, makerNote: false, userComment: false,
      pick: includeCaptureTime ? [...GPS_TAGS, ...DATE_TAGS] : GPS_TAGS,
      translateKeys: true, translateValues: false, reviveValues: false,
      silentErrors: false, mergeOutput: true,
    }) ?? {};
    if (!GPS_TAGS.some(tag => raw[tag] !== undefined)) return { status: 'missing-gps' };
    const latitude = coordinate(raw.GPSLatitude, raw.GPSLatitudeRef, 'N', 'S', 90);
    const longitude = coordinate(raw.GPSLongitude, raw.GPSLongitudeRef, 'E', 'W', 180);
    if (latitude === null || longitude === null) return { status: 'malformed-gps' };
    const result = { status: 'accepted', format: jpeg ? 'jpeg' : 'heic', latitude, longitude };
    if (includeCaptureTime) result.captureTime = captureTime(raw);
    return result;
  } catch {
    // Raw parser errors can include private metadata; do not log or forward them.
    return { status: 'malformed-file' };
  }
}
