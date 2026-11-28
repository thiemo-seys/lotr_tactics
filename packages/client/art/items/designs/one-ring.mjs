// The One Ring's chip: three designs, each drawn at the four Corruption tiers.
import { INK, blur, grain, mix, sparkle } from '../kit.mjs';

export const TIERS = { gift: '#f3d27a', burden: '#f2a14a', grip: '#f06a4c', betrayal: '#e0457a' };
const HEAT = { gift: 0, burden: 1, grip: 2, betrayal: 3 };

/** A dark iron frame whose rim and glow take the tier's colour; hotter tiers burn brighter. */
export function frame(p, tier, inner) {
  const t = TIERS[tier], h = HEAT[tier];
  return `<defs>${grain(p)}${blur(p, 2)}
    <linearGradient id="${p}iron" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b5a4a"/><stop offset=".35" stop-color="#2a1f17"/><stop offset=".6" stop-color="#0e0906"/><stop offset="1" stop-color="#3b2c20"/></linearGradient>
    <radialGradient id="${p}bg" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="${mix(t, '#000000', .55 - h * .06)}"/><stop offset=".55" stop-color="${mix(t, '#000000', .86)}"/><stop offset="1" stop-color="#030102"/></radialGradient>
    <radialGradient id="${p}vig" cx=".5" cy=".5" r=".55"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></radialGradient>
    <clipPath id="${p}clip"><circle cx="32" cy="32" r="26.4"/></clipPath></defs>
    <circle cx="32" cy="32" r="30.4" fill="none" stroke="${t}" stroke-width="${1.4 + h * .5}" opacity="${.35 + h * .12}" filter="url(#${p}blur2)"/>
    <circle cx="32" cy="32" r="30.6" fill="#070403"/>
    <circle cx="32" cy="32" r="29.6" fill="url(#${p}iron)"/>
    <circle cx="32" cy="32" r="29.6" fill="none" stroke="${t}" stroke-width=".9" opacity=".85"/>
    <circle cx="32" cy="32" r="28" fill="none" stroke="${mix(t, '#000000', .3)}" stroke-width=".5" stroke-dasharray=".8 1.6" opacity=".8"/>
    <circle cx="32" cy="32" r="26.8" fill="#050302"/>
    <g clip-path="url(#${p}clip)">
      <rect x="5" y="5" width="54" height="54" fill="url(#${p}bg)"/>
      <rect x="5" y="5" width="54" height="54" fill="#fff" filter="url(#${p}grain)" opacity=".6"/>
      ${inner}
      <rect x="5" y="5" width="54" height="54" fill="url(#${p}vig)"/>
    </g>
    <circle cx="32" cy="32" r="26.4" fill="none" stroke="#000" stroke-width="1.1"/>
    <circle cx="32" cy="32" r="25.6" fill="none" stroke="${t}" stroke-width=".4" opacity=".4"/>`;
}

/** Fiery letters along an arc of an ellipse, made of small strokes like a script. */
function letters(cx, cy, rx, ry, from, to, n, colour, w) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = from + (to - from) * (i + .5) / n;
    const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    const k = (i * 7) % 5 % 4, s = .9;
    const g = [
      `M${x - s * .6} ${y + s}v${-s * 2}c${s} 0 ${s * 1.3} ${s * .8} ${s * .2} ${s * 1.1}`,
      `M${x - s * .7} ${y - s * .2}c0 ${s} ${s * 1.4} ${s} ${s * 1.4} 0v${-s * .9}`,
      `M${x + s * .5} ${y - s}c${-s * 1.3} 0 ${-s * 1.3} ${s * 2} 0 ${s * 2}M${x - s * .2} ${y - s * 1.5}v.01`,
      `M${x - s * .6} ${y - s}l${s * .6} ${s * 2} ${s * .6} ${-s * 2}`,
    ][k];
    d += g;
  }
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const EMBERS = [[14, 40, 1], [50, 44, 1.2], [20, 18, .8], [44, 14, .9], [11, 28, .7], [54, 26, .8], [26, 52, .9], [40, 54, .7], [30, 10, .6], [57, 36, .6]];
/** Fire round the band: embers from Burden, flames from Grip, black smoke at Betrayal. */
function heat(p, h, cx, cy, rx, front) {
  if (h === 0) return '';
  if (front) return EMBERS.slice(0, h * 3 + 1).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r * 1.1}" fill="#ffb347" opacity=".95"/><circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="#ff6a1a" opacity=".35" filter="url(#${p}blur1.2)"/>`).join('');
  let out = `<defs><linearGradient id="${p}flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd25a"/><stop offset=".4" stop-color="#ff6a1a"/><stop offset="1" stop-color="#b3150a" stop-opacity="0"/></linearGradient></defs>`;
  if (h >= 3) out += `<g fill="#000" opacity=".75" filter="url(#${p}blur2)"><path d="M${cx - 16} ${cy}c-4-8 2-12-1-20 4 5 8 9 5 20zM${cx + 14} ${cy - 2}c5-7-1-13 3-21-6 5-9 11-3 21zM${cx - 3} ${cy - 6}c-2-8 4-12 2-19 3 6 5 12-2 19z"/></g>`;
  if (h >= 2) {
    const tall = h >= 3 ? 1.35 : 1;
    const f = (x, w, t) => `M${x - w} ${cy + 2}c0-${6 * t} ${w * .6}-${8 * t} ${w * .2}-${15 * t}c${w * 1.4} ${4 * t} ${w * 1.8} ${9 * t} ${w * 1.8} ${15 * t}z`;
    out += `<path d="${f(cx - rx * .75, 3.2, tall)}${f(cx - rx * .3, 4, tall * 1.2)}${f(cx + rx * .15, 3.6, tall * 1.1)}${f(cx + rx * .6, 3, tall)}" fill="url(#${p}flame)" filter="url(#${p}blur1.2)" opacity=".95"/>`;
  }
  return out;
}

/** The band at an angle: its top face, the inner wall behind, the outer wall in front, with the script. */
function band(p, cx, cy, rx, ry, th, heat_, tierColour) {
  const irx = rx * .72, iry = ry * .6;
  const fire = heat_ >= 2 ? '#ff3b1f' : '#ff7a2a';
  return `<defs>
      <linearGradient id="${p}bandTop" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#f3c650"/><stop offset=".7" stop-color="#b07a16"/><stop offset="1" stop-color="#6a440a"/></linearGradient>
      <linearGradient id="${p}bandSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4f0c"/><stop offset=".22" stop-color="#e9b947"/><stop offset=".4" stop-color="#fff0b0"/><stop offset=".62" stop-color="#c7901f"/><stop offset="1" stop-color="#5a3807"/></linearGradient>
      <linearGradient id="${p}inner" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2f08"/><stop offset="1" stop-color="#d9a640"/></linearGradient>
      ${blur(p, 1.2)}</defs>
    ${heat(p, heat_, cx, cy, rx, false)}
    <ellipse cx="${cx}" cy="${cy + th * .6}" rx="${rx + 2}" ry="${ry + 2}" fill="${tierColour}" opacity="${.25 + heat_ * .08}" filter="url(#${p}blur2)"/>
    <path d="M${cx - rx} ${cy}a${rx} ${ry} 0 0 0 ${rx * 2} 0v${th}a${rx} ${ry} 0 0 1 ${-rx * 2} 0z" fill="url(#${p}bandSide)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path fill-rule="evenodd" d="M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0zM${cx - irx} ${cy}a${irx} ${iry} 0 1 0 ${irx * 2} 0a${irx} ${iry} 0 1 0 ${-irx * 2} 0z" fill="url(#${p}bandTop)" stroke="${INK}" stroke-width=".9"/>
    <path d="M${cx - irx} ${cy}a${irx} ${iry} 0 0 1 ${irx * 2} 0v${th * .7}a${irx} ${iry} 0 0 0 ${-irx * 2} 0z" fill="url(#${p}inner)" opacity=".9"/>
    <path d="M${cx - irx} ${cy}a${irx} ${iry} 0 0 0 ${irx * 2} 0" fill="none" stroke="${INK}" stroke-width=".6" opacity=".7"/>
    <g opacity="${.75 + heat_ * .08}">
      ${letters(cx, cy + th * .55, rx * .98, ry * 1.02, Math.PI * .12, Math.PI * .88, 15, fire, 1.9).replace('/>', ` filter="url(#${p}blur1.2)"/>`)}
      ${letters(cx, cy + th * .55, rx * .98, ry * 1.02, Math.PI * .12, Math.PI * .88, 15, '#ffe2a0', .55)}
    </g>
    <path d="M${cx - rx * .8} ${cy - ry * .45}a${rx} ${ry} 0 0 1 ${rx * .7} ${-ry * .52}" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".9"/>
    ${heat(p, heat_, cx, cy, rx, true)}`;
}

const designs = [
  {
    title: 'Fiery letters',
    draw: (p, tier) => band(p, 32, 30, 19, 10.5, 5.4, HEAT[tier], TIERS[tier]) + sparkle(46, 22, 3.4) ,
  },
  {
    title: 'Under the Eye',
    draw: (p, tier) => {
      const h = HEAT[tier];
      return `<defs><radialGradient id="${p}eye" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2a8"/><stop offset=".3" stop-color="#ff9a2a"/><stop offset=".7" stop-color="#c2290e"/><stop offset="1" stop-color="#3a0602" stop-opacity="0"/></radialGradient>${blur(p, 2.5)}</defs>
        <g opacity="${.5 + h * .16}"><ellipse cx="32" cy="20" rx="${17 + h}" ry="${7.5 + h * .4}" fill="url(#${p}eye)" filter="url(#${p}blur2.5)"/>
        <ellipse cx="32" cy="20" rx="14" ry="5.6" fill="url(#${p}eye)"/>
        <path d="M32 14.6c1.3 1.6 1.8 3.5 1.8 5.4s-.5 3.8-1.8 5.4c-1.3-1.6-1.8-3.5-1.8-5.4s.5-3.8 1.8-5.4z" fill="#0a0201"/></g>
        ${band(p, 32, 38, 17, 9, 4.8, h, TIERS[tier])}`;
    },
  },
  {
    title: 'On its chain',
    draw: (p, tier) => {
      const h = HEAT[tier];
      let links = '';
      for (let i = 0; i < 9; i++) {
        const t = i / 8, x = 12 + t * 13, y = 8 + t * t * 14 + t * 6;
        const x2 = 52 - t * 13;
        links += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="1.7" ry="1.05" transform="rotate(${50 - t * 30} ${x.toFixed(1)} ${y.toFixed(1)})"/><ellipse cx="${x2.toFixed(1)}" cy="${y.toFixed(1)}" rx="1.7" ry="1.05" transform="rotate(${-50 + t * 30} ${x2.toFixed(1)} ${y.toFixed(1)})"/>`;
      }
      return `<defs><linearGradient id="${p}chain" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#b8c0cc"/><stop offset="1" stop-color="#5b6577"/></linearGradient></defs>
        <g fill="none" stroke="#0a0604" stroke-width="1.6">${links}</g><g fill="none" stroke="url(#${p}chain)" stroke-width=".8">${links}</g>
        <path d="M27 28.6c1.6-1.8 8.4-1.8 10 0" fill="none" stroke="url(#${p}chain)" stroke-width="1.4"/>
        ${band(p, 32, 37, 18, 10, 5.2, h, TIERS[tier])}${sparkle(48, 32, 3)}`;
    },
  },
];

export default designs;
