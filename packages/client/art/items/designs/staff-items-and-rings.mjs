// Batch 5: Ent-draught, Athelas, Wizard's Staff and the Rings of Power, three designs each.
import { INK, blur, gold, silver, wood, gem, mix, rays, sparkle } from '../kit.mjs';

// ---------------------------------------------------------------- local helpers

/** A flame with its base centred at (x, y), h tall, w half-wide, its tip leaning by `lean`. */
const flame = (x, y, h, w, lean = 0) =>
  `M${x - w} ${y}C${x - w} ${y - h * .45} ${x + lean - w * .25} ${y - h * .62} ${x + lean} ${y - h}C${x + lean + w * .2} ${y - h * .58} ${x + w} ${y - h * .45} ${x + w} ${y}Q${x} ${y + w * .7} ${x - w} ${y}z`;

/** A leaf from (0, 0) to (0, -len), w half-wide, placed by `t`. */
const leaf = (t, len, w, fill, vein = '#14532d') =>
  `<g transform="${t}"><path d="M0 0C${w} ${-len * .28} ${w * .85} ${-len * .72} 0 ${-len}C${-w * .85} ${-len * .72} ${-w} ${-len * .28} 0 0z" fill="${fill}" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
   <path d="M0 -1V${-len * .92}" stroke="${vein}" stroke-width=".7" opacity=".8"/>
   <path d="M0 ${-len * .3}l${w * .55} ${-len * .1}M0 ${-len * .5}l${w * .5} ${-len * .1}M0 ${-len * .7}l${w * .4} ${-len * .08}M0 ${-len * .3}l${-w * .55} ${-len * .1}M0 ${-len * .5}l${-w * .5} ${-len * .1}M0 ${-len * .7}l${-w * .4} ${-len * .08}" stroke="${vein}" stroke-width=".4" opacity=".6"/>
   <path d="M${-w * .35} ${-len * .2}C${-w * .6} ${-len * .45} ${-w * .5} ${-len * .7} ${-w * .1} ${-len * .88}" fill="none" stroke="#fff" stroke-width=".5" opacity=".45"/></g>`;

/** Metal gradients for a ring: face (lit top), wall (its side), inner (the far inside wall). */
const metals = {
  gold: ['#fff4c4', '#f2cd6a', '#b8841f', '#6e4a0e'],
  mithril: ['#ffffff', '#dfe7f2', '#9aa8bc', '#4a5568'],
  iron: ['#8b95a5', '#4b5563', '#1f2733', '#06080c'],
  dwarf: ['#ffe7a0', '#e0a93a', '#9a6410', '#4a2c05'],
};
const metalDefs = (p, kind) => {
  const [a, b, c, d] = metals[kind];
  return `<linearGradient id="${p}face" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".35" stop-color="${b}"/><stop offset=".75" stop-color="${c}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <linearGradient id="${p}wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient>
    <linearGradient id="${p}inner" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${d}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient>
    <linearGradient id="${p}front" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".3" stop-color="${b}"/><stop offset=".62" stop-color="${c}"/><stop offset=".85" stop-color="${b}"/><stop offset="1" stop-color="${d}"/></linearGradient>`;
};

/** A ring lying at an angle: band of half-width w and depth d, centred at (cx, cy). Needs metalDefs. */
function angledRing(p, cx, cy, rx, ry, w, d, extra = '') {
  const ri = rx - w, rri = ry - w * .5;
  const ell = (x, y, a, b) => `M${x - a} ${y}a${a} ${b} 0 1 0 ${2 * a} 0a${a} ${b} 0 1 0 ${-2 * a} 0z`;
  return `<defs><mask id="${p}hole"><rect x="0" y="0" width="64" height="64" fill="#000"/><path d="${ell(cx, cy, ri, rri)}" fill="#fff"/><path d="${ell(cx, cy + d, ri, rri)}" fill="#000"/></mask></defs>
    <path d="M${cx - rx} ${cy}V${cy + d}A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + d}V${cy}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}z" fill="url(#${p}wall)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <rect x="0" y="0" width="64" height="64" fill="url(#${p}inner)" mask="url(#${p}hole)"/>
    <path fill-rule="evenodd" d="${ell(cx, cy, rx, ry)}${ell(cx, cy, ri, rri)}" fill="url(#${p}face)" stroke="${INK}" stroke-width=".9"/>
    ${extra}
    <path d="M${cx - rx + 1.6} ${cy - 1}A${rx - 1.6} ${ry - 1} 0 0 1 ${cx - rx * .2} ${cy - ry + .9}" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".85"/>
    <path d="M${cx - rx + 2} ${cy + d * .55}A${rx} ${ry} 0 0 0 ${cx - rx * .3} ${cy + ry + d * .45}" fill="none" stroke="#fff" stroke-width=".5" opacity=".4"/>`;
}

/** A ring standing upright, seen from the front: outer radius R, inner r, with depth behind. Needs metalDefs. */
function frontRing(p, cx, cy, R, r, extra = '') {
  return `<path fill-rule="evenodd" d="M${cx - R + 1.6} ${cy + 1.2}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0zM${cx - r + 1.6} ${cy + 1.2}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z" fill="url(#${p}wall)" stroke="${INK}" stroke-width=".9"/>
    <path fill-rule="evenodd" d="M${cx - R} ${cy}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0zM${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z" fill="url(#${p}front)" stroke="${INK}" stroke-width=".9"/>
    ${extra}
    <path d="M${cx - R + 1.4} ${cy - 1}A${R - 1.4} ${R - 1.4} 0 0 1 ${cx - 2} ${cy - R + 1.4}" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".85"/>
    <path d="M${cx + r * .7} ${cy + r * .7}A${r + .8} ${r + .8} 0 0 1 ${cx - r * .2} ${cy + r + .8}" fill="none" stroke="#fff" stroke-width=".5" opacity=".5"/>`;
}

/** A brilliant seen from the side: girdle at y, w half-wide, h deep. */
function sideGem(p, name, cx, cy, w, h, colour) {
  const lt = mix(colour, '#ffffff', .55), dk = mix(colour, '#000000', .55);
  return `<defs><linearGradient id="${p}${name}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${lt}"/><stop offset="1" stop-color="${colour}"/></linearGradient>
    <linearGradient id="${p}${name}v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="${dk}"/></linearGradient></defs>
    <path d="M${cx - w} ${cy}H${cx + w}L${cx} ${cy + h}z" fill="url(#${p}${name}v)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M${cx - w * .5} ${cy}L${cx} ${cy + h}L${cx + w * .5} ${cy}" fill="none" stroke="${lt}" stroke-width=".4" opacity=".7"/>
    <path d="M${cx - w} ${cy}L${cx - w * .55} ${cy - h * .42}H${cx + w * .55}L${cx + w} ${cy}z" fill="url(#${p}${name}c)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M${cx - w * .55} ${cy - h * .42}L${cx - w * .3} ${cy}L${cx} ${cy - h * .42}L${cx + w * .3} ${cy}L${cx + w * .55} ${cy - h * .42}" fill="none" stroke="${dk}" stroke-width=".4" opacity=".6"/>
    <path d="M${cx - w * .7} ${cy - .6}L${cx - w * .45} ${cy - h * .34}" stroke="#fff" stroke-width=".7" stroke-linecap="round"/>`;
}

/** A brilliant seen from above: an octagon with its table, r across. */
function topGem(p, name, cx, cy, r, colour) {
  const pt = (rad, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]; };
  const poly = (rad) => [...Array(8).keys()].map((i) => pt(rad, i).map((v) => v.toFixed(2)).join(' ')).join('L');
  let facets = '';
  for (let i = 0; i < 8; i++) { const [a, b] = pt(r, i), [c, d] = pt(r * .55, i); facets += `M${a.toFixed(2)} ${b.toFixed(2)}L${c.toFixed(2)} ${d.toFixed(2)}`; }
  return `<defs>${gem(p, name, colour)}<radialGradient id="${p}${name}t" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="${mix(colour, '#ffffff', .4)}"/><stop offset="1" stop-color="${colour}"/></radialGradient></defs>
    <path d="M${poly(r)}z" fill="url(#${p}gem-${name})" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="${facets}" stroke="${mix(colour, '#000000', .5)}" stroke-width=".45" opacity=".8"/>
    <path d="M${poly(r * .55)}z" fill="url(#${p}${name}t)" stroke="${mix(colour, '#000000', .4)}" stroke-width=".5"/>
    <path d="M${cx - r * .45} ${cy - r * .1}L${cx - r * .1} ${cy - r * .45}" stroke="#fff" stroke-width="${(r * .14).toFixed(2)}" stroke-linecap="round" opacity=".9"/>`;
}

/** A gold cup the gem of an angled ring sits in, with four claws. */
const bezel = (p, cx, cy, w) => `<path d="M${cx - w} ${cy - 1}H${cx + w}L${cx + w * .55} ${cy + 4.6}H${cx - w * .55}z" fill="url(#${p}face)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M${cx - w * .8} ${cy + .4}H${cx + w * .8}" stroke="#fff" stroke-width=".4" opacity=".6"/>`;
const claws = (p, cx, cy, w) => [-1, -.38, .38, 1].map((k) => `<path d="M${cx + k * w * .92} ${cy - .6}l${-k * .5} -2.6" stroke="url(#${p}face)" stroke-width="1.6" stroke-linecap="round"/><path d="M${cx + k * w * .92} ${cy - .6}l${-k * .5} -2.6" stroke="${INK}" stroke-width=".35" stroke-linecap="round" opacity=".7"/>`).join('');

// ---------------------------------------------------------------- Rings of Power

const ringItem = (id, name, bg, variants) => ({ id, name, kind: 'ring', recipe: null, bg, variants });

// Narya: gold and ruby, fire.
const naryaFire = (p) => `<defs>${metalDefs(p, 'gold')}${blur(p, 1.5)}${blur(p, 4)}
    <linearGradient id="${p}fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe066"/><stop offset=".45" stop-color="#ff8a1f"/><stop offset="1" stop-color="#c2200c"/></linearGradient>
    <linearGradient id="${p}fi" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#fff3a0"/><stop offset="1" stop-color="#ffb02e"/></linearGradient></defs>
  <ellipse cx="32" cy="30" rx="16" ry="20" fill="#ff7a1a" opacity=".55" filter="url(#${p}blur4)"/>
  <path d="${flame(22, 42, 22, 5, -3)}${flame(42, 42, 24, 5, 3)}${flame(32, 40, 34, 8, 1)}" fill="url(#${p}fl)" stroke="#5a1004" stroke-width=".7"/>
  <path d="${flame(32, 39, 22, 4.6, 1)}${flame(23, 41, 12, 2.6, -2)}${flame(41, 41, 13, 2.6, 2)}" fill="url(#${p}fi)" opacity=".95"/>
  ${angledRing(p, 32, 44, 18, 7.6, 4.2, 3.8)}
  ${bezel(p, 32, 34, 6.4)}${sideGem(p, 'ruby', 32, 32.4, 7, 7.4, '#e11d48')}${claws(p, 32, 34, 6.4)}
  <circle cx="14" cy="22" r="1" fill="#ffd27a"/><circle cx="50" cy="17" r=".8" fill="#ffd27a"/><circle cx="47" cy="27" r=".6" fill="#fff0b0"/><circle cx="17" cy="13" r=".6" fill="#fff0b0"/>
  ${sparkle(41, 27, 3)}`;

const naryaCrown = (p) => {
  let tongues = '';
  for (let i = 0; i < 12; i++) tongues += `<path d="${flame(32, 19, 7.5, 2.6, 0)}" transform="rotate(${i * 30} 32 34)"/>`;
  return `<defs>${metalDefs(p, 'gold')}${blur(p, 3)}
    <radialGradient id="${p}fl" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="#ffe066"/><stop offset=".7" stop-color="#ff7a1a"/><stop offset="1" stop-color="#b91c1c"/></radialGradient></defs>
  <circle cx="32" cy="34" r="22" fill="#ff6a00" opacity=".45" filter="url(#${p}blur3)"/>
  <g fill="url(#${p}fl)" stroke="#5a1004" stroke-width=".6">${tongues}</g>
  ${frontRing(p, 32, 34, 14.5, 10)}
  <circle cx="32" cy="34" r="9" fill="#ffb347" opacity=".45" filter="url(#${p}blur3)"/>
  <path d="M25 22.6h14l-2 4.6H27z" fill="url(#${p}face)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  ${topGem(p, 'ruby', 32, 17, 7.4, '#e11d48')}
  ${sparkle(35.6, 13.4, 2.6)}${sparkle(48, 48, 1.4, .8)}`;
};

const naryaSun = (p) => {
  let sun = '';
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 13.4 : 17.2; sun += `${i ? 'L' : 'M'}${(32 + Math.cos(a) * r).toFixed(2)} ${(28 + Math.sin(a) * r).toFixed(2)}`; }
  return `<defs>${metalDefs(p, 'gold')}${blur(p, 3)}</defs>
  ${rays(32, 28, 16, 30, 22, 2, '#ffb347', .5)}
  <circle cx="32" cy="28" r="18" fill="#ff5a1a" opacity=".5" filter="url(#${p}blur3)"/>
  <path d="M22 38c-2 6 0 13 4 18M42 38c2 6 0 13-4 18" fill="none" stroke="url(#${p}wall)" stroke-width="4.6" stroke-linecap="round"/>
  <path d="M22 38c-2 6 0 13 4 18M42 38c2 6 0 13-4 18" fill="none" stroke="${INK}" stroke-width=".5" opacity=".6"/>
  <path d="${sun}z" fill="url(#${p}face)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <circle cx="32" cy="28" r="12.2" fill="#6e2a06" stroke="${INK}" stroke-width=".7"/>
  <circle cx="32" cy="28" r="11.2" fill="none" stroke="#ffe08a" stroke-width=".6" stroke-dasharray="1 1.4"/>
  ${topGem(p, 'ruby', 32, 28, 10.4, '#e11d48')}
  <path d="${flame(32, 31, 7, 2.6, 0)}" fill="#ffd27a" opacity=".55"/>
  ${sparkle(27.6, 22.6, 3.4)}${sparkle(48, 12, 1.6, .8)}`;
};

// Nenya: mithril and a white stone, water.
const nenyaRipples = (p) => `<defs>${metalDefs(p, 'mithril')}${blur(p, 3)}
    <linearGradient id="${p}water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe8ff" stop-opacity=".5"/><stop offset="1" stop-color="#1e5fa0" stop-opacity=".1"/></linearGradient></defs>
  <ellipse cx="32" cy="47" rx="26" ry="9" fill="url(#${p}water)"/>
  ${[24, 18, 12].map((r, i) => `<ellipse cx="32" cy="48" rx="${r}" ry="${r * .32}" fill="none" stroke="#dff4ff" stroke-width="${.6 + i * .2}" opacity="${.35 + i * .2}"/>`).join('')}
  <circle cx="32" cy="27" r="11" fill="#ffffff" opacity=".35" filter="url(#${p}blur3)"/>
  ${angledRing(p, 32, 41, 17, 7.2, 3.4, 3.2)}
  ${bezel(p, 32, 32, 5.6)}${sideGem(p, 'white', 32, 30.6, 6.2, 6.6, '#cbd5e1')}${claws(p, 32, 32, 5.6)}
  ${rays(32, 27.6, 8, 9, 6, .7, '#ffffff', .8)}
  <path d="M12 38c0-2 1.4-3.4 1.4-3.4s1.4 1.4 1.4 3.4a1.4 1.4 0 0 1-2.8 0zM51 34c0-1.6 1.1-2.7 1.1-2.7s1.1 1.1 1.1 2.7a1.1 1.1 0 0 1-2.2 0z" fill="#e0f4ff" stroke="${INK}" stroke-width=".5"/>
  ${sparkle(32, 27, 5)}${sparkle(46, 16, 1.6, .9)}${sparkle(18, 20, 1.2, .8)}`;

const nenyaMirror = (p) => `<defs>${metalDefs(p, 'mithril')}${blur(p, 3)}${silver(p)}
    <radialGradient id="${p}pool" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#a9d8f5"/><stop offset="1" stop-color="#1b3f6b"/></radialGradient></defs>
  <path d="M10 48c0 4 9.8 7.4 22 7.4S54 52 54 48l-3 8.6c-3 2.6-10.4 4-19 4s-16-1.4-19-4z" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".9"/>
  <ellipse cx="32" cy="48" rx="22" ry="6.4" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".9"/>
  <ellipse cx="32" cy="48.4" rx="19.6" ry="5" fill="url(#${p}pool)" stroke="#4b5a70" stroke-width=".6"/>
  <ellipse cx="32" cy="49" rx="6" ry="1.6" fill="#fff" opacity=".7" filter="url(#${p}blur3)"/>
  ${sparkle(32, 49, 2.4, .9)}
  <path d="M32 43v-4" stroke="#fff" stroke-width=".8" opacity=".5"/>
  <circle cx="32" cy="15" r="9" fill="#fff" opacity=".5" filter="url(#${p}blur3)"/>
  ${frontRing(p, 32, 30, 11.6, 8)}
  <path d="M27 19.4h10l-1.6 4H28.6z" fill="url(#${p}face)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  ${topGem(p, 'white', 32, 15, 5.6, '#dbe4ef')}
  ${rays(32, 15, 8, 12, 7, .8, '#ffffff', .75)}
  ${sparkle(32, 15, 4.6)}`;

const nenyaWave = (p) => `<defs>${metalDefs(p, 'mithril')}${blur(p, 2.5)}
    <linearGradient id="${p}wave" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6f7ff"/><stop offset=".35" stop-color="#5cc0e8"/><stop offset="1" stop-color="#0c3a6b"/></linearGradient></defs>
  <path d="M5 50C12 46 14 36 22 28c8-8 22-10 28-4 4 4 2 10-3 10-4 0-5-4-2-5-4-2-10 0-14 6-5 7-6 14-4 19H5z" fill="url(#${p}wave)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <path d="M10 46c4-4 6-11 12-17 7-7 18-9 24-5" fill="none" stroke="#fff" stroke-width="1" opacity=".75"/>
  <path d="M47 29.5c-1.6-.4-2.4-1.6-2-2.6" fill="none" stroke="#fff" stroke-width=".8"/>
  <circle cx="50" cy="20" r="1" fill="#e6f7ff"/><circle cx="53" cy="25" r=".7" fill="#e6f7ff"/><circle cx="45" cy="17" r=".6" fill="#e6f7ff"/>
  <circle cx="41" cy="40" r="10" fill="#fff" opacity=".35" filter="url(#${p}blur2.5)"/>
  ${angledRing(p, 40, 47, 13.4, 5.8, 3, 2.8)}
  ${bezel(p, 40, 39.6, 4.6)}${sideGem(p, 'white', 40, 38.4, 5.2, 5.6, '#d8e2ee')}${claws(p, 40, 39.6, 4.6)}
  ${sparkle(40, 35.4, 5)}${sparkle(22, 50, 1.4, .8)}`;

// Vilya: gold and sapphire, air.
const vilyaWind = (p) => `<defs>${metalDefs(p, 'gold')}${blur(p, 3)}</defs>
  <circle cx="32" cy="28" r="12" fill="#60a5fa" opacity=".5" filter="url(#${p}blur3)"/>
  <g fill="none" stroke="#e0f2ff" stroke-linecap="round">
    <path d="M8 26c10-6 22 2 30-4 5-4 2-10-3-8-3 1-2 5 1 4" stroke-width="1.6" opacity=".8"/>
    <path d="M12 52c12 2 24-4 34 0 5 2 6 8 1 9" stroke-width="1.2" opacity=".6"/>
    <path d="M56 33c-8 4-14 0-20 3" stroke-width="1.2" opacity=".7"/>
    <path d="M10 36c6-1 9 1 13 0" stroke-width=".9" opacity=".6"/></g>
  ${angledRing(p, 32, 44, 17, 7.4, 4, 3.6)}
  ${bezel(p, 32, 34.4, 6.4)}${sideGem(p, 'sap', 32, 32.8, 7, 7.6, '#2563eb')}${claws(p, 32, 34.4, 6.4)}
  <path d="M27 50c-1-2 0-4 2-4" fill="none" stroke="#fffbe0" stroke-width=".6" opacity=".7"/>
  ${sparkle(37.6, 28.4, 3.2)}${sparkle(50, 14, 1.4, .8)}`;

const vilyaSky = (p) => {
  let stars = '';
  [[13, 14, 1.2], [20, 9, .8], [47, 10, 1], [53, 22, .7], [10, 28, .7], [44, 18, .6], [24, 16, .5]].forEach(([x, y, r]) => { stars += sparkle(x, y, r * 1.8, .85); });
  return `<defs>${metalDefs(p, 'gold')}${blur(p, 3)}
    <linearGradient id="${p}cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#bcd3f0"/><stop offset="1" stop-color="#5b7fb3"/></linearGradient></defs>
  ${stars}
  <circle cx="32" cy="18" r="10" fill="#60a5fa" opacity=".6" filter="url(#${p}blur3)"/>
  ${rays(32, 18, 12, 15, 9, 1, '#bfdbfe', .55)}
  ${frontRing(p, 32, 33, 12.6, 8.8)}
  <path d="M26.6 21.8h10.8l-1.8 4.2h-7.2z" fill="url(#${p}face)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  ${topGem(p, 'sap', 32, 17, 6.4, '#2563eb')}
  <path d="M4 56c2-6 7-7 10-5 1-5 7-7 11-3 3-4 9-4 11 1 3-3 9-2 10 3 3-2 8-1 9 4 2 0 4 1 5 2v8H4z" fill="url(#${p}cloud)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M12 52c1-1.6 3-2 4.4-1.2M27 49c1.4-1.6 4-2 5.6-.6M46 51.6c1.4-1 3.4-.8 4.4.4" fill="none" stroke="#fff" stroke-width=".8" opacity=".9"/>
  ${sparkle(35, 13.6, 3.2)}`;
};

const vilyaWings = (p) => {
  const wing = (s) => {
    let d = '';
    for (let i = 0; i < 5; i++) { const y = 24 + i * 3.4, len = 19 - i * 3; d += `M${32 + s * 9} ${y}c${s * 4} -3.6 ${s * len * .7} -5.4 ${s * len} -4.6c${-s * 2} 2.4 ${-s * len * .5} 5.4 ${-s * len} 6.4z`; }
    return d;
  };
  return `<defs>${metalDefs(p, 'gold')}${blur(p, 3)}
    <linearGradient id="${p}wing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#cfe3ff"/><stop offset="1" stop-color="#7aa4dc"/></linearGradient></defs>
  <circle cx="32" cy="27" r="14" fill="#3b82f6" opacity=".55" filter="url(#${p}blur3)"/>
  <path d="${wing(-1)}${wing(1)}" fill="url(#${p}wing)" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
  ${angledRing(p, 32, 47, 14, 6, 3.6, 3.4)}
  <path d="M24 40l3-14h10l3 14" fill="url(#${p}face)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  <circle cx="32" cy="26.6" r="10.4" fill="url(#${p}front)" stroke="${INK}" stroke-width=".9"/>
  ${topGem(p, 'sap', 32, 26.6, 8.6, '#2563eb')}
  ${sparkle(28.4, 23, 3)}${sparkle(51, 44, 1.4, .8)}${sparkle(13, 44, 1.2, .8)}`;
};

// The Seven: heavy dwarf gold, a square emerald, runes.
const squareGem = (p, cx, cy, s) => `<defs>${gem(p, 'em', '#10b981')}</defs>
  <rect x="${cx - s}" y="${cy - s}" width="${2 * s}" height="${2 * s}" rx=".6" fill="url(#${p}gem-em)" stroke="${INK}" stroke-width=".9"/>
  <rect x="${cx - s * .5}" y="${cy - s * .5}" width="${s}" height="${s}" fill="#a7f3d0" opacity=".55" stroke="#065f46" stroke-width=".4"/>
  <path d="M${cx - s} ${cy - s}l${s * .5} ${s * .5}M${cx + s} ${cy - s}l${-s * .5} ${s * .5}M${cx - s} ${cy + s}l${s * .5} ${-s * .5}M${cx + s} ${cy + s}l${-s * .5} ${-s * .5}" stroke="#065f46" stroke-width=".45"/>
  <path d="M${cx - s * .7} ${cy - s * .2}L${cx - s * .2} ${cy - s * .7}" stroke="#fff" stroke-width=".9" stroke-linecap="round"/>`;
const runes = (x, y, n, step) => { let d = ''; for (let i = 0; i < n; i++) { const x0 = x + i * step; d += i % 3 === 0 ? `M${x0} ${y - 1}v2l1 -1z` : i % 3 === 1 ? `M${x0} ${y + 1}l.8 -2 .8 2` : `M${x0} ${y - 1}h1.4M${x0 + .7} ${y - 1}v2`; } return d; };

const sevenHoard = (p) => {
  const coin = (x, y, r) => `<ellipse cx="${x}" cy="${y + .9}" rx="${r}" ry="${r * .42}" fill="#8a5a10" stroke="${INK}" stroke-width=".6"/><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .42}" fill="url(#${p}face)" stroke="${INK}" stroke-width=".6"/><ellipse cx="${x}" cy="${y}" rx="${r * .6}" ry="${r * .24}" fill="none" stroke="#8a5a10" stroke-width=".4"/>`;
  return `<defs>${metalDefs(p, 'dwarf')}${blur(p, 3)}</defs>
  <ellipse cx="32" cy="50" rx="26" ry="9" fill="#f5b942" opacity=".35" filter="url(#${p}blur3)"/>
  ${[[12, 53, 5], [20, 57, 5.4], [46, 55, 5], [54, 50, 4.4], [38, 58, 5], [8, 46, 4], [27, 51, 4.6], [50, 44, 3.8]].map(([x, y, r]) => coin(x, y, r)).join('')}
  ${angledRing(p, 32, 40, 17, 7.4, 5.4, 5, `<path d="${runes(20.5, 47.4, 9, 2.6)}" fill="none" stroke="#5a3606" stroke-width=".55" opacity=".9"/>`)}
  <path d="M24.6 30h14.8l-1.4 5.6H26z" fill="url(#${p}face)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  ${squareGem(p, 32, 26.4, 5.2)}
  ${[[26.4, 21], [37.6, 21], [26.4, 31.8], [37.6, 31.8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="url(#${p}face)" stroke="${INK}" stroke-width=".4"/>`).join('')}
  ${sparkle(37, 22, 3.2)}${sparkle(14, 49, 1.4, .8)}`;
};

const sevenAnvil = (p) => {
  const oct = (r) => { let d = ''; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; d += `${i ? 'L' : 'M'}${(32 + Math.cos(a) * r).toFixed(2)} ${(32 + Math.sin(a) * r).toFixed(2)}`; } return d + 'z'; };
  return `<defs>${metalDefs(p, 'dwarf')}${blur(p, 3)}
    <linearGradient id="${p}iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3ad"/><stop offset=".3" stop-color="#4b5058"/><stop offset="1" stop-color="#17191d"/></linearGradient></defs>
  <path d="M9 44h40c3 0 6-2 7-4l1 4c-1 3-4 5-8 5h-6l-2 3h4v6H17v-6h4l-2-3h-6c-3 0-4-2-4-5z" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <path d="M10 45h39c3 0 5-1.4 6.4-3" fill="none" stroke="#e5e7eb" stroke-width=".6" opacity=".7"/>
  <circle cx="32" cy="30" r="13" fill="#ffb347" opacity=".35" filter="url(#${p}blur3)"/>
  <path fill-rule="evenodd" d="${oct(11.8)}${oct(7.8)}" fill="url(#${p}wall)" stroke="${INK}" stroke-width=".9" transform="translate(1.6 1.4)"/>
  <path fill-rule="evenodd" d="${oct(11.8)}${oct(7.8)}" fill="url(#${p}front)" stroke="${INK}" stroke-width=".9"/>
  <path d="${oct(9.8)}" fill="none" stroke="#5a3606" stroke-width=".5" stroke-dasharray="1.2 1"/>
  <path d="M22 28l4-7" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".8"/>
  <path d="M26.4 17.6h11.2l-1.4 3.6H27.8z" fill="url(#${p}face)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  ${squareGem(p, 32, 15.2, 4)}
  <g stroke="#ffd27a" stroke-width=".8" stroke-linecap="round"><path d="M46 38l5-4M48 41l6-1M44 36l2-5M16 38l-5-3M15 41l-6 0"/></g>
  <circle cx="53" cy="31" r=".7" fill="#fff0b0"/><circle cx="9" cy="33" r=".6" fill="#fff0b0"/>
  ${sparkle(35, 12.6, 2.6)}`;
};

const sevenDoor = (p) => `<defs>${metalDefs(p, 'dwarf')}${blur(p, 3)}
    <linearGradient id="${p}stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a8378"/><stop offset=".5" stop-color="#4d4740"/><stop offset="1" stop-color="#211d19"/></linearGradient>
    <linearGradient id="${p}hall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf6b"/><stop offset=".6" stop-color="#b45309"/><stop offset="1" stop-color="#3a1a04"/></linearGradient></defs>
  <path d="M8 60V30C8 16 19 7 32 7s24 9 24 23v30h-7V30c0-10-7.6-17-17-17s-17 7-17 17v30z" fill="url(#${p}stone)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <path d="M15 60V30c0-10 7.6-17 17-17s17 7 17 17v30z" fill="url(#${p}hall)" stroke="${INK}" stroke-width=".8"/>
  <path d="M12 26c1.6-7 6-12 12-14.6M40 11.4c6 2.6 10.4 7.6 12 14.6" fill="none" stroke="#ffe08a" stroke-width=".7" opacity=".85" stroke-dasharray="1.6 1.2"/>
  <path d="M8 40h7M49 40h7M8 50h7M49 50h7M10 20l5 4M54 20l-5 4" stroke="#1a1612" stroke-width=".6"/>
  <circle cx="32" cy="34" r="14" fill="#ffdd88" opacity=".55" filter="url(#${p}blur3)"/>
  ${angledRing(p, 32, 44, 13.4, 5.8, 4.4, 4, `<path d="${runes(23, 49.6, 7, 2.6)}" fill="none" stroke="#5a3606" stroke-width=".5"/>`)}
  <path d="M26 35.6h12l-1.2 4.8H27.2z" fill="url(#${p}face)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  ${squareGem(p, 32, 32, 4.6)}
  ${sparkle(36.4, 28.2, 3)}`;

// The Nine: black iron, a dead pale stone, shadow.
const nineSmoke = (p) => `<defs>${metalDefs(p, 'iron')}${blur(p, 2)}${blur(p, 4)}</defs>
  <path d="M18 44c-6-8 4-12-2-20-3-4 0-10 4-12-1 6 6 8 4 16-1 5 4 8 2 14zM44 44c6-6-2-12 3-18 3-4 1-9-2-11 0 6-6 8-3 15 2 5-3 8-2 13z" fill="#05070a" opacity=".85" filter="url(#${p}blur2)"/>
  <path d="M22 40c-3-6 3-10 0-16M42 40c3-5-2-9 1-15M32 30c-2-5 2-9 0-14" fill="none" stroke="#b9d8c8" stroke-width="1.1" opacity=".75" filter="url(#${p}blur2)"/>
  <circle cx="32" cy="30" r="9" fill="#8fd3b4" opacity=".25" filter="url(#${p}blur4)"/>
  ${angledRing(p, 32, 44, 17, 7.4, 4, 3.8)}
  ${bezel(p, 32, 34.4, 6)}${sideGem(p, 'dead', 32, 32.8, 6.6, 7, '#4b6b5e')}${claws(p, 32, 34.4, 6)}
  <path d="M28.4 29.4l3.6 3.4 3.6-3.4" fill="none" stroke="#c7f9e0" stroke-width=".6" opacity=".7"/>
  ${sparkle(37, 28.6, 2.4, .8)}`;

const nineWraith = (p) => `<defs>${metalDefs(p, 'iron')}${blur(p, 1.5)}${blur(p, 4)}
    <linearGradient id="${p}cloak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b313b"/><stop offset=".6" stop-color="#0d1016"/><stop offset="1" stop-color="#020306"/></linearGradient>
    <radialGradient id="${p}void" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#0a0d12"/></radialGradient></defs>
  <path d="M32 4C21 6 14 17 13 30c-1 12-5 22-9 30h56c-4-8-8-18-9-30C50 17 43 6 32 4z" fill="url(#${p}cloak)" stroke="${INK}" stroke-width=".9"/>
  <path d="M32 4c-6 6-9 16-9 26M32 4c6 6 9 16 9 26" fill="none" stroke="#4b5563" stroke-width=".6" opacity=".7"/>
  <path d="M22 30c0-8 4-14 10-14s10 6 10 14c-3 3-6.4 4-10 4s-7-1-10-4z" fill="url(#${p}void)"/>
  <circle cx="28" cy="25" r="1.5" fill="#d6fff0" filter="url(#${p}blur1.5)"/><circle cx="36" cy="25" r="1.5" fill="#d6fff0" filter="url(#${p}blur1.5)"/>
  <circle cx="28" cy="25" r=".7" fill="#fff"/><circle cx="36" cy="25" r=".7" fill="#fff"/>
  <circle cx="32" cy="45" r="11" fill="#9ad8c0" opacity=".3" filter="url(#${p}blur4)"/>
  ${frontRing(p, 32, 46, 10.4, 7.2)}
  <path d="M28 34.4h8l-1.4 3.6h-5.2z" fill="url(#${p}face)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  ${topGem(p, 'dead', 32, 31.4, 4.6, '#55786a')}
  ${sparkle(34.4, 28.8, 2.2, .85)}`;

const nineCrown = (p) => {
  let spikes = '';
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = 17 + t * 30, h = 15 - Math.abs(t - .5) * 12, y = 39 - Math.sin(t * Math.PI) * 6.6;
    spikes += `M${(x - 1.6).toFixed(2)} ${(y + 1).toFixed(2)}L${x.toFixed(2)} ${(y - h).toFixed(2)}L${(x + 1.6).toFixed(2)} ${(y + 1).toFixed(2)}z`;
  }
  return `<defs>${metalDefs(p, 'iron')}${blur(p, 3)}
    <linearGradient id="${p}spike" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9d2de"/><stop offset=".45" stop-color="#5b6577"/><stop offset="1" stop-color="#0b0e14"/></linearGradient></defs>
  <ellipse cx="32" cy="50" rx="26" ry="8" fill="#c7d6e8" opacity=".2" filter="url(#${p}blur3)"/>
  <path d="M6 48c8-3 14 1 20-1s12-4 18-1 10 2 14 0" fill="none" stroke="#d9e6f5" stroke-width="1.6" opacity=".35" filter="url(#${p}blur3)"/>
  <circle cx="32" cy="26" r="13" fill="#a8c9ff" opacity=".22" filter="url(#${p}blur3)"/>
  <path d="${spikes}" fill="url(#${p}spike)" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
  ${angledRing(p, 32, 42, 17, 7, 4, 4)}
  ${topGem(p, 'dead', 32, 35, 3.6, '#55786a')}
  <path d="M32 20v-6" stroke="#e5f0ff" stroke-width=".6" opacity=".7"/>
  ${sparkle(32, 14.6, 2.2, .9)}${sparkle(48, 30, 1.2, .7)}`;
};

// ---------------------------------------------------------------- Ent-draught

const entBowl = (p) => `<defs>${blur(p, 2.5)}${blur(p, 5)}
    <linearGradient id="${p}stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9b29f"/><stop offset=".45" stop-color="#6f6a5c"/><stop offset="1" stop-color="#2c2a24"/></linearGradient>
    <radialGradient id="${p}draught" cx=".45" cy=".45" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#f6f7a8"/><stop offset=".7" stop-color="#9ad94a"/><stop offset="1" stop-color="#3f7d1c"/></radialGradient></defs>
  ${rays(32, 34, 14, 28, 18, 1.6, '#e9f7a0', .4)}
  <ellipse cx="32" cy="30" rx="18" ry="10" fill="#d9f27a" opacity=".55" filter="url(#${p}blur5)"/>
  <path d="M8 34c0 10 10 18 24 18s24-8 24-18z" fill="url(#${p}stone)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <path d="M24 51l-2 5h20l-2-5" fill="url(#${p}stone)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <path d="M12 40c4 5 10 8 20 8s16-3 20-8M18 46l2-4M26 49l1-5M38 49l-1-5M46 46l-2-4" fill="none" stroke="#2c2a24" stroke-width=".6" opacity=".7"/>
  <path d="M10.6 38.6c1.6 4 5 7 9.4 8.6" fill="none" stroke="#fffbe8" stroke-width=".8" opacity=".6"/>
  <ellipse cx="32" cy="34" rx="24" ry="6.6" fill="url(#${p}stone)" stroke="${INK}" stroke-width=".9"/>
  <ellipse cx="32" cy="34.4" rx="21" ry="5" fill="url(#${p}draught)" stroke="#3a5a14" stroke-width=".6"/>
  <ellipse cx="29" cy="33.6" rx="8" ry="1.8" fill="#fff" opacity=".7" filter="url(#${p}blur2.5)"/>
  <path d="M22 32c3-1 6-1 9 0M34 36c3 .8 6 .6 8-.4" fill="none" stroke="#ffffd6" stroke-width=".6" opacity=".8"/>
  ${[[22, 22, 1.4], [38, 18, 1.8], [30, 13, 1.2], [44, 25, 1]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f6ffb0" stroke="#4d7c0f" stroke-width=".4"/><circle cx="${x - r * .35}" cy="${y - r * .35}" r="${r * .3}" fill="#fff"/>`).join('')}
  ${sparkle(26, 33.4, 3.4)}${sparkle(48, 14, 1.4, .8)}`;

const entJar = (p) => `<defs>${blur(p, 3)}${blur(p, 5)}
    <linearGradient id="${p}clay" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c79a62"/><stop offset=".35" stop-color="#8b5e34"/><stop offset=".8" stop-color="#4a2d14"/><stop offset="1" stop-color="#2a1708"/></linearGradient>
    <linearGradient id="${p}light" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fffbd0"/><stop offset=".5" stop-color="#c8f06a" stop-opacity=".7"/><stop offset="1" stop-color="#7ad13a" stop-opacity="0"/></linearGradient>
    <linearGradient id="${p}leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bef264"/><stop offset="1" stop-color="#15803d"/></linearGradient></defs>
  <path d="M24 16L16 2h32l-8 14z" fill="url(#${p}light)"/>
  <ellipse cx="32" cy="17" rx="10" ry="5" fill="#eaffa0" opacity=".7" filter="url(#${p}blur5)"/>
  <path d="M25 16c-1 4-3 5-6 8-4 4-6 10-6 16 0 10 8 18 19 18s19-8 19-18c0-6-2-12-6-16-3-3-5-4-6-8z" fill="url(#${p}clay)" stroke="${INK}" stroke-width=".9"/>
  <path d="M16 36c5 2.4 11 3.4 16 3.4S43 38.4 48 36M14.4 44c5 2.6 11.4 3.6 17.6 3.6S44.6 46.6 49.6 44" fill="none" stroke="#2a1708" stroke-width=".7" opacity=".75"/>
  <path d="M18 40.6l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2" fill="none" stroke="#e8c48a" stroke-width=".55" opacity=".8"/>
  <path d="M17.6 30c-1.6 3-2.4 7-2 11" fill="none" stroke="#fff3d6" stroke-width="1" stroke-linecap="round" opacity=".6"/>
  <ellipse cx="32" cy="16" rx="8" ry="2.6" fill="#4a2d14" stroke="${INK}" stroke-width=".8"/>
  <ellipse cx="32" cy="16.2" rx="6.4" ry="1.8" fill="#f4ffb8"/>
  <path d="M23.4 15.6c2-1.6 5-2.4 8.6-2.4s6.6.8 8.6 2.4" fill="none" stroke="#c79a62" stroke-width="1.2"/>
  <path d="M40 22c6-2 12 0 14 6" fill="none" stroke="#3f6212" stroke-width="1" stroke-linecap="round"/>
  ${leaf('translate(50 25) rotate(40)', 9, 3, `url(#${p}leaf)`)}${leaf('translate(45 22) rotate(-10)', 7, 2.6, `url(#${p}leaf)`)}${leaf('translate(16 48) rotate(-120)', 8, 3, `url(#${p}leaf)`)}
  ${sparkle(30, 10, 3.2)}${sparkle(40, 6, 1.4, .8)}`;

const entCup = (p) => `<defs>${wood(p)}${blur(p, 3)}
    <radialGradient id="${p}draught" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#fffde0"/><stop offset=".5" stop-color="#d4f06a"/><stop offset="1" stop-color="#4d8a1c"/></radialGradient>
    <linearGradient id="${p}leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9f99d"/><stop offset="1" stop-color="#166534"/></linearGradient></defs>
  <ellipse cx="32" cy="20" rx="18" ry="10" fill="#dcf58a" opacity=".5" filter="url(#${p}blur3)"/>
  <path d="M16 20c0 9 6 16 13 18v8c-4 1-9 3-12 7 3-1 6-1 8 0-2 2-3 5-3 7h20c0-2-1-5-3-7 2-1 5-1 8 0-3-4-8-6-12-7v-8c7-2 13-9 13-18z" fill="url(#${p}wood)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <path d="M20 24c2 5 5 9 9 11M44 24c-1 4-3 7-6 9M30 40v8M35 40v6M26 52c2-1 4-1 6 0" fill="none" stroke="#2a1505" stroke-width=".6" opacity=".7"/>
  <path d="M18.6 22.6c.8 4 3 8 6 10.6" fill="none" stroke="#f0c48a" stroke-width=".8" opacity=".7"/>
  <ellipse cx="32" cy="20" rx="16" ry="4.6" fill="#5a3410" stroke="${INK}" stroke-width=".9"/>
  <ellipse cx="32" cy="20.4" rx="14" ry="3.4" fill="url(#${p}draught)"/>
  <path d="M45 21c2 2 2.6 5 2 8-.4 1.6-.6 3 .4 4.4" fill="none" stroke="#c8ec5a" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M48 36.6c0-1.6 1-2.6 1-2.6s1 1 1 2.6a1 1 0 0 1-2 0z" fill="#e6ff9a" stroke="${INK}" stroke-width=".4"/>
  ${leaf('translate(18 19) rotate(-60)', 10, 3.4, `url(#${p}leaf)`)}${leaf('translate(20 17) rotate(-25)', 9, 3, `url(#${p}leaf)`)}${leaf('translate(44 18) rotate(35)', 8, 2.8, `url(#${p}leaf)`)}
  ${sparkle(30, 19.4, 3)}${sparkle(42, 9, 1.4, .8)}`;

// ---------------------------------------------------------------- Athelas

const athelasSprig = (p) => `<defs>${blur(p, 3)}
    <linearGradient id="${p}leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9f99d"/><stop offset=".5" stop-color="#4ade80"/><stop offset="1" stop-color="#14532d"/></linearGradient></defs>
  <circle cx="32" cy="28" r="16" fill="#bbf7d0" opacity=".35" filter="url(#${p}blur3)"/>
  <path d="M32 58c-1-8 0-16 0-26" fill="none" stroke="#3f6212" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M32 58c-1-8 0-16 0-26" fill="none" stroke="${INK}" stroke-width=".4"/>
  ${leaf('translate(32 40) rotate(-62)', 20, 4, `url(#${p}leaf)`)}${leaf('translate(32 40) rotate(62)', 20, 4, `url(#${p}leaf)`)}
  ${leaf('translate(32 34) rotate(-32)', 22, 4.4, `url(#${p}leaf)`)}${leaf('translate(32 34) rotate(32)', 22, 4.4, `url(#${p}leaf)`)}
  ${leaf('translate(32 32) rotate(0)', 25, 4.8, `url(#${p}leaf)`)}
  <g fill="none" stroke="#f0fdf4" stroke-width=".8" stroke-linecap="round" opacity=".7"><path d="M12 22c2-3 0-5 2-8M52 22c-2-3 0-5-2-8M18 12c1-2 0-3 1-5"/></g>
  ${sparkle(46, 30, 2.4, .9)}${sparkle(17, 32, 1.6, .8)}${sparkle(40, 10, 1.4, .8)}`;

const athelasBowl = (p) => `<defs>${blur(p, 2)}${blur(p, 3)}${silver(p)}
    <linearGradient id="${p}bowl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d8c3a0"/><stop offset=".4" stop-color="#9a7a52"/><stop offset="1" stop-color="#3e2b16"/></linearGradient>
    <radialGradient id="${p}water" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#f0fff4"/><stop offset=".5" stop-color="#7dd3a8"/><stop offset="1" stop-color="#1e5a4a"/></radialGradient>
    <linearGradient id="${p}leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9f99d"/><stop offset="1" stop-color="#15803d"/></linearGradient></defs>
  <g fill="none" stroke="#f0fdf4" stroke-linecap="round" filter="url(#${p}blur2)" opacity=".8"><path d="M24 30c-4-5 4-8 0-13s3-8 1-11" stroke-width="2.6"/><path d="M34 30c-3-5 4-7 1-12s3-7 2-10" stroke-width="2.2"/><path d="M42 31c-3-4 3-6 0-10" stroke-width="1.8"/></g>
  <g fill="none" stroke="#fff" stroke-linecap="round" opacity=".8"><path d="M24 30c-4-5 4-8 0-13s3-8 1-11" stroke-width=".8"/><path d="M34 30c-3-5 4-7 1-12s3-7 2-10" stroke-width=".7"/></g>
  <path d="M10 38c0 9 9.8 16 22 16s22-7 22-16z" fill="url(#${p}bowl)" stroke="${INK}" stroke-width=".9"/>
  <path d="M14 44c4 4 10 6 18 6s14-2 18-6" fill="none" stroke="#3e2b16" stroke-width=".6" opacity=".7"/>
  <path d="M24 53l-2 4h20l-2-4" fill="url(#${p}bowl)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <ellipse cx="32" cy="38" rx="22" ry="6" fill="url(#${p}bowl)" stroke="${INK}" stroke-width=".9"/>
  <ellipse cx="32" cy="38.3" rx="19.4" ry="4.4" fill="url(#${p}water)"/>
  ${leaf('translate(24 39) rotate(-80) scale(1 .55)', 13, 4, `url(#${p}leaf)`)}${leaf('translate(40 37.4) rotate(70) scale(1 .55)', 12, 3.6, `url(#${p}leaf)`)}${leaf('translate(33 40) rotate(-10) scale(1 .5)', 9, 3.2, `url(#${p}leaf)`)}
  <ellipse cx="30" cy="37" rx="6" ry="1.2" fill="#fff" opacity=".55" filter="url(#${p}blur2)"/>
  ${sparkle(20, 22, 1.8, .9)}${sparkle(46, 16, 1.6, .85)}${sparkle(36, 8, 1.2, .8)}`;

const athelasBundle = (p) => `<defs>${blur(p, 4)}
    <linearGradient id="${p}leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecfccb"/><stop offset=".45" stop-color="#65c466"/><stop offset="1" stop-color="#14532d"/></linearGradient>
    <linearGradient id="${p}twine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d9a4"/><stop offset="1" stop-color="#8a6630"/></linearGradient></defs>
  <circle cx="32" cy="30" r="19" fill="#fef9c3" opacity=".45" filter="url(#${p}blur4)"/>
  ${rays(32, 30, 12, 27, 18, 1.4, '#fef3c7', .35)}
  ${leaf('translate(36 46) rotate(-48)', 26, 5, `url(#${p}leaf)`)}${leaf('translate(30 46) rotate(42)', 26, 5, `url(#${p}leaf)`)}
  ${leaf('translate(34 47) rotate(-18)', 30, 5.2, `url(#${p}leaf)`)}${leaf('translate(31 47) rotate(14)', 29, 5, `url(#${p}leaf)`)}
  <path d="M29 46l-4 12M32 46l-1 12M35 46l3 12" stroke="#3f6212" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M27 44.6h10l.6 3.6H26.4z" fill="url(#${p}twine)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M28 45l1 3M31 45l1 3M34 45l1 3" stroke="#6b4a1c" stroke-width=".5"/>
  <path d="M36.6 47c3 1 4 4 3 6M37 46.4c3.4-.4 5.4 1 6 3" fill="none" stroke="url(#${p}twine)" stroke-width="1.1" stroke-linecap="round"/>
  ${[[14, 18], [50, 20], [46, 40], [16, 40]].map(([x, y]) => `<path d="M${x - 1.6} ${y}h3.2M${x} ${y - 1.6}v3.2" stroke="#fefce8" stroke-width="1" stroke-linecap="round"/>`).join('')}
  ${sparkle(32, 12, 2.6)}${sparkle(24, 26, 1.4, .8)}`;

// ---------------------------------------------------------------- Wizard's Staff

const staffGnarled = (p) => `<defs>${wood(p)}${blur(p, 2)}${blur(p, 4)}
    <radialGradient id="${p}crystal" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#e0f2ff"/><stop offset="1" stop-color="#7cb7f0"/></radialGradient></defs>
  ${rays(43, 17, 16, 26, 16, 1.6, '#e0f2ff', .45)}
  <circle cx="43" cy="17" r="12" fill="#bfe3ff" opacity=".7" filter="url(#${p}blur4)"/>
  <g transform="rotate(35 32 32) translate(32 0) scale(1.6 1) translate(-32 0)">
    <path d="M30.4 60c.4-6-.8-12 0-18 .8-6-.6-12 .2-18 .4-3 1.4-4.6 1.4-4.6l2.2.6s-1 2-1.2 4.6c-.6 6 .8 12 0 18-.8 6 .4 12 0 17.4z" fill="url(#${p}wood)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M31 50c.6-1.4.4-2.6 0-3.6M31.6 36c.4-1.4.2-2.4-.2-3.2" fill="none" stroke="#2a1505" stroke-width=".6"/>
    <path d="M31.2 56c.2-4-.4-8 0-12" fill="none" stroke="#f0c48a" stroke-width=".5" opacity=".7"/>
    <path d="M31.6 20c-3-1-5-4-4.4-8 .6-3.6 3.6-6.4 6-7 2 2 3.4 6 2.4 9.6-.6 2.6-2 4.6-4 5.4zM33.6 19.4c2.4-1 5-3.6 5.2-7.6" fill="url(#${p}wood)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  </g>
  <path d="M43 10.4l3.6 6.6-3.6 6.6-3.6-6.6z" fill="url(#${p}crystal)" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
  <circle cx="43" cy="17" r="4.6" fill="#fff" opacity=".8" filter="url(#${p}blur2)"/>
  ${sparkle(43, 17, 6.4)}${sparkle(52, 30, 1.6, .9)}${sparkle(30, 9, 1.4, .8)}`;

const staffClaw = (p) => `<defs>${blur(p, 2)}${blur(p, 4)}
    <linearGradient id="${p}iron" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b7280"/><stop offset=".3" stop-color="#e5e7eb"/><stop offset=".55" stop-color="#4b5563"/><stop offset="1" stop-color="#111827"/></linearGradient>
    <radialGradient id="${p}orb" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#c7e2ff"/><stop offset=".7" stop-color="#3b6fd8"/><stop offset="1" stop-color="#0b1b4a"/></radialGradient></defs>
  <circle cx="32" cy="17" r="13" fill="#7fb2ff" opacity=".55" filter="url(#${p}blur4)"/>
  <path d="M29.8 30h4.4l1 29h-6.4z" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <path d="M29.2 36h5.6M29.2 44h5.6M29 52h6" stroke="${INK}" stroke-width=".8"/>
  <path d="M29.4 35.2h5.2v1.6h-5.2zM29.6 43.2h4.8v1.6h-4.8z" fill="url(#${p}iron)"/>
  <circle cx="32" cy="17" r="9.4" fill="url(#${p}orb)" stroke="${INK}" stroke-width=".9"/>
  <path d="M26 19c3-4 8-5 12-2M27.6 23c3 1 6 .6 9-1.6" fill="none" stroke="#e0f0ff" stroke-width=".7" opacity=".7"/>
  <circle cx="32" cy="17" r="3" fill="#fff" opacity=".85" filter="url(#${p}blur2)"/>
  <path d="M32 31c-5 0-9-3-10.6-8-1-3 0-7 2-9-.4 3 0 6 2 8M32 31c5 0 9-3 10.6-8 1-3 0-7-2-9 .4 3 0 6-2 8M30 31c-2-3-2.4-6-1.6-8.6M34 31c2-3 2.4-6 1.6-8.6" fill="none" stroke="url(#${p}iron)" stroke-width="2" stroke-linecap="round"/>
  <path d="M32 31c-5 0-9-3-10.6-8-1-3 0-7 2-9M32 31c5 0 9-3 10.6-8 1-3 0-7-2-9" fill="none" stroke="${INK}" stroke-width=".45" stroke-linecap="round"/>
  <path d="M23.4 14l-1.4-2.6M40.6 14l1.4-2.6" stroke="url(#${p}iron)" stroke-width="1.6" stroke-linecap="round"/>
  ${sparkle(28.6, 13.2, 3)}${sparkle(47, 30, 1.4, .8)}${sparkle(16, 26, 1.2, .8)}`;

const staffSigil = (p) => {
  let ticks = '';
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r1 = 17, r2 = i % 3 === 0 ? 14.6 : 15.8; ticks += `M${(32 + Math.cos(a) * r1).toFixed(2)} ${(24 + Math.sin(a) * r1).toFixed(2)}L${(32 + Math.cos(a) * r2).toFixed(2)} ${(24 + Math.sin(a) * r2).toFixed(2)}`; }
  return `<defs>${wood(p)}${blur(p, 1.5)}${blur(p, 4)}${gold(p)}</defs>
  <circle cx="32" cy="24" r="19" fill="#3b82f6" opacity=".35" filter="url(#${p}blur4)"/>
  <g fill="none" stroke="#9fd0ff" opacity=".9"><circle cx="32" cy="24" r="18.4" stroke-width=".9"/><circle cx="32" cy="24" r="13.4" stroke-width=".6"/><path d="${ticks}" stroke-width=".6"/>
    <path d="M22.5 14.5h19v19h-19zM32 10.6L45.4 24 32 37.4 18.6 24z" stroke-width=".6"/></g>
  <g fill="none" stroke="#5fb0ff" opacity=".6" filter="url(#${p}blur1.5)"><circle cx="32" cy="24" r="18.4" stroke-width="2"/></g>
  <path d="M29.6 60l.8-30h3.2l.8 30z" fill="url(#${p}wood)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
  <path d="M30.8 33h2.4v2.4h-2.4z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".6"/>
  <path d="M32 31c-6 0-8-5-6-9 1.6-3.4 6-4 8-1.6 1.8 2 .8 5-1.6 5-1.8 0-2.6-2-1.4-3" fill="none" stroke="url(#${p}wood)" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M32 31c-6 0-8-5-6-9 1.6-3.4 6-4 8-1.6 1.8 2 .8 5-1.6 5-1.8 0-2.6-2-1.4-3" fill="none" stroke="${INK}" stroke-width=".4" stroke-linecap="round"/>
  <circle cx="31.4" cy="23.4" r="3.4" fill="#e0f2ff" filter="url(#${p}blur1.5)"/>
  <circle cx="31.4" cy="23.4" r="1.8" fill="#fff"/>
  <g stroke="#bfe3ff" stroke-width=".7" stroke-linecap="round"><path d="M46 44l3 2M17 46l-3 2M50 14l2.4-1.4M13 16l-2.4-1.4"/></g>
  ${sparkle(31.4, 23.4, 4.6)}${sparkle(50, 38, 1.4, .8)}`;
};

export default [
  { id: 'ent-draught', name: 'Ent-draught', kind: 'combined', recipe: ['lembas', 'lembas'], variants: [
    { title: 'Stone basin', draw: entBowl },
    { title: 'Fangorn jar', draw: entJar },
    { title: 'Root goblet', draw: entCup },
  ] },
  { id: 'athelas', name: 'Athelas', kind: 'combined', recipe: ['lembas', 'staff'], variants: [
    { title: 'Kingsfoil sprig', draw: athelasSprig },
    { title: 'Steeping bowl', draw: athelasBowl },
    { title: 'Bound bundle', draw: athelasBundle },
  ] },
  { id: 'wizards-staff', name: "Wizard's Staff", kind: 'combined', recipe: ['staff', 'staff'], variants: [
    { title: 'Gnarled staff', draw: staffGnarled },
    { title: 'Claw and orb', draw: staffClaw },
    { title: 'Rune circle', draw: staffSigil },
  ] },
  ringItem('narya', 'Narya', ['#c2410c', '#450a0a'], [
    { title: 'Ring of Fire', draw: naryaFire },
    { title: 'Crown of flame', draw: naryaCrown },
    { title: 'Sunburst ruby', draw: naryaSun },
  ]),
  ringItem('nenya', 'Nenya', ['#7c95b8', '#0f1f3a'], [
    { title: 'Still water', draw: nenyaRipples },
    { title: 'The Mirror', draw: nenyaMirror },
    { title: 'Breaking wave', draw: nenyaWave },
  ]),
  ringItem('vilya', 'Vilya', ['#1d4ed8', '#0b1f4a'], [
    { title: 'On the wind', draw: vilyaWind },
    { title: 'Above the clouds', draw: vilyaSky },
    { title: 'Winged sapphire', draw: vilyaWings },
  ]),
  ringItem('ring-of-the-seven', 'Ring of the Seven', ['#b45309', '#2a1405'], [
    { title: 'On the hoard', draw: sevenHoard },
    { title: 'On the anvil', draw: sevenAnvil },
    { title: 'At the gate', draw: sevenDoor },
  ]),
  ringItem('ring-of-the-nine', 'Ring of the Nine', ['#4b5d75', '#030712'], [
    { title: 'Shadow smoke', draw: nineSmoke },
    { title: 'The wraith', draw: nineWraith },
    { title: 'Crown of spikes', draw: nineCrown },
  ]),
];
