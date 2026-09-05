export const PALETTE_ALGORITHM = 'rgb-histogram-v1';

// A bounded, deterministic accent palette, not an image description or colour profile.
export function extractPalette(rgba) {
  if (!(rgba instanceof Uint8ClampedArray) || !rgba.length || rgba.length % 4 || rgba.length > 64 * 64 * 4) {
    throw new TypeError('Expected at most 4096 RGBA pixels');
  }
  const bins = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const [r, g, b] = rgba.subarray(i, i + 3);
    const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const bin = bins.get(key) ?? { key, count: 0, sum: [0, 0, 0] };
    bin.count++;
    bin.sum[0] += r; bin.sum[1] += g; bin.sum[2] += b;
    bins.set(key, bin);
  }
  const ranked = [...bins.values()].sort((a, b) => b.count - a.count || a.key - b.key);
  const selected = [];
  for (const bin of ranked) {
    const rgb = bin.sum.map(value => Math.round(value / bin.count));
    // RGB distance is a simple design heuristic; it is not perceptually uniform.
    if (selected.some(other => rgb.reduce((sum, value, i) => sum + (value - other[i]) ** 2, 0) < 48 ** 2)) continue;
    selected.push(rgb);
    if (selected.length === 3) break;
  }
  return { algorithm: PALETTE_ALGORITHM, colors: selected.map(rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()) };
}

export async function decodePalette(file) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return { status: 'decoder-unavailable' };
  let bitmap;
  let canvas;
  let pixels;
  try {
    bitmap = await createImageBitmap(file, { resizeWidth: 64, resizeHeight: 64, resizeQuality: 'low' });
    canvas = new OffscreenCanvas(64, 64);
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!context) return { status: 'decoder-unavailable' };
    context.drawImage(bitmap, 0, 0, 64, 64);
    pixels = context.getImageData(0, 0, 64, 64).data;
    const palette = extractPalette(pixels);
    return palette.colors.length ? { status: 'ready', ...palette } : { status: 'no-visible-pixels' };
  } catch {
    return { status: 'decode-unavailable' };
  } finally {
    pixels?.fill(0);
    bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export function paletteSwatch(palette) {
  const canvas = document.createElement('canvas');
  canvas.width = palette.colors.length * 64;
  canvas.height = 32;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Photo colours: ${palette.colors.join(', ')}`);
  const context = canvas.getContext('2d');
  palette.colors.forEach((color, i) => {
    context.fillStyle = color;
    context.fillRect(i * 64, 0, 64, 32);
  });
  return canvas;
}
