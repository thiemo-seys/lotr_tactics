/* global console, process, Buffer, window */
// Renders each unit's portrait for the shop's unit cards into packages/client/public/portraits/<id>.webp
// (docs/viewer-spec.md section 4, Portraits). It serves the client with Vite, opens art/portraits/ in
// headless Chromium, which draws each unit's 1★ model the way the game does (render.ts), and saves
// what it draws. Run it after a 1★ model or a livery changes:
//
//   pnpm portraits [id ...]    every unit when no id is given
//
// Playwright isn't one of the repo's dependencies: this uses the copy installed on the machine, as
// art/board.mjs does.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const load = createRequire(import.meta.url);
const { chromium } = load('playwright');

/** Each portrait's width and height in pixels: twice the largest a card draws it, for sharp screens. */
const SIZE = 384;
const QUALITY = 0.82;

const CLIENT = path.join(import.meta.dirname, '../..');
const OUT = path.join(CLIENT, 'public/portraits');
const only = new Set(process.argv.slice(2));

const server = await createServer({ root: CLIENT, logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}art/portraits/`);
  await page.waitForFunction(() => 'portraits' in window);
  const portraits = await page.evaluate(([size, quality]) => window.portraits(size, quality), [SIZE, QUALITY]);
  fs.mkdirSync(OUT, { recursive: true });
  let written = 0;
  for (const [id, url] of Object.entries(portraits)) {
    if (only.size > 0 && !only.has(id)) continue;
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    fs.writeFileSync(path.join(OUT, `${id}.webp`), bytes);
    console.log(`PORTRAIT ${id} ${bytes.length} bytes`);
    written++;
  }
  const missing = [...only].filter((id) => !(id in portraits));
  if (missing.length > 0) throw new Error(`No model for ${missing.join(', ')}`);
  console.log(`${written} portraits in ${path.relative(process.cwd(), OUT)}`);
} finally {
  await browser.close();
  await server.close();
}
