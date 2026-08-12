// Generates PWA icons (192, 512, maskable 512) from the CODEBYTERS logo.
// Uses the project's existing Playwright + Chromium — no new deps.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public');
mkdirSync(outDir, { recursive: true });

const logoUrl = 'file:///' + join(__dirname, '..', 'public', 'assets', 'codebyterts-logo.gif').replaceAll('\\', '/');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });

async function shot(size, path, maskable) {
  // Brand background (#0B2B3A deep navy) with subtle teal radial glow.
  const pad = maskable ? 96 : 0; // maskable safe-zone
  const inner = size - pad * 2;
  await page.setContent(`
    <!doctype html><body style="margin:0;background:${maskable ? '#0B2B3A' : 'transparent'}">
      <div id="card" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
        background:radial-gradient(circle at 50% 42%, #14465e 0%, #0B2B3A 62%);
        border-radius:${maskable ? 0 : size * 0.22}px;overflow:hidden">
        <img src="${logoUrl}" style="width:${inner}px;height:${inner}px;object-fit:contain" crossorigin="anonymous"/>
      </div>
    </body>`);
  await page.waitForTimeout(500);
  const el = page.locator('#card');
  await el.screenshot({ path });
  console.log(`wrote ${path} (${size}px${maskable ? ', maskable' : ''})`);
}

await shot(192, join(outDir, 'pwa-192x192.png'), false);
await shot(512, join(outDir, 'pwa-512x512.png'), false);
await shot(512, join(outDir, 'pwa-maskable-512x512.png'), true);

await browser.close();
console.log('done');
