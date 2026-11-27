// Batch 3: Bow of the Galadhrim, Grond, Miruvor, King's Banner, Palantír and Oakenshield, three designs each.
import { INK, blur, gem, gold, silver, sparkle, steel, wood } from '../kit.mjs';

// ---------------------------------------------------------------- Local helpers

/** A mallorn leaf at (x, y), pointing along `ang` degrees (0 = up), `len` long. */
const leaf = (x, y, ang, len, fill, vein = true) =>
  `<g transform="translate(${x} ${y}) rotate(${ang})"><path d="M0 0Q${len * .42} ${-len * .45} 0 ${-len}Q${-len * .42} ${-len * .45} 0 0z" fill="${fill}" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>${vein ? `<path d="M0 -.6V${-len * .86}" stroke="${INK}" stroke-width=".45" opacity=".55"/>` : ''}</g>`;

/** An oak leaf at (x, y), pointing along `ang`, scaled by `s` (12 long at s = 1). */
const oakLeaf = (x, y, ang, s, fill) =>
  `<g transform="translate(${x} ${y}) rotate(${ang}) scale(${s})"><path d="M0 0C-2-1-3-3-1.8-4C-3.6-4.6-4-7-2-7.6C-3.4-9-2.4-11.4 0-12C2.4-11.4 3.4-9 2-7.6C4-7 3.6-4.6 1.8-4C3-3 2-1 0 0z" fill="${fill}" stroke="${INK}" stroke-width="${.7 / s}" stroke-linejoin="round"/><path d="M0-.4V-10.6M0-4.6l-1.6-1M0-4.6l1.6-1M0-8l-1.2-.8M0-8l1.2-.8" stroke="${INK}" stroke-width="${.4 / s}" opacity=".5" fill="none"/></g>`;

/** An acorn at (x, y), scaled by `s`. */
const acorn = (x, y, s) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-2.4 0c0 2.6 1 4.4 2.4 4.4S2.4 2.6 2.4 0z" fill="#c98a3c" stroke="${INK}" stroke-width=".5"/><path d="M-2.8.4C-2.8-1.4-1.6-2.4 0-2.4S2.8-1.4 2.8.4z" fill="#6b4524" stroke="${INK}" stroke-width=".5"/><path d="M0-2.4v-1.2" stroke="${INK}" stroke-width=".6"/><path d="M-1 1.4c0 1.2.4 2 1 2.4" stroke="#fff" stroke-width=".4" opacity=".6" fill="none"/></g>`;

/** An arrow along +x from the origin, `len` long. */
const arrow = (len, head, fletch, glow = '') =>
  `<path d="M4 -.75H${len - 5}v1.5H4z" fill="#d6b27a" stroke="${INK}" stroke-width=".5"/>` +
  `<path d="M4 -.3H${len - 5}" stroke="#fff3d6" stroke-width=".35" opacity=".8"/>` +
  glow +
  `<path d="M${len - 7} -2.6L${len} 0L${len - 7} 2.6L${len - 5.6} 0z" fill="${head}" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/>` +
  `<path d="M0 -3.2L6.5 -.7H9L3.4 -3.4zM0 3.2L6.5 .7H9L3.4 3.4z" fill="${fletch}" stroke="${INK}" stroke-width=".55" stroke-linejoin="round"/>`;

/** Embers: small glowing dots at fixed places. */
const embers = (pts, colour) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${colour}"/><circle cx="${x}" cy="${y}" r="${r * .45}" fill="#fff6c8"/>`).join('');

/** A White Tree in white, its trunk's foot at (x, y), `s` = scale (26 tall at 1). */
const whiteTree = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#f4f1e8" stroke-linecap="round">
  <path d="M0 0V-18" stroke-width="1.7"/>
  <path d="M0-8Q-5-11-8-17M0-8Q5-11 8-17M0-13Q-3-16-4.6-22M0-13Q3-16 4.6-22M0-18V-24M0 0l-3 1.8M0 0l3 1.8M-8-17l-2.4-1.4M8-17l2.4-1.4" stroke-width="1.1"/>
  <g fill="#fff" stroke="none"><circle cx="-8" cy="-17.4" r="1.3"/><circle cx="8" cy="-17.4" r="1.3"/><circle cx="-4.6" cy="-22.4" r="1.2"/><circle cx="4.6" cy="-22.4" r="1.2"/><circle cx="0" cy="-24.4" r="1.3"/><circle cx="-10.4" cy="-18.4" r=".9"/><circle cx="10.4" cy="-18.4" r=".9"/></g></g>`;

/** Five-pointed star at (x, y), radius r. */
const star5 = (x, y, r, fill) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * .45 : r;
    d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(2)} ${(y + Math.sin(a) * rr).toFixed(2)}`;
  }
  return `<path d="${d}z" fill="${fill}"/>`;
};

const fire = (p) => `<radialGradient id="${p}fire" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6c0"/><stop offset=".3" stop-color="#ffb53a"/><stop offset=".65" stop-color="#e2470f"/><stop offset="1" stop-color="#7a1206"/></radialGradient>`;
const iron = (p) => `<linearGradient id="${p}iron" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#9097a3"/><stop offset=".35" stop-color="#4a4e58"/><stop offset=".7" stop-color="#24262d"/><stop offset="1" stop-color="#0f1014"/></linearGradient>`;
const leafGold = (p, id = 'lf') => `<linearGradient id="${p}${id}" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fff1a0"/><stop offset=".4" stop-color="#e2c444"/><stop offset=".75" stop-color="#9aa52a"/><stop offset="1" stop-color="#4f6a18"/></linearGradient>`;
const paleWood = (p) => `<linearGradient id="${p}pw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff2c4"/><stop offset=".35" stop-color="#e2c07a"/><stop offset=".7" stop-color="#a87a32"/><stop offset="1" stop-color="#5e3e12"/></linearGradient>`;

// ---------------------------------------------------------------- Bow of the Galadhrim

function bowLongbow(p) {
  const defs = `<defs>${gold(p)}${wood(p)}${paleWood(p)}${leafGold(p)}${blur(p, 1.6)}${blur(p, 5)}</defs>`;
  const limb = 'M21 5.5Q24 6 26.5 9C34 16 39.5 24 39.5 32C39.5 40 34 48 26.5 55Q24 58 21 58.5L22 56.6Q24.4 55.6 25.4 53.6C31.6 47 35.6 40 35.6 32C35.6 24 31.6 17 25.4 10.4Q24.4 8.4 22 7.4z';
  const glow = `<ellipse cx="${56 - 3}" cy="0" rx="6" ry="3.4" fill="#eaffb0" opacity=".85" filter="url(#${p}blur1.6)"/>`;
  return defs + `<ellipse cx="32" cy="32" rx="22" ry="12" transform="rotate(-35 32 32)" fill="#ffe98a" opacity=".3" filter="url(#${p}blur5)"/>
    <g transform="translate(33 32) rotate(-38) scale(1.02) translate(-31 -32)">
      <path d="M21.6 6.6L21.6 57.4" stroke="#f6eccb" stroke-width=".7"/>
      <path d="${limb}" fill="url(#${p}pw)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M23.8 8.8C31 15.6 37.6 23.6 37.6 32C37.6 40.4 31 48.4 23.8 55.2" fill="none" stroke="url(#${p}gold)" stroke-width="1" stroke-dasharray="3.2 1.4"/>
      <path d="M22.6 6.6C30 12.6 38.6 21.4 38.6 30" fill="none" stroke="#fff" stroke-width=".5" opacity=".75"/>
      <circle cx="21.6" cy="6.4" r="1.4" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".6"/>
      <circle cx="21.6" cy="57.6" r="1.4" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".6"/>
      <g transform="translate(14 32)">${arrow(42, '#e9f7c8', '#e8f0d8', glow)}</g>
      <rect x="34.6" y="27" width="5.8" height="10" rx="1.4" fill="url(#${p}leather)" stroke="${INK}" stroke-width=".8"/>
      <path d="M34.8 29l5.6-1.2M34.8 31.4l5.6-1.2M34.8 33.8l5.6-1.2M34.8 36.2l5.6-1.2" stroke="#c48d5a" stroke-width=".5" opacity=".8"/>
      ${leaf(40, 28.5, 62, 9, `url(#${p}lf)`)}${leaf(40, 35.5, 118, 9, `url(#${p}lf)`)}${leaf(40.4, 32, 90, 7, `url(#${p}lf)`)}
    </g>
    ${sparkle(50, 15.6, 4)}${sparkle(14, 20, 1.6, .75)}${sparkle(44, 48, 1.4, .7)}`;
}

function bowTwinArrows(p) {
  const defs = `<defs>${leafGold(p, 'lf2')}${blur(p, 1.4)}${blur(p, 4)}</defs>`;
  const big = 46;
  const veins = [10, 17, 24, 31].map((d) => `M0 ${-d}l-${7 - d * .12} -6M0 ${-d}l${7 - d * .12} -6`).join('');
  const glow = (len) => `<ellipse cx="${len - 3}" cy="0" rx="6" ry="3.2" fill="#d9ffb0" opacity=".9" filter="url(#${p}blur1.4)"/>`;
  const streaks = `<path d="M-10 -1.4H-2M-14 0H-1M-9 1.4H-3" stroke="#f4ffd6" stroke-width=".8" stroke-linecap="round" opacity=".7"/>`;
  return defs + `<circle cx="32" cy="32" r="22" fill="#e6f07a" opacity=".28" filter="url(#${p}blur4)"/>
    <g transform="translate(47 53) rotate(-40)">
      <path d="M0 0Q${big * .42} ${-big * .45} 0 ${-big}Q${-big * .42} ${-big * .45} 0 0z" fill="url(#${p}lf2)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M0 -1V${-big * .9}" stroke="#6b5a12" stroke-width=".9"/>
      <path d="${veins}" stroke="#7a6a16" stroke-width=".6" fill="none" opacity=".8"/>
      <path d="M-3 -6Q-14 -20 -4 -40" fill="none" stroke="#fffbe0" stroke-width=".9" opacity=".7"/>
      <path d="M0 0l-1.2 5" stroke="#5a4a10" stroke-width="1.6" stroke-linecap="round"/>
    </g>
    <g transform="translate(11 41) rotate(-42)">${streaks}${arrow(40, '#f0ffd8', '#ffffff', glow(40))}</g>
    <g transform="translate(19 50) rotate(-42)">${streaks}${arrow(40, '#f0ffd8', '#ffffff', glow(40))}</g>
    ${sparkle(46.5, 13.4, 3.6)}${sparkle(53, 22, 2.4, .9)}${sparkle(15, 14, 1.5, .7)}`;
}

function bowQuiver(p) {
  const defs = `<defs>${gold(p)}${wood(p)}${paleWood(p)}${leafGold(p)}${gem(p, 'g', '#3fbf5a')}${blur(p, 4)}
    <linearGradient id="${p}qv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4f7a3a"/><stop offset=".35" stop-color="#2f5a26"/><stop offset="1" stop-color="#0f2410"/></linearGradient></defs>`;
  const shafts = [27.4, 30.6, 33.8, 37].map((x, i) => {
    const top = 8 + (i % 2) * 2.6;
    return `<path d="M${x} 21V${top + 5}" stroke="#d6b27a" stroke-width="1.2"/><path d="M${x - .1} 21V${top + 5}" stroke="${INK}" stroke-width=".3" opacity=".4"/>` +
      `<path d="M${x} ${top}L${x - 2.2} ${top + 2}V${top + 7}L${x} ${top + 5.6}L${x + 2.2} ${top + 7}V${top + 2}z" fill="${i % 2 ? '#f4f4e6' : '#9ccf6a'}" stroke="${INK}" stroke-width=".55" stroke-linejoin="round"/>` +
      `<path d="M${x} ${top + .6}V${top + 5}" stroke="${INK}" stroke-width=".35" opacity=".5"/>`;
  }).join('');
  return defs + `<circle cx="32" cy="34" r="22" fill="#f0e48a" opacity=".22" filter="url(#${p}blur4)"/>
    <path d="M10 12Q5 46 52 55" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M10 12Q5 46 52 55" fill="none" stroke="url(#${p}pw)" stroke-width="3" stroke-linecap="round"/>
    <path d="M9.4 14Q5.8 42 46 53" fill="none" stroke="url(#${p}gold)" stroke-width=".8" stroke-dasharray="3 1.5"/>
    <path d="M10 12L52 55" stroke="#f6eccb" stroke-width=".6" opacity=".9"/>
    <g transform="rotate(24 32 34)">
      ${shafts}
      <path d="M25 20.6h14l-1.4 35.4h-11.2z" fill="url(#${p}qv)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M26.6 23V54" stroke="#9fd08a" stroke-width=".6" opacity=".6"/>
      <ellipse cx="32" cy="21" rx="7.4" ry="2" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8"/>
      <rect x="25.8" y="49.6" width="12.4" height="2.4" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".6"/>
      <path d="M26.4 28.2h11.4" stroke="url(#${p}gold)" stroke-width="1.2"/>
      <path d="M27 31.4c3 1 7 1 10 0M27 46c3 1 7 1 10 0" fill="none" stroke="#c9e6a0" stroke-width=".45" opacity=".6"/>
      <circle cx="32" cy="38.6" r="4.6" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8"/>
      ${leaf(32, 42, 0, 7.4, `url(#${p}lf)`)}
      <circle cx="32" cy="38.2" r="1.2" fill="url(#${p}gem-g)" stroke="${INK}" stroke-width=".4"/>
    </g>
    <path d="M13 20Q22 30 20 44" fill="none" stroke="url(#${p}leather)" stroke-width="2.2" opacity="0"/>
    ${sparkle(48.6, 14.6, 3.4)}${sparkle(14, 44, 1.6, .75)}`;
}

// ---------------------------------------------------------------- Grond

function grondRam(p) {
  const defs = `<defs>${iron(p)}${fire(p)}${blur(p, 1.2)}${blur(p, 5)}
    <linearGradient id="${p}beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5030"/><stop offset=".45" stop-color="#3f2614"/><stop offset="1" stop-color="#150a04"/></linearGradient></defs>`;
  const head = 'M5.5 30.5L8 27.5L16 24.5L21 19.5L23.5 11L27 18L28.5 15.2L30.6 20L32 16.8L33.4 21.2L35 22V34L22 32.6L9.5 33.2L6 32.6z';
  const jaw = 'M9 37.5L22 35.4L35 36V42.5L26 42.8L18 40z';
  const mouth = 'M6.6 32.8L22 32.6L35 34V36L22 35.4L8.6 37.6z';
  const fangs = 'M10.4 33.1l.9 2.3.9-2.3zM14.4 32.9l.8 2 .8-2zM18.6 32.7l.7 1.8.7-1.8zM11.8 37.2l.8-2 .9 1.8zM16 36.4l.7-1.7.8 1.6z';
  return defs + `<ellipse cx="30" cy="40" rx="24" ry="14" fill="#ff6a1a" opacity=".45" filter="url(#${p}blur5)"/>
    <g transform="rotate(25 32 32)">
      <rect x="32" y="24.4" width="34" height="16.4" fill="url(#${p}beam)" stroke="${INK}" stroke-width=".9"/>
      <path d="M36 28.6c6 .6 14-.4 26 .4M36 35c8 .5 16-.3 26 .3" stroke="#1a0c04" stroke-width=".6" fill="none" opacity=".8"/>
      ${[40, 52].map((x) => `<rect x="${x}" y="22.8" width="3.6" height="19.6" rx=".6" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".8"/><circle cx="${x + 1.8}" cy="26" r=".7" fill="#c8ccd4"/><circle cx="${x + 1.8}" cy="39" r=".7" fill="#c8ccd4"/>`).join('')}
      <path d="${mouth}" fill="url(#${p}fire)"/>
      <path d="${head}" fill="url(#${p}iron)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
      <path d="${jaw}" fill="url(#${p}iron)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
      <path d="${fangs}" fill="#efe6d2" stroke="${INK}" stroke-width=".35"/>
      <path d="M8 27.6L16 24.6L21 19.6" fill="none" stroke="#c9ced8" stroke-width=".6" opacity=".8"/>
      <path d="M10 37.6L18 40.2L26 42.9" fill="none" stroke="#ff8a2a" stroke-width=".8" opacity=".85"/>
      <path d="M23.5 13.5L25.6 18.4L22 20.6z" fill="#5a1a0e" opacity=".8"/>
      <ellipse cx="17.6" cy="26.4" rx="2.4" ry="1.1" transform="rotate(-18 17.6 26.4)" fill="#ff7a1a" filter="url(#${p}blur1.2)"/>
      <ellipse cx="17.6" cy="26.4" rx="1.8" ry=".7" transform="rotate(-18 17.6 26.4)" fill="#fff0a0"/>
      <path d="M27.6 25l1.8 2.6-1.8 2.6M30.8 24.6v6.6M29.6 27.8h2.4M33.4 25l-1.4 2.6 1.4 2.6" stroke="#ff9a3a" stroke-width=".7" fill="none" stroke-linecap="round"/>
      <path d="M27.6 25l1.8 2.6-1.8 2.6M30.8 24.6v6.6M33.4 25l-1.4 2.6 1.4 2.6" stroke="#ff5a0a" stroke-width="2" fill="none" opacity=".5" filter="url(#${p}blur1.2)"/>
    </g>
    ${embers([[12, 50, .9], [20, 56, .7], [46, 12, .8], [52, 20, .6], [8, 40, .6], [38, 56, .7]], '#ff8a2a')}
    ${sparkle(30, 10.5, 2.4, .85)}`;
}

const WOLF_FRONT = 'M32 18L22 13L15 7.5L16.5 22L10 30L14 36L20 40L25 50L32 54L39 50L44 40L50 36L54 30L47.5 22L49 7.5L42 13z';

function grondMask(p) {
  const defs = `<defs>${iron(p)}${fire(p)}${gold(p)}${blur(p, 1.2)}${blur(p, 5)}
    <linearGradient id="${p}fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffde7a"/><stop offset=".4" stop-color="#ff7a1a"/><stop offset="1" stop-color="#b3200a" stop-opacity="0"/></linearGradient></defs>`;
  const eye = (flip) => `<g transform="${flip ? 'translate(64 0) scale(-1 1)' : ''}"><path d="M21 27.4L28.6 30.4L23 31.8z" fill="#ff7a1a" filter="url(#${p}blur1.2)"/><path d="M21.6 27.9L28 30.4L23.2 31.2z" fill="#fff0a0"/><path d="M17 12L18.4 20.6L22.4 15.8z" fill="#5a1a0e" stroke="${INK}" stroke-width=".5"/></g>`;
  return defs + `<ellipse cx="32" cy="50" rx="26" ry="14" fill="#ff5a14" opacity=".55" filter="url(#${p}blur5)"/>
    <path d="M6 60C8 52 11 50 12 44C14 50 17 49 18 42C21 48 24 46 26 38C28 46 31 45 32 36C33 45 36 46 38 38C40 46 43 48 46 42C47 49 50 50 52 44C53 50 56 52 58 60z" fill="url(#${p}fl)" opacity=".9"/>
    <path d="${WOLF_FRONT}" fill="url(#${p}iron)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M24 44L32 47.6L40 44L38 51.6L32 54.2L26 51.6z" fill="url(#${p}fire)" stroke="${INK}" stroke-width=".7"/>
    <path d="M26.2 45l1.2 3.6 1.2-2.6zM37.8 45l-1.2 3.6-1.2-2.6zM27.6 52l1.2-2.6 1 2.6zM36.4 52l-1.2-2.6-1 2.6z" fill="#efe6d2" stroke="${INK}" stroke-width=".35"/>
    <path d="M27.2 33.4L32 31.6L36.8 33.4L35.6 42L32 44.4L28.4 42z" fill="#3a3d46" stroke="${INK}" stroke-width=".7"/>
    <path d="M29.4 41.4Q32 39.6 34.6 41.4L32 43.6z" fill="#0b0b0e"/>
    <path d="M28.6 34L32 32.6" stroke="#c9ced8" stroke-width=".5" opacity=".8"/>
    <path d="M19 25.6L29 30L32 28.2L35 30L45 25.6" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M15.6 8.8L17 21.6M22.4 13.4L31.6 18" stroke="#c9ced8" stroke-width=".6" opacity=".7" fill="none"/>
    ${eye(false)}${eye(true)}
    <path d="M10.4 30.4L14.2 35.6L20 39.6L25 49.6" fill="none" stroke="#ff8a2a" stroke-width=".8" opacity=".8"/>
    <path d="M53.6 30.4L49.8 35.6L44 39.6L39 49.6" fill="none" stroke="#ff8a2a" stroke-width=".8" opacity=".8"/>
    <circle cx="32" cy="22.4" r="1.6" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".5"/>
    <path d="M29.6 25.4l2.4-1.4 2.4 1.4" stroke="#ff9a3a" stroke-width=".7" fill="none"/>
    ${embers([[10, 20, .8], [55, 16, .7], [8, 46, .6], [56, 42, .7], [16, 56, .6], [48, 56, .6]], '#ff8a2a')}`;
}

function grondHammer(p) {
  const defs = `<defs>${iron(p)}${fire(p)}${wood(p)}${blur(p, 1.2)}${blur(p, 5)}
    <linearGradient id="${p}hot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#ff6a12"/><stop offset="1" stop-color="#7a1206" stop-opacity="0"/></linearGradient></defs>`;
  return defs + `<ellipse cx="38" cy="26" rx="22" ry="14" transform="rotate(-45 38 26)" fill="#ff5a14" opacity=".45" filter="url(#${p}blur5)"/>
    <g transform="rotate(45 32 32)">
      <rect x="29.8" y="24" width="4.4" height="34" rx="1" fill="url(#${p}leather)" stroke="${INK}" stroke-width=".9"/>
      <path d="M30 34l4.2-1.4M30 37l4.2-1.4M30 40l4.2-1.4M30 43l4.2-1.4M30 46l4.2-1.4M30 49l4.2-1.4" stroke="#a87650" stroke-width=".55" opacity=".8"/>
      <rect x="29" y="28" width="6" height="3" rx=".6" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".7"/>
      <rect x="29" y="51" width="6" height="3" rx=".6" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".7"/>
      <path d="M29.4 58h5.2L32 63.4z" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M28 12L32 3L36 12z" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M14 9.4L18.4 12H45.6L50 9.4V26.6L45.6 24H18.4L14 26.6z" fill="url(#${p}iron)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M14.4 10.6V25.4" stroke="#ff8a2a" stroke-width="1.6"/>
      <path d="M49.6 10.6V25.4" stroke="#ff8a2a" stroke-width="1.6"/>
      <path d="M14.4 10.6V25.4M49.6 10.6V25.4" stroke="#ffcf6a" stroke-width="3" opacity=".6" filter="url(#${p}blur1.2)"/>
      <path d="M18.6 13H45.4" stroke="#c9ced8" stroke-width=".6" opacity=".7"/>
      <path d="M20.6 14.6v8M43.4 14.6v8" stroke="${INK}" stroke-width=".6" opacity=".7"/>
      <g transform="translate(32 18.4) scale(.27) translate(-32 -31)">
        <path d="${WOLF_FRONT}" fill="#2a0c06" stroke="#ff7a1a" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M21 27.4L28.6 30.4L23 31.8zM43 27.4L35.4 30.4L41 31.8z" fill="#ffe07a"/>
        <path d="M24 44L32 47.6L40 44L38 51.6L32 54.2L26 51.6z" fill="#ff8a2a"/>
      </g>
      <path d="M24.6 15.4l-1.4 2.6 1.4 2.6M39.4 15.4l1.4 2.6-1.4 2.6" stroke="#ff9a3a" stroke-width=".7" fill="none"/>
      <path d="M32 35v3M30.8 41l2.4 1.6M32 45.4v3" stroke="#ff9a3a" stroke-width=".8" opacity=".9"/>
    </g>
    ${embers([[50, 46, .9], [56, 36, .7], [44, 54, .6], [12, 14, .7], [20, 8, .6], [8, 24, .6]], '#ff8a2a')}
    ${sparkle(47, 16, 3)}`;
}

// ---------------------------------------------------------------- Miruvor

function miruvorFlask(p) {
  const defs = `<defs>${silver(p)}${gold(p)}${wood(p)}${leafGold(p)}${blur(p, 1.4)}${blur(p, 4)}
    <radialGradient id="${p}lth" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#b67a46"/><stop offset=".5" stop-color="#6e3f1e"/><stop offset="1" stop-color="#2a1408"/></radialGradient>
    <radialGradient id="${p}med" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c3ccd8"/><stop offset="1" stop-color="#5d6878"/></radialGradient></defs>`;
  return defs + `<circle cx="32" cy="30" r="20" fill="#ffd36a" opacity=".3" filter="url(#${p}blur4)"/>
    <path d="M18 30C14 22 12 14 15 7M46 30C50 22 52 14 49 7" fill="none" stroke="${INK}" stroke-width="3"/>
    <path d="M18 30C14 22 12 14 15 7M46 30C50 22 52 14 49 7" fill="none" stroke="url(#${p}leather)" stroke-width="1.8"/>
    <circle cx="32" cy="38" r="17.4" fill="url(#${p}lth)" stroke="${INK}" stroke-width="1"/>
    <circle cx="32" cy="38" r="15.4" fill="none" stroke="#e3b48a" stroke-width=".6" stroke-dasharray="1.6 1.2" opacity=".85"/>
    <path d="M17.6 33C19 27 24 22.6 30 21.6" fill="none" stroke="#e9b98a" stroke-width="1" opacity=".6" stroke-linecap="round"/>
    <circle cx="32" cy="39" r="7.4" fill="url(#${p}med)" stroke="${INK}" stroke-width=".8"/>
    <circle cx="32" cy="39" r="6" fill="none" stroke="#5b6577" stroke-width=".5"/>
    ${leaf(32, 43.4, 0, 8.6, `url(#${p}lf)`)}
    <rect x="28" y="16" width="8" height="5.6" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".8"/>
    <path d="M28 18.2h8" stroke="#4b5363" stroke-width=".5"/>
    <rect x="26.6" y="11" width="10.8" height="5" rx="1.2" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".8"/>
    <path d="M27.6 12.4h8.8" stroke="#fff" stroke-width=".5" opacity=".9"/>
    <path d="M33.8 21.6c.6 2 .4 3.4-.4 4.4" fill="none" stroke="#ffcf3a" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="33.4" cy="26.8" r="1.1" fill="#ffd84a" stroke="${INK}" stroke-width=".35"/>
    <path d="M29 9.6C27.6 7.6 29.6 6 28.4 3.8M35 9.6C36.4 7.4 34.4 5.8 35.8 3.6" fill="none" stroke="#ffe9a0" stroke-width="1" stroke-linecap="round" opacity=".75"/>
    <path d="M29 9.6C27.6 7.6 29.6 6 28.4 3.8M35 9.6C36.4 7.4 34.4 5.8 35.8 3.6" fill="none" stroke="#ffcf5a" stroke-width="2.4" opacity=".4" filter="url(#${p}blur1.4)"/>
    ${sparkle(44, 25, 3.2)}${sparkle(20, 50, 1.6, .7)}${sparkle(48, 50, 1.3, .6)}`;
}

function miruvorVial(p) {
  const body = 'M29 17h6v6c6 2 9 8 9 15v9c0 6-5 9-12 9s-12-3-12-9v-9c0-7 3-13 9-15z';
  const defs = `<defs>${gold(p)}${silver(p)}${gem(p, 'v', '#a855f7')}${blur(p, 1.4)}${blur(p, 4)}
    <clipPath id="${p}in"><path d="${body}"/></clipPath>
    <radialGradient id="${p}liq" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffd859"/><stop offset=".75" stop-color="#e48a14"/><stop offset="1" stop-color="#8a3a06"/></radialGradient>
    <linearGradient id="${p}gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".3" stop-color="#e6f2ff" stop-opacity=".2"/><stop offset=".75" stop-color="#9ab8de" stop-opacity=".25"/><stop offset="1" stop-color="#40608a" stop-opacity=".6"/></linearGradient></defs>`;
  return defs + `<ellipse cx="32" cy="42" rx="20" ry="18" fill="#ffc84a" opacity=".45" filter="url(#${p}blur4)"/>
    <g clip-path="url(#${p}in)">
      <rect x="18" y="16" width="28" height="42" fill="url(#${p}gl)"/>
      <path d="M18 35Q25 33 32 35T46 35V58H18z" fill="url(#${p}liq)"/>
      <path d="M18 35Q25 33 32 35T46 35" fill="none" stroke="#fff6c8" stroke-width=".8"/>
      <circle cx="28" cy="46" r=".9" fill="#fff" opacity=".8"/><circle cx="35" cy="41" r=".7" fill="#fff" opacity=".8"/><circle cx="31" cy="51" r=".6" fill="#fff" opacity=".7"/>
      <path d="M26 24V56M38 24V56" stroke="#fff" stroke-width=".5" opacity=".3"/>
    </g>
    <path d="${body}" fill="none" stroke="${INK}" stroke-width="1"/>
    <path d="M22.4 38c.2-5 2.4-9.6 6.2-11.8" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>
    <path d="M23 46v4" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".7"/>
    <rect x="27.8" y="20.6" width="8.4" height="2.4" rx=".8" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7"/>
    <path d="M29.6 17V12.6Q32 6.4 34.4 12.6V17z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <circle cx="32" cy="12.6" r="1.6" fill="url(#${p}gem-v)" stroke="${INK}" stroke-width=".5"/>
    ${leaf(28, 22, -70, 9, '#cfd8e2')}${leaf(36, 22, 70, 9, '#cfd8e2')}
    <path d="M28 21.8q-3 3-2.4 7M36 21.8q3 3 2.4 7" stroke="#a855f7" stroke-width="1" fill="none" stroke-linecap="round"/>
    ${sparkle(32, 44, 4.6)}${sparkle(45, 18, 2.4, .85)}${sparkle(18, 28, 1.6, .7)}${sparkle(50, 40, 1.3, .6)}`;
}

function miruvorGoblet(p) {
  const defs = `<defs>${gold(p)}${silver(p)}${gem(p, 'v', '#a855f7')}${blur(p, 1.4)}${blur(p, 4)}
    <radialGradient id="${p}liq" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd859"/><stop offset="1" stop-color="#d77a10"/></radialGradient>
    <linearGradient id="${p}cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a95a6"/><stop offset=".22" stop-color="#ffffff"/><stop offset=".5" stop-color="#c3ccd8"/><stop offset=".85" stop-color="#58637a"/><stop offset="1" stop-color="#8a95a6"/></linearGradient></defs>`;
  const vine = 'M22.6 26c3 2 5-1 8 1s5 1 8-1c2-1.4 3.4-.6 3.4-.6';
  return defs + `<ellipse cx="32" cy="16" rx="16" ry="14" fill="#ffd36a" opacity=".55" filter="url(#${p}blur4)"/>
    <path d="M26 13C24 10 27 8 25 4.6M32 12.4C30.4 9.4 33.6 7.6 31.6 3.6M38 13C40 10 37 8 39 4.6" fill="none" stroke="#fff0b0" stroke-width="1.1" stroke-linecap="round" opacity=".85"/>
    <path d="M26 13C24 10 27 8 25 4.6M32 12.4C30.4 9.4 33.6 7.6 31.6 3.6M38 13C40 10 37 8 39 4.6" fill="none" stroke="#ffc84a" stroke-width="2.6" opacity=".45" filter="url(#${p}blur1.4)"/>
    <path d="M19.4 18H44.6C44.6 30 39 37 32 37S19.4 30 19.4 18z" fill="url(#${p}cup)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <ellipse cx="32" cy="18" rx="12.6" ry="3" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".9"/>
    <ellipse cx="32" cy="18.2" rx="10.8" ry="2.1" fill="url(#${p}liq)"/>
    <ellipse cx="30" cy="17.8" rx="4" ry=".7" fill="#fff" opacity=".8"/>
    <path d="${vine}" fill="none" stroke="url(#${p}gold)" stroke-width="1"/>
    ${leaf(26, 26.6, -40, 3.4, `url(#${p}gold)`, false)}${leaf(34, 27.6, 30, 3.4, `url(#${p}gold)`, false)}${leaf(39, 25, -30, 3.2, `url(#${p}gold)`, false)}
    <circle cx="32" cy="31.4" r="2" fill="url(#${p}gem-v)" stroke="${INK}" stroke-width=".6"/>
    <path d="M22.6 21.6c.6 5 2.8 9 6 11" fill="none" stroke="#fff" stroke-width="1" opacity=".8" stroke-linecap="round"/>
    <path d="M30.4 36.6h3.2V48h-3.2z" fill="url(#${p}cup)" stroke="${INK}" stroke-width=".8"/>
    <ellipse cx="32" cy="41.6" rx="3.4" ry="1.8" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7"/>
    <path d="M21 54.6C21 50.4 26 48 32 48S43 50.4 43 54.6z" fill="url(#${p}cup)" stroke="${INK}" stroke-width=".9"/>
    <ellipse cx="32" cy="54.6" rx="11" ry="2.4" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8"/>
    <path d="M41 23c0 1.4-1 2-1 3.2" stroke="#ffd859" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    ${sparkle(46.6, 12, 3)}${sparkle(16.4, 20, 2, .8)}${sparkle(48, 40, 1.4, .6)}`;
}

// ---------------------------------------------------------------- King's Banner

function bannerStandard(p) {
  const cloth = 'M15 12.4H49V48L41.4 43L32 51.6L22.6 43L15 48z';
  const defs = `<defs>${gold(p)}${wood(p)}${blur(p, 1.4)}${blur(p, 4)}
    <linearGradient id="${p}cl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0c0c12"/><stop offset=".22" stop-color="#2c2c38"/><stop offset=".45" stop-color="#101018"/><stop offset=".72" stop-color="#2a2a34"/><stop offset="1" stop-color="#08080c"/></linearGradient>
    <clipPath id="${p}c"><path d="${cloth}"/></clipPath></defs>`;
  const stars = [[21.6, 22], [23.6, 18.4], [27.4, 16], [32, 15.2], [36.6, 16], [40.4, 18.4], [42.4, 22]].map(([x, y]) => sparkle(x, y, 1.5)).join('');
  return defs + `<ellipse cx="32" cy="30" rx="22" ry="24" fill="#fff2c0" opacity=".2" filter="url(#${p}blur4)"/>
    <rect x="30.9" y="6" width="2.2" height="56" fill="url(#${p}wood)" stroke="${INK}" stroke-width=".7"/>
    <path d="M32 2.4L34.4 7.4L32 9.6L29.6 7.4z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
    <path d="${cloth}" fill="url(#${p}cl)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <g clip-path="url(#${p}c)">
      <path d="M16.4 13.6H47.6V46.4L41.4 41.6L32 49.6L22.6 41.6L16.4 46.4z" fill="none" stroke="url(#${p}gold)" stroke-width="1"/>
      ${stars}
      <path d="M28.6 26.4L29 23.2L30.8 24.8L32 22.4L33.2 24.8L35 23.2L35.4 26.4z" fill="#f4f1e8"/>
      ${whiteTree(32, 44, .78)}
      <ellipse cx="32" cy="34" rx="8" ry="10" fill="#fff" opacity=".08" filter="url(#${p}blur1.4)"/>
    </g>
    <rect x="13" y="10.2" width="38" height="2.6" rx="1.2" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8"/>
    <circle cx="13" cy="11.5" r="1.9" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7"/>
    <circle cx="51" cy="11.5" r="1.9" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7"/>
    <path d="M12 13.4V24M52 13.4V24" stroke="url(#${p}gold)" stroke-width=".8"/>
    <path d="M10.8 24h2.4l-.4 4h-1.6zM50.8 24h2.4l-.4 4h-1.6z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".5"/>
    <path d="M22.6 43L15 48M41.4 43L49 48" stroke="url(#${p}gold)" stroke-width=".6"/>
    ${sparkle(46, 6.6, 2.6, .9)}`;
}

function bannerWind(p) {
  const cloth = 'M21 9C29 5 37 13 46 8.6C50 6.6 54 7.4 57 8.6L51.6 18L57.4 28C52 25.6 46 30 38 28.4C31 27 26 31 20.6 30z';
  const defs = `<defs>${gold(p)}${wood(p)}${blur(p, 4)}
    <linearGradient id="${p}cl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2e2e3a"/><stop offset=".2" stop-color="#0d0d14"/><stop offset=".42" stop-color="#34343f"/><stop offset=".66" stop-color="#0b0b10"/><stop offset=".86" stop-color="#2a2a34"/><stop offset="1" stop-color="#101016"/></linearGradient>
    <clipPath id="${p}c"><path d="${cloth}"/></clipPath></defs>`;
  return defs + `<circle cx="36" cy="22" r="20" fill="#fff2c0" opacity=".2" filter="url(#${p}blur4)"/>
    <g transform="translate(31 37) scale(1.08) translate(-35 -28)">
    <path d="M6 36H18M4 44H16M10 40H22" stroke="#f4ecd4" stroke-width=".8" stroke-linecap="round" opacity=".45"/>
    <g transform="rotate(-8 20 34)">
      <rect x="19" y="7" width="3" height="56" rx="1" fill="url(#${p}wood)" stroke="${INK}" stroke-width=".8"/>
      <path d="M20.5 1.4L23.4 6.6L20.5 8.8L17.6 6.6z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
      <rect x="18.2" y="8.4" width="4.6" height="2" rx=".6" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".6"/>
      <rect x="18.6" y="32" width="3.8" height="1.6" rx=".5" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".5"/>
    </g>
    <path d="${cloth}" fill="url(#${p}cl)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <g clip-path="url(#${p}c)">
      <path d="M21 10.4C29 6.4 37 14.4 46 10C50 8 53.6 8.8 55.6 9.6M20.8 28.6C26 29.6 31 25.6 38 27C46 28.6 52 24.4 56 26.6" fill="none" stroke="url(#${p}gold)" stroke-width="1.1"/>
      ${whiteTree(37, 26, .62)}
      ${sparkle(30, 14, 1.2)}${sparkle(44, 14, 1.2)}${sparkle(37, 10.6, 1.3)}
    </g>
    <path d="M46 8.6C44 14 45 22 38 28.4" fill="none" stroke="#000" stroke-width="1" opacity=".35"/>
    <path d="M24 40l2.6 4M26.6 44l-1 6M24 40l-2 8" stroke="url(#${p}gold)" stroke-width=".8" fill="none"/>
    <circle cx="24" cy="40" r="1.4" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".5"/>
    </g>
    ${sparkle(50, 50, 2.6, .85)}${sparkle(12, 18, 1.6, .7)}`;
}

function bannerCrossed(p) {
  const defs = `<defs>${gold(p)}${wood(p)}${gem(p, 'r', '#dc2626')}${blur(p, 4)}
    <linearGradient id="${p}blk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2a34"/><stop offset=".5" stop-color="#0d0d14"/><stop offset="1" stop-color="#22222c"/></linearGradient>
    <linearGradient id="${p}grn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f8a3e"/><stop offset=".5" stop-color="#14532d"/><stop offset="1" stop-color="#226b33"/></linearGradient></defs>`;
  const flag = (fill, emblem) => `
    <rect x="-1.1" y="-24" width="2.2" height="54" fill="url(#${p}wood)" stroke="${INK}" stroke-width=".7"/>
    <path d="M0 -29L2.2 -24.6L0 -22.6L-2.2 -24.6z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/>
    <path d="M-9 -20H9V5L4.4 1.6L0 6.4L-4.4 1.6L-9 5z" fill="${fill}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M-8 -19H8V3.2L4.4 .4L0 4.8L-4.4 .4L-8 3.2z" fill="none" stroke="url(#${p}gold)" stroke-width=".7"/>
    ${emblem}
    <rect x="-10.4" y="-21.6" width="20.8" height="2" rx=".9" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".6"/>`;
  return defs + `<circle cx="32" cy="24" r="22" fill="#fff0b0" opacity=".22" filter="url(#${p}blur4)"/>
    <g transform="translate(21 34) rotate(-18)">${flag(`url(#${p}grn)`, `${star5(0, -9, 5.4, '#ffd96a')}${star5(0, -9, 2.4, '#fff6d0')}`)}</g>
    <g transform="translate(43 34) rotate(18)">${flag(`url(#${p}blk)`, whiteTree(0, 1, .52))}</g>
    <g transform="translate(32 12)">
      <path d="M-14 1C-10-4-6-5-4.4-2-7.4-2.6-10-1-14 1zM14 1C10-4 6-5 4.4-2 7.4-2.6 10-1 14 1z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
      <path d="M-5.4 4L-6-4.2L-2.8-1.4L0-7L2.8-1.4L6-4.2L5.4 4z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
      <rect x="-5.8" y="3.2" width="11.6" height="2.4" rx=".6" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7"/>
      <circle cx="0" cy="-7.4" r="1.1" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".5"/>
      <circle cx="0" cy="1.2" r="1.6" fill="url(#${p}gem-r)" stroke="${INK}" stroke-width=".5"/>
      <path d="M-4.6 3.2L-5-2.4" stroke="#fff6d0" stroke-width=".5" opacity=".8"/>
    </g>
    ${sparkle(45, 7, 2.4, .9)}${sparkle(14, 52, 1.4, .6)}`;
}

// ---------------------------------------------------------------- Palantír

function palantirEye(p) {
  const defs = `<defs>${iron(p)}${blur(p, 1.4)}${blur(p, 4)}
    <radialGradient id="${p}orb" cx=".42" cy=".38" r=".66"><stop offset="0" stop-color="#3a2230"/><stop offset=".6" stop-color="#140c16"/><stop offset="1" stop-color="#050307"/></radialGradient>
    <radialGradient id="${p}eye" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3c0"/><stop offset=".3" stop-color="#ffae2a"/><stop offset=".7" stop-color="#d0300a"/><stop offset="1" stop-color="#5a0a04" stop-opacity="0"/></radialGradient>
    <clipPath id="${p}c"><circle cx="32" cy="27.6" r="19"/></clipPath></defs>`;
  return defs + `<circle cx="32" cy="27.6" r="23" fill="#ff6a1a" opacity=".3" filter="url(#${p}blur4)"/>
    <path d="M18 58.6L46 58.6L42.6 50.6H21.4z" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M21 52H43" stroke="#c9ced8" stroke-width=".5" opacity=".6"/>
    <circle cx="32" cy="27.6" r="19" fill="url(#${p}orb)" stroke="${INK}" stroke-width="1.1"/>
    <g clip-path="url(#${p}c)">
      <ellipse cx="32" cy="28" rx="18" ry="11" fill="#ff5a14" opacity=".5" filter="url(#${p}blur4)"/>
      <path d="M17 28Q32 15 47 28Q32 41 17 28z" fill="url(#${p}eye)"/>
      <path d="M17 28Q32 15 47 28Q32 41 17 28z" fill="none" stroke="#ffcf6a" stroke-width=".8" opacity=".9"/>
      <path d="M32 19.6Q34.8 28 32 36.4Q29.2 28 32 19.6z" fill="#0a0303"/>
      <path d="M14 22Q22 16 30 20M34 36Q42 40 50 34" fill="none" stroke="#ff8a3a" stroke-width=".7" opacity=".55"/>
      <path d="M21 41.6A19 19 0 0 0 48 37" fill="none" stroke="#ff8a3a" stroke-width="1.4" opacity=".55"/>
    </g>
    <path d="M18.6 22.4C20.4 16.8 25 12.6 30.4 11.4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>
    <circle cx="22.6" cy="16.6" r="1.1" fill="#fff" opacity=".9"/>
    <path d="M21.4 50.6C17 48 14.6 44 15 39.4C17.6 43 20.6 44.6 24.4 45.2z" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M42.6 50.6C47 48 49.4 44 49 39.4C46.4 43 43.4 44.6 39.6 45.2z" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M29 50.6L32 46L35 50.6z" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M16 41C17.6 43.4 20 44.6 23 45" fill="none" stroke="#c9ced8" stroke-width=".5" opacity=".7"/>
    ${sparkle(45.4, 14.6, 2.6, .9)}`;
}

function palantirStorm(p) {
  const defs = `<defs>${blur(p, 1.2)}${blur(p, 4)}
    <radialGradient id="${p}orb" cx=".46" cy=".4" r=".62"><stop offset="0" stop-color="#8ab8ff"/><stop offset=".45" stop-color="#2a4fa8"/><stop offset=".8" stop-color="#121c4a"/><stop offset="1" stop-color="#05081a"/></radialGradient>
    <linearGradient id="${p}stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9b4aa"/><stop offset=".5" stop-color="#6e6a62"/><stop offset="1" stop-color="#2e2b27"/></linearGradient>
    <clipPath id="${p}c"><circle cx="32" cy="28.4" r="20"/></clipPath></defs>`;
  return defs + `<circle cx="32" cy="28.4" r="24" fill="#6aa0ff" opacity=".35" filter="url(#${p}blur4)"/>
    <path d="M14 59H50L47 54.6H17z" fill="url(#${p}stone)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M18 54.6H46L43 47.4Q32 51.6 21 47.4z" fill="url(#${p}stone)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M20 52.6h24" stroke="#e6e0d2" stroke-width=".5" opacity=".6"/>
    <circle cx="32" cy="28.4" r="20" fill="url(#${p}orb)" stroke="${INK}" stroke-width="1.1"/>
    <g clip-path="url(#${p}c)">
      <path d="M12 24C20 18 30 26 40 20S52 18 54 22M10 33C18 28 26 36 36 31S50 28 54 32M14 16C22 12 30 18 38 13" fill="none" stroke="#cfe2ff" stroke-width="1.1" opacity=".45"/>
      <path d="M12 42C18 38 24 40 28 44M36 44C40 40 46 39 52 42" fill="none" stroke="#cfe2ff" stroke-width=".9" opacity=".35"/>
      <path d="M22 48.6H42V44Q32 40 22 44z" fill="#0b0f22"/>
      <path d="M29 45L29.8 27L28.4 22.6L30.4 24.2L31.2 19L32 22.4L32.8 19L33.6 24.2L35.6 22.6L34.2 27L35 45z" fill="#05060e" stroke="#9cc0ff" stroke-width=".4"/>
      <circle cx="32" cy="27.4" r=".7" fill="#ffd36a"/>
      <path d="M40 9L36.6 15.4L39 16L34.4 23" fill="none" stroke="#ffffff" stroke-width="1" stroke-linejoin="round"/>
      <path d="M40 9L36.6 15.4L39 16L34.4 23" fill="none" stroke="#a8ccff" stroke-width="3" opacity=".7" filter="url(#${p}blur1.2)"/>
    </g>
    <path d="M17.6 22.6C19.4 16.8 24.4 12.4 30 11" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>
    <circle cx="21.8" cy="16.2" r="1.1" fill="#fff" opacity=".9"/>
    <path d="M44.6 41.4A20 20 0 0 1 36 47.6" fill="none" stroke="#cfe2ff" stroke-width="1" opacity=".5"/>
    ${sparkle(48, 12.4, 2.6, .9)}${sparkle(12, 44, 1.4, .6)}`;
}

function palantirOrbit(p) {
  const defs = `<defs>${gold(p)}${blur(p, 1.2)}${blur(p, 4)}
    <radialGradient id="${p}orb" cx=".42" cy=".38" r=".66"><stop offset="0" stop-color="#7c5cff"/><stop offset=".35" stop-color="#2a1a6a"/><stop offset=".75" stop-color="#0e0828"/><stop offset="1" stop-color="#040210"/></radialGradient>
    <radialGradient id="${p}core" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#bfe9ff"/><stop offset=".7" stop-color="#3aa0ff" stop-opacity=".6"/><stop offset="1" stop-color="#3aa0ff" stop-opacity="0"/></radialGradient></defs>`;
  const ring = (rot, rx, ry, w, col, back) => `<g transform="translate(32 29) rotate(${rot})">${back
    ? `<ellipse rx="${rx}" ry="${ry}" fill="none" stroke="${col}" stroke-width="${w}" opacity=".55"/>`
    : `<path d="M${-rx} 0A${rx} ${ry} 0 0 0 ${rx} 0" fill="none" stroke="${col}" stroke-width="${w * 2.4}" opacity=".5" filter="url(#${p}blur1.2)"/><path d="M${-rx} 0A${rx} ${ry} 0 0 0 ${rx} 0" fill="none" stroke="${col}" stroke-width="${w}"/><path d="M${-rx * .5} ${ry * .86}A${rx} ${ry} 0 0 0 ${rx * .5} ${ry * .86}" fill="none" stroke="#fff" stroke-width="${w * .45}"/>`}</g>`;
  return defs + `<circle cx="32" cy="29" r="22" fill="#5a8cff" opacity=".35" filter="url(#${p}blur4)"/>
    <ellipse cx="32" cy="54" rx="13" ry="2.8" fill="#000" opacity=".5" filter="url(#${p}blur1.2)"/>
    <path d="M24 53.4L32 48L40 53.4L32 55.6z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7" stroke-linejoin="round" opacity=".95"/>
    ${ring(-22, 25, 7, 1.1, '#7fd4ff', true)}${ring(28, 23, 6, 1, '#c09bff', true)}
    <circle cx="32" cy="29" r="15.4" fill="url(#${p}orb)" stroke="${INK}" stroke-width="1.1"/>
    <circle cx="33" cy="30" r="9" fill="url(#${p}core)"/>
    <path d="M33 26l1.4 2.6 2.6 1.4-2.6 1.4L33 34l-1.4-2.6L29 30l2.6-1.4z" fill="#fff"/>
    <path d="M28 22C30 25 34 24 36 27M26 34C30 32 34 36 38 33" fill="none" stroke="#9fd8ff" stroke-width=".6" opacity=".6"/>
    <path d="M21 25C22.4 20.2 26.4 16.4 31 15.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>
    <circle cx="24.4" cy="19.4" r=".9" fill="#fff"/>
    ${ring(-22, 25, 7, 1.1, '#7fd4ff', false)}${ring(28, 23, 6, 1, '#c09bff', false)}
    <circle cx="9.6" cy="38.2" r="1.6" fill="#bfe9ff"/><circle cx="9.6" cy="38.2" r="3" fill="#7fd4ff" opacity=".5" filter="url(#${p}blur1.2)"/>
    <circle cx="51.4" cy="15.6" r="1.4" fill="#e0ccff"/><circle cx="51.4" cy="15.6" r="2.8" fill="#c09bff" opacity=".5" filter="url(#${p}blur1.2)"/>
    ${sparkle(46, 44, 2.2, .85)}${sparkle(16, 11, 1.8, .8)}`;
}

// ---------------------------------------------------------------- Oakenshield

function oakBranch(p) {
  const defs = `<defs>${gold(p)}${gem(p, 'b', '#38bdf8')}${blur(p, 1.2)}${blur(p, 4)}
    <linearGradient id="${p}bark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a07a4e"/><stop offset=".35" stop-color="#6a4a2a"/><stop offset=".75" stop-color="#3a2512"/><stop offset="1" stop-color="#1e1208"/></linearGradient>
    <radialGradient id="${p}cut" cx=".45" cy=".45" r=".6"><stop offset="0" stop-color="#f0cf96"/><stop offset=".7" stop-color="#c8955a"/><stop offset="1" stop-color="#8a5a2a"/></radialGradient>
    <linearGradient id="${p}green" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#b7e07a"/><stop offset=".5" stop-color="#5a9a2e"/><stop offset="1" stop-color="#2a5a14"/></linearGradient></defs>`;
  return defs + `<ellipse cx="32" cy="32" rx="26" ry="14" transform="rotate(-40 32 32)" fill="#ffe0a0" opacity=".22" filter="url(#${p}blur4)"/>
    <g transform="rotate(-40 32 32)">
      <path d="M28 37C29.4 41 31.4 45 33 49.4" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M28 37C29.4 41 31.4 45 33 49.4" fill="none" stroke="url(#${p}bark)" stroke-width="2.4" stroke-linecap="round"/>
      ${oakLeaf(33, 48.6, 200, 1.5, `url(#${p}green)`)}${oakLeaf(32.4, 47, 135, 1.3, `url(#${p}green)`)}${oakLeaf(31, 43.6, 250, 1.2, `url(#${p}green)`)}
      ${acorn(38, 47, 1.25)}${acorn(27.6, 50.6, 1.1)}
      <path d="M10 26.4C20 24.8 34 27.4 46 25.8C52 25.4 56 24 62 22.8V39.4C56 38.4 52 37.6 46 38C34 37.6 20 39.2 10 37.6z" fill="url(#${p}bark)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
      <path d="M14 29C22 28.2 28 29.6 33 28.6M16 32.6C24 31.6 30 33.4 34 32.2M14 35.6C22 35 26 36.2 33 35.4M41 29.4C47 28.6 52 29 58 27.6M41 33.4C48 32.4 53 33.6 60 32.2M42 36.4C48 36 52 36.6 58 35.8" fill="none" stroke="#1a0e05" stroke-width=".6" opacity=".85"/>
      <path d="M12 27.6C20 26.4 30 28.4 34 27.4M40 27C48 26.6 54 25.6 60 24.4" fill="none" stroke="#e0c08a" stroke-width=".6" opacity=".7"/>
      <ellipse cx="24" cy="34" rx="1.8" ry="1.2" fill="#2a1a0a" stroke="#8a6a40" stroke-width=".4"/>
      <ellipse cx="10" cy="32" rx="3.6" ry="5.7" fill="url(#${p}cut)" stroke="${INK}" stroke-width=".9"/>
      <ellipse cx="10" cy="32" rx="2.4" ry="3.9" fill="none" stroke="#8a5a2a" stroke-width=".4"/>
      <ellipse cx="10" cy="32" rx="1.2" ry="2" fill="none" stroke="#8a5a2a" stroke-width=".4"/>
      <path d="M34.4 24.4H39.4V39.8H34.4z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8"/>
      <path d="M35 26H38.8M35 38.2H38.8" stroke="#7a5212" stroke-width=".5"/>
      <path d="M35.6 29.6l1.3 1.6 1.3-1.6M36.9 31.2v4" stroke="#5e3d0b" stroke-width=".55" fill="none"/>
      <circle cx="36.9" cy="36.4" r="1.1" fill="url(#${p}gem-b)" stroke="${INK}" stroke-width=".4"/>
    </g>
    <path d="M12 14L18 19M8 20l6 2.2M17 9l2.4 6" stroke="#fff3c0" stroke-width=".8" stroke-linecap="round" opacity=".7"/>
    ${sparkle(20, 18, 2.8)}${sparkle(46, 46, 1.8, .75)}`;
}

function oakRound(p) {
  const defs = `<defs>${gold(p)}${steel(p)}${blur(p, 4)}
    <linearGradient id="${p}plank" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c58a52"/><stop offset=".45" stop-color="#8a5228"/><stop offset="1" stop-color="#3d200c"/></linearGradient>
    <radialGradient id="${p}boss" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#c3ccd8"/><stop offset=".8" stop-color="#5d6878"/><stop offset="1" stop-color="#2d3440"/></radialGradient>
    <radialGradient id="${p}sh" cx=".38" cy=".34" r=".72"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <clipPath id="${p}c"><circle cx="32" cy="32" r="23"/></clipPath></defs>`;
  const rivets = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const x = (32 + Math.cos(a) * 24.4).toFixed(2), y = (32 + Math.sin(a) * 24.4).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="1" fill="url(#${p}boss)" stroke="${INK}" stroke-width=".35"/>`;
  }).join('');
  return defs + `<circle cx="32" cy="32" r="27" fill="#fff0c0" opacity=".2" filter="url(#${p}blur4)"/>
    <circle cx="32" cy="32" r="23" fill="url(#${p}plank)"/>
    <g clip-path="url(#${p}c)">
      <path d="M20 8V56M26.6 8V56M33.4 8V56M40.2 8V56M46.8 8V56" stroke="#2a1608" stroke-width=".8"/>
      <path d="M22 14c1 6-1 12 0 18s-1 12 0 18M29.4 10c1 8-1 14 0 22s-1 14 0 22M36.6 12c1 6-1 14 0 20s-1 14 0 20M43.4 14c1 6-1 12 0 18s-1 12 0 18" fill="none" stroke="#5a3214" stroke-width=".5" opacity=".7"/>
      <circle cx="32" cy="32" r="23" fill="url(#${p}sh)"/>
      <path d="M9 22H55M9 42H55" stroke="url(#${p}boss)" stroke-width="2.4"/>
      <path d="M9 22H55M9 42H55" stroke="${INK}" stroke-width=".3" opacity=".6" transform="translate(0 1.2)"/>
    </g>
    <circle cx="32" cy="32" r="24.4" fill="none" stroke="${INK}" stroke-width="4.2"/>
    <circle cx="32" cy="32" r="24.4" fill="none" stroke="url(#${p}gold)" stroke-width="3"/>
    <circle cx="32" cy="32" r="22.8" fill="none" stroke="${INK}" stroke-width=".6" opacity=".8"/>
    ${rivets}
    ${oakLeaf(32, 25, 0, 1.15, `url(#${p}gold)`)}${oakLeaf(39, 32, 90, 1.15, `url(#${p}gold)`)}${oakLeaf(32, 39, 180, 1.15, `url(#${p}gold)`)}${oakLeaf(25, 32, 270, 1.15, `url(#${p}gold)`)}
    <circle cx="32" cy="32" r="7" fill="url(#${p}boss)" stroke="${INK}" stroke-width="1"/>
    <circle cx="32" cy="32" r="5" fill="none" stroke="#5d6878" stroke-width=".5"/>
    <ellipse cx="29.8" cy="29.6" rx="2" ry="1.2" transform="rotate(-35 29.8 29.6)" fill="#fff" opacity=".9"/>
    <path d="M15 19.6C18 14.6 23.4 11 29.4 10.2" fill="none" stroke="#fff6d0" stroke-width="1" stroke-linecap="round" opacity=".7"/>
    ${sparkle(48, 15, 3.4)}${sparkle(14, 48, 1.6, .7)}`;
}

function oakDeflect(p) {
  const shield = 'M32 6L51.6 12L49.6 37.6L32 58L14.4 37.6L12.4 12z';
  const defs = `<defs>${gold(p)}${blur(p, 1.2)}${blur(p, 4)}
    <linearGradient id="${p}st" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#eef2f7"/><stop offset=".35" stop-color="#a9b4c4"/><stop offset=".5" stop-color="#6b778a"/><stop offset="1" stop-color="#2d3542"/></linearGradient>
    <linearGradient id="${p}plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4a66"/><stop offset="1" stop-color="#121a2a"/></linearGradient>
    <linearGradient id="${p}green" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset=".5" stop-color="#e2b440"/><stop offset="1" stop-color="#8a5a12"/></linearGradient></defs>`;
  return defs + `<path d="${shield}" fill="url(#${p}st)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M32 11L46.8 15.6L45.2 35.6L32 51.4L18.8 35.6L17.2 15.6z" fill="url(#${p}plate)" stroke="url(#${p}gold)" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M32 11L46.8 15.6L45.2 35.6L32 51.4L18.8 35.6L17.2 15.6z" fill="none" stroke="${INK}" stroke-width=".4" stroke-linejoin="round"/>
    <path d="M32 7.4L50.2 13" stroke="#fff" stroke-width=".7" opacity=".8"/>
    <path d="M13.8 13.4L15.6 37" stroke="#fff" stroke-width=".6" opacity=".55"/>
    <g transform="translate(32 26)">
      <path d="M0 18V2" stroke="url(#${p}gold)" stroke-width="2.4"/>
      <path d="M0 18V2" stroke="${INK}" stroke-width=".4" opacity=".6" transform="translate(1 0)"/>
      <path d="M0 18l-4 2.4M0 18l4 2.4" stroke="url(#${p}gold)" stroke-width="1.4" stroke-linecap="round"/>
      ${oakLeaf(0, 2, 0, 1.25, `url(#${p}green)`)}${oakLeaf(-1, 5, -55, 1.05, `url(#${p}green)`)}${oakLeaf(1, 5, 55, 1.05, `url(#${p}green)`)}
      ${acorn(-6.6, 7.8, .85)}${acorn(6.6, 7.8, .85)}
    </g>
    ${[[32, 8.6], [49.4, 14], [47.6, 36.6], [16.4, 36.6], [14.6, 14]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".4"/>`).join('')}
    <g transform="translate(58 4) rotate(135)">${arrow(18, '#9aa5b4', '#e8e0cc')}</g>
    <circle cx="45.4" cy="16.8" r="5" fill="#fff3b0" opacity=".9" filter="url(#${p}blur1.2)"/>
    <path d="M45.4 16.8l6-6.4M45.4 16.8l8.4-.6M45.4 16.8l3 6.6M45.4 16.8l-1.6-7.2M45.4 16.8l-6.4 2" stroke="#fff6c8" stroke-width=".9" stroke-linecap="round"/>
    <circle cx="51" cy="21" r=".8" fill="#ffd36a"/><circle cx="40.6" cy="12.4" r=".7" fill="#ffd36a"/><circle cx="53.6" cy="12" r=".6" fill="#ffd36a"/>
    ${sparkle(45.4, 16.8, 3.4)}`;
}

export default [
  {
    id: 'galadhrim-bow', name: 'Bow of the Galadhrim', kind: 'combined', recipe: ['bow', 'bow'],
    variants: [
      { title: 'Mallorn longbow', bg: ['#7a6a18', '#1f4a26'], draw: bowLongbow },
      { title: 'Twin arrows on a mallorn leaf', bg: ['#2f6a2a', '#5a4a10'], draw: bowTwinArrows },
      { title: 'Bow and quiver of Lórien', bg: ['#7a5a14', '#1f4a26'], draw: bowQuiver },
    ],
  },
  {
    id: 'grond', name: 'Grond', kind: 'combined', recipe: ['bow', 'mail'],
    variants: [
      { title: "Wolf's-head ram", bg: ['#9a3a10', '#2a1a1a'], draw: grondRam },
      { title: 'Snarling wolf mask in fire', bg: ['#7a2a0a', '#1a1418'], draw: grondMask },
      { title: 'Hammer of the Underworld', bg: ['#8a3010', '#24202a'], draw: grondHammer },
    ],
  },
  {
    id: 'miruvor', name: 'Miruvor', kind: 'combined', recipe: ['bow', 'cloak'],
    variants: [
      { title: 'Leather flask with a silver leaf', draw: miruvorFlask },
      { title: 'Crystal vial of golden cordial', draw: miruvorVial },
      { title: 'Silver goblet, warm and steaming', draw: miruvorGoblet },
    ],
  },
  {
    id: 'kings-banner', name: "King's Banner", kind: 'combined', recipe: ['bow', 'lembas'],
    variants: [
      { title: 'Standard of Elessar', draw: bannerStandard },
      { title: 'Banner in the wind', draw: bannerWind },
      { title: 'Crossed banners under the crown', draw: bannerCrossed },
    ],
  },
  {
    id: 'palantir', name: 'Palantír', kind: 'combined', recipe: ['bow', 'staff'],
    variants: [
      { title: 'The Eye in the stone', bg: ['#7a2a14', '#1a1430'], draw: palantirEye },
      { title: 'Storm over Orthanc', draw: palantirStorm },
      { title: 'Seeing-stone in orbiting light', bg: ['#1d3f9a', '#3a1a6a'], draw: palantirOrbit },
    ],
  },
  {
    id: 'oakenshield', name: 'Oakenshield', kind: 'combined', recipe: ['mail', 'mail'],
    variants: [
      { title: 'Oak branch bound in gold', bg: ['#5a4a22', '#1f3a2a'], draw: oakBranch },
      { title: 'Round shield of oak planks', bg: ['#5a6678', '#3a2614'], draw: oakRound },
      { title: 'Dwarf shield turning an arrow', bg: ['#4a5a78', '#2a2014'], draw: oakDeflect },
    ],
  },
];
