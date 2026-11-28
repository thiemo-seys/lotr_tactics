// The four drawings from the approved style test, as examples and as one variant each of their items.
import { INK, blur, gold, sparkle } from '../kit.mjs';

export function anduril(p) {
  const defs = `<defs>${gold(p)}${blur(p, 2.2)}${blur(p, 5)}
    <linearGradient id="${p}bl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e4f2ff"/><stop offset="1" stop-color="#b6d6f5"/></linearGradient>
    <linearGradient id="${p}br" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fb4d8"/><stop offset=".5" stop-color="#5d86b3"/><stop offset="1" stop-color="#2f4f78"/></linearGradient>
    <linearGradient id="${p}grip" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4426"/><stop offset=".4" stop-color="#4b2412"/><stop offset="1" stop-color="#1d0c05"/></linearGradient>
    <radialGradient id="${p}ruby" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#9fe0ff"/><stop offset="1" stop-color="#0d3c75"/></radialGradient></defs>`;
  const runes = 'M31.4 14.5l1.2 1.4-1.2 1.4M32.6 19.2h-1.2l1.2 1.8h-1.2M31.4 23.6l1.2.8-1.2.8 1.2.8M32 28.2v2.2M31.2 29.3h1.6M32.6 33.2l-1.2 1.2 1.2 1.2';
  const sword = `<g transform="rotate(45 32 32)">
    <path d="M32 1.8L36.2 9.6V41H27.8V9.6z" fill="#cfeaff" opacity=".85" filter="url(#${p}blur2.2)"/>
    <path d="M32 2.2L36 9.8V41H32z" fill="url(#${p}br)"/>
    <path d="M32 2.2L28 9.8V41H32z" fill="url(#${p}bl)"/>
    <path d="M32 2.2L36 9.8V41H28V9.8z" fill="none" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M30.6 12.2h2.8V39h-2.8z" fill="#244a75" opacity=".55"/>
    <path d="${runes}" fill="none" stroke="#e6f6ff" stroke-width=".7" stroke-linecap="round"/>
    <path d="${runes}" fill="none" stroke="#7fd1ff" stroke-width="1.8" stroke-linecap="round" opacity=".5" filter="url(#${p}blur2.2)"/>
    <path d="M28.9 10.4L32 3.6" stroke="#fff" stroke-width=".6" opacity=".9"/>
    <path d="M28.7 11V39.5" stroke="#fff" stroke-width=".5" opacity=".7"/>
    <path d="M22.5 39.2c3 2.4 6.4 2.6 9.5 1.6 3.1 1 6.5.8 9.5-1.6l1.6-2.4.4 3.8c-.9 2-2.4 3.4-4.6 4.2-2.6.9-5 .7-6.9-.2-1.9.9-4.3 1.1-6.9.2-2.2-.8-3.7-2.2-4.6-4.2l.4-3.8z" fill="url(#${p}goldside)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M22.4 40.4c2.6 1.8 5.8 2.4 9.6 1.4 3.8 1 7 .4 9.6-1.4" fill="none" stroke="#fff6d0" stroke-width=".6" opacity=".8"/>
    <circle cx="32" cy="42.4" r="2.5" fill="url(#${p}ruby)" stroke="${INK}" stroke-width=".8"/>
    <circle cx="31.2" cy="41.6" r=".7" fill="#fff"/>
    <rect x="29.6" y="45.2" width="4.8" height="11" rx="1.2" fill="url(#${p}grip)" stroke="${INK}" stroke-width=".9"/>
    <path d="M29.8 47.2l4.4-1.4M29.8 49.6l4.4-1.4M29.8 52l4.4-1.4M29.8 54.4l4.4-1.4" stroke="#c48d5a" stroke-width=".6" opacity=".8"/>
    <path d="M30.4 46v9.4" stroke="#d8a476" stroke-width=".45" opacity=".6"/>
    <path d="M29 56.2h6l1.4 2.6-4.4 3.6-4.4-3.6z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <circle cx="32" cy="58.6" r="1.5" fill="url(#${p}ruby)" stroke="${INK}" stroke-width=".5"/>
  </g>`;
  const flame = `<g opacity=".9"><ellipse cx="32" cy="32" rx="20" ry="9" transform="rotate(-45 32 32)" fill="#5fb7ff" opacity=".35" filter="url(#${p}blur5)"/></g>`;
  return defs + flame + sword + sparkle(50.5, 12.5, 4.4) + sparkle(44, 9.4, 1.6, .8) + sparkle(54, 19, 1.3, .7);
}

export function phial(p) {
  const defs = `<defs>${blur(p, 1.4)}${blur(p, 4)}
    <radialGradient id="${p}core" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fffbe0"/><stop offset=".6" stop-color="#ffe9a0" stop-opacity=".7"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}glass" cx=".4" cy=".42" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#fff7d6"/><stop offset=".7" stop-color="#bfe2ff" stop-opacity=".85"/><stop offset="1" stop-color="#5d8fc9" stop-opacity=".9"/></radialGradient>
    <linearGradient id="${p}silver" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d8798"/><stop offset=".3" stop-color="#ffffff"/><stop offset=".55" stop-color="#b9c3d1"/><stop offset=".8" stop-color="#5b6577"/><stop offset="1" stop-color="#9aa5b6"/></linearGradient></defs>`;
  let rays = '';
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + .1, long = i % 2 === 0 ? 30 : 20, w = i % 2 === 0 ? 1.8 : 1.1;
    const x2 = 32 + Math.cos(ang) * long, y2 = 38 + Math.sin(ang) * long;
    const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
    rays += `M${(32 + nx).toFixed(2)} ${(38 + ny).toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}L${(32 - nx).toFixed(2)} ${(38 - ny).toFixed(2)}z`;
  }
  const body = 'M28.6 19.5h6.8v6.2c5.6 1.9 9.4 6.6 9.4 12.3 0 7.2-5.8 12.8-12.8 12.8S19.2 45.2 19.2 38c0-5.7 3.8-10.4 9.4-12.3z';
  return defs + `
    <path d="${rays}" fill="#fff3bf" opacity=".55"/>
    <circle cx="32" cy="38" r="22" fill="url(#${p}core)" opacity=".75"/>
    <path d="${body}" fill="url(#${p}glass)" stroke="${INK}" stroke-width="1"/>
    <circle cx="32" cy="38.5" r="7" fill="#fff" filter="url(#${p}blur4)"/>
    ${sparkle(32, 38.5, 7.4)}
    <path d="M23.2 34.6c.8-3.2 3.2-5.8 6-7" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".95"/>
    <path d="M22.6 40.4c.2 1.6.8 3 1.6 4.2" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".7"/>
    <path d="M39.6 46.6c1.8-1.3 3.2-3.2 3.8-5.4" fill="none" stroke="#3d6ea8" stroke-width="1" stroke-linecap="round" opacity=".6"/>
    <path d="M27.6 24.4c2.8 1 6 1 8.8 0" fill="none" stroke="url(#${p}silver)" stroke-width="2.2"/>
    <path d="M27.6 24.4c2.8 1 6 1 8.8 0" fill="none" stroke="${INK}" stroke-width=".5" opacity=".6"/>
    <path d="M27.4 14.6h9.2l-.8 5.4h-7.6z" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M28 16.4h8M28.3 18.2h7.4" stroke="#4b5363" stroke-width=".5"/>
    <path d="M29 12.2c0-2 1.4-3.4 3-3.4s3 1.4 3 3.4v2.4h-6z" fill="url(#${p}silver)" stroke="${INK}" stroke-width=".9"/>
    <circle cx="32" cy="7.6" r="2.4" fill="none" stroke="url(#${p}silver)" stroke-width="1.4"/>
    <circle cx="32" cy="7.6" r="2.4" fill="none" stroke="${INK}" stroke-width=".4" opacity=".7"/>
    <path d="M29.8 11.4c.6-.9 1.4-1.4 2.2-1.4" stroke="#fff" stroke-width=".6" fill="none"/>
    ${sparkle(14, 17, 2.2, .9)}${sparkle(51, 22, 1.8, .85)}${sparkle(48, 53, 1.4, .7)}`;
}

export function mithril(p) {
  const shirt = 'M22.5 9.5L12 15.6l3.6 12.6 4.8-1.8V54.5h23.2V26.4l4.8 1.8L52 15.6 41.5 9.5c-1.6 3.6-5.2 5.8-9.5 5.8s-7.9-2.2-9.5-5.8z';
  const defs = `<defs>${gold(p)}${blur(p, 1.4)}
    <pattern id="${p}mail" width="3.2" height="2.6" patternUnits="userSpaceOnUse"><circle cx="1.6" cy="1.3" r="1.25" fill="none" stroke="#5c6b80" stroke-width=".55"/><circle cx="1.6" cy="1.05" r="1.1" fill="none" stroke="#ffffff" stroke-width=".35" opacity=".8"/><circle cx="0" cy="2.6" r="1.25" fill="none" stroke="#5c6b80" stroke-width=".55"/><circle cx="3.2" cy="2.6" r="1.25" fill="none" stroke="#5c6b80" stroke-width=".55"/></pattern>
    <linearGradient id="${p}sil" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#dfe8f4"/><stop offset=".7" stop-color="#97a8bf"/><stop offset="1" stop-color="#52627a"/></linearGradient>
    <linearGradient id="${p}shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#0b1730" stop-opacity=".15"/><stop offset="1" stop-color="#0b1730" stop-opacity=".5"/></linearGradient>
    <clipPath id="${p}sc"><path d="${shirt}"/></clipPath></defs>`;
  return defs + `
    <ellipse cx="32" cy="34" rx="20" ry="23" fill="#dbeaff" opacity=".22" filter="url(#${p}blur1.4)"/>
    <path d="${shirt}" fill="url(#${p}sil)"/>
    <g clip-path="url(#${p}sc)"><rect x="10" y="8" width="44" height="48" fill="url(#${p}mail)"/><rect x="10" y="8" width="44" height="48" fill="url(#${p}shade)"/>
      <path d="M20.4 26.4l-4.8 1.8M43.6 26.4l4.8 1.8" stroke="#3b4a60" stroke-width="1"/>
      <path d="M15 24c4 .4 7-.6 9-2.6M49 24c-4 .4-7-.6-9-2.6" fill="none" stroke="#3b4a60" stroke-width=".6" opacity=".6"/></g>
    <path d="${shirt}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M20.4 52l1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5 1.6 2.5 1.6-2.5" fill="none" stroke="#e9f0f8" stroke-width=".8"/>
    <path d="M22.5 9.5c1.6 3.6 5.2 5.8 9.5 5.8s7.9-2.2 9.5-5.8l1.6 1.2c-1.8 4.6-6.2 7.4-11.1 7.4s-9.3-2.8-11.1-7.4z" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>
    <circle cx="32" cy="17.2" r="1.6" fill="#bfe9ff" stroke="${INK}" stroke-width=".6"/>
    <rect x="20.4" y="40" width="23.2" height="3.6" fill="#3a2414" stroke="${INK}" stroke-width=".8"/>
    <path d="M20.4 40.8h23.2" stroke="#7a5236" stroke-width=".5"/>
    <rect x="29.4" y="39.2" width="5.2" height="5.2" rx=".8" fill="url(#${p}gold)" stroke="${INK}" stroke-width=".8"/>
    <rect x="30.9" y="40.7" width="2.2" height="2.2" fill="#3a2414"/>
    <path d="M17 17.4c1.4 3 2.4 6 2.8 8.4" stroke="#fff" stroke-width="1" fill="none" opacity=".7" stroke-linecap="round"/>
    ${sparkle(45.5, 21, 4.2)}${sparkle(24, 31, 2.2, .9)}${sparkle(39, 49, 1.6, .8)}`;
}

export function blade(p) {
  const defs = `<defs>${gold(p)}
    <linearGradient id="${p}bl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c3cbd6"/></linearGradient>
    <linearGradient id="${p}br" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa5b4"/><stop offset="1" stop-color="#4d5869"/></linearGradient>
    <linearGradient id="${p}grip" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b3b20"/><stop offset="1" stop-color="#25110a"/></linearGradient>
    <linearGradient id="${p}iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9b9a6"/><stop offset=".5" stop-color="#6e5d4c"/><stop offset="1" stop-color="#3a2f25"/></linearGradient></defs>`;
  return defs + `<g transform="rotate(45 32 32)">
    <path d="M32 5L35.4 11.4V42H32z" fill="url(#${p}br)"/>
    <path d="M32 5L28.6 11.4V42H32z" fill="url(#${p}bl)"/>
    <path d="M32 5L35.4 11.4V42H28.6V11.4z" fill="none" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M32 12.5V40" stroke="#5f6a7a" stroke-width="1"/>
    <path d="M29.3 12V41" stroke="#fff" stroke-width=".45" opacity=".8"/>
    <path d="M32 31l-.6 2.6M33.6 22l-.8 1.6" stroke="#6a5446" stroke-width=".5" opacity=".7"/>
    <rect x="23" y="41.6" width="18" height="4" rx="1.4" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".9"/>
    <path d="M24 42.6h16" stroke="#efe2d0" stroke-width=".5" opacity=".7"/>
    <rect x="29.8" y="45.6" width="4.4" height="10" rx="1" fill="url(#${p}grip)" stroke="${INK}" stroke-width=".9"/>
    <path d="M30 47.6l4-1.2M30 50l4-1.2M30 52.4l4-1.2M30 54.8l4-1.2" stroke="#a87650" stroke-width=".55" opacity=".8"/>
    <circle cx="32" cy="58.2" r="3" fill="url(#${p}iron)" stroke="${INK}" stroke-width=".9"/>
    <circle cx="31" cy="57.2" r=".9" fill="#fff" opacity=".6"/></g>
    ${sparkle(46, 15, 2.2, .7)}`;
}

