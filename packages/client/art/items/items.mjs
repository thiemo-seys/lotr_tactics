/* global console, process */
// Writes the item chips' art (docs/viewer-spec.md section 2, Item art) into
// packages/client/public/items/: one SVG per item, from the design picks.json chooses for it, and
// one per Corruption tier for the One Ring. Run it after a design or a pick changes:
//
//   pnpm items              write every item's art
//   pnpm items --gallery    also write gallery.html here: every design, three to an item, to choose from

import fs from 'node:fs';
import path from 'node:path';
import { ITEM_DESIGNS, ONE_RING_DESIGNS } from './designs.mjs';
import { frame as oneRingFrame, TIERS } from './designs/one-ring.mjs';
import { frame, background } from './kit.mjs';

const OUT = path.join(import.meta.dirname, '../../public/items');
const picks = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'picks.json'), 'utf8'));

/** An icon as a standalone SVG file on the 64-unit grid; every id in it starts with `i-`. */
const file = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body}</svg>\n`;
const itemSvg = (item, variant) => file(frame('i-', item.kind, ...background(item, variant), variant.draw('i-')));
const oneRingSvg = (design, tier) => file(oneRingFrame('i-', tier, design.draw('i-', tier)));

/** The design `picks` chooses for an id, failing if there is no such pick or design. */
function picked(id, designs) {
  const pick = picks[id];
  const design = designs[pick - 1];
  if (design === undefined) throw new Error(`picks.json has no design for ${id} (pick ${pick})`);
  return design;
}

fs.mkdirSync(OUT, { recursive: true });
const written = new Set();
for (const item of ITEM_DESIGNS) {
  fs.writeFileSync(path.join(OUT, `${item.id}.svg`), itemSvg(item, picked(item.id, item.variants)));
  written.add(`${item.id}.svg`);
}
const ring = picked('one-ring', ONE_RING_DESIGNS);
for (const tier of Object.keys(TIERS)) {
  fs.writeFileSync(path.join(OUT, `one-ring-${tier}.svg`), oneRingSvg(ring, tier));
  written.add(`one-ring-${tier}.svg`);
}
for (const name of fs.readdirSync(OUT)) if (!written.has(name)) fs.rmSync(path.join(OUT, name));
console.log(`Wrote ${written.size} files to public/items/`);

if (process.argv.includes('--gallery')) {
  let n = 0;
  const inline = (svg) => svg.replaceAll('i-', `g${n++}-`);
  let rows = '';
  for (const item of ITEM_DESIGNS) {
    rows += `<section><h3>${item.name}</h3><div>${item.variants.map((v, i) => `<figure${picks[item.id] === i + 1 ? ' class="pick"' : ''}>${inline(itemSvg(item, v)).replace('width="64" height="64"', 'width="120" height="120"')}<figcaption>${i + 1} ${v.title}</figcaption></figure>`).join('')}</div></section>`;
  }
  rows += `<section><h3>The One Ring</h3><div>${ONE_RING_DESIGNS.map((d, i) => `<figure${picks['one-ring'] === i + 1 ? ' class="pick"' : ''}>${Object.keys(TIERS).map((t) => inline(oneRingSvg(d, t)).replace('width="64" height="64"', 'width="58" height="58"')).join('')}<figcaption>${i + 1} ${d.title}</figcaption></figure>`).join('')}</div></section>`;
  fs.writeFileSync(path.join(import.meta.dirname, 'gallery.html'), `<!doctype html><meta charset="utf-8"><title>Item art</title><style>
body{background:#170e08;color:#f3e6c8;font:12px system-ui,sans-serif;margin:16px}section{display:inline-block;vertical-align:top;margin:0 12px 12px 0;padding:8px;border:1px solid #4d3523;border-radius:8px}
h3{margin:0 0 6px;font:600 14px Georgia,serif;color:#e0b65a}section>div{display:flex;gap:8px}figure{margin:0;padding:4px;text-align:center;max-width:124px;border:2px solid transparent;border-radius:8px}figure.pick{border-color:#ffd677}
</style>${rows}`);
  console.log('Wrote art/items/gallery.html');
}
