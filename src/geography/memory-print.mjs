// Matches the Figma overview's affine longitude/latitude projection, not a navigation map.
export const MEMORY_PRINT_VIEWPORT = Object.freeze({
  west: 113.92, south: 22.16, east: 114.43, north: 22.56,
  width: 1000, height: 845, cellSize: 10,
  projection: 'affine-longitude-latitude',
});

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// Rebuild from an atomic LocalJournal snapshot; never retain deleted marks or colours.
export function memoryPrint(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.observations) ||
      !Array.isArray(snapshot.journalEntries)) throw new TypeError('Unsupported journal snapshot');
  const viewport = { ...MEMORY_PRINT_VIEWPORT };
  const { west, south, east, north, width, height, cellSize } = viewport;
  const cells = new Map(), ids = new Set(), outsideViewport = [];
  for (const record of snapshot.observations) {
    const { id, longitude, latitude, palette } = record;
    if (typeof id !== 'string' || !id || ids.has(id)) throw new TypeError('Invalid or duplicate observation');
    ids.add(id);
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
        !Number.isFinite(latitude) || Math.abs(latitude) > 90) throw new TypeError('Invalid coordinates');
    if (palette !== undefined && (palette?.algorithm !== 'rgb-histogram-v1' ||
        !Array.isArray(palette.colors) || palette.colors.length < 1 || palette.colors.length > 3 ||
        palette.colors.some(color => typeof color !== 'string' || !/^#[0-9A-F]{6}$/.test(color)) ||
        new Set(palette.colors).size !== palette.colors.length)) throw new TypeError('Invalid photo palette');
    const evidence = { id, longitude, latitude };
    if (longitude < west || longitude > east || latitude < south || latitude > north) {
      outsideViewport.push(evidence);
      continue;
    }
    const x = (longitude - west) / (east - west) * width;
    const y = (north - latitude) / (north - south) * height;
    const column = Math.min(Math.floor(x / cellSize), Math.ceil(width / cellSize) - 1);
    const row = Math.min(Math.floor(y / cellSize), Math.ceil(height / cellSize) - 1);
    const key = `${column}:${row}`;
    if (!cells.has(key)) cells.set(key, { column, row, members: [], votes: new Map(), paletteCount: 0 });
    const cell = cells.get(key);
    cell.members.push({ ...evidence, x, y });
    if (palette) {
      cell.paletteCount++;
      for (const color of palette.colors) cell.votes.set(color, (cell.votes.get(color) ?? 0) + 1);
    }
  }
  const marks = [...cells.values()].sort((a, b) => a.row - b.row || a.column - b.column).map(cell => ({
    id: `cell:${cell.column}:${cell.row}`,
    // Decorative anchor is the cell centre; member positions retain the original projection.
    x: (cell.column * cellSize + Math.min((cell.column + 1) * cellSize, width)) / 2,
    y: (cell.row * cellSize + Math.min((cell.row + 1) * cellSize, height)) / 2,
    observationCount: cell.members.length,
    paletteCount: cell.paletteCount,
    colors: [...cell.votes].sort((a, b) => b[1] - a[1] || compare(a[0], b[0])).slice(0, 3).map(([color]) => color),
    members: cell.members.sort((a, b) => compare(a.id, b.id)),
  }));
  return {
    viewport,
    coordinateSource: 'photo-gps-metadata', locationAccuracy: 'unknown',
    meaning: 'Decorative grid grouping, not verified places, travelled routes or area coverage.',
    observationCount: ids.size,
    displayedObservationCount: ids.size - outsideViewport.length,
    marks,
    outsideViewport: outsideViewport.sort((a, b) => compare(a.id, b.id)),
  };
}
