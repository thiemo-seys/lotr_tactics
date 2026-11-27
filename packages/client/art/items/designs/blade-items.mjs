// Batch 2: the swords and the arrow made with a Blade.
import { INK, blur, gold, silver, steel, wood, gem, sparkle, rays } from '../kit.mjs';
import { anduril as andurilTest } from './examples.mjs';

// ---- helpers (vertical, centred on x = 32, tip at the top) ----
const lg = (id, stops, x2 = 1, y2 = 0) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</linearGradient>`;
/** Lit and shadow halves of a blade, light colours first. */
const bladeGrad = (p, name, l0, l1, r0, r1) => lg(`${p}${name}L`, [[0, l0], [1, l1]]) + lg(`${p}${name}R`, [[0, r0], [1, r1]]);
function straight(T, B, w) {
  const s = T + w * 1.9;
  return { L: `M32 ${T}L${32 - w} ${s}V${B}H32z`, R: `M32 ${T}L${32 + w} ${s}V${B}H32z`, all: `M32 ${T}L${32 + w} ${s}V${B}H${32 - w}V${s}z`, edge: `M${32 - w + .45} ${s + .6}V${B - .5}`, tipEdge: `M${32 - w + .5} ${s - .2}L32 ${T + 1}` };
}
function leaf(T, B, w) {
  const m = T + (B - T) * .6;
  return {
    L: `M32 ${T}Q${32 - w * 1.5} ${m} ${32 - w * .7} ${B}H32z`, R: `M32 ${T}Q${32 + w * 1.5} ${m} ${32 + w * .7} ${B}H32z`,
    all: `M32 ${T}Q${32 + w * 1.5} ${m} ${32 + w * .7} ${B}H${32 - w * .7}Q${32 - w * 1.5} ${m} 32 ${T}z`,
    edge: `M${32 - w * .35} ${T + (B - T) * .22}Q${32 - w * 1.1} ${m} ${32 - w * .55} ${B - .6}`, tipEdge: '',
  };
}
/** Draws a blade from its paths: glow (optional), halves, outline, edge light. */
const bladeSvg = (p, b, name, { glow, glowBlur = 2.2, fuller, fullerCol = '#3c4a60', extra = '' } = {}) =>
  (glow ? `<path d="${b.all}" fill="${glow}" opacity=".9" filter="url(#${p}blur${glowBlur})" transform="translate(32 0) scale(1.35 1) translate(-32 0)"/>` : '') +
  `<path d="${b.R}" fill="url(#${p}${name}R)"/><path d="${b.L}" fill="url(#${p}${name}L)"/>` +
  (fuller ? `<path d="M32 ${fuller[0]}V${fuller[1]}" stroke="${fullerCol}" stroke-width="1.6" opacity=".55"/><path d="M31.5 ${fuller[0]}V${fuller[1]}" stroke="#fff" stroke-width=".35" opacity=".6"/>` : '') +
  extra +
  `<path d="${b.all}" fill="none" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>` +
  `<path d="${b.edge}" stroke="#fff" stroke-width=".5" fill="none" opacity=".85"/>` + (b.tipEdge ? `<path d="${b.tipEdge}" stroke="#fff" stroke-width=".55" opacity=".9"/>` : '');
/** A wrapped grip from y0 to y1. */
const grip = (y0, y1, w, fill, line = '#c48d5a') => {
  let d = '';
  for (let y = y0 + 1.8; y < y1; y += 2.3) d += `M${32 - w + .2} ${y}l${w * 2 - .4} -1.3`;
  return `<rect x="${32 - w}" y="${y0}" width="${w * 2}" height="${y1 - y0}" rx="1" fill="${fill}" stroke="${INK}" stroke-width=".9"/><path d="${d}" stroke="${line}" stroke-width=".55" opacity=".85"/><path d="M${32 - w + .7} ${y0 + .6}V${y1 - .6}" stroke="#fff" stroke-width=".4" opacity=".35"/>`;
};
const O = `stroke="${INK}" stroke-width=".9" stroke-linejoin="round"`;
const glint = (x, y, r, o) => sparkle(x, y, r, o);
/** A small horse head facing right, about 11 wide and 12 tall, its neck at the bottom left. */
const horseHead = 'M0 12C.2 8.6.6 5.4 2.2 3.2 3.4 1.6 4.8.8 6 .6L6.6-1.6 7.8.4C9.6 1 10.8 2.4 11.4 4.4L12.2 7.2C12.4 8.2 11.6 8.9 10.6 8.6L8 7.6C7.2 8.8 6.6 10.4 6.6 12z';

// ======================= Andúril =======================
function andurilShards(p) {
  const defs = `<defs>${gold(p)}${wood(p)}${blur(p, 1.5)}${blur(p, 4)}${bladeGrad(p, 'bl', '#ffffff', '#cfdced', '#9fb0c6', '#4a5a73')}${gem(p, 'r', '#c81e1e')}
    <radialGradient id="${p}forge" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe7a8"/><stop offset=".5" stop-color="#ff8a2a" stop-opacity=".6"/><stop offset="1" stop-color="#ff5a00" stop-opacity="0"/></radialGradient></defs>`;
  const b = straight(5, 40, 4.6);
  // Three shards with glowing seams between them, the middle one a little out of line.
  const seams = [[16.5, 17.8], [27.5, 28.9]];
  const cut = (y0, y1) => `<clipPath id="${p}c${y0}"><rect x="20" y="${y0}" width="24" height="${y1 - y0}"/></clipPath>`;
  const clips = `<defs>${cut(0, 16.5)}${cut(17.8, 27.5)}${cut(28.9, 41)}</defs>`;
  const blade = bladeSvg(p, b, 'bl', { fuller: [12, 38] });
  const pieces = `<g clip-path="url(#${p}c0)">${blade}</g><g clip-path="url(#${p}c17.8)" transform="translate(.9 0) rotate(-3 32 22)">${blade}</g><g clip-path="url(#${p}c28.9)">${blade}</g>`;
  const seamGlow = seams.map(([a, c]) => `<rect x="25" y="${a - 1.5}" width="14" height="${c - a + 3}" fill="url(#${p}forge)" filter="url(#${p}blur1.5)"/><path d="M27.6 ${(a + c) / 2}l1.6-.7 1.4.8 1.6-.9 1.4.9 1.6-.8 1.6.7" fill="none" stroke="#fff3c4" stroke-width="1.1"/>`).join('');
  const embers = [[18, 14, 1], [46, 20, .8], [44, 34, 1.1], [20, 30, .7], [47, 12, .6], [16, 22, .5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffcf6a"/><circle cx="${x}" cy="${y}" r="${r * 2.4}" fill="#ff8a2a" opacity=".35" filter="url(#${p}blur1.5)"/>`).join('');
  return defs + clips + `<ellipse cx="32" cy="23" rx="14" ry="20" fill="#ff7a1a" opacity=".22" filter="url(#${p}blur4)"/>` + embers + pieces + seamGlow +
    `<path d="M20.5 40.2h23l1.6 2.8-1.4 1.6H20.3l-1.4-1.6z" fill="url(#${p}goldside)" ${O}/><path d="M21 41.2h22" stroke="#fff6d0" stroke-width=".55" opacity=".8"/>
     <path d="M19 43.2l-2.4 3.2M45 43.2l2.4 3.2" stroke="url(#${p}gold)" stroke-width="2.2" stroke-linecap="round"/><path d="M19 43.2l-2.4 3.2M45 43.2l2.4 3.2" stroke="${INK}" stroke-width=".5" stroke-linecap="round" opacity=".6"/>
     ${grip(44.6, 54.4, 2.4, `url(#${p}leather)`)}
     <path d="M28.6 54.2h6.8l1.2 2.4-4.6 3.4-4.6-3.4z" fill="url(#${p}gold)" ${O}/><circle cx="32" cy="56.4" r="1.5" fill="url(#${p}gem-r)" stroke="${INK}" stroke-width=".5"/>` + glint(36, 8.5, 3.2);
}

function andurilSun(p) {
  const defs = `<defs>${gold(p)}${wood(p)}${blur(p, 2.2)}${blur(p, 5)}${bladeGrad(p, 'bl', '#ffffff', '#f2f6ff', '#c9d6ea', '#7d8fae')}${gem(p, 'w', '#8fd3ff')}
    <radialGradient id="${p}sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff8d8"/><stop offset=".4" stop-color="#ffd98a" stop-opacity=".7"/><stop offset="1" stop-color="#ffb84a" stop-opacity="0"/></radialGradient></defs>`;
  const b = straight(6.5, 41, 3.6);
  const stars = [[14.5, 26], [16.5, 18.5], [21.5, 12.5], [42.5, 12.5], [47.5, 18.5], [49.5, 26], [32, 51.8]];
  const star = ([x, y], i) => i === 6 ? '' : `<path d="M${x} ${y - 2.4}l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" fill="#fffbe6" stroke="#b98a2a" stroke-width=".35"/><circle cx="${x}" cy="${y}" r="2.6" fill="#fff3b0" opacity=".45" filter="url(#${p}blur2.2)"/>`;
  return defs + rays(32, 24, 20, 34, 24, 1.8, '#ffe39a', .4) + `<circle cx="32" cy="24" r="20" fill="url(#${p}sun)"/>` + stars.map(star).join('') +
    bladeSvg(p, b, 'bl', { glow: '#fff4c8', fuller: [13, 39], fullerCol: '#a77a1e',
      extra: `<path d="M32 15.5l1 1.6-1 1.6-1-1.6zM32 22l1 1.6-1 1.6-1-1.6zM32 28.5l1 1.6-1 1.6-1-1.6z" fill="#e6b84a" stroke="#7a5410" stroke-width=".3"/>` }) +
    `<path d="M17.5 40c3.6 1.6 9.4 2.4 14.5 2.4s10.9-.8 14.5-2.4l1.4-3.4 1.2 3.8c-1.6 2.6-5 4.4-8.6 4.8-3 .4-5.6.6-8.5.6s-5.5-.2-8.5-.6c-3.6-.4-7-2.2-8.6-4.8l1.2-3.8z" fill="url(#${p}goldside)" ${O}/>
     <path d="M17.6 41.4c3.6 1.4 9.2 2.2 14.4 2.2s10.8-.8 14.4-2.2" fill="none" stroke="#fff6d0" stroke-width=".55" opacity=".8"/>
     <circle cx="32" cy="43.6" r="2.4" fill="url(#${p}gem-w)" stroke="${INK}" stroke-width=".8"/><circle cx="31.3" cy="42.9" r=".6" fill="#fff"/>
     ${grip(46.2, 54.6, 2.3, `url(#${p}leather)`)}
     <path d="M32 53.8c2.4 0 3.6 1.4 3.6 3s-1.6 3-3.6 3-3.6-1.4-3.6-3 1.2-3 3.6-3z" fill="url(#${p}gold)" ${O}/><path d="M32 54.9l.9 1.9-.9 1.9-.9-1.9z" fill="#fff"/>` + glint(32, 7, 3.6);
}

// ======================= Black Arrow =======================
/** The Black Arrow drawn upright, its head at the top; length from y 4 to 60. */
function blackArrow(p, { head = 4, nock = 60 } = {}) {
  const h = head;
  return `<path d="M32 ${h + 13}V${nock - 2}" stroke="#0a0706" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M32 ${h + 13}V${nock - 2}" stroke="url(#${p}shaft)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M31.4 ${h + 15}V${nock - 4}" stroke="#7c6a5a" stroke-width=".35" opacity=".8"/>
    <path d="M32 ${nock - 15}l-4.6 2.6-1.2 9.2 5.8-3.6zM32 ${nock - 15}l4.6 2.6 1.2 9.2-5.8-3.6z" fill="url(#${p}feather)" ${O}/>
    <path d="M32 ${nock - 13}l-3.4 2.4M32 ${nock - 10.5}l-4 2.6M32 ${nock - 8}l-4.4 2.8M32 ${nock - 13}l3.4 2.4M32 ${nock - 10.5}l4 2.6M32 ${nock - 8}l4.4 2.8" stroke="#5a1414" stroke-width=".45"/>
    <rect x="30.6" y="${nock - 17.2}" width="2.8" height="1.6" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".5"/>
    <rect x="30.6" y="${nock - 3.4}" width="2.8" height="1.4" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".5"/>
    <path d="M32 ${h}L36.4 ${h + 9.4}L33.8 ${h + 8.4}L35.2 ${h + 13.2}L32 ${h + 11.4}L28.8 ${h + 13.2}L30.2 ${h + 8.4}L27.6 ${h + 9.4}z" fill="url(#${p}iron)" ${O}/>
    <path d="M32 ${h + 1.2}V${h + 10.6}" stroke="#7a8796" stroke-width=".5"/><path d="M31.3 ${h + 2.6}L28.8 ${h + 8.6}" stroke="#cfd8e2" stroke-width=".45"/>
    <rect x="30.4" y="${h + 11.6}" width="3.2" height="2" rx=".4" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".5"/>`;
}
const arrowDefs = (p) => `${gold(p)}${blur(p, 2)}${blur(p, 4)}
  ${lg(`${p}shaft`, [[0, '#4a3c32'], [.5, '#231a15'], [1, '#0c0908']])}
  ${lg(`${p}feather`, [[0, '#3a1010'], [.5, '#120808'], [1, '#000000']], .6, 1)}
  ${lg(`${p}iron`, [[0, '#9aa3ad'], [.35, '#3a3f47'], [.6, '#16181c'], [1, '#4a515a']])}`;

function arrowLone(p) {
  return `<defs>${arrowDefs(p)}</defs><g transform="rotate(45 32 32)">
    <ellipse cx="32" cy="12" rx="7" ry="10" fill="#ff3a1a" opacity=".5" filter="url(#${p}blur4)"/>
    <path d="M32 6V40" stroke="#ff6a3a" stroke-width="5" opacity=".18" filter="url(#${p}blur2)"/>
    ${blackArrow(p, { head: 3.5, nock: 59 })}</g>` + glint(46.5, 17.5, 3.2) + `<circle cx="47.2" cy="16.8" r="6" fill="#ff5a2a" opacity=".2" filter="url(#${p}blur2)"/>`;
}

function arrowScale(p) {
  const defs = `<defs>${arrowDefs(p)}
    <radialGradient id="${p}scale" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="#ffd27a"/><stop offset=".35" stop-color="#c0561c"/><stop offset=".75" stop-color="#6e1a0c"/><stop offset="1" stop-color="#2a0804"/></radialGradient>
    <radialGradient id="${p}hole" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff0b0"/><stop offset=".4" stop-color="#ff7a22"/><stop offset="1" stop-color="#ff3a00" stop-opacity="0"/></radialGradient></defs>`;
  const scale = 'M30 11C40 11 48 18 48 29c0 11-8 20-18 25-10-5-18-14-18-25 0-11 8-18 18-18z';
  const back = `<g transform="rotate(45 32 32)">${blackArrow(p, { head: 3, nock: 59 })}</g>`;
  return defs + back.replace('<g transform', `<g clip-path="url(#${p}behind)" transform`) +
    `<defs><clipPath id="${p}behind"><path d="M0 64L64 0V64z"/></clipPath><clipPath id="${p}front"><path d="M0 0H64L0 64z"/></clipPath></defs>` +
    `<path d="${scale}" fill="url(#${p}scale)" ${O}/>
     <path d="M30 14.5c-7.6.2-13.6 5.6-14.4 13.4M30 14.5c3.4 0 6.4 1 8.8 2.6" fill="none" stroke="#ffe3a4" stroke-width=".9" opacity=".75" stroke-linecap="round"/>
     <path d="M30 18c8 0 13 5 13 11.6 0 8.6-6 15.6-13 19.6-7-4-13-11-13-19.6C17 23 22 18 30 18z" fill="none" stroke="#4a1006" stroke-width=".6" opacity=".7"/>
     <path d="M32 32l-6.2-8.4-2.4.4M32 32l-9.8 2.6-1.2 3.4M32 32l-.8 9.6 2.4 4M32 32l9 3.6M32 32l4.4-9.6" fill="none" stroke="#1a0402" stroke-width=".9" stroke-linecap="round"/>
     <path d="M32 32l-6.2-8.4M32 32l-9.8 2.6M32 32l-.8 9.6M32 32l9 3.6M32 32l4.4-9.6" fill="none" stroke="#ffb35a" stroke-width=".4" opacity=".8"/>
     <circle cx="32" cy="32" r="7" fill="url(#${p}hole)"/>` +
    back.replace('<g transform', `<g clip-path="url(#${p}front)" transform`) + glint(32, 32, 4.2, .9) + glint(51, 13, 2.6);
}

function arrowBow(p) {
  const defs = `<defs>${arrowDefs(p)}${wood(p)}
    ${lg(`${p}yew`, [[0, '#e0a868'], [.4, '#9a5a2a'], [1, '#3e1e0a']], 0, 1)}</defs>`;
  // Upright: the bow bulges up, the string drawn back to the nock at the bottom.
  const bow = 'M7 30C12 16 22 10 32 10s20 6 25 20l-2.4.8C50 19.6 42 14.2 32 14.2S14 19.6 9.4 30.8z';
  return defs + `<g transform="rotate(45 32 32) translate(32 33) scale(.86) translate(-32 -32)">
    <path d="M8.2 30.4L32 52.6 55.8 30.4" fill="none" stroke="#e9e1cf" stroke-width=".8"/>
    <path d="${bow}" fill="url(#${p}yew)" ${O}/>
    <path d="M10.2 28.6C14.6 18.6 22.6 12.6 32 12.4" fill="none" stroke="#ffd9a0" stroke-width=".6" opacity=".8"/>
    <rect x="28.6" y="9.2" width="6.8" height="5.8" rx="1" fill="url(#${p}leather)" stroke="${INK}" stroke-width=".8"/>
    <path d="M29 11h6M29 13h6" stroke="#c48d5a" stroke-width=".5"/>
    <path d="M7 30l-1.6 1.8 2.2 1M57 30l1.6 1.8-2.2 1" fill="none" stroke="url(#${p}gold)" stroke-width="1.4" stroke-linecap="round"/>
    <ellipse cx="32" cy="6" rx="5" ry="6" fill="#ff3a1a" opacity=".45" filter="url(#${p}blur4)"/>
    ${blackArrow(p, { head: 1.5, nock: 54 })}</g>` + glint(50, 12, 2.8);
}

// ======================= Orcrist =======================
/** Orcrist upright: a long, slightly curved Elven blade, blue-white on its edge. */
function orcristSword(p) {
  return `<path d="M33.6 3.5C36.6 12 37 26 35.4 40.5H29.4C29.6 27 30.4 14 33.6 3.5z" fill="#8fd8ff" opacity=".75" filter="url(#${p}blur2.2)" transform="translate(32 0) scale(1.5 1) translate(-32 0)"/>
    <path d="M33.6 4C36.4 12.4 36.8 26.4 35.2 40.4H32.2C33 26.6 33.4 14 33.6 4z" fill="url(#${p}obR)"/>
    <path d="M33.6 4C30.6 14.2 29.8 27 29.6 40.4H32.2C33 26.6 33.4 14 33.6 4z" fill="url(#${p}obL)"/>
    <path d="M33.6 4C36.4 12.4 36.8 26.4 35.2 40.4H29.6C29.8 27 30.6 14.2 33.6 4z" fill="none" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M34.2 7C36.2 15 36.4 27 35 39.6" fill="none" stroke="#e8fbff" stroke-width=".7"/>
    <path d="M31.4 16.5q.8-1 1.6 0M31.2 21.2q.9-1.2 1.8 0M31.1 26q.9-1.2 1.8 0M31 30.8q.9-1.2 1.8 0M30.9 35.4q.9-1.2 1.8 0" fill="none" stroke="#bfefff" stroke-width=".55"/>
    <path d="M31.4 16.5q.8-1 1.6 0M31.2 21.2q.9-1.2 1.8 0M31.1 26q.9-1.2 1.8 0M31 30.8q.9-1.2 1.8 0M30.9 35.4q.9-1.2 1.8 0" fill="none" stroke="#4fc3ff" stroke-width="1.6" opacity=".5" filter="url(#${p}blur2.2)"/>
    <path d="M32.4 40.2c-3.4.2-6.6-1.4-8.6-4.6 3.6 1.2 6.4 1.4 8.6 1.2 2.2.2 5-.2 8.6-1.4-2 3.2-5.2 4.6-8.6 4.8z" transform="translate(0 2)" fill="url(#${p}silver)" ${O}/>
    <path d="M24.2 37.2c-1.6-.4-2.8-1.6-3-3.4 1.6.2 2.8 1 3.6 2.2zM40.6 37c1.6-.4 2.8-1.6 3-3.4-1.6.2-2.8 1-3.6 2.2z" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".7"/>
    <circle cx="32.4" cy="41.4" r="1.7" fill="url(#${p}gem-b)" stroke="${INK}" stroke-width=".6"/>
    ${grip(43, 54.4, 2.1, `url(#${p}og)`, '#9cc7e6').replace(/32 -/g, '32.2 -')}
    <path d="M32.2 54c1.9 1 3 2.8 3 4.8-1.2-.6-2.2-.6-3 0-.8-.6-1.8-.6-3 0 0-2 1.1-3.8 3-4.8z" fill="url(#${p}silver)" ${O}/>`;
}
const orcristDefs = (p) => `${silver(p)}${blur(p, 2.2)}${blur(p, 4)}${gem(p, 'b', '#3aa0ff')}
  ${bladeGrad(p, 'ob', '#ffffff', '#d4ecff', '#9cc4e8', '#3d6390')}
  ${lg(`${p}og`, [[0, '#2d4a72'], [.5, '#1a2c48'], [1, '#0a1220']])}
  ${lg(`${p}sheath`, [[0, '#365a86'], [.4, '#1c3150'], [1, '#08101c']])}`;

function orcristDrawn(p) {
  return `<defs>${orcristDefs(p)}</defs><g transform="rotate(45 32 32) translate(0 1)">${orcristSword(p)}</g>` + glint(49.5, 13, 3.4) + glint(44, 10.5, 1.3, .7);
}

function orcristSheath(p) {
  const sheath = `<path d="M30 9h5.8l.4 3.4c.4 10 .2 23-.8 36-.4 3-1.2 5.6-2.6 7.6-1.4-2-2.2-4.6-2.6-7.6-1-13-1.2-26-.8-36z" fill="url(#${p}sheath)" ${O}/>
    <path d="M30.8 12.4c-.3 10-.1 22.4.8 34.8" fill="none" stroke="#7fb2e6" stroke-width=".5" opacity=".7"/>
    <path d="M29.6 9h6.8l.3 4.6h-7.4z" fill="url(#${p}silver)" ${O}/>
    <path d="M30.2 45.6h5.6l-.6 4.8c-.6 2.2-1.3 4-2.2 5.2-.9-1.2-1.6-3-2.2-5.2z" fill="url(#${p}silver)" ${O}/>
    <path d="M33 20c1.8 2 1.8 4.6 0 6.6-1.8-2-1.8-4.6 0-6.6zM33 30c1.6 1.8 1.6 4.2 0 6-1.6-1.8-1.6-4.2 0-6z" fill="none" stroke="url(#${p}silver)" stroke-width=".8"/>
    <path d="M33 23.3v10" stroke="url(#${p}silver)" stroke-width=".5"/>`;
  return `<defs>${orcristDefs(p)}</defs><g transform="rotate(-45 32 32)">${sheath}</g><g transform="rotate(45 32 32) translate(0 1)">${orcristSword(p)}</g>` + glint(49.5, 13, 3.2);
}

function orcristSwift(p) {
  return `<defs>${orcristDefs(p)}</defs>
    <path d="M10 44C14 24 30 11 50 9" fill="none" stroke="#7fd4ff" stroke-width="5" opacity=".25" filter="url(#${p}blur2.2)" stroke-linecap="round"/>
    <path d="M12.6 46.6C17 27 31.6 15 50.6 13.2L50 15.4C33 17.8 20 29 15 47.4z" fill="#dff6ff" opacity=".7"/>
    <g transform="rotate(5 32 32) translate(0 1)" opacity=".22">${orcristSword(p)}</g>
    <g transform="rotate(25 32 32) translate(0 1)" opacity=".4">${orcristSword(p)}</g>
    <g transform="rotate(45 32 32) translate(0 1)">${orcristSword(p)}</g>` + glint(49.5, 13, 3.4);
}

// ======================= Sting =======================
const stingDefs = (p) => `${silver(p)}${wood(p)}${blur(p, 2.2)}${blur(p, 4)}${gem(p, 'b', '#38bdf8')}
  ${bladeGrad(p, 'sb', '#ffffff', '#d8f2ff', '#8fd0f5', '#2f78b8')}
  <radialGradient id="${p}aura" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#bff0ff"/><stop offset=".45" stop-color="#38bdf8" stop-opacity=".55"/><stop offset="1" stop-color="#0369a1" stop-opacity="0"/></radialGradient>`;
/** Sting upright: a broad leaf-shaped blade, short hilt; from y 6 to about 58. */
function stingSword(p, T = 6, B = 38) {
  const b = leaf(T, B, 6);
  return bladeSvg(p, b, 'sb', { glow: '#5cd0ff', fuller: [T + 6, B - 1], fullerCol: '#1e5f99',
    extra: `<path d="M32 ${T + 9}l.9 1.4-.9 1.4-.9-1.4zM32 ${T + 15}l.9 1.4-.9 1.4-.9-1.4zM32 ${T + 21}l.9 1.4-.9 1.4-.9-1.4z" fill="#e6faff"/>` }) +
    `<path d="M22 ${B + .2}c2.6 1.6 6 2.2 10 2.2s7.4-.6 10-2.2l1.6-2.6.6 3.2c-.8 2-3.4 3.6-6.6 4.2-2 .4-3.6.4-5.6.4s-3.6 0-5.6-.4c-3.2-.6-5.8-2.2-6.6-4.2l.6-3.2z" fill="url(#${p}silver)" ${O}/>
     <path d="M20.6 ${B - 2.4}c-.6-.8-1.8-1.2-2.8-1 .2 1.2 1 2.2 2.2 2.6zM43.4 ${B - 2.4}c.6-.8 1.8-1.2 2.8-1-.2 1.2-1 2.2-2.2 2.6z" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".6"/>
     ${grip(B + 4.6, B + 14, 2.2, `url(#${p}leather)`, '#d9b98a')}
     <circle cx="32" cy="${B + 16.2}" r="2.8" fill="url(#${p}silver)" ${O}/><circle cx="32" cy="${B + 16.2}" r="1.3" fill="url(#${p}gem-b)"/>`;
}

function stingGlow(p) {
  return `<defs>${stingDefs(p)}</defs><circle cx="30" cy="28" r="24" fill="url(#${p}aura)" opacity=".8"/>
    <g transform="rotate(45 32 32) translate(0 2.5) scale(1.02)">${stingSword(p, 5, 36)}</g>` + glint(47, 14, 4) + glint(40, 9, 1.5, .8) + glint(52, 22, 1.2, .7);
}

function stingWeb(p) {
  // A web in the top corners, Sting point-down in the earth.
  const web = (flip) => {
    let d = '';
    const spokes = [0, 18, 36, 54, 72, 90].map((a) => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]);
    for (const [c, s] of spokes) d += `M5 5L${(5 + c * 26).toFixed(1)} ${(5 + s * 26).toFixed(1)}`;
    for (const r of [7, 12.5, 18, 23]) {
      d += `M${(5 + r).toFixed(1)} 5`;
      for (let i = 1; i < spokes.length; i++) { const [c, s] = spokes[i]; const [c0, s0] = spokes[i - 1]; const mx = 5 + (c + c0) / 2 * r * .86, my = 5 + (s + s0) / 2 * r * .86; d += `Q${mx.toFixed(1)} ${my.toFixed(1)} ${(5 + c * r).toFixed(1)} ${(5 + s * r).toFixed(1)}`; }
    }
    return `<path d="${d}" fill="none" stroke="#e8eef5" stroke-width=".45" opacity=".55" ${flip ? 'transform="translate(64 0) scale(-1 1)"' : ''}/>`;
  };
  return `<defs>${stingDefs(p)}${lg(`${p}earth`, [[0, '#5a4030'], [1, '#1c120a']], 0, 1)}</defs>` + web(false) + web(true) +
    `<ellipse cx="32" cy="34" rx="16" ry="24" fill="url(#${p}aura)"/>
     <g transform="rotate(180 32 32) translate(0 -3.6)">${stingSword(p, 8, 40)}</g>
     <path d="M8 59c3-5.4 8-8.2 14-8.8 3.6-.4 6.4.4 10 .4s6.4-.8 10-.4c6 .6 11 3.4 14 8.8z" fill="url(#${p}earth)" ${O}/>
     <path d="M22.6 52.4c3-.8 6-1 9.4-.8M36 51.8c2.4-.2 4.6 0 6.8.6" fill="none" stroke="#9a7a5c" stroke-width=".6"/>
     <path d="M27.6 54.8l-2.4 2.6M37 54.6l2.6 2.4M32 55.2v2.6" stroke="#0e0905" stroke-width=".7"/>` + glint(40, 42, 2.6) + glint(23, 33, 1.4, .8);
}

function stingSheath(p) {
  return `<defs>${stingDefs(p)}${lg(`${p}sh`, [[0, '#6b4a2e'], [.45, '#3a2414'], [1, '#140a04']])}</defs>
    <g transform="rotate(45 32 32)">
      <ellipse cx="32" cy="25" rx="9" ry="7" fill="url(#${p}aura)" />
      ${rays(32, 25, 12, 15, 9, 1.4, '#bff0ff', .5)}
      <path d="M26.6 26.4h10.8l-.4 7c-.2 8-.8 15.4-2.2 20.6-.6 2.2-1.6 3.6-2.8 4.4-1.2-.8-2.2-2.2-2.8-4.4-1.4-5.2-2-12.6-2.2-20.6z" fill="url(#${p}sh)" ${O}/>
      <path d="M28 31c.2 7.6.8 15 2 20.4" fill="none" stroke="#c49a6a" stroke-width=".5" opacity=".7"/>
      <path d="M32 36c1.6 1.4 1.6 3.4 0 4.8-1.6-1.4-1.6-3.4 0-4.8zM32 43c1.3 1.2 1.3 3 0 4.2-1.3-1.2-1.3-3 0-4.2z" fill="none" stroke="url(#${p}silver)" stroke-width=".7"/>
      <path d="M28.4 52h7.2l-.8 2.6c-.8 2.2-1.6 3.2-2.8 3.8-1.2-.6-2-1.6-2.8-3.8z" fill="url(#${p}silver)" ${O}/>
      <path d="M32 17.4l4 1.2v8H28v-8z" fill="url(#${p}sbL)"/>
      <path d="M32 17.4l4 1.2v8H32z" fill="url(#${p}sbR)"/>
      <path d="M28 18.6v8M36 18.6v8" stroke="${INK}" stroke-width=".9"/>
      <path d="M32 19v7.6" stroke="#1e5f99" stroke-width="1.3" opacity=".6"/>
      <rect x="26" y="25.6" width="12" height="3.4" rx="1" fill="url(#${p}silver)" ${O}/>
      <path d="M21.4 17.6c2.6 1.2 6 1.6 10.6 1.6s8-.4 10.6-1.6l1.4-2.2.6 2.8c-.8 1.8-3.4 3-6.6 3.4-2 .2-3.6.2-6 .2s-4-0-6-.2c-3.2-.4-5.8-1.6-6.6-3.4l.6-2.8z" transform="translate(0 -1.6)" fill="url(#${p}silver)" ${O}/>
      ${grip(5.4, 15.4, 2.3, `url(#${p}leather)`, '#d9b98a')}
      <circle cx="32" cy="3.6" r="2.7" fill="url(#${p}silver)" ${O}/><circle cx="32" cy="3.6" r="1.2" fill="url(#${p}gem-b)"/>
    </g>` + glint(17, 21, 2.2, .9) + glint(30, 14, 1.6, .8);
}

// ======================= Herugrim =======================
const heruDefs = (p) => `${gold(p)}${wood(p)}${blur(p, 2.2)}${blur(p, 4)}${steel(p)}${gem(p, 'g', '#16a34a')}
  ${lg(`${p}hg`, [[0, '#3f7a3a'], [.5, '#1f4a1e'], [1, '#0b200a']])}`;
/** Herugrim upright: broad blade, straight gold guard with knot ends, green grip, a horse-head pommel. */
function heruSword(p) {
  const b = straight(4.5, 39.5, 4.4);
  const knot = 'M30 13c1.2-1.6 2.8-1.6 4 0-1.2 1.6-2.8 1.6-4 0zM30 13c1.2 1.6 2.8 1.6 4 0';
  return bladeSvg(p, b, 'steel', { fuller: [12, 37] }) +
    `<path d="${knot}" fill="none" stroke="#e6b84a" stroke-width=".55" transform="translate(0 20)"/><path d="${knot}" fill="none" stroke="#e6b84a" stroke-width=".55" transform="translate(0 24)"/>
     <path d="M19 39.4h26v3.6H19z" fill="url(#${p}goldside)" ${O}/><path d="M19.6 40.4h24.8" stroke="#fff6d0" stroke-width=".5" opacity=".8"/>
     <circle cx="17.4" cy="41.2" r="2.6" fill="url(#${p}gold)" ${O}/><circle cx="46.6" cy="41.2" r="2.6" fill="url(#${p}gold)" ${O}/>
     <circle cx="17.4" cy="41.2" r="1.1" fill="url(#${p}gem-g)"/><circle cx="46.6" cy="41.2" r="1.1" fill="url(#${p}gem-g)"/>
     <path d="M29.6 41.2l2.4-2 2.4 2-2.4 2z" fill="url(#${p}gem-g)" stroke="${INK}" stroke-width=".5"/>
     ${grip(43, 52.2, 2.4, `url(#${p}hg)`, '#e6b84a')}
     <g transform="translate(26.6 51.6)"><path d="${horseHead}" fill="url(#${p}gold)" ${O}/><circle cx="8.3" cy="3.6" r=".6" fill="${INK}"/><path d="M3 3.4c-1.2 2-1.6 4.4-1.6 7.4" stroke="#fff6d0" stroke-width=".5" fill="none"/></g>`;
}
const steelAlias = (p) => `${lg(`${p}steelL`, [[0, '#ffffff'], [1, '#c3cbd6']])}${lg(`${p}steelR`, [[0, '#9aa5b4'], [1, '#4d5869']])}`;

function heruDiag(p) {
  return `<defs>${heruDefs(p)}</defs><ellipse cx="32" cy="32" rx="22" ry="8" transform="rotate(-45 32 32)" fill="#ffd36b" opacity=".18" filter="url(#${p}blur4)"/>
    <g transform="rotate(45 32 32) translate(0 -.6)">${heruSword(p)}</g>` + glint(49, 14, 3.4) + glint(43, 10, 1.3, .7);
}

function heruShield(p) {
  const defs = `<defs>${heruDefs(p)}
    <radialGradient id="${p}sh" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#4f9a46"/><stop offset=".6" stop-color="#1f5a1d"/><stop offset="1" stop-color="#0a2408"/></radialGradient></defs>`;
  let spokes = '';
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; spokes += `M${(30 + Math.cos(a) * 5.6).toFixed(2)} ${(34 + Math.sin(a) * 5.6).toFixed(2)}L${(30 + Math.cos(a + .14) * 15).toFixed(2)} ${(34 + Math.sin(a + .14) * 15).toFixed(2)}L${(30 + Math.cos(a + .26) * 5.6).toFixed(2)} ${(34 + Math.sin(a + .26) * 5.6).toFixed(2)}z`; }
  return defs + `<circle cx="30" cy="34" r="21" fill="url(#${p}sh)" ${O}/>
    <circle cx="30" cy="34" r="21" fill="none" stroke="url(#${p}gold)" stroke-width="2.4"/>
    <circle cx="30" cy="34" r="22" fill="none" stroke="${INK}" stroke-width=".6"/><circle cx="30" cy="34" r="19.6" fill="none" stroke="${INK}" stroke-width=".5" opacity=".6"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i * Math.PI / 4 + .4; return `<circle cx="${(30 + Math.cos(a) * 21).toFixed(2)}" cy="${(34 + Math.sin(a) * 21).toFixed(2)}" r="1" fill="#fff4c4" stroke="${INK}" stroke-width=".4"/>`; }).join('')}
    <path d="${spokes}" fill="url(#${p}gold)" opacity=".9" stroke="#5a3d08" stroke-width=".3"/>
    <circle cx="30" cy="34" r="5.4" fill="url(#${p}gold)" ${O}/><circle cx="28.8" cy="32.8" r="1.6" fill="#fff" opacity=".7"/>
    <path d="M14 27c2.2-6 7.4-10.4 14-11.4" fill="none" stroke="#bfe6b0" stroke-width=".9" opacity=".6" stroke-linecap="round"/>
    <g transform="rotate(45 32 32) translate(0 -.6)">${heruSword(p)}</g>` + glint(49, 14, 3.2);
}

function heruGable(p) {
  const beam = (flip) => `<g ${flip ? 'transform="translate(64 0) scale(-1 1)"' : ''}>
      <path d="M8 60L42.2 14.4l3.4 2.4L11.4 62.4z" fill="url(#${p}wood)" ${O}/>
      <path d="M10 59.6l32.6-43.6" stroke="#e7b07a" stroke-width=".5" opacity=".6"/>
      <path d="M20 46l2.4 1.8M27 36.6l2.4 1.8M34 27.2l2.4 1.8" stroke="#e6b84a" stroke-width="1.2"/>
      <g transform="translate(41 4.4) scale(1.15)"><path d="${horseHead}" fill="url(#${p}gold)" ${O}/><circle cx="8.3" cy="3.6" r=".6" fill="${INK}"/><path d="M6.4 .6c-.8 1.6-2 2.6-3.8 3.4" stroke="#fff6d0" stroke-width=".5" fill="none"/></g>
    </g>`;
  return `<defs>${heruDefs(p)}<radialGradient id="${p}sky" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3c0" stop-opacity=".8"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="22" r="17" fill="url(#${p}sky)"/>` + beam(false) + beam(true) +
    `<g transform="translate(32 33) scale(.94) translate(-32 -33)">${heruSword(p)}</g>` + glint(32, 6.6, 3.2);
}

// ======================= Glamdring =======================
const glamDefs = (p) => `${gold(p)}${silver(p)}${wood(p)}${blur(p, 1.2)}${blur(p, 2.2)}${blur(p, 4)}${gem(p, 'b', '#60a5fa')}
  ${bladeGrad(p, 'gb', '#ffffff', '#eef5ff', '#bccbe0', '#6a7c98')}
  ${lg(`${p}gg`, [[0, '#f0ead8'], [.5, '#bfb69a'], [1, '#6a6048']])}`;
/** Glamdring upright: a broad straight blade, a silver guard curving down to the blade, a pale grip. */
function glamSword(p, glow = '#dff0ff') {
  const b = straight(5, 40, 4.1);
  return bladeSvg(p, b, 'gb', { glow, fuller: [12.5, 38], fullerCol: '#4b6a96',
    extra: `<path d="M31.2 15h1.6M31.4 18.2l1.2 1-1.2 1M32.6 23l-1.2 1.2 1.2 1.2M31.2 28.6h1.6v1.6M31.4 33.4l1.2.8-1.2.8" fill="none" stroke="#2f5fae" stroke-width=".6"/>` }) +
    `<path d="M20 38.6c1.4 2.6 4 4 7 4.2h10c3-.2 5.6-1.6 7-4.2l1.8-.4c-.8 4-4.4 6.6-8.6 6.8H26.8c-4.2-.2-7.8-2.8-8.6-6.8z" fill="url(#${p}silver)" ${O}/>
     <path d="M20 38.6l-2-1.8M44 38.6l2-1.8" stroke="url(#${p}silver)" stroke-width="1.6" stroke-linecap="round"/>
     <path d="M29.6 41.4h4.8v3.6h-4.8z" fill="url(#${p}silver)" ${O}/><circle cx="32" cy="43.2" r="1.3" fill="url(#${p}gem-b)"/>
     ${grip(45, 54, 2.3, `url(#${p}gg)`, '#7a6a48')}
     <path d="M32 53.6l3.4 1.8.2 2.8-3.6 2-3.6-2 .2-2.8z" fill="url(#${p}silver)" ${O}/><circle cx="32" cy="56.6" r="1.2" fill="url(#${p}gem-b)"/>`;
}
const bolt = (d, p) => `<path d="${d}" fill="none" stroke="#7cc7ff" stroke-width="2.6" opacity=".6" filter="url(#${p}blur1.2)" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#f0f9ff" stroke-width=".8" stroke-linejoin="round"/>`;

function glamLightning(p) {
  return `<defs>${glamDefs(p)}</defs>
    <ellipse cx="32" cy="32" rx="24" ry="10" transform="rotate(-45 32 32)" fill="#9fd4ff" opacity=".3" filter="url(#${p}blur4)"/>
    <g transform="rotate(45 32 32)">${glamSword(p)}
      ${bolt('M32 3l-3.6 5.4 4.4 2.4-5.2 6.6 4.8 2.2-4.6 7', p)}${bolt('M33.6 18l4.2 3.8-3.2 3.4 4.8 4-3.6 3.2 2.6 3.6', p)}</g>` +
    bolt('M50 6l-3 4.4 3 .8-3.6 5', p) + glint(49, 14.5, 3.6) + glint(12, 46, 1.6, .7);
}

function glamStaff(p) {
  const staff = `<path d="M30.6 12c.8 14 .4 30 1.2 47.6h2.4C33.4 42 33.8 26 33.4 12z" fill="url(#${p}wood)" ${O}/>
    <path d="M31.4 14c.4 12 .4 28 1 44" stroke="#e7b07a" stroke-width=".45" opacity=".6"/>
    <path d="M31 26l-1.2-.8M33.2 38l1.4-.6M31.6 48l-1.2-.6" stroke="${INK}" stroke-width=".7"/>
    <path d="M30.4 12.6C28 10 27.6 6.6 29.6 4c.4 2.6 1.4 4 2.4 4.6 1-.6 2-2 2.4-4.6 2 2.6 1.6 6-.8 8.6z" fill="url(#${p}wood)" ${O}/>
    <circle cx="32" cy="7.6" r="5" fill="#e8f4ff" opacity=".8" filter="url(#${p}blur2.2)"/>
    <circle cx="32" cy="7.8" r="2.6" fill="url(#${p}gem-b)" stroke="${INK}" stroke-width=".6"/><circle cx="31.2" cy="7" r=".8" fill="#fff"/>`;
  return `<defs>${glamDefs(p)}</defs>
    <g transform="rotate(45 32 32)">${staff}</g>
    <g transform="rotate(-45 32 32)">${glamSword(p)}</g>` + glint(15, 15, 3.4) + glint(49.5, 14.8, 2.6, .9);
}

function glamLife(p) {
  // A helix of healing light round the blade, in front and behind.
  let back = '', front = '';
  for (let i = 0; i < 4; i++) {
    const y = 10 + i * 8.4;
    back += `M24.6 ${y + 4.2}C27 ${y + 1.6} 37 ${y + 1.6} 39.4 ${y}`;
    front += `M39.4 ${y}C42 ${y + 2} 30 ${y + 6} 24.6 ${y + 4.2 + 4.2}`;
  }
  const motes = [[16, 20, 1.2], [47, 26, 1], [14, 34, .9], [49, 12, .8], [44, 40, 1.1], [20, 10, .7], [19, 44, .8]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r * 2.4}" fill="#86efac" opacity=".35" filter="url(#${p}blur1.2)"/><circle cx="${x}" cy="${y}" r="${r}" fill="#ecfdf2"/>`).join('');
  return `<defs>${glamDefs(p)}${lg(`${p}lifeG`, [[0, '#d9f99d'], [1, '#22c55e']], 0, 1)}</defs>
    <ellipse cx="32" cy="24" rx="15" ry="22" fill="#4ade80" opacity=".22" filter="url(#${p}blur4)"/>
    <path d="${back}" fill="none" stroke="#166534" stroke-width="1.6" opacity=".7"/>
    ${glamSword(p, '#d1fae5')}
    <path d="${front}" fill="none" stroke="#4ade80" stroke-width="3" opacity=".55" filter="url(#${p}blur1.2)"/>
    <path d="${front}" fill="none" stroke="url(#${p}lifeG)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="${front}" fill="none" stroke="#f7fee7" stroke-width=".45" stroke-linecap="round"/>` + motes + glint(32, 6, 3.4);
}

export default [
  { id: 'anduril', name: 'Andúril', kind: 'combined', recipe: ['blade', 'blade'], variants: [
    { title: 'Flame of the West', bg: ['#8f2020', '#1d3d73'], draw: andurilTest },
    { title: 'Shards reforged', draw: andurilShards },
    { title: 'Sun, moon and seven stars', bg: ['#a23a1e', '#3a1430'], draw: (p) => andurilSun(p) },
  ] },
  { id: 'black-arrow', name: 'Black Arrow', kind: 'combined', recipe: ['blade', 'bow'], variants: [
    { title: 'The last arrow', draw: arrowLone },
    { title: 'Through the dragon’s scale', draw: arrowScale },
    { title: 'On Bard’s bow', draw: arrowBow },
  ] },
  { id: 'orcrist', name: 'Orcrist', kind: 'combined', recipe: ['blade', 'mail'], variants: [
    { title: 'Goblin-cleaver', draw: orcristDrawn },
    { title: 'Blade and scabbard', draw: orcristSheath },
    { title: 'Swift strikes', draw: orcristSwift },
  ] },
  { id: 'sting', name: 'Sting', kind: 'combined', recipe: ['blade', 'cloak'], variants: [
    { title: 'Glowing blue', draw: stingGlow },
    { title: 'In Shelob’s lair', draw: stingWeb },
    { title: 'Half drawn', draw: stingSheath },
  ] },
  { id: 'herugrim', name: 'Herugrim', kind: 'combined', recipe: ['blade', 'lembas'], variants: [
    { title: 'Horse-head hilt', draw: (p) => `<defs>${steelAlias(p)}</defs>` + heruDiag(p) },
    { title: 'Over the Rohirrim’s shield', draw: (p) => `<defs>${steelAlias(p)}</defs>` + heruShield(p) },
    { title: 'Under the gables of Meduseld', draw: (p) => `<defs>${steelAlias(p)}</defs>` + heruGable(p) },
  ] },
  { id: 'glamdring', name: 'Glamdring', kind: 'combined', recipe: ['blade', 'staff'], variants: [
    { title: 'Foe-hammer', draw: glamLightning },
    { title: 'Sword and staff', draw: glamStaff },
    { title: 'Life-light', draw: glamLife },
  ] },
];
