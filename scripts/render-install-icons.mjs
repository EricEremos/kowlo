import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const source = await readFile(new URL('../docs/design-assets/kowlo-symbol.svg', import.meta.url), 'utf8');
const paths = source.match(/<path\b[^>]*\/>/g).join('').replace(/fill="#[A-Fa-f0-9]+"/g, 'fill="#F6F4EF"');
const destination = new URL('../app/icons/', import.meta.url);
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  // Existing Harbour K, centred by its 20..116 / 16..112 bounds.
  // The entire silhouette fits inside the maskable icon's central 80% circle.
  for (const size of [180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path fill="#263B3E" d="M0 0H128V128H0Z"/><g transform="translate(64 64) scale(.72) translate(-68 -64)">${paths}</g></svg>`);
    await page.screenshot({ path: fileURLToPath(new URL(`kowlo-${size}.png`, destination)) });
  }
} finally { await browser.close(); }
