// Batch 4: Mithril Shirt, Dragon-helm, Star of Elendil, Elven Cloak, Elven Rope, Phial of Galadriel.
import { INK, blur, gem, gold, rays, silver, sparkle } from '../kit.mjs';
import { mithril, phial } from './examples.mjs';

const f = (n) => n.toFixed(2);

// ---- local helpers

/** A mail pattern and the shading over it. */
const mailDefs = (p) => `<pattern id="${p}mail" width="3.2" height="2.6" patternUnits="userSpaceOnUse"><circle cx="1.6" cy="1.3" r="1.25" fill="none" stroke="#5c6b80" stroke-width=".55"/><circle cx="1.6" cy="1.05" r="1.1" fill="none" stroke="#ffffff" stroke-width=".35" opacity=".8"/><circle cx="0" cy="2.6" r="1.25" fill="none" stroke="#5c6b80" stroke-width=".55"/><circle cx="3.2" cy="2.6" r="1.25" fill="none" stroke="#5c6b80" stroke-width=".55"/></pattern>
  <linearGradient id="${p}sil" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#dfe8f4"/><stop offset=".7" stop-color="#97a8bf"/><stop offset="1" stop-color="#52627a"/></linearGradient>
  <linearGradient id="${p}shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#0b1730" stop-opacity=".15"/><stop offset="1" stop-color="#0b1730" stop-opacity=".5"/></linearGradient>`;
const mailBody = (p, d, id) => `<clipPath id="${p}${id}"><path d="${d}"/></clipPath>
  <path d="${d}" fill="url(#${p}sil)"/>
  <g clip-path="url(#${p}${id})"><rect x="5" y="5" width="54" height="54" fill="url(#${p}mail)"/><rect x="5" y="5" width="54" height="54" fill="url(#${p}shade)"/></g>
  <path d="${d}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`;

/** A twisted rope along a path: outline, silver body, twist stripes, a highlight. */
const ropeDefs = (p) => `<linearGradient id="${p}rope" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f7fa"/><stop offset=".5" stop-color="#c5ccd3"/><stop offset="1" stop-color="#7c8794"/></linearGradient>`;
const rope = (p, d, w = 4.2) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 1.8}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="url(#${p}rope)" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="#5f6a78" stroke-width="${w}" stroke-dasharray=".7 1.5" opacity=".55"/>
  <path d="${d}" fill="none" stroke="#fff" stroke-width="${w * .28}" stroke-linecap="round" opacity=".55" transform="translate(-.5 -.6)"/>`;

/** A smooth closed or open path through points (Catmull-Rom). */
const smooth = (pts, closed = false) => {
  const n = pts.length, at = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + (closed ? 'z' : '');
};

/** A mallorn leaf pointing up, centred on 0, 0, length about 2 * s. */
const leaf = (fill, s = 1, vein = '#e8f5d0') => `<path d="M0 ${-s * 1.0}C${s * .62} ${-s * .55} ${s * .66} ${s * .35} 0 ${s * 1.0}C${-s * .66} ${s * .35} ${-s * .62} ${-s * .55} 0 ${-s * 1.0}z" fill="${fill}" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M0 ${-s * .8}V${s * .9}M0 ${-s * .2}L${s * .34} ${-s * .5}M0 ${s * .2}L${-s * .36} ${-s * .1}M0 ${s * .5}L${s * .32} ${s * .2}" fill="none" stroke="${vein}" stroke-width=".55" opacity=".85"/>`;

/** A star with `n` points, outer radius r, inner radius ri. */
const star = (cx, cy, n, r, ri, rot = -Math.PI / 2) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? ri : r;
    d += `${i ? 'L' : 'M'}${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`;
  }
  return d + 'z';
};

/** Flames rising from a base line, as one path. */
const flames = (x0, x1, base, h, n) => {
  let d = `M${x0} ${base}`;
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * step, xm = xa + step / 2, tall = h * (i % 2 ? .7 : 1) * (1 - Math.abs(i - (n - 1) / 2) / n * .6);
    d += `C${f(xa + step * .1)} ${f(base - tall * .5)} ${f(xm - step * .3)} ${f(base - tall * .6)} ${f(xm)} ${f(base - tall)}C${f(xm + step * .1)} ${f(base - tall * .55)} ${f(xa + step * .9)} ${f(base - tall * .35)} ${f(xa + step)} ${base}`;
  }
  return d + 'z';
};
const fireDefs = (p) => `<linearGradient id="${p}fire" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#ffb02e"/><stop offset=".75" stop-color="#e2481c"/><stop offset="1" stop-color="#7a120a"/></linearGradient>`;

// ---- Mithril Shirt

function mithrilArrow(p) {
  const shirt = 'M23 9.5L18.5 12v12.5l1.9 1V54.5h23.2V25.5l1.9-1V12L41 9.5c-1.6 3.6-5 5.8-9 5.8s-7.4-2.2-9-5.8z';
  return `<defs>${mailDefs(p)}${gold(p)}${blur(p, 1.4)}${blur(p, 3)}${gem(p, 'w', '#9fdcff')}</defs>
    <ellipse cx="32" cy="34" rx="18" ry="23" fill="#dbeaff" opacity=".22" filter="url(#${p}blur1.4)"/>
    ${mailBody(p, shirt, 'sc')}
    <path d="M20.4 52l1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5" fill="none" stroke="#e9f0f8" stroke-width=".8"/>
    <path d="M23 9.5c1.6 3.6 5 5.8 9 5.8s7.4-2.2 9-5.8l1.8 1.2c-1.9 4.6-6 7.2-10.8 7.2s-8.9-2.6-10.8-7.2z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M18.5 12v12.5l1.9 1M45.5 12v12.5l-1.9 1" fill="none" stroke="url(#${p}gold)" stroke-width="1.6"/>
    <circle cx="32" cy="17.4" r="1.8" fill="url(#${p}gem-w)" stroke="${INK}" stroke-width=".6"/>
    <circle cx="35" cy="33" r="9" fill="#fff6c8" opacity=".7" filter="url(#${p}blur3)"/>
    ${rays(35, 33, 12, 11, 6, 1, '#fffbe0', .9)}
    <g transform="rotate(-38 35 33)">
      <path d="M33 33.2H14" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      <path d="M33 33.2H14" stroke="#8a5a32" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M14.6 33.2l-2.6-3.6h5.4l2.4 3.6-2.4 3.6H12z" fill="#e9e2d2" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
      <path d="M12.4 33.2h7" stroke="#9c8f78" stroke-width=".5"/>
      <path d="M31.6 30.6l5 2.6-5 2.6 1-2.6z" fill="#cfd5dd" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
    </g>
    <g transform="rotate(32 47 46)"><path d="M41.6 46h8.6" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><path d="M41.6 46h8.6" stroke="#8a5a32" stroke-width="1.5" stroke-linecap="round"/><path d="M49.8 43.8l4 2.2-4 2.2.8-2.2z" fill="#cfd5dd" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/><path d="M41 46l-.6-1.8M41 46l-.6 1.8" stroke="#3a2a1e" stroke-width=".9" stroke-linecap="round"/></g>
    ${sparkle(35, 33, 5.4)}${sparkle(25, 42, 1.8, .85)}${sparkle(47, 18, 2.2, .9)}`;
}

function mithrilMoon(p) {
  const shirt = 'M24 11L7.5 16.5l1.6 7.2 11.3-2.9V53.5h23.2V20.8l11.3 2.9 1.6-7.2L40 11c-1.6 3-4.4 4.6-8 4.6S25.6 14 24 11z';
  const pearls = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, a = Math.PI * (.12 + .76 * t); pearls.push([32 - Math.cos(a) * 8.6, 11.2 + Math.sin(a) * 5.6]); }
  return `<defs>${mailDefs(p)}${blur(p, 1.4)}${blur(p, 2.5)}
    <radialGradient id="${p}moon" cx=".4" cy=".35" r=".65"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#d8e6f7"/><stop offset="1" stop-color="#8fa6c6"/></radialGradient>
    <radialGradient id="${p}pearl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#e7ecf5"/><stop offset="1" stop-color="#8b93a6"/></radialGradient></defs>
    <circle cx="32" cy="30" r="21" fill="#cfe0ff" opacity=".35" filter="url(#${p}blur2.5)"/>
    <circle cx="32" cy="30" r="17.5" fill="url(#${p}moon)" opacity=".55"/>
    <circle cx="32" cy="30" r="17.5" fill="none" stroke="#fff" stroke-width=".6" opacity=".6"/>
    ${mailBody(p, shirt, 'sc')}
    <path d="M20.4 20.8L9.1 23.7M43.6 20.8l11.3 2.9" stroke="#3b4a60" stroke-width=".8"/>
    <path d="M9 17.6l1.4 5.6M55 17.6l-1.4 5.6" stroke="#e9f0f8" stroke-width=".9" opacity=".8"/>
    <path d="M20.4 50.8h23.2" stroke="#3b4a60" stroke-width=".8"/>
    <path d="M20.4 51.6l1.45 2.2 1.45-2.2 1.45 2.2 1.45-2.2 1.45 2.2 1.45-2.2 1.45 2.2 1.45-2.2 1.45 2.2 1.45-2.2 1.45 2.2 1.45-2.2 1.45 2.2 1.45-2.2 1.45 2.2 1.45-2.2" fill="none" stroke="#e9f0f8" stroke-width=".7"/>
    ${pearls.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.25" fill="url(#${p}pearl)" stroke="${INK}" stroke-width=".45"/>`).join('')}
    <path d="M32 17.2l1.8 2.6-1.8 2.8-1.8-2.8z" fill="#bfe9ff" stroke="${INK}" stroke-width=".6"/>
    <path d="M28.6 23v26M35.4 23v26" stroke="#fff" stroke-width=".5" opacity=".35"/>
    ${sparkle(15, 18.5, 2.6)}${sparkle(41, 33, 4.2)}${sparkle(26, 45, 1.8, .85)}${sparkle(50, 12, 1.6, .8)}`;
}

// ---- Dragon-helm

const helmDefs = (p) => `${gold(p)}${fireDefs(p)}${blur(p, 1.4)}${blur(p, 3)}${blur(p, 5)}
  <linearGradient id="${p}iron" x1="0" y1="0" x2="1" y2=".3"><stop offset="0" stop-color="#e8ecf2"/><stop offset=".3" stop-color="#a9b2bf"/><stop offset=".7" stop-color="#5a6475"/><stop offset="1" stop-color="#262c38"/></linearGradient>`;

function helmFront(p) {
  const dome = 'M15 34c0-11 7.6-19 17-19s17 8 17 19v8.6c0 1.6-.8 2.8-2.2 3.4l-6.4 2.6-1.4 7.6h-4.8l-2.2-12.4-2.2 12.4H24l-1.4-7.6-6.4-2.6c-1.4-.6-2.2-1.8-2.2-3.4z';
  const crest = 'M32 15c-1.2-3.4.4-6.8 3.6-8.4 2.8-1.4 6-.6 7.6 1.6-2.2-.4-4 .4-4.8 2 2-.2 3.6.6 4.2 2.2-2.4-.6-4.4 0-5.4 1.6.2 2.4-1 4.4-3 5.6z';
  return `<defs>${helmDefs(p)}${gem(p, 'r', '#ff5a1f')}</defs>
    <path d="${flames(10, 54, 60, 26, 7)}" fill="url(#${p}fire)" opacity=".75" filter="url(#${p}blur1.4)"/>
    <ellipse cx="32" cy="44" rx="22" ry="12" fill="#ff7a1c" opacity=".35" filter="url(#${p}blur5)"/>
    <path d="${dome}" fill="url(#${p}iron)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M32 15.4V30" stroke="url(#${p}gold)" stroke-width="2.6"/><path d="M32 15.4V30" stroke="${INK}" stroke-width=".5" opacity=".5"/>
    <path d="M15.6 31.6c4.6-1.6 10.4-2.2 16.4-2.2s11.8.6 16.4 2.2" fill="none" stroke="url(#${p}gold)" stroke-width="2.2"/>
    <path d="M17.4 34.6l6.6-1.6 5.2 2.6-.6 4.4-5.8.4-5.4-2.2zM46.6 34.6L40 33l-5.2 2.6.6 4.4 5.8.4 5.4-2.2z" fill="#0b0604" stroke="${INK}" stroke-width=".8"/>
    <path d="M20 36.4l4-.8 3.6 1.6M44 36.4l-4-.8-3.6 1.6" stroke="#ffb02e" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M20 36.4l4-.8 3.6 1.6M44 36.4l-4-.8-3.6 1.6" stroke="#ff7a1c" stroke-width="2.6" stroke-linecap="round" opacity=".6" filter="url(#${p}blur1.4)"/>
    <path d="M18.5 22c1.8-3 4.6-5.2 8-6.2" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
    <path d="M16.6 41.6c2.2 1.6 4.4 2.4 6.4 2.8M47.4 41.6c-2.2 1.6-4.4 2.4-6.4 2.8" fill="none" stroke="url(#${p}gold)" stroke-width="1.4"/>
    <circle cx="20" cy="42.2" r=".8" fill="#ffe9a3"/><circle cx="44" cy="42.2" r=".8" fill="#ffe9a3"/>
    <path d="${crest}" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M30.6 15.6c-3.4-1.4-6.4-.6-8.4 1.6 2.2-.2 3.8.6 4.4 2" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <circle cx="39.6" cy="9" r=".9" fill="url(#${p}gem-r)"/>
    <circle cx="32" cy="27.4" r="2" fill="url(#${p}gem-r)" stroke="${INK}" stroke-width=".7"/>
    ${sparkle(23.5, 20, 2.8)}${sparkle(48, 12, 1.6, .8)}`;
}

function helmProfile(p) {
  // A helm in profile facing right, a dragon's head as its crest breathing fire forward.
  const shell = 'M14 38c-.6-11.4 6.6-20.4 17.6-21.4 9.6-.8 16.4 5.4 17.4 14.2l.4 4.6-6.6.4-.4 3.6 6.8.6.2 4.4c-.2 2.4-1.8 3.8-4.2 4.2l-5 .8-1.2 6.2-6.8.4-.8-6.8-8.6-1.4C17 47.2 14.4 43.6 14 38z';
  return `<defs>${helmDefs(p)}${gem(p, 'r', '#ff5a1f')}</defs>
    <path d="M42.4 10.4c4.6-3 9.8-3.4 14.8-1.4-2.4.8-4 2-4.8 3.4 2.4.4 4.4 1.6 5.6 3.4-5.2-.6-10.6-1.6-15.6-5.4z" fill="url(#${p}fire)" stroke="#7a120a" stroke-width=".5" filter="url(#${p}blur1.4)"/>
    <path d="M42.6 10.6c4-2.4 8.4-2.8 12.6-1.4-2 .6-3.4 1.6-4 2.8 2 .4 3.6 1.2 4.6 2.6-4.4-.4-9-1.2-13.2-4z" fill="url(#${p}fire)"/>
    <circle cx="32" cy="38" r="20" fill="#ff7a1c" opacity=".28" filter="url(#${p}blur5)"/>
    <path d="${shell}" fill="url(#${p}iron)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M43.4 35.4h6.4M43 39.4l6.6.4" stroke="${INK}" stroke-width=".8"/>
    <path d="M43.2 35.6l-.2 3.6 6.6.5-.4-3.9z" fill="#0b0604"/>
    <path d="M44 37.4h4.8" stroke="#ff9a2e" stroke-width="1" stroke-linecap="round"/>
    <path d="M16.6 33.4c8.6-2.4 20.6-2.6 32.8-1" fill="none" stroke="url(#${p}gold)" stroke-width="2.2"/>
    <path d="M16.6 33.4c8.6-2.4 20.6-2.6 32.8-1" fill="none" stroke="${INK}" stroke-width=".4" opacity=".5"/>
    <path d="M27 46.2l1.4 9.2M33.4 47.4l.4 8" stroke="url(#${p}gold)" stroke-width="1.5"/>
    ${[20, 24, 28, 32, 36, 40].map((x) => `<circle cx="${x}" cy="${f(33.1 - (x - 20) * .04)}" r=".7" fill="#fff2c0"/>`).join('')}
    <path d="M19 26c2.2-4 6-6.6 10.6-7.4" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
    <path d="M21.4 19.2c-.8-5.4 1.2-10 5.6-12.6l3.6 3.8c-2.8 1.8-4 4.6-3.6 8z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M23.4 17.4c-.2-3.6 1-6.6 3.4-8.4M25.6 18c-.2-2.6.6-4.8 2.4-6.4" fill="none" stroke="#8a5f14" stroke-width=".6"/>
    <path d="M18.6 13.6c-1.6-1.6-1.8-3.4-.8-5 .4 1.4 1.4 2.2 2.8 2.4M18.4 17.4c-2-1-2.6-2.6-2-4.2.6 1.2 1.6 1.8 3 1.8" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>
    <path d="M26 7.4c3.2-2.6 7.4-3.4 11.6-2.4l7.4 3-1.6 1.4-6.4-.4c-1.8.2-3.2 1-4 2.2l-5.4.8z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M29.6 11.8l4.2-.6 8.6 2.4-.8 1.6-6.6-1c-1.8.2-3.4.8-4.6 1.6z" fill="url(#${p}goldside)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M38.6 9.4l.8 1.4.8-1.2M41 9.6l.7 1.2.7-1" fill="none" stroke="#fff6d8" stroke-width=".5"/>
    <path d="M28.6 6.6c-2.4-2.6-5.4-3.6-8.6-3.2 2.2.8 3.8 2.4 4.6 4.4z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <circle cx="32.4" cy="7.6" r="1.1" fill="url(#${p}gem-r)" stroke="${INK}" stroke-width=".4"/>
    <path d="M28 9.4c2.4-1.6 5.6-2.4 9-2.2" fill="none" stroke="#fff6d0" stroke-width=".5" opacity=".8"/>
    ${sparkle(26, 22, 2.6)}${sparkle(12.5, 46, 1.4, .7)}`;
}

function helmWings(p) {
  const dome = 'M19 33c0-9.6 5.8-16.6 13-16.6S45 23.4 45 33v10.4c0 1.4-.8 2.4-2 2.8l-5 1.6-.8 6.6h-3.6L32 43.8l-1.6 10.6h-3.6l-.8-6.6-5-1.6c-1.2-.4-2-1.4-2-2.8z';
  const wing = 'M19.6 30.6C13.4 26 9.6 19.4 9 11.4c2.6 2.4 4.4 3 6.2 2.8-1.4-1.8-1.8-3.8-1.4-6 2.6 3 4.6 4.2 6.6 4.2-.8-1.6-.8-3.2-.2-4.8 2.4 3.6 4.6 6.8 6.4 9.6-4.6 2.6-7 7.2-7 13.4z';
  const wingL = wing;
  return `<defs>${helmDefs(p)}${gem(p, 'r', '#ff5a1f')}</defs>
    <circle cx="32" cy="32" r="22" fill="#ff6a1a" opacity=".3" filter="url(#${p}blur5)"/>
    <path d="${flames(6, 58, 60, 18, 9)}" fill="url(#${p}fire)" opacity=".9" filter="url(#${p}blur1.4)"/>
    <path d="${flames(12, 52, 60, 13, 7)}" fill="url(#${p}fire)"/>
    <g><path d="${wingL}" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M19.4 28.6c-3.8-4.6-6.4-9.8-7.6-15.4M20.6 25.4c-2.4-4-3.8-8-4.4-12.4M22.6 21.8c-1.6-3-2.4-6-2.8-9.6" fill="none" stroke="#8a5f14" stroke-width=".6"/></g>
    <g transform="translate(64 0) scale(-1 1)"><path d="${wingL}" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M19.4 28.6c-3.8-4.6-6.4-9.8-7.6-15.4M20.6 25.4c-2.4-4-3.8-8-4.4-12.4M22.6 21.8c-1.6-3-2.4-6-2.8-9.6" fill="none" stroke="#8a5f14" stroke-width=".6"/></g>
    <path d="${dome}" fill="url(#${p}iron)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M32 16.6c-2.2 3.4-2.2 9.4 0 14 2.2-4.6 2.2-10.6 0-14z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8"/>
    <path d="M22.4 34.8l7.6-1 .8 3.6-1.6 3-6-.4zM41.6 34.8l-7.6-1-.8 3.6 1.6 3 6-.4z" fill="#0b0604" stroke="${INK}" stroke-width=".8"/>
    <path d="M24.4 37l4.6-.6M39.6 37L35 36.4" stroke="#ffd36b" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M24.4 37l4.6-.6M39.6 37L35 36.4" stroke="#ff7a1c" stroke-width="2.8" stroke-linecap="round" opacity=".6" filter="url(#${p}blur1.4)"/>
    <path d="M22.6 24.4c1.2-2.6 3.2-4.6 5.8-5.6" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>
    <circle cx="32" cy="32.6" r="1.9" fill="url(#${p}gem-r)" stroke="${INK}" stroke-width=".7"/>
    ${sparkle(25, 22, 2.4)}${sparkle(52, 9.4, 1.4, .7)}`;
}

// ---- Star of Elendil

const starDefs = (p) => `${silver(p)}${blur(p, 1.4)}${blur(p, 3)}${blur(p, 6)}
  <radialGradient id="${p}white" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f2f8ff"/><stop offset=".8" stop-color="#bcd6f2"/><stop offset="1" stop-color="#6f93bf"/></radialGradient>
  <linearGradient id="${p}band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#cdd5e0"/><stop offset=".6" stop-color="#7d889b"/><stop offset="1" stop-color="#b8c2d0"/></linearGradient>`;

/** A faceted star-gem: eight points, cut into lit and shadowed facets. */
function starGem(p, cx, cy, r) {
  let facets = '';
  for (let i = 0; i < 16; i++) {
    const a0 = -Math.PI / 2 + (i * Math.PI) / 8, a1 = -Math.PI / 2 + ((i + 1) * Math.PI) / 8;
    const r0 = i % 2 ? r * .45 : r, r1 = i % 2 ? r : r * .45;
    const lit = Math.cos(a0 + Math.PI / 16 + Math.PI * .75);
    facets += `<path d="M${cx} ${cy}L${f(cx + Math.cos(a0) * r0)} ${f(cy + Math.sin(a0) * r0)}L${f(cx + Math.cos(a1) * r1)} ${f(cy + Math.sin(a1) * r1)}z" fill="${lit > 0 ? '#ffffff' : '#b9cde6'}" opacity="${f(.55 + Math.abs(lit) * .45)}"/>`;
  }
  return `<path d="${star(cx, cy, 8, r, r * .45)}" fill="url(#${p}white)"/>${facets}
    <path d="${star(cx, cy, 8, r, r * .45)}" fill="none" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <circle cx="${cx}" cy="${cy}" r="${r * .3}" fill="#fff"/>`;
}

function starFillet(p) {
  return `<defs>${starDefs(p)}</defs>
    ${rays(32, 30, 16, 28, 18, 1.6, '#eaf4ff', .5)}
    <circle cx="32" cy="30" r="11" fill="#fff" opacity=".55" filter="url(#${p}blur6)"/>
    <path d="M8.4 36.6c0-6.4 10.6-11 23.6-11s23.6 4.6 23.6 11" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/>
    <path d="M8.4 36.6c0-6.4 10.6-11 23.6-11s23.6 4.6 23.6 11" fill="none" stroke="#5b6577" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M8.4 36.6c0 6.4 10.6 11.6 23.6 11.6s23.6-5.2 23.6-11.6" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M8.4 36.6c0 6.4 10.6 11.6 23.6 11.6s23.6-5.2 23.6-11.6" fill="none" stroke="url(#${p}band)" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M10 39.6c4 4.6 12 7.2 22 7.2" fill="none" stroke="#fff" stroke-width=".8" opacity=".8"/>
    ${[14, 20, 44, 50].map((x) => `<path d="${star(x, 36.6 + Math.sqrt(Math.max(0, 1 - ((x - 32) / 23.6) ** 2)) * 11.6, 4, 1.3, .5)}" fill="#fff" opacity=".9"/>`).join('')}
    <path d="M24 46.6c2-5.6 4.8-9.4 8-10.6 3.2 1.2 6 5 8 10.6" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <circle cx="32" cy="36" r="9.4" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".9"/>
    <circle cx="32" cy="36" r="7.8" fill="#1c2a44"/>
    ${starGem(p, 32, 36, 8.4)}
    ${sparkle(32, 36, 5)}${sparkle(49, 18, 2.4, .9)}${sparkle(15, 21, 1.6, .8)}`;
}

function starWard(p) {
  return `<defs>${starDefs(p)}
    <radialGradient id="${p}bub" cx=".5" cy=".5" r=".5"><stop offset=".72" stop-color="#bfe0ff" stop-opacity="0"/><stop offset=".93" stop-color="#bfe0ff" stop-opacity=".45"/><stop offset="1" stop-color="#ffffff" stop-opacity=".9"/></radialGradient>
    <radialGradient id="${p}mount" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c3ccd8"/><stop offset="1" stop-color="#4d5869"/></radialGradient></defs>
    <circle cx="32" cy="32" r="25" fill="url(#${p}bub)"/>
    <path d="M14 18c4-5.6 10.4-9 18-9" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>
    <path d="M52 44c-2 3.4-5 6.2-8.6 8" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".5"/>
    <circle cx="32" cy="32" r="13" fill="#fff" opacity=".6" filter="url(#${p}blur6)"/>
    ${rays(32, 32, 8, 22, 22, 1.2, '#ffffff', .55)}
    <path d="${star(32, 32, 8, 19, 9.4)}" fill="url(#${p}mount)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <path d="${star(32, 32, 8, 16.4, 8.2)}" fill="none" stroke="#fff" stroke-width=".5" opacity=".6"/>
    <circle cx="32" cy="32" r="9" fill="#1c2a44" stroke="${INK}" stroke-width=".8"/>
    ${starGem(p, 32, 32, 9.6)}
    ${sparkle(32, 32, 6.2)}${sparkle(47, 15, 2.2, .9)}${sparkle(16, 47, 1.6, .8)}`;
}

function starShield(p) {
  const shield = 'M32 7.4l19 6.4v15c0 12.6-8.2 21.4-19 26.4-10.8-5-19-13.8-19-26.4v-15z';
  return `<defs>${starDefs(p)}${gold(p)}
    <linearGradient id="${p}face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a5a8c"/><stop offset=".6" stop-color="#16294a"/><stop offset="1" stop-color="#0a1428"/></linearGradient>
    <clipPath id="${p}sh"><path d="${shield}"/></clipPath></defs>
    <circle cx="32" cy="28" r="20" fill="#cfe4ff" opacity=".35" filter="url(#${p}blur6)"/>
    <path d="${shield}" fill="url(#${p}face)"/>
    <g clip-path="url(#${p}sh)">${rays(32, 27, 16, 30, 20, 1.6, '#cfe4ff', .35)}
      <path d="M13 22h38" stroke="#ffffff" stroke-width=".4" opacity=".2"/></g>
    <path d="${shield}" fill="none" stroke="url(#${p}silver)" stroke-width="3"/>
    <path d="${shield}" fill="none" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M32 9.8l16.6 5.6v13.4c0 11.2-7.2 19-16.6 23.6" fill="none" stroke="#fff" stroke-width=".5" opacity=".45"/>
    ${[[18, 18], [46, 18], [32, 49.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".4"/>`).join('')}
    <circle cx="32" cy="27" r="9" fill="#fff" opacity=".7" filter="url(#${p}blur3)"/>
    ${starGem(p, 32, 27, 10)}
    ${sparkle(32, 27, 5.6)}${sparkle(17, 13, 2, .85)}${sparkle(50, 40, 1.6, .75)}`;
}

// ---- Elven Cloak

const cloakDefs = (p) => `${silver(p)}${blur(p, 1.4)}${blur(p, 4)}
  <linearGradient id="${p}cl" x1="0" y1="0" x2="1" y2=".25"><stop offset="0" stop-color="#b9cdb0"/><stop offset=".35" stop-color="#7e9b78"/><stop offset=".75" stop-color="#4b6450"/><stop offset="1" stop-color="#243328"/></linearGradient>
  <linearGradient id="${p}leafg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7f5a0"/><stop offset=".45" stop-color="#5fbf47"/><stop offset="1" stop-color="#1d5a24"/></linearGradient>
  <linearGradient id="${p}leafy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#e3b23c"/><stop offset="1" stop-color="#8a5f14"/></linearGradient>`;

/** The leaf brooch: a green leaf on a silver stem, at x, y, turned by rot. */
const brooch = (p, x, y, s, rot = -30) => `<g transform="translate(${x} ${y}) rotate(${rot})">
  <path d="M0 ${s * 1.05}v${s * .5}" stroke="url(#${p}silver)" stroke-width="${s * .22}" stroke-linecap="round"/>
  ${leaf(`url(#${p}leafg)`, s, '#f0ffd8')}
  <path d="M${-s * .25} ${-s * .55}C${-s * .1} ${-s * .2} ${-s * .12} ${s * .2} ${-s * .3} ${s * .5}" fill="none" stroke="#fff" stroke-width=".5" opacity=".7"/></g>`;

function cloakHood(p) {
  const cloak = 'M32 6.6c-6.4 0-10.6 5-10.8 11.4l-.2 4.4C16.8 28 13.4 37.6 11.4 54.6c6.4 1.8 13.4 2.2 20.6 1.2 7.2 1 14.2.6 20.6-1.2-2-17-5.4-26.6-9.6-32.2l-.2-4.4C42.6 11.6 38.4 6.6 32 6.6z';
  return `<defs>${cloakDefs(p)}<clipPath id="${p}c"><path d="${cloak}"/></clipPath></defs>
    <ellipse cx="32" cy="34" rx="21" ry="24" fill="#a8f08a" opacity=".22" filter="url(#${p}blur4)"/>
    <path d="${cloak}" fill="url(#${p}cl)"/>
    <g clip-path="url(#${p}c)">
      <path d="M26.4 13.4c1.4-2 3.4-3 5.6-3s4.2 1 5.6 3c1 2.8 1.2 6 .6 9.4-1.8 1.8-3.8 2.6-6.2 2.6s-4.4-.8-6.2-2.6c-.6-3.4-.4-6.6.6-9.4z" fill="#0e1510"/>
      <path d="M21 27c-2.4 8.4-4 17.6-4.4 28M27 30c-1 8.4-1.2 16.8-.8 26M37 30c1 8.4 1.2 16.8.8 26M43 27c2.4 8.4 4 17.6 4.4 28" fill="none" stroke="#1a261c" stroke-width="1.6" opacity=".55"/>
      <path d="M22.4 27.4c-2.2 8-3.6 16.6-4 26.2M28.4 30.4c-.8 8.2-.8 16.4-.4 25" fill="none" stroke="#e4f2dc" stroke-width=".7" opacity=".5"/>
      <path d="M11 55c6.4 1.4 13.6 1.8 21 .8 7.4 1 14.6.6 21-.8" fill="none" stroke="#e4f2dc" stroke-width="1.2" stroke-dasharray="1.4 1.6" opacity=".55"/>
      <rect x="5" y="5" width="54" height="54" fill="#fff" opacity=".06"/>
    </g>
    <path d="${cloak}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M23.2 15.6c.8-3.6 2.8-6 5.6-7.2" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".65"/>
    ${brooch(p, 32, 30.6, 5.6, -24)}
    ${sparkle(37, 26.6, 2.6)}${sparkle(14, 20, 1.6, .8)}${sparkle(49, 44, 1.4, .7)}`;
}

function cloakFolded(p) {
  let wreath = '';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, x = 32 + Math.cos(a) * 21.5, y = 33 + Math.sin(a) * 21.5;
    wreath += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f((a * 180) / Math.PI + 180)})">${leaf(`url(#${p}${i % 2 ? 'leafy' : 'leafg'})`, 3.2)}</g>`;
  }
  return `<defs>${cloakDefs(p)}
    <linearGradient id="${p}front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58735a"/><stop offset="1" stop-color="#22302a"/></linearGradient></defs>
    <circle cx="32" cy="33" r="17" fill="#b8f59a" opacity=".3" filter="url(#${p}blur4)"/>
    <circle cx="32" cy="33" r="21.5" fill="none" stroke="#5a3a1a" stroke-width="1.6"/>
    ${wreath}
    <path d="M13.6 34.6L32 26.6l18.4 8v8.6L32 51.2l-18.4-8z" fill="#0b0604" opacity=".5" transform="translate(0 2)" filter="url(#${p}blur1.4)"/>
    <path d="M13.6 33.4v8.4L32 49.8v-8.4z" fill="url(#${p}front)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M50.4 33.4v8.4L32 49.8v-8.4z" fill="#1f2c24" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M13.6 37.6L32 45.6M50.4 37.6L32 45.6" stroke="#0e1510" stroke-width="1" opacity=".7"/>
    <path d="M14.4 36.8L32 44.6" stroke="#c7dcc0" stroke-width=".5" opacity=".6"/>
    <path d="M13.6 33.4L32 25.4l18.4 8L32 41.4z" fill="url(#${p}cl)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M17 33.4L32 26.9l15 6.5L32 39.9z" fill="none" stroke="#e4f2dc" stroke-width=".7" stroke-dasharray="1.3 1.4" opacity=".6"/>
    <path d="M22 29.1l14.8 6.4M27 26.9l14.8 6.4" stroke="#2d3f30" stroke-width=".8" opacity=".5"/>
    ${brooch(p, 32, 31.6, 5.2, -60)}
    ${sparkle(37.6, 27, 2.6)}${sparkle(15.4, 22, 1.6, .85)}${sparkle(50, 47, 1.4, .7)}`;
}

function cloakBrooch(p) {
  const fold = 'M5 40c8-4 15-12 20-22 3-6 6-10 11-13h23v54H5z';
  return `<defs>${cloakDefs(p)}${gold(p)}
    <radialGradient id="${p}heal" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#d9ffb8" stop-opacity=".85"/><stop offset=".6" stop-color="#7fe06a" stop-opacity=".3"/><stop offset="1" stop-color="#7fe06a" stop-opacity="0"/></radialGradient></defs>
    <path d="${fold}" fill="url(#${p}cl)" opacity=".9"/>
    <path d="M5 40c8-4 15-12 20-22 3-6 6-10 11-13" fill="none" stroke="#e4f2dc" stroke-width="1" stroke-dasharray="1.4 1.6" opacity=".55"/>
    <path d="M36 5c-5 3-8 7-11 13-5 10-12 18-20 22" fill="none" stroke="${INK}" stroke-width="1"/>
    <path d="M30 40c6-6 12-10 29-12M40 52c4-5 10-8 19-9" fill="none" stroke="#1a261c" stroke-width="1.6" opacity=".45"/>
    <circle cx="32" cy="31" r="22" fill="url(#${p}heal)"/>
    <g transform="translate(32 31) rotate(-35)">
      <path d="M0 18v7" stroke="url(#${p}silver)" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M0 18v7" stroke="${INK}" stroke-width=".5" opacity=".6"/>
      <path d="M0 -19C11 -10 12.6 6 0 19C-12.6 6 -11 -10 0 -19z" fill="url(#${p}silver)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
      <path d="M0 -15.6C8.8 -8 10 5 0 15.6C-10 5 -8.8 -8 0 -15.6z" fill="url(#${p}leafg)" stroke="${INK}" stroke-width=".6"/>
      <path d="M0 -13V14M0 -6l5-4M0 -6l-5-4M0 1l6-4.6M0 1l-6-4.6M0 8l4.6-3.8M0 8l-4.6-3.8" fill="none" stroke="url(#${p}silver)" stroke-width="1"/>
      <path d="M-4 -11c-2.6 4-3.4 9-2.4 14" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".75"/>
    </g>
    <g transform="translate(13 50) rotate(-20)">${leaf(`url(#${p}leafg)`, 2.4)}</g>
    <g transform="translate(51 12) rotate(40)">${leaf(`url(#${p}leafy)`, 2.2)}</g>
    <g transform="translate(53 50) rotate(70)">${leaf(`url(#${p}leafg)`, 1.8)}</g>
    <path d="M17 18v4M15 20h4M48 30v3M46.5 31.5h3" stroke="#d9ffb8" stroke-width="1.1" stroke-linecap="round"/>
    ${sparkle(27, 17, 2.8)}${sparkle(43, 45, 1.6, .8)}`;
}

// ---- Elven Rope

/** Points on an ellipse arc from a0 to a1 (radians). */
const arc = (cx, cy, rx, ry, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });

function ropeCoil(p) {
  // A coil on its side: loops stacked, each with its back half behind.
  const loops = [44, 38.5, 33, 27.5];
  let back = '', front = '';
  for (const y of loops) {
    back += rope(p, smooth(arc(32, y, 18, 6.6, Math.PI, 2 * Math.PI, 10)), 4);
    front += rope(p, smooth(arc(32, y, 18, 6.6, 0, Math.PI, 10)), 4);
  }
  // Back halves first (lowest first), then fronts top-down so lower loops overlap upper ones.
  const tail = smooth([[50, 27.5], [53, 21], [50.6, 14], [44, 11.4], [38, 13.6]]);
  return `<defs>${ropeDefs(p)}${blur(p, 1.4)}${blur(p, 4)}</defs>
    <ellipse cx="32" cy="36" rx="23" ry="17" fill="#e6eef8" opacity=".25" filter="url(#${p}blur4)"/>
    <ellipse cx="32" cy="51.4" rx="19" ry="4" fill="#000" opacity=".45" filter="url(#${p}blur1.4)"/>
    ${back}${front.split('</path>').length ? '' : ''}${[...loops].reverse().map((y) => rope(p, smooth(arc(32, y, 18, 6.6, 0, Math.PI, 10)), 4)).join('')}
    ${rope(p, tail, 3.8)}
    <path d="M38 13.6l-2.4 1.4M37.6 12.2l-2.6.6M38.4 15l-2 2" stroke="#e8edf2" stroke-width=".9" stroke-linecap="round"/>
    ${sparkle(46, 30, 2.6)}${sparkle(20, 20, 2, .85)}${sparkle(36.6, 13, 1.8, .9)}${sparkle(54, 46, 1.4, .7)}`;
}

function ropeKnot(p) {
  // A trefoil knot with crossings drawn over and under.
  const N = 180, s = 6.8, pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    pts.push([32 + s * (Math.sin(t) + 2 * Math.sin(2 * t)), 33 + s * (Math.cos(t) - 2 * Math.cos(2 * t)) * .92]);
  }
  const crossings = [];
  for (let i = 0; i < N; i++) for (let j = i + 12; j < N; j++) {
    if (N - (j - i) < 12) continue;
    const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
    if (dx * dx + dy * dy < .5) crossings.push([i, j]);
  }
  // Keep one pair per crossing: the closest of each cluster.
  const unique = [];
  for (const c of crossings) if (!unique.some((u) => Math.abs(u[0] - c[0]) < 8 && Math.abs(u[1] - c[1]) < 8)) unique.push(c);
  // Walking along the knot, crossings alternate over and under.
  const hits = unique.flatMap(([i, j], k) => [[i, k], [j, k]]).sort((a, b) => a[0] - b[0]);
  const over = hits.filter((_, n) => n % 2 === 0).map(([i]) => i);
  const seg = (c) => smooth(Array.from({ length: 13 }, (_, k) => pts[(c - 6 + k + N) % N]));
  const full = smooth(pts.filter((_, i) => i % 6 === 0), true);
  return `<defs>${ropeDefs(p)}${blur(p, 1.4)}${blur(p, 5)}</defs>
    <circle cx="32" cy="33" r="20" fill="#e6eef8" opacity=".3" filter="url(#${p}blur5)"/>
    ${rope(p, full, 4.2)}
    ${over.map((c) => rope(p, seg(c), 4.2)).join('')}
    ${sparkle(32, 33, 4)}${sparkle(48, 14, 2.2, .9)}${sparkle(14, 50, 1.6, .8)}${sparkle(51, 47, 1.4, .7)}`;
}

function ropeLasso(p) {
  // A loop thrown wide, its end trailing up, with stun stars where it binds.
  const loop = smooth(arc(32, 40, 20, 11, -Math.PI * .1, Math.PI * 1.85, 16));
  const tail = smooth([[50.6, 36.2], [47, 30], [44, 24], [45.6, 16.4], [52, 11.6], [55.4, 8]]);
  const back = smooth(arc(32, 40, 20, 11, Math.PI * 1.05, Math.PI * 1.95, 8));
  return `<defs>${ropeDefs(p)}${blur(p, 1.4)}${blur(p, 4)}${gem(p, 'y', '#ffd84a')}
    <linearGradient id="${p}leafg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7f5a0"/><stop offset=".45" stop-color="#5fbf47"/><stop offset="1" stop-color="#1d5a24"/></linearGradient></defs>
    <ellipse cx="32" cy="40" rx="24" ry="15" fill="#e6eef8" opacity=".25" filter="url(#${p}blur4)"/>
    ${rope(p, back, 4.4)}
    ${rope(p, tail, 3.8)}
    ${rope(p, loop, 4.4)}
    <g transform="translate(50.4 36.6) rotate(-30)"><rect x="-3.4" y="-2.6" width="6.8" height="5.2" rx="1.4" fill="url(#${p}rope)" stroke="${INK}" stroke-width=".9"/><path d="M-3.4 -.8h6.8M-3.4 1h6.8" stroke="#5f6a78" stroke-width=".6"/></g>
    <g transform="translate(55 8) rotate(30)">${leaf(`url(#${p}leafg)`, 2.6)}</g>
    <path d="${star(18, 21, 5, 3.2, 1.4)}" fill="url(#${p}gem-y)" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/>
    <path d="${star(28, 15, 5, 2.6, 1.1)}" fill="url(#${p}gem-y)" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/>
    <path d="${star(37, 21.5, 5, 2.2, .95)}" fill="url(#${p}gem-y)" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/>
    <ellipse cx="28" cy="20" rx="13" ry="4" fill="none" stroke="#fff3b0" stroke-width=".7" stroke-dasharray="2 2" opacity=".75"/>
    ${sparkle(16, 46, 2.2, .9)}${sparkle(44, 49, 1.6, .8)}`;
}

// ---- Phial of Galadriel

function phialAura(p) {
  // A tall slender phial inside a ring of light.
  const body = 'M30.2 17.6h3.6v4.6c3.4 2.4 5.6 7 5.6 13.2 0 8.4-3.2 14.6-7.4 14.6s-7.4-6.2-7.4-14.6c0-6.2 2.2-10.8 5.6-13.2z';
  return `<defs>${silver(p)}${blur(p, 1.4)}${blur(p, 4)}
    <radialGradient id="${p}glass" cx=".45" cy=".55" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#fff7d6"/><stop offset=".75" stop-color="#bfe2ff" stop-opacity=".85"/><stop offset="1" stop-color="#5d8fc9" stop-opacity=".9"/></radialGradient>
    <radialGradient id="${p}core" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fffbe0"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="36" r="18" fill="url(#${p}core)" opacity=".6"/>
    <ellipse cx="32" cy="45" rx="23" ry="7.4" fill="none" stroke="#bfe0ff" stroke-width="3.4" opacity=".35" filter="url(#${p}blur1.4)"/>
    <path d="M9 45a23 7.4 0 0 1 46 0" fill="none" stroke="#e8f4ff" stroke-width="1.2" stroke-dasharray="2.6 1.8" opacity=".55"/>
    <path d="${body}" fill="url(#${p}glass)" stroke="${INK}" stroke-width="1"/>
    <circle cx="32" cy="38" r="5.4" fill="#fff" filter="url(#${p}blur4)"/>
    ${sparkle(32, 38, 6.2)}
    <path d="M27.4 30c.4-2.6 1.4-4.6 3-6" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".9"/>
    <path d="M26.8 37c0 3 .6 6 1.6 8.2" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".7"/>
    <path d="M29.2 13.4h5.6l-.6 4.4h-4.4z" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M29.6 15h4.8M29.8 16.4h4.4" stroke="#4b5363" stroke-width=".45"/>
    <path d="M30.4 11.6c0-1.4.7-2.4 1.6-2.4s1.6 1 1.6 2.4v1.8h-3.2z" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".8"/>
    <path d="M28 22.6c2.6 1 5.4 1 8 0" fill="none" stroke="url(#${p}silver)" stroke-width="1.8"/>
    <path d="M55 45a23 7.4 0 0 1-46 0" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".85"/>
    <path d="M55 45a23 7.4 0 0 1-46 0" fill="none" stroke="#bfe0ff" stroke-width="4" opacity=".35" filter="url(#${p}blur1.4)"/>
    ${sparkle(11, 45.4, 2, .9)}${sparkle(53.4, 44.6, 2.4)}${sparkle(48, 17, 2, .85)}${sparkle(15, 22, 1.4, .7)}`;
}

function phialStar(p) {
  // Eärendil's light caught in a teardrop crystal on a silver chain.
  const drop = 'M32 20.4c4.6 5 9.6 10.6 9.6 17.2a9.6 9.6 0 0 1-19.2 0c0-6.6 5-12.2 9.6-17.2z';
  let chain = '';
  for (let i = 0; i < 6; i++) { const t = i / 5, x = 32 + Math.sin(t * Math.PI) * 0, y = 6 + t * 12; chain += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${i % 2 ? .9 : 1.5}" ry="${i % 2 ? 1.5 : 1}" fill="none" stroke="url(#${p}silver)" stroke-width=".9"/>`; }
  return `<defs>${silver(p)}${blur(p, 1.4)}${blur(p, 3)}${blur(p, 6)}
    <radialGradient id="${p}cr" cx=".42" cy=".6" r=".65"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#fff8dc"/><stop offset=".7" stop-color="#cfe6ff" stop-opacity=".85"/><stop offset="1" stop-color="#6a8fd0" stop-opacity=".9"/></radialGradient></defs>
    ${rays(32, 38, 20, 30, 20, 1.4, '#fff6c8', .5)}
    <circle cx="32" cy="38" r="16" fill="#fff6c8" opacity=".55" filter="url(#${p}blur6)"/>
    <circle cx="32" cy="38" r="20" fill="none" stroke="#fff6c8" stroke-width=".6" opacity=".45"/>
    <circle cx="32" cy="38" r="24" fill="none" stroke="#fff6c8" stroke-width=".5" opacity=".3"/>
    ${chain}
    <path d="M29.6 18.4h4.8l1 3.2h-6.8z" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="${drop}" fill="url(#${p}cr)" stroke="${INK}" stroke-width="1"/>
    <path d="M32 21.6l-5 8.6 5 15.6 5-15.6zM27 30.2l-3.6 7.4M37 30.2l3.6 7.4M32 45.8l-7.6-4.4M32 45.8l7.6-4.4" fill="none" stroke="#ffffff" stroke-width=".5" opacity=".6"/>
    <circle cx="32" cy="38" r="5" fill="#fff" filter="url(#${p}blur3)"/>
    <path d="${star(32, 38, 8, 7.4, 2)}" fill="#fff"/>
    ${sparkle(32, 38, 9)}
    <path d="M25.4 34c.6-2.8 2-5.4 4-7.6" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".85"/>
    ${sparkle(14, 16, 2, .9)}${sparkle(51, 22, 2.2, .9)}${sparkle(47, 54, 1.5, .75)}${sparkle(14, 50, 1.3, .7)}`;
}

export default [
  { id: 'mithril-shirt', name: 'Mithril Shirt', kind: 'combined', recipe: ['mail', 'cloak'], variants: [
    { title: 'Gold-collared shirt', draw: mithril },
    { title: 'Arrows glance off', draw: mithrilArrow },
    { title: 'Under a silver moon', draw: mithrilMoon },
  ] },
  { id: 'dragon-helm', name: 'Dragon-helm', kind: 'combined', recipe: ['mail', 'lembas'], variants: [
    { title: 'Crested helm over flame', draw: helmFront, bg: ['#7a2a10', '#3a4a3a'] },
    { title: 'Dragon crest breathing fire', draw: helmProfile, bg: ['#5a2412', '#2f4636'] },
    { title: 'Dragon-winged helm', draw: helmWings, bg: ['#6e2410', '#334a38'] },
  ] },
  { id: 'star-of-elendil', name: 'Star of Elendil', kind: 'combined', recipe: ['mail', 'staff'], variants: [
    { title: 'Star on a silver fillet', draw: starFillet },
    { title: 'Star in a ward of light', draw: starWard },
    { title: 'Star on a shield', draw: starShield },
  ] },
  { id: 'elven-cloak', name: 'Elven Cloak', kind: 'combined', recipe: ['cloak', 'cloak'], variants: [
    { title: 'Hooded Lórien cloak', draw: cloakHood, bg: ['#3e5a3c', '#3b1f5c'] },
    { title: 'Folded in a mallorn wreath', draw: cloakFolded, bg: ['#3e5a3c', '#3b1f5c'] },
    { title: 'The leaf brooch', draw: cloakBrooch, bg: ['#2f5a34', '#3b1f5c'] },
  ] },
  { id: 'elven-rope', name: 'Elven Rope', kind: 'combined', recipe: ['cloak', 'lembas'], variants: [
    { title: 'Coil of hithlain', draw: ropeCoil },
    { title: 'Endless knot', draw: ropeKnot },
    { title: 'Binding lasso', draw: ropeLasso },
  ] },
  { id: 'phial', name: 'Phial of Galadriel', kind: 'combined', recipe: ['cloak', 'staff'], variants: [
    { title: 'Starlight phial', draw: phial },
    { title: 'Phial in a ring of light', draw: phialAura },
    { title: 'Eärendil’s star', draw: phialStar },
  ] },
];
