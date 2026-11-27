// Shared kit for the detailed item icons: a 64-unit grid, frames, metals, glows and sparkles.
// Every id a drawing defines must start with its prefix `p`, so many icons can share a page.

export const INK = '#120904';
export const COL = { blade: '#dc2626', bow: '#d97706', mail: '#64748b', cloak: '#9333ea', lembas: '#16a34a', staff: '#2563eb' };

/** Mixes two #rrggbb colours: t = 0 gives `hex`, 1 gives `other`. */
export const mix = (hex, other, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(other);
  return '#' + a.map((v, i) => Math.round(v * (1 - t) + b[i] * t).toString(16).padStart(2, '0')).join('');
};

// Filters and gradients: call inside a drawing's own <defs>, with its prefix.
export const blur = (p, s) => `<filter id="${p}blur${s}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${s}"/></filter>`;
export const grain = (p) => `<filter id="${p}grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .22"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter>`;
/** url(#${p}gold): bright gold, lit from top left. url(#${p}goldside): gold across a curved band. */
export const gold = (p) => `<linearGradient id="${p}gold" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#fff4c4"/><stop offset=".28" stop-color="#f2cd6a"/><stop offset=".6" stop-color="#b8841f"/><stop offset=".8" stop-color="#e6bb55"/><stop offset="1" stop-color="#6e4a0e"/></linearGradient>
  <linearGradient id="${p}goldside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a3"/><stop offset=".45" stop-color="#d9a640"/><stop offset=".55" stop-color="#8a5f14"/><stop offset="1" stop-color="#c99633"/></linearGradient>`;
/** url(#${p}silver): polished silver across its width. */
export const silver = (p) => `<linearGradient id="${p}silver" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d8798"/><stop offset=".3" stop-color="#ffffff"/><stop offset=".55" stop-color="#b9c3d1"/><stop offset=".8" stop-color="#5b6577"/><stop offset="1" stop-color="#9aa5b6"/></linearGradient>`;
/** url(#${p}steelL) / url(#${p}steelR): the lit and shadowed halves of a blade. */
export const steel = (p) => `<linearGradient id="${p}steelL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c3cbd6"/></linearGradient>
  <linearGradient id="${p}steelR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa5b4"/><stop offset="1" stop-color="#4d5869"/></linearGradient>`;
/** url(#${p}wood): turned wood across its width. url(#${p}leather): a leather wrap. */
export const wood = (p) => `<linearGradient id="${p}wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c58a52"/><stop offset=".35" stop-color="#8a5228"/><stop offset="1" stop-color="#3d200c"/></linearGradient>
  <linearGradient id="${p}leather" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4426"/><stop offset=".4" stop-color="#4b2412"/><stop offset="1" stop-color="#1d0c05"/></linearGradient>`;
/** url(#${p}gem-<name>): a round-lit gem in a colour. */
export const gem = (p, name, colour) => `<radialGradient id="${p}gem-${name}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="${mix(colour, '#ffffff', .35)}"/><stop offset=".65" stop-color="${colour}"/><stop offset="1" stop-color="${mix(colour, '#000000', .7)}"/></radialGradient>`;

/** A four-pointed glint. */
export const sparkle = (x, y, r, o = 1) => `<g opacity="${o}"><path d="M${x} ${y - r}Q${x + r * .12} ${y - r * .12} ${x + r} ${y}Q${x + r * .12} ${y + r * .12} ${x} ${y + r}Q${x - r * .12} ${y + r * .12} ${x - r} ${y}Q${x - r * .12} ${y - r * .12} ${x} ${y - r}z" fill="#fff"/><circle cx="${x}" cy="${y}" r="${r * .28}" fill="#fff"/></g>`;

/** Rays from a point: n rays, alternating long and short. */
export const rays = (cx, cy, n, long, short, w, fill, opacity) => {
  let d = '';
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + .1, len = i % 2 === 0 ? long : short, ww = i % 2 === 0 ? w : w * .6;
    const x2 = cx + Math.cos(ang) * len, y2 = cy + Math.sin(ang) * len, nx = -Math.sin(ang) * ww, ny = Math.cos(ang) * ww;
    d += `M${(cx + nx).toFixed(2)} ${(cy + ny).toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}L${(cx - nx).toFixed(2)} ${(cy - ny).toFixed(2)}z`;
  }
  return `<path d="${d}" fill="${fill}" opacity="${opacity}"/>`;
};

/**
 * The frame round a drawing: a part in bronze with rivets, a finished item in gold with filigree corners
 * and gems in its second colour, a Ring of Power round in gold with four gems. `a` and `b` tint the
 * background (a in the light at the top left, b further out). The drawing sits on the 64 grid; the
 * well is x, y 5 to 59 (round: radius 26 about 32, 32).
 */
export function frame(p, kind, a, b, inner) {
  const rimStops = kind === 'component'
    ? ['#e3b48a', '#9a6238', '#4a2c16', '#a87148', '#3a2210']
    : ['#fff0b5', '#d9a441', '#7a5212', '#e9be5c', '#5e3d0b'];
  const defs = `<defs><linearGradient id="${p}rim" x1="0" y1="0" x2="1" y2="1">${rimStops.map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join('')}</linearGradient>
    <radialGradient id="${p}bg" cx=".42" cy=".36" r=".78"><stop offset="0" stop-color="${a}" stop-opacity=".95"/><stop offset=".55" stop-color="${b}" stop-opacity=".55"/><stop offset="1" stop-color="#07040a"/></radialGradient>
    <radialGradient id="${p}vig" cx=".5" cy=".5" r=".72"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></radialGradient>
    <radialGradient id="${p}fgem" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${mix(b, '#ffffff', .25)}"/><stop offset="1" stop-color="#05030a"/></radialGradient>
    ${grain(p)}
    <clipPath id="${p}clip">${kind === 'ring' ? '<circle cx="32" cy="32" r="26.4"/>' : '<rect x="5" y="5" width="54" height="54" rx="6"/>'}</clipPath></defs>`;
  const well = `<g clip-path="url(#${p}clip)">
      <rect x="5" y="5" width="54" height="54" fill="url(#${p}bg)"/>
      <rect x="5" y="5" width="54" height="54" fill="#fff" filter="url(#${p}grain)"/>
      ${inner}
      <rect x="5" y="5" width="54" height="54" fill="url(#${p}vig)"/>
      <path d="M5 5h54v14C40 14 22 15 5 24z" fill="#fff" opacity=".07"/>
    </g>`;
  if (kind === 'ring') {
    const g = (x, y) => `<circle cx="${x}" cy="${y}" r="2.6" fill="url(#${p}fgem)" stroke="#2a1804" stroke-width=".7"/><circle cx="${x - .8}" cy="${y - .8}" r=".7" fill="#fff" opacity=".9"/>`;
    return `${defs}<circle cx="32" cy="32" r="31" fill="#120a04"/>
      <circle cx="32" cy="32" r="29.8" fill="url(#${p}rim)"/>
      <circle cx="32" cy="32" r="29.8" fill="none" stroke="rgba(255,240,200,.55)" stroke-width=".7"/>
      <circle cx="32" cy="32" r="28.2" fill="none" stroke="#5e3d0b" stroke-width=".5" stroke-dasharray="1.2 2.2"/>
      <circle cx="32" cy="32" r="26.8" fill="#0b0604"/>${well}
      <circle cx="32" cy="32" r="26.4" fill="none" stroke="rgba(0,0,0,.8)" stroke-width="1.1"/>
      ${g(32, 3.2)}${g(60.8, 32)}${g(32, 60.8)}${g(3.2, 32)}`;
  }
  const corner = kind === 'combined'
    ? (t) => `<g transform="${t}"><path d="M3.5 15C3.5 8 8 3.5 15 3.5" fill="none" stroke="url(#${p}rim)" stroke-width="2.6"/><path d="M7 7c3.2-.6 5.6.6 6.6 3.2-2.4-.8-4.4-.6-5.6 1.2C7.2 9.8 6.8 8.4 7 7z" fill="url(#${p}rim)" stroke="#2a1804" stroke-width=".6"/><circle cx="6.2" cy="6.2" r="2.4" fill="url(#${p}fgem)" stroke="#2a1804" stroke-width=".7"/><circle cx="5.5" cy="5.4" r=".7" fill="#fff" opacity=".9"/></g>`
    : (t) => `<g transform="${t}"><circle cx="6.6" cy="6.6" r="1.9" fill="url(#${p}rim)" stroke="#1a0e05" stroke-width=".6"/><circle cx="6.1" cy="6.1" r=".55" fill="#fff" opacity=".5"/></g>`;
  return `${defs}
    <rect x="1.2" y="1.2" width="61.6" height="61.6" rx="10" fill="#120a04"/>
    <rect x="2.4" y="2.4" width="59.2" height="59.2" rx="9" fill="url(#${p}rim)"/>
    <rect x="2.4" y="2.4" width="59.2" height="59.2" rx="9" fill="none" stroke="rgba(255,240,200,.55)" stroke-width=".7"/>
    <rect x="4.6" y="4.6" width="54.8" height="54.8" rx="6.6" fill="#0b0604"/>
    ${well}
    <rect x="5" y="5" width="54" height="54" rx="6" fill="none" stroke="rgba(0,0,0,.8)" stroke-width="1.1"/>
    <rect x="5.8" y="5.8" width="52.4" height="52.4" rx="5.4" fill="none" stroke="rgba(255,230,170,.18)" stroke-width=".6"/>
    ${corner('')}${corner('translate(64 0) scale(-1 1)')}${corner('translate(0 64) scale(1 -1)')}${corner('translate(64 64) scale(-1 -1)')}`;
}

/** The background colours an item's frame gets by default: from its recipe, or its own for rings. */
export function background(item, variant) {
  if (variant.bg) return variant.bg;
  if (item.bg) return item.bg;
  const [r0, r1] = item.recipe;
  return [mix(COL[r0], '#000000', .4), mix(COL[r1], '#000000', .5)];
}

let counter = 0;
/** One icon as an SVG of `px` pixels. */
export function render(item, variant, px) {
  const p = `${item.id}-${counter++}-`;
  const [a, b] = background(item, variant);
  return `<svg width="${px}" height="${px}" viewBox="0 0 64 64" class="ic">${frame(p, item.kind, a, b, variant.draw(p))}</svg>`;
}
