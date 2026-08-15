// Renders each .card section in cards.html to a 1080×1920 PNG.
//   node marketing/tiktok/render.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1160, height: 2000 } });
await page.goto('file://' + path.join(here, 'cards.html'));
await page.waitForFunction(() => document.fonts.status === 'loaded');

const ids = await page.$$eval('.card', (els) => els.map((e) => e.id));
for (const id of ids) {
  const out = path.join(here, `${id}.png`);
  await page.locator('#' + id).screenshot({ path: out });
  console.log('wrote', out);
}

await browser.close();
