// Batch 1: the six item parts, three designs each. Plain, well-made gear: richly shaded, not legendary.
import { INK, blur, gem, sparkle, steel, wood } from '../kit.mjs';
import { blade as testBlade } from './examples.mjs';

// Local materials. Each takes the drawing's prefix.
const iron = (p) => `<linearGradient id="${p}iron" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e6eaef"/><stop offset=".35" stop-color="#a7b0bc"/><stop offset=".7" stop-color="#606a77"/><stop offset="1" stop-color="#363d47"/></linearGradient>`;
const bronze = (p) => `<linearGradient id="${p}bronze" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#f3cf9e"/><stop offset=".4" stop-color="#b8793f"/><stop offset=".75" stop-color="#6b3f19"/><stop offset="1" stop-color="#a5703d"/></linearGradient>`;
const cloth = (p, light, mid, dark) => `<linearGradient id="${p}cloth" x1="0" y1="0" x2="1" y2=".25"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
const leaf = (p) => `<linearGradient id="${p}leaf" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f6b1f"/><stop offset=".5" stop-color="#6fae3a"/><stop offset="1" stop-color="#c7d96a"/></linearGradient>`;
const cake = (p) => `<linearGradient id="${p}cake" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fff6dc"/><stop offset=".5" stop-color="#f1dca6"/><stop offset="1" stop-color="#d6b06a"/></linearGradient>
  <linearGradient id="${p}cakeside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9ac62"/><stop offset="1" stop-color="#8f6128"/></linearGradient>`;
const o = (w = .9) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/** Diagonal leather wraps across a grip from y0 to y1. */
const wraps = (x0, x1, y0, y1, step = 2.4, colour = '#c48d5a') => {
  let d = '';
  for (let y = y0 + step; y <= y1; y += step) d += `M${x0} ${y.toFixed(1)}L${x1} ${(y - 1.4).toFixed(1)}`;
  return `<path d="${d}" stroke="${colour}" stroke-width=".6" opacity=".85"/>`;
};
/** Rings of chain mail: a pattern in the given colours. */
const mailPattern = (p, dark, light) => `<pattern id="${p}mail" width="3.2" height="2.6" patternUnits="userSpaceOnUse"><circle cx="1.6" cy="1.3" r="1.25" fill="none" stroke="${dark}" stroke-width=".55"/><circle cx="1.6" cy="1.05" r="1.1" fill="none" stroke="${light}" stroke-width=".35" opacity=".8"/><circle cx="0" cy="2.6" r="1.25" fill="none" stroke="${dark}" stroke-width=".55"/><circle cx="3.2" cy="2.6" r="1.25" fill="none" stroke="${dark}" stroke-width=".55"/></pattern>`;

// ---------------------------------------------------------------- Blade

function broadsword(p) {
  return `<defs>${steel(p)}${bronze(p)}${wood(p)}</defs>
    <g>
    <path d="M32 6.5L27.3 14 27 41H32z" fill="url(#${p}steelL)"/>
    <path d="M32 6.5L36.7 14 37 41H32z" fill="url(#${p}steelR)"/>
    <path d="M32 6.5L36.7 14 37 41H27L27.3 14z" fill="none" ${o(1)}/>
    <path d="M32 15V38.5" stroke="#5a6576" stroke-width="1.6"/>
    <path d="M31.3 15.4V38" stroke="#eef2f7" stroke-width=".45" opacity=".8"/>
    <path d="M28.5 15V40" stroke="#fff" stroke-width=".55" opacity=".85"/>
    <path d="M29.6 26l.6 1.6M34.4 20.5l-.5 1.2M34 33l-.7 1.4" stroke="#56606e" stroke-width=".5" opacity=".6"/>
    <path d="M16 41.6Q32 39.4 48 41.6L47 45.4Q32 43.6 17 45.4z" fill="url(#${p}bronze)" ${o()}/>
    <path d="M17.5 42.2Q32 40.4 46.5 42.2" fill="none" stroke="#ffe7c2" stroke-width=".5" opacity=".8"/>
    <circle cx="16.4" cy="43.5" r="2.3" fill="url(#${p}bronze)" ${o(.8)}/><circle cx="47.6" cy="43.5" r="2.3" fill="url(#${p}bronze)" ${o(.8)}/>
    <circle cx="15.8" cy="42.8" r=".6" fill="#fff" opacity=".6"/><circle cx="47" cy="42.8" r=".6" fill="#fff" opacity=".6"/>
    <rect x="29.5" y="45" width="5" height="9.6" rx="1" fill="url(#${p}leather)" ${o()}/>
    ${wraps(29.7, 34.3, 45, 54.4)}
    <circle cx="32" cy="57.2" r="3.6" fill="url(#${p}bronze)" ${o()}/>
    <circle cx="32" cy="57.2" r="1.5" fill="#5a3612" stroke="#2a1606" stroke-width=".5"/>
    <circle cx="30.8" cy="56" r=".8" fill="#fff" opacity=".6"/>
    </g>
    ${sparkle(35.2, 9.6, 3)}`;
}

function seax(p) {
  const blade = 'M35 38V12.5L31 6Q27.4 12.5 26.9 22.5Q26.5 32 28 38z';
  return `<defs>${steel(p)}${wood(p)}${bronze(p)}</defs>
    <g transform="rotate(-45 32 32)">
    <path d="${blade}" fill="url(#${p}steelR)"/>
    <path d="M31 6Q27.4 12.5 26.9 22.5Q26.5 32 28 38H30.6Q29.6 30 29.8 22.5Q30.1 13.5 31 6z" fill="url(#${p}steelL)"/>
    <path d="${blade}" fill="none" ${o(1)}/>
    <path d="M34.3 13V37.4" stroke="#fff" stroke-width=".5" opacity=".7"/>
    <path d="M31.4 14.5Q30.8 24 31.4 36" fill="none" stroke="#56606e" stroke-width=".7"/>
    <path d="M27.6 22Q27.3 30 28.6 37" fill="none" stroke="#fff" stroke-width=".6" opacity=".9"/>
    <rect x="26.6" y="37.6" width="9.4" height="3" rx=".8" fill="url(#${p}bronze)" ${o()}/>
    <path d="M28 40.6H35Q35.8 48.5 34.7 56.2Q31.6 58.2 28.7 56.2Q27.3 48.5 28 40.6z" fill="url(#${p}wood)" ${o()}/>
    <path d="M29.6 42Q29 48 29.8 55M32 41.5Q31.6 49 32.4 56.5M33.8 42.5Q34.2 48 33.4 54" fill="none" stroke="#3d200c" stroke-width=".45" opacity=".7"/>
    <path d="M29 42Q28.6 48 29.2 54" fill="none" stroke="#f0c48e" stroke-width=".5" opacity=".7"/>
    <circle cx="31.4" cy="45" r=".9" fill="url(#${p}bronze)" stroke="${INK}" stroke-width=".4"/>
    <circle cx="31.6" cy="51.6" r=".9" fill="url(#${p}bronze)" stroke="${INK}" stroke-width=".4"/>
    <ellipse cx="31.7" cy="56.6" rx="3.4" ry="1.6" fill="url(#${p}bronze)" ${o(.8)}/>
    </g>
    ${sparkle(17.5, 16.5, 2.8)}`;
}

// ---------------------------------------------------------------- Bow

function arrowShaft(p, x0, x1, y) {
  return `<rect x="${x1}" y="${y - .7}" width="${x0 - x1}" height="1.4" fill="#d9b27a" ${o(.6)}/>
    <path d="M${x1 + .6} ${y - .25}H${x0 - .6}" stroke="#fff3d6" stroke-width=".35" opacity=".8"/>`;
}

function recurve(p) {
  const limb = 'M36.5 5.6C31 8 20 18 20 32S31 56 36.5 58.4L37.4 56.8C32.2 53 23.8 44.5 23.8 32S32.2 11 37.4 7.2z';
  return `<defs>${wood(p)}${steel(p)}</defs>
    <g transform="rotate(45 32 32)">
    <path d="M37.8 6.6V57.4" stroke="#000" stroke-width="1.4" opacity=".35"/>
    <path d="M37.6 6.6V57.4" stroke="#f1e8d2" stroke-width=".8"/>
    <path d="${limb}" fill="url(#${p}wood)" ${o(1)}/>
    <path d="M35.4 7.2C30 10.4 21.4 19.4 21.4 32" fill="none" stroke="#f0c48e" stroke-width=".7" opacity=".8"/>
    <path d="M26 16C24.4 19 23.4 22 23.2 25M26 48C24.4 45 23.4 42 23.2 39" fill="none" stroke="#3d200c" stroke-width=".45" opacity=".6"/>
    <path d="M36.5 5.6Q39.2 4.6 40 7M36.5 58.4Q39.2 59.4 40 57" fill="none" stroke="#3d200c" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="19" y="27.4" width="5.6" height="9.2" rx="1.4" fill="url(#${p}leather)" ${o()}/>
    ${wraps(19.2, 24.4, 27.4, 36.4, 2.2)}
    ${arrowShaft(p, 43, 11.6, 32)}
    <path d="M5.2 32L12.6 28.4 11.4 32 12.6 35.6z" fill="url(#${p}steelL)" ${o(.8)}/>
    <path d="M5.2 32H11.4" stroke="#56606e" stroke-width=".5"/>
    <path d="M37.6 31.3L39.6 26.6H44.6L42.6 31.3z" fill="#e8e2d6" ${o(.7)}/>
    <path d="M37.6 32.7L39.6 37.4H44.6L42.6 32.7z" fill="#b8352b" ${o(.7)}/>
    <path d="M39.2 30.6L41 27.8M40.8 30.6L42.6 27.8" stroke="#8d8a83" stroke-width=".4"/>
    </g>
    ${sparkle(14.5, 14, 2.4, .9)}`;
}

function bowAndQuiver(p) {
  const fletch = (x, y, c) => `<path d="M${x} ${y}l-1.8-1.6v-6.4l1.8 1.8 1.8-1.8v6.4z" fill="${c}" ${o(.6)}/><path d="M${x} ${y}v-6.2" stroke="${INK}" stroke-width=".4" opacity=".6"/>`;
  return `<defs>${wood(p)}${bronze(p)}
    <linearGradient id="${p}quiver" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a76a3c"/><stop offset=".35" stop-color="#7a4426"/><stop offset="1" stop-color="#2a1207"/></linearGradient></defs>
    <path d="M10.5 52Q4 18 47 9.5" fill="none" stroke="${INK}" stroke-width="5.2" stroke-linecap="round"/>
    <path d="M10.5 52Q4 18 47 9.5" fill="none" stroke="#7d4a22" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M10 49Q5.6 20 44 11" fill="none" stroke="#e0a868" stroke-width=".8" opacity=".8"/>
    <path d="M11 51.6L46.6 10" stroke="#f1e8d2" stroke-width=".8"/>
    <path d="M9.6 30.4l3.6-.3.4 6.2-3.4.4z" fill="url(#${p}leather)" ${o(.7)}/>
    <g transform="rotate(22 32 32)">
      <path d="M26.6 22.6V10.6M30 22V8.6M33.4 22V9.4M36.8 22.6V11.2" stroke="${INK}" stroke-width="1.9"/>
      <path d="M26.6 22.6V10.6M30 22V8.6M33.4 22V9.4M36.8 22.6V11.2" stroke="#d9b27a" stroke-width="1"/>
      ${fletch(26.6, 13.2, '#e8e2d6')}${fletch(30, 11.2, '#b8352b')}${fletch(33.4, 12, '#e8e2d6')}${fletch(36.8, 13.8, '#3e6b8a')}
      <path d="M24.4 22.4H39.4L38.2 56Q31.9 59.4 25.6 56z" fill="url(#${p}quiver)" ${o(1)}/>
      <ellipse cx="31.9" cy="22.4" rx="7.5" ry="2.2" fill="#1c0b04" ${o(.9)}/>
      <path d="M25.6 21.8Q31.9 19.6 38.2 21.8" fill="none" stroke="#c48d5a" stroke-width=".6"/>
      <path d="M24.8 28.6Q31.9 30.6 39 28.6L38.9 32Q31.9 34 24.9 32z" fill="url(#${p}bronze)" ${o(.7)}/>
      <path d="M25.3 47.2Q31.9 49.2 38.6 47.2L38.5 50.4Q31.9 52.4 25.4 50.4z" fill="url(#${p}bronze)" ${o(.7)}/>
      <path d="M26.4 35V45.6" stroke="#c48d5a" stroke-width=".6" stroke-dasharray="1 1.1" opacity=".9"/>
      <path d="M27.2 23.6V55" stroke="#d9a272" stroke-width=".6" opacity=".55"/>
      <path d="M29 37.5l3-2.5 3 2.5-3 2.5z" fill="none" stroke="#e6b87d" stroke-width=".6" opacity=".7"/>
    </g>
    ${sparkle(48.5, 14.5, 2.2, .8)}`;
}

function drawnBow(p) {
  const limb = 'M7 31.4C12 20 22 15.8 32 15.8S52 20 57 31.4L54.8 32.6C50.2 23.8 41.2 19.8 32 19.8S13.8 23.8 9.2 32.6z';
  return `<defs>${wood(p)}${steel(p)}
    <linearGradient id="${p}limb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d79a5c"/><stop offset=".55" stop-color="#8a5228"/><stop offset="1" stop-color="#4a260e"/></linearGradient></defs>
    <g transform="rotate(45 32 32)">
    <path d="M8.2 32L32 45.4 55.8 32" fill="none" stroke="#f1e8d2" stroke-width=".85"/>
    <path d="${limb}" fill="url(#${p}limb)" ${o(1)}/>
    <path d="M10 29.6C15 21 23 17.2 32 17.2" fill="none" stroke="#ffd7a6" stroke-width=".7" opacity=".85"/>
    <path d="M7 31.4Q4.8 30 5.4 27.6M57 31.4Q59.2 30 58.6 27.6" fill="none" stroke="#3d200c" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="29" y="14.8" width="6" height="6.2" rx="1.2" fill="url(#${p}leather)" ${o(.9)}/>
    <path d="M29.3 16.8H34.7M29.3 18.8H34.7" stroke="#c48d5a" stroke-width=".55"/>
    ${'' /* the arrow */}
    <rect x="31.3" y="9" width="1.4" height="37.4" fill="#d9b27a" ${o(.6)}/>
    <path d="M31.75 9.6V45.8" stroke="#fff3d6" stroke-width=".35" opacity=".8"/>
    <path d="M32 3.2L35.2 10 32 8.8 28.8 10z" fill="url(#${p}steelL)" ${o(.8)}/>
    <path d="M32 3.2V8.8" stroke="#56606e" stroke-width=".5"/>
    <path d="M31.3 45.6L26.6 43.4V37.6L31.3 39.6z" fill="#e8e2d6" ${o(.7)}/>
    <path d="M32.7 45.6L37.4 43.4V37.6L32.7 39.6z" fill="#b8352b" ${o(.7)}/>
    <path d="M31.75 46.4l-1 1.6h2z" fill="#3d200c"/>
    </g>
    ${sparkle(52, 11.5, 3)}${sparkle(46, 6.5, 1.2, .7)}`;
}

// ---------------------------------------------------------------- Mail

function hauberk(p) {
  const shirt = 'M23 10L12.4 14.8 7 36.4 13.2 38.4 18.4 23 19.6 55.2H44.4L45.6 23 50.8 38.4 57 36.4 51.6 14.8 41 10Q38 15.2 32 15.2T23 10z';
  return `<defs>${iron(p)}${wood(p)}${mailPattern(p, '#3e4652', '#e8edf3')}
    <linearGradient id="${p}shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
    <clipPath id="${p}sc"><path d="${shirt}"/></clipPath></defs>
    <path d="${shirt}" fill="url(#${p}iron)"/>
    <g clip-path="url(#${p}sc)">
      <rect x="6" y="9" width="52" height="48" fill="url(#${p}mail)"/>
      <rect x="6" y="9" width="52" height="48" fill="url(#${p}shade)"/>
      <path d="M18.4 23L19.6 55M45.6 23L44.4 55" stroke="#20252d" stroke-width="1.1" opacity=".7"/>
      <path d="M22 30Q32 33 42 30M21.6 40Q32 43 42.4 40" fill="none" stroke="#20252d" stroke-width=".6" opacity=".35"/>
    </g>
    <path d="${shirt}" fill="none" ${o(1.1)}/>
    <path d="M23 10Q26 15.2 32 15.2T41 10L43 11.2Q39.4 18 32 18T21 11.2z" fill="url(#${p}leather)" ${o(.8)}/>
    <path d="M22.6 12Q26.6 16.6 32 16.6" fill="none" stroke="#c48d5a" stroke-width=".5" stroke-dasharray="1 .9"/>
    <path d="M19.5 52.4H44.5V55.2H19.6z" fill="url(#${p}leather)" ${o(.7)}/>
    <path d="M7.3 35.1L13.6 37.2 13.2 38.4 7 36.4zM56.7 35.1L50.4 37.2 50.8 38.4 57 36.4z" fill="#4b2412" ${o(.6)}/>
    <path d="M14 17Q11 26 9.4 33" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".6"/>
    ${sparkle(25.5, 24, 2.6, .9)}`;
}

function breastplate(p) {
  const plate = 'M18 12.4Q24 15.2 32 15.2T46 12.4L50.4 20Q47 26 47 34.4L45 50.6Q38.6 55.4 32 55.4T19 50.6L17 34.4Q17 26 13.6 20z';
  let rivets = '';
  for (const [x, y] of [[16.6, 21], [18.4, 30], [19, 40], [20.4, 49], [47.4, 21], [45.6, 30], [45, 40], [43.6, 49], [25, 16.4], [39, 16.4]]) rivets += `<circle cx="${x}" cy="${y}" r=".95" fill="#e9edf2" stroke="${INK}" stroke-width=".45"/>`;
  return `<defs>${bronze(p)}${wood(p)}
    <linearGradient id="${p}plate" x1="0" y1="0" x2="1" y2=".2"><stop offset="0" stop-color="#f5f8fb"/><stop offset=".3" stop-color="#c2cad5"/><stop offset=".5" stop-color="#8994a3"/><stop offset=".52" stop-color="#66717f"/><stop offset="1" stop-color="#2e353f"/></linearGradient></defs>
    <path d="M18.6 13.2L17 6.4h4.6l1.6 7.4zM45.4 13.2L47 6.4h-4.6l-1.6 7.4z" fill="url(#${p}leather)" ${o(.8)}/>
    <rect x="17.4" y="8.2" width="4" height="2.6" rx=".5" fill="none" stroke="url(#${p}bronze)" stroke-width="1"/>
    <rect x="42.6" y="8.2" width="4" height="2.6" rx=".5" fill="none" stroke="url(#${p}bronze)" stroke-width="1"/>
    <path d="${plate}" fill="url(#${p}plate)" ${o(1.1)}/>
    <path d="M32 16V54.6" stroke="#3a414b" stroke-width=".8"/>
    <path d="M31.2 16.4V54" stroke="#fff" stroke-width=".7" opacity=".7"/>
    <path d="M18.2 13.6Q24.2 17.2 32 17.2T45.8 13.6" fill="none" stroke="#fff" stroke-width=".9" opacity=".9"/>
    <path d="M18.6 13.8Q24.4 18.8 32 18.8T45.4 13.8" fill="none" stroke="${INK}" stroke-width=".6" opacity=".7"/>
    <path d="M14.6 21.4Q18.6 24.6 18.4 31M49.4 21.4Q45.4 24.6 45.6 31" fill="none" stroke="${INK}" stroke-width=".6" opacity=".6"/>
    <path d="M18.6 44.6Q32 49.6 45.4 44.6M19 49Q32 54 45 49" fill="none" stroke="${INK}" stroke-width=".7"/>
    <path d="M18.8 45.6Q32 50.6 45.2 45.6" fill="none" stroke="#fff" stroke-width=".45" opacity=".6"/>
    <path d="M22 21Q20.6 28 21.6 37" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>
    <path d="M38 24l1.2 3.4M27 33.6l-.8 2" stroke="#3a414b" stroke-width=".45" opacity=".6"/>
    ${rivets}
    ${sparkle(24.4, 22.4, 3)}`;
}

function shield(p) {
  let planks = '';
  for (const x of [20.5, 26.2, 32, 37.8, 43.5]) planks += `M${x} 9V55`;
  let rivets = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + .26;
    rivets += `<circle cx="${(32 + Math.cos(a) * 21.6).toFixed(2)}" cy="${(32 + Math.sin(a) * 21.6).toFixed(2)}" r=".95" fill="#e3e7ec" stroke="${INK}" stroke-width=".4"/>`;
  }
  return `<defs>${iron(p)}
    <linearGradient id="${p}boards" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c88a4e"/><stop offset=".5" stop-color="#8a5228"/><stop offset="1" stop-color="#3d200c"/></linearGradient>
    <radialGradient id="${p}boss" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#c6cdd6"/><stop offset=".7" stop-color="#5f6976"/><stop offset="1" stop-color="#262b33"/></radialGradient>
    <clipPath id="${p}disc"><circle cx="32" cy="32" r="22"/></clipPath></defs>
    <circle cx="32" cy="32" r="23.6" fill="url(#${p}boards)"/>
    <g clip-path="url(#${p}disc)">
      <path d="${planks}" stroke="#2a1306" stroke-width=".9"/>
      <path d="M21.3 9V55M27 9V55M32.8 9V55M38.6 9V55M44.3 9V55" stroke="#e2a86a" stroke-width=".4" opacity=".5"/>
      <path d="M14 22q3 4 1 9M24 13q2 6 0 12M29 40q2 5 0 10M41 14q-2 5 0 9M47 36q2 5 0 9" fill="none" stroke="#3d200c" stroke-width=".45" opacity=".6"/>
      <path d="M18 18l6 4M40 45l5 2" stroke="#f0c48e" stroke-width=".5" opacity=".6"/>
      <path d="M9 30H55V34H9z" fill="url(#${p}iron)" opacity=".95"/>
      <path d="M9 30H55M9 34H55" stroke="${INK}" stroke-width=".6"/>
    </g>
    <circle cx="32" cy="32" r="22.2" fill="none" stroke="url(#${p}iron)" stroke-width="3.4"/>
    <circle cx="32" cy="32" r="23.9" fill="none" ${o(.9)}/>
    <circle cx="32" cy="32" r="20.5" fill="none" ${o(.6)}/>
    <path d="M17 17A21.2 21.2 0 0 1 32 10.8" fill="none" stroke="#fff" stroke-width=".8" opacity=".7"/>
    ${rivets}
    <circle cx="32" cy="32" r="7.4" fill="#3a2a1a" ${o(.8)}/>
    <circle cx="32" cy="32" r="6.2" fill="url(#${p}boss)" ${o(.8)}/>
    <circle cx="29.8" cy="29.6" r="1.4" fill="#fff" opacity=".9"/>
    ${sparkle(23.5, 15.5, 2.6, .9)}`;
}

// ---------------------------------------------------------------- Cloak

const CLOAK_COLOURS = ['#9a8fbb', '#4e4470', '#1d1630'];

function hoodedCloak(p) {
  const body = 'M32 6.4C26 6.4 22.5 11 22 17C21.5 22 19 26 16 30C12 36 10 46 9 56.6Q14.5 58.8 20.5 57.4Q26 59.4 32 58Q38 59.4 43.5 57.4Q49.5 58.8 55 56.6C54 46 52 36 48 30C45 26 42.5 22 42 17C41.5 11 38 6.4 32 6.4z';
  return `<defs>${cloth(p, ...CLOAK_COLOURS)}${gem(p, 'brooch', '#5aa0e6')}
    <radialGradient id="${p}hole" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#000"/><stop offset=".7" stop-color="#0d0918"/><stop offset="1" stop-color="#2a2244"/></radialGradient>
    <linearGradient id="${p}lining" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1d45"/><stop offset="1" stop-color="#0b0714"/></linearGradient>
    <clipPath id="${p}cc"><path d="${body}"/></clipPath></defs>
    <path d="${body}" fill="url(#${p}cloth)"/>
    <g clip-path="url(#${p}cc)">
      <path d="M32 25L28.6 60H35.4z" fill="url(#${p}lining)"/>
      <path d="M20.4 32Q16.8 44 15.6 58M25.4 30Q23.6 44 23.2 58M43.6 32Q47.2 44 48.4 58M38.6 30Q40.4 44 40.8 58" fill="none" stroke="#120c22" stroke-width="1.1" opacity=".6"/>
      <path d="M22.4 32Q19.6 44 18.8 58M27.2 31Q26.2 44 26 58M41.4 31Q43.6 44 44.4 58" fill="none" stroke="#c9bfe6" stroke-width=".8" opacity=".35"/>
      <path d="M23 18C22.4 24 19 28 15.6 33" fill="none" stroke="#d8d0f0" stroke-width="1" opacity=".5"/>
      <path d="M29 26.2Q26 40 25 59M35 26.2Q38 40 39 59" fill="none" stroke="#0b0714" stroke-width=".7" opacity=".7"/>
    </g>
    <path d="${body}" fill="none" ${o(1.1)}/>
    <path d="M32 10.6C28.4 10.6 26.3 13.8 26.1 17.8C25.9 21 28.4 23.8 32 23.8S38.1 21 37.9 17.8C37.7 13.8 35.6 10.6 32 10.6z" fill="url(#${p}hole)" ${o(.9)}/>
    <path d="M27.4 14.4C28.4 12.2 30 11.4 32 11.4" fill="none" stroke="#b7aedb" stroke-width=".6" opacity=".6"/>
    <circle cx="32" cy="26.4" r="2.6" fill="#d9a640" ${o(.8)}/>
    <circle cx="32" cy="26.4" r="1.5" fill="url(#${p}gem-brooch)"/>
    <circle cx="31.4" cy="25.8" r=".5" fill="#fff"/>
    ${sparkle(46.5, 18.5, 2.2, .7)}`;
}

function billowingCloak(p) {
  const body = 'M26.4 11.6Q32 9.2 37.6 11.6C41.6 21.6 49.6 29.4 57.4 33.4C52.4 36.4 54.6 41.6 50.2 45.8C46.2 43.8 46.2 50.2 41.2 53C38 50 34.2 56.2 28.2 55.2C22.2 57.4 15.2 55.2 8.6 56.2C13.6 44 20 30.2 26.4 11.6z';
  return `<defs>${cloth(p, ...CLOAK_COLOURS)}${gem(p, 'clasp', '#5aa0e6')}
    <linearGradient id="${p}inside" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2c5e"/><stop offset="1" stop-color="#120c22"/></linearGradient>
    <clipPath id="${p}cc"><path d="${body}"/></clipPath></defs>
    <path d="M37.6 11.6C41.6 21.6 49.6 29.4 57.4 33.4C52.4 36.4 54.6 41.6 50.2 45.8C49 40 45 33 40 26z" fill="url(#${p}inside)" ${o(.9)}/>
    <path d="${body}" fill="url(#${p}cloth)"/>
    <g clip-path="url(#${p}cc)">
      <path d="M40 26C45 33 49 40 50.2 45.8C46 41 42 34 38 29z" fill="url(#${p}inside)"/>
      <path d="M30 14Q24 34 15 56M33 14Q30 34 26 56M35 15Q38 34 38.5 54M37 18Q43 34 46 46" fill="none" stroke="#120c22" stroke-width="1.1" opacity=".55"/>
      <path d="M28.6 14Q21.6 34 11.6 56M31.6 14Q27.6 34 21.6 56M34 15Q34 34 33 55" fill="none" stroke="#d8d0f0" stroke-width=".8" opacity=".35"/>
    </g>
    <path d="${body}" fill="none" ${o(1.1)}/>
    <path d="M25.6 12.4Q32 8 38.4 12.4L37.6 16.2Q32 13.2 26.4 16.2z" fill="#3a2e5a" ${o(.8)}/>
    <path d="M27 13Q32 10.4 37 13" fill="none" stroke="#c9bfe6" stroke-width=".55" opacity=".7"/>
    <circle cx="32" cy="12.6" r="2.4" fill="#d9a640" ${o(.8)}/>
    <circle cx="32" cy="12.6" r="1.3" fill="url(#${p}gem-clasp)"/>
    <path d="M31 14.6Q29.6 19 30.4 22M33 14.6Q34.8 18.6 34.4 21.6" fill="none" stroke="#d9a640" stroke-width=".8" stroke-linecap="round"/>
    ${sparkle(15, 18, 2.2, .7)}${sparkle(50, 22, 1.4, .6)}`;
}

function foldedCloak(p) {
  const top = 'M10.6 29.4Q11 27.6 13 26.8L34.6 18.4Q36.4 17.8 38.2 18.6L53.2 25.4Q55 26.4 53.6 27.8L31.6 38.2Q29.8 39 28 38.2L12 31.2Q10.4 30.6 10.6 29.4z';
  const left = 'M10.6 29.6L28 38.2Q29.8 39 31.4 38.4V50.2Q29.8 50.8 28 50L11.4 42.4Q10.4 41.8 10.6 40.6z';
  const right = 'M31.4 38.4L53.6 27.8V39.4Q53.6 40.4 52.6 41L31.4 50.2z';
  return `<defs>${cloth(p, ...CLOAK_COLOURS)}${gem(p, 'brooch', '#5aa0e6')}
    <linearGradient id="${p}topf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b3a8d6"/><stop offset=".6" stop-color="#6a5e94"/><stop offset="1" stop-color="#3a2f5c"/></linearGradient>
    <linearGradient id="${p}lf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d5186"/><stop offset="1" stop-color="#2c2348"/></linearGradient>
    <linearGradient id="${p}rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2f5c"/><stop offset="1" stop-color="#16102a"/></linearGradient>
    <linearGradient id="${p}tail" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d5186"/><stop offset="1" stop-color="#1d1630"/></linearGradient></defs>
    <path d="M47.6 33.4Q52 40 50.4 47Q54 51 52.4 57.4Q47.6 55.6 45.2 58Q44.4 50 41.6 45.4Q44.6 40 41.6 36.2z" fill="url(#${p}tail)" ${o(.9)}/>
    <path d="M45 37.4Q47.8 43 46.6 50" fill="none" stroke="#a99ecf" stroke-width=".6" opacity=".5"/>
    <path d="${left}" fill="url(#${p}lf)" ${o(1)}/>
    <path d="${right}" fill="url(#${p}rf)" ${o(1)}/>
    <path d="M11 34.6L28.6 42.4Q30 43 31.4 42.4M11.2 38.4L28.6 46.2Q30 46.8 31.4 46.2" fill="none" stroke="#120c22" stroke-width=".8"/>
    <path d="M11.2 35.6L28.6 43.4M11.4 39.4L28.6 47.2" fill="none" stroke="#b3a8d6" stroke-width=".55" opacity=".6"/>
    <path d="M31.4 42.4L53.6 32M31.4 46.2L53.4 35.8" fill="none" stroke="#06040c" stroke-width=".8"/>
    <path d="M31.4 43.4L53.6 33M31.4 47.2L53.4 36.8" fill="none" stroke="#8f84b8" stroke-width=".5" opacity=".45"/>
    <path d="${top}" fill="url(#${p}topf)" ${o(1)}/>
    <path d="M15 28.6L35 20.4M20 32.8L41 23.4M38 21L50.6 27" fill="none" stroke="#2c2348" stroke-width=".6" opacity=".55"/>
    <path d="M13.4 28.2L34.8 19.6Q36.4 19 37.8 19.6" fill="none" stroke="#e6e0f8" stroke-width=".7" opacity=".8"/>
    <path d="M33.4 22.4C29 23.4 27 26.4 28.2 29.6C29.6 33 34.8 33.4 37.8 30.6C40.6 28 39.6 23.4 33.4 22.4z" fill="none" stroke="#120c22" stroke-width=".6" opacity=".35"/>
    <ellipse cx="33.6" cy="28.2" rx="5" ry="3.4" fill="#d9a640" ${o(.9)}/>
    <ellipse cx="33.6" cy="28.2" rx="3.4" ry="2.2" fill="none" stroke="#7a5212" stroke-width=".5"/>
    <ellipse cx="33.6" cy="28" rx="2.2" ry="1.6" fill="url(#${p}gem-brooch)" ${o(.6)}/>
    <path d="M29.6 26.6Q31 25.2 33.4 25" fill="none" stroke="#fff6d0" stroke-width=".55"/>
    <path d="M38.4 28.6l5.6 3.4" stroke="#d9a640" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M38.4 28.6l5.6 3.4" stroke="${INK}" stroke-width=".35" stroke-linecap="round" opacity=".6"/>
    ${sparkle(31.6, 26.6, 2.8)}${sparkle(16, 16, 1.8, .6)}`;
}

// ---------------------------------------------------------------- Lembas

function leafParcel(p) {
  return `<defs>${leaf(p)}${cake(p)}
    <linearGradient id="${p}flap" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9cf55"/><stop offset="1" stop-color="#3c7a24"/></linearGradient></defs>
    <path d="M8.6 54.6C12 31 29 13.6 55.4 8.6C51.4 34 34 51 8.6 54.6z" fill="url(#${p}leaf)" ${o(1)}/>
    <path d="M9.6 53.6L54.4 9.6" stroke="#244d16" stroke-width=".9"/>
    <path d="M18 45l-4-7M24 39l-4.6-9M31 32l-3-10M38 25l-1.6-10M18 45l7 3.4M24 39l9 3.4M31 32l10 2.6M38 25l10 1.6" stroke="#244d16" stroke-width=".5" opacity=".8"/>
    <g transform="rotate(-8 32 33)">
      <rect x="21" y="23.6" width="23" height="21" rx="2.2" fill="url(#${p}cakeside)" ${o(.9)}/>
      <rect x="20" y="21.6" width="23" height="21" rx="2.2" fill="url(#${p}cake)" ${o(.9)}/>
      <path d="M23 24.6L40 39.6M40 24.6L23 39.6" stroke="#c99a4e" stroke-width=".8" opacity=".8"/>
      <path d="M21.4 23.4H41.6" stroke="#fff" stroke-width=".7" opacity=".8"/>
      <circle cx="26" cy="35" r=".5" fill="#c99a4e"/><circle cx="37" cy="29" r=".5" fill="#c99a4e"/><circle cx="31.5" cy="27" r=".45" fill="#c99a4e"/>
    </g>
    <path d="M13 47C17 40 21 34 27 30C29 38 25 46 18.6 50.4z" fill="url(#${p}flap)" ${o(.9)}/>
    <path d="M14.4 47.4L26 32" stroke="#244d16" stroke-width=".6"/>
    <path d="M14.6 45C18 39 22 34.6 26 31.4" fill="none" stroke="#e4f2a0" stroke-width=".6" opacity=".7"/>
    <path d="M18.6 24.6Q32 34 46 41M30 17.6Q33 31 33.4 50" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <path d="M18.6 24.6Q32 34 46 41M30 17.6Q33 31 33.4 50" fill="none" stroke="#d8bb83" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M32.6 32.4c-2.6-3.6-6.2-3-6 .2s3.8 2.6 6-.2zM32.6 32.4c3.6-1.8 5.6 1.2 3.6 3.4s-4.4-.6-3.6-3.4z" fill="#d8bb83" ${o(.6)}/>
    ${sparkle(47, 18, 2.4, .8)}`;
}

function cakeStack(p) {
  const slab = (cx, cy, s) => `<path d="M${cx - 14 * s} ${cy}L${cx} ${cy + 7 * s}V${cy + 11 * s}L${cx - 14 * s} ${cy + 4 * s}z" fill="url(#${p}cakeside)" ${o(.8)}/>
    <path d="M${cx + 14 * s} ${cy}L${cx} ${cy + 7 * s}V${cy + 11 * s}L${cx + 14 * s} ${cy + 4 * s}z" fill="#8f6128" ${o(.8)}/>
    <path d="M${cx - 14 * s} ${cy}L${cx} ${cy - 7 * s}L${cx + 14 * s} ${cy}L${cx} ${cy + 7 * s}z" fill="url(#${p}cake)" ${o(.9)}/>
    <path d="M${cx - 7 * s} ${cy - 3.5 * s}L${cx + 7 * s} ${cy + 3.5 * s}M${cx + 7 * s} ${cy - 3.5 * s}L${cx - 7 * s} ${cy + 3.5 * s}" stroke="#c99a4e" stroke-width=".7"/>
    <path d="M${cx - 12.4 * s} ${cy - .2}L${cx} ${cy - 6.4 * s}" stroke="#fff" stroke-width=".6" opacity=".85"/>
    <path d="M${cx - 13 * s} ${cy + 1.6 * s}L${cx} ${cy + 8.2 * s}" stroke="#ffe7b0" stroke-width=".4" opacity=".6"/>`;
  return `<defs>${leaf(p)}${cake(p)}</defs>
    <path d="M6.6 47C14 40 28 40 34 46C40 52 52 55 58 52C52 59 30 61 18 56C12 53.6 8.6 50.6 6.6 47z" fill="url(#${p}leaf)" ${o(.9)}/>
    <path d="M8 47.4Q30 46 56.4 53" fill="none" stroke="#244d16" stroke-width=".7"/>
    ${slab(31, 40.6, 1.08)}
    <g transform="rotate(-7 32 32)">${slab(32.6, 31.4, 1)}</g>
    <g transform="rotate(5 32 22)">${slab(31.4, 22.6, .94)}</g>
    <path d="M44 51l1.4-.8.8 1.2-1.4.6zM48.6 49.6l1-.4.4.9-1 .4zM17 51.4l1.2-.4.5 1-1.2.4z" fill="#e2c27e" stroke="${INK}" stroke-width=".35"/>
    ${sparkle(44, 13, 2.4, .85)}`;
}

function brokenWafer(p) {
  const left = 'M11 21.6L31.6 15.6 30 21 33 25.4 29.6 30.4 33.2 35.4 30.6 41 13.4 46.6z';
  const right = 'M35.6 16.6L54 21.6 51.6 47 35.4 42.6 38 37.4 34.6 32.4 38.2 27.4 35 23z';
  return `<defs>${leaf(p)}${cake(p)}
    <pattern id="${p}crumb" width="2.6" height="2.6" patternUnits="userSpaceOnUse"><circle cx=".7" cy=".8" r=".45" fill="#c99a4e"/><circle cx="1.9" cy="1.9" r=".35" fill="#fff6dc"/></pattern></defs>
    <path d="M37 56C42 45 50 40 59 40C56 49 47 55 37 56z" fill="url(#${p}leaf)" ${o(.8)}/>
    <path d="M38 55.4L58 40.6" stroke="#244d16" stroke-width=".6"/>
    <g transform="translate(-1.2 2.4)">
      <path d="${left}" fill="url(#${p}cakeside)" ${o(.9)}/>
    </g>
    <path d="${left}" fill="url(#${p}cake)" ${o(.9)}/>
    <path d="M31.6 15.6L30 21 33 25.4 29.6 30.4 33.2 35.4 30.6 41 28.2 41.8 28.4 36 31 30.6 27.6 25.6 30 21z" fill="url(#${p}crumb)" opacity=".9"/>
    <path d="M15.4 25.6L27.4 41M27.2 19.6L18.4 43" stroke="#c99a4e" stroke-width=".8" opacity=".85"/>
    <path d="M12.2 22.4L30.6 17" stroke="#fff" stroke-width=".7" opacity=".85"/>
    <g transform="rotate(8 44 32) translate(1.6 2.6)">
      <path d="${right}" fill="url(#${p}cakeside)" ${o(.9)}/>
    </g>
    <g transform="rotate(8 44 32)">
      <path d="${right}" fill="url(#${p}cake)" ${o(.9)}/>
      <path d="M35.6 16.6L35 23 38.2 27.4 34.6 32.4 38 37.4 35.4 42.6 37.8 42 40.4 37.4 37 32.4 40.4 27.6 37.4 23z" fill="url(#${p}crumb)" opacity=".9"/>
      <path d="M40.4 21L50.6 43.6M50.6 24.6L41 41.6" stroke="#c99a4e" stroke-width=".8" opacity=".85"/>
      <path d="M37 17.8L52.6 22" stroke="#fff" stroke-width=".7" opacity=".85"/>
    </g>
    <path d="M30.4 47.6l1.6-.6.6 1.4-1.6.6zM34 50.2l1.1-.3.4 1-1.1.3zM26.6 51l1.3-.5.5 1.1-1.3.5zM33.4 45.6l.9-.3.3.8-.9.3z" fill="#e2c27e" stroke="${INK}" stroke-width=".35"/>
    ${sparkle(15, 14, 2.2, .8)}`;
}

// ---------------------------------------------------------------- Staff

function crystalStaff(p) {
  return `<defs>${wood(p)}${iron(p)}${blur(p, 2.4)}
    <linearGradient id="${p}cl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#a9d2f5"/></linearGradient>
    <linearGradient id="${p}cr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5d93d6"/><stop offset="1" stop-color="#1f3f7a"/></linearGradient></defs>
    <g transform="rotate(38 32 32)">
    <circle cx="32" cy="12" r="8.6" fill="#7fbfff" opacity=".55" filter="url(#${p}blur2.4)"/>
    <rect x="30.2" y="20" width="3.6" height="39.6" rx="1.2" fill="url(#${p}wood)" ${o(.9)}/>
    <path d="M31 22V58M32.6 26V40M32.8 46V57" stroke="#3d200c" stroke-width=".4" opacity=".7"/>
    <path d="M30.9 21.4V58.6" stroke="#f0c48e" stroke-width=".5" opacity=".7"/>
    <rect x="29.6" y="36.6" width="4.8" height="8.4" rx="1" fill="url(#${p}leather)" ${o(.8)}/>
    ${wraps(29.8, 34.2, 36.6, 45, 2.1)}
    <rect x="29.8" y="57.6" width="4.4" height="3.4" rx=".8" fill="url(#${p}iron)" ${o(.8)}/>
    <path d="M32 3.6L36.2 8.4V16.8L32 21L27.8 16.8V8.4z" fill="url(#${p}cr)"/>
    <path d="M32 3.6L27.8 8.4V16.8L32 21z" fill="url(#${p}cl)"/>
    <path d="M32 3.6L36.2 8.4V16.8L32 21L27.8 16.8V8.4z" fill="none" ${o(.9)}/>
    <path d="M27.8 8.4L32 10.6 36.2 8.4M32 10.6V21" fill="none" stroke="#1f3f7a" stroke-width=".5" opacity=".8"/>
    <path d="M29 9.6V16" stroke="#fff" stroke-width=".6"/>
    <path d="M30.6 22C26.2 19.6 25.6 14.6 27.6 10.6M33.4 22C37.8 19.6 38.4 14.6 36.4 10.6" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M30.6 22C26.2 19.6 25.6 14.6 27.6 10.6M33.4 22C37.8 19.6 38.4 14.6 36.4 10.6" fill="none" stroke="#8a5228" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M29.6 21.2C27 19.2 26.6 15.6 27.8 12.6" fill="none" stroke="#e0a868" stroke-width=".5"/>
    </g>
    ${sparkle(41.6, 13.4, 3.4)}`;
}

function crookStaff(p) {
  const crook = 'M30 25C30 13 36.6 7.4 42.6 8.8C48.4 10.2 48.8 18 43.6 20.2C39.4 22 36.4 18.4 38.8 15.4';
  return `<defs>${wood(p)}${iron(p)}${gem(p, 'bead', '#2bb3a0')}</defs>
    <g transform="rotate(10 32 32)">
    <path d="${crook}" fill="none" stroke="${INK}" stroke-width="5.6" stroke-linecap="round"/>
    <path d="${crook}" fill="none" stroke="#7d4a22" stroke-width="3.8" stroke-linecap="round"/>
    <path d="M29.2 22C29.6 13.4 35.4 8.4 41.6 9.2" fill="none" stroke="#e0a868" stroke-width=".9" stroke-linecap="round" opacity=".85"/>
    <path d="M45.6 17.4C44.2 19.6 41.8 20.2 40.2 19" fill="none" stroke="#3d200c" stroke-width=".6"/>
    <rect x="28.2" y="22" width="3.6" height="37.6" rx="1.2" fill="url(#${p}wood)" ${o(.9)}/>
    <path d="M29 24V57M30.8 28V40M31 46V56" stroke="#3d200c" stroke-width=".4" opacity=".7"/>
    <path d="M28.9 23V58" stroke="#f0c48e" stroke-width=".5" opacity=".7"/>
    <path d="M28.6 27.6l1.4 1.2 1.4-1.2M28.6 31l1.4 1.2 1.4-1.2" fill="none" stroke="#f3d3a3" stroke-width=".55"/>
    <rect x="27.6" y="34" width="4.8" height="8.4" rx="1" fill="url(#${p}leather)" ${o(.8)}/>
    ${wraps(27.8, 32.2, 34, 42.4, 2.1)}
    <path d="M28.4 41.4C24.6 43 22.4 46.4 22.2 49.6" fill="none" stroke="#5a2f17" stroke-width=".8"/>
    <circle cx="22.4" cy="50.6" r="1.5" fill="url(#${p}gem-bead)" ${o(.5)}/>
    <path d="M22.4 52.2C19.4 53.6 18 57 18.6 59.4C21.4 58.4 23 55.2 22.4 52.2z" fill="#e8e2d6" ${o(.6)}/>
    <path d="M22.4 52.2L19.4 58.6" stroke="#8d8a83" stroke-width=".4"/>
    <rect x="27.8" y="57.4" width="4.4" height="3.4" rx=".8" fill="url(#${p}iron)" ${o(.8)}/>
    </g>
    ${sparkle(17, 14, 2.4, .85)}`;
}

function runeStaff(p) {
  const runes = 'M30.8 24l1.2 1.2-1.2 1.2M32.6 29.4h-1.4l1.4 1.6h-1.4M31.2 35.4l1.4.8-1.4.8M31.9 46.6v2.2M31 47.7h1.8';
  return `<defs>${wood(p)}${iron(p)}${blur(p, 1.6)}${blur(p, 3)}
    <radialGradient id="${p}knot" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d79a5c"/><stop offset=".5" stop-color="#7d4a22"/><stop offset="1" stop-color="#2e1606"/></radialGradient></defs>
    <g transform="rotate(-24 32 32)">
    <circle cx="32" cy="12.6" r="8" fill="#5fb7ff" opacity=".35" filter="url(#${p}blur3)"/>
    <path d="M30 18.6Q29.4 38 30.2 59.6H33.8Q34.6 38 34 18.6z" fill="url(#${p}wood)" ${o(.9)}/>
    <ellipse cx="30.1" cy="40" rx="1.4" ry="2" fill="#5a2f17" ${o(.5)}/>
    <ellipse cx="34" cy="52" rx="1.2" ry="1.7" fill="#5a2f17" ${o(.5)}/>
    <path d="M31 21V57M33 22V36" stroke="#3d200c" stroke-width=".4" opacity=".6"/>
    <path d="${runes}" fill="none" stroke="#9fe0ff" stroke-width="1.8" stroke-linecap="round" opacity=".55" filter="url(#${p}blur1.6)"/>
    <path d="${runes}" fill="none" stroke="#e6f6ff" stroke-width=".65" stroke-linecap="round"/>
    <path d="M24.6 12.4C24.6 7.4 28 4.4 32 4.4S39.6 7.4 39.6 12.4C39.6 16.8 36.6 19.8 32 19.8S24.6 16.8 24.6 12.4z" fill="url(#${p}knot)" ${o(1)}/>
    <path d="M26.4 10C27.2 7.4 29.2 5.8 31.6 5.6" fill="none" stroke="#f3c48e" stroke-width=".8" opacity=".85"/>
    <path d="M27 15.4Q29 18 32 18.2M36.4 8.6Q38 10.6 37.8 13" fill="none" stroke="#2e1606" stroke-width=".5" opacity=".7"/>
    <path d="M30 9.4V15.6M30 12.4L34.2 9.6M30 12.4L34.2 15.4" fill="none" stroke="#7fd1ff" stroke-width="2.2" stroke-linecap="round" opacity=".6" filter="url(#${p}blur1.6)"/>
    <path d="M30 9.4V15.6M30 12.4L34.2 9.6M30 12.4L34.2 15.4" fill="none" stroke="#e6f6ff" stroke-width=".8" stroke-linecap="round"/>
    <rect x="29" y="19" width="6" height="2.6" rx=".6" fill="url(#${p}iron)" ${o(.7)}/>
    <rect x="29.4" y="42" width="5.4" height="2.2" rx=".5" fill="url(#${p}iron)" ${o(.7)}/>
    <path d="M29.6 59.4L32 62.2 34.4 59.4z" fill="url(#${p}iron)" ${o(.7)}/>
    </g>
    ${sparkle(45.4, 12.4, 2.6, .9)}`;
}

const part = (id, name, variants) => ({ id, name, kind: 'component', recipe: [id, id], variants });

export default [
  part('blade', 'Blade', [
    { title: 'Arming sword', draw: testBlade },
    { title: 'Broadsword, upright', draw: broadsword },
    { title: 'Seax knife', draw: seax },
  ]),
  part('bow', 'Bow', [
    { title: 'Recurve bow, arrow nocked', draw: recurve },
    { title: 'Bow and quiver', draw: bowAndQuiver },
    { title: 'Drawn bow', draw: drawnBow },
  ]),
  part('mail', 'Mail', [
    { title: 'Iron hauberk', draw: hauberk },
    { title: 'Steel breastplate', draw: breastplate },
    { title: 'Iron-bound shield', draw: shield },
  ]),
  part('cloak', 'Cloak', [
    { title: 'Hooded cloak', draw: hoodedCloak },
    { title: 'Billowing cloak', draw: billowingCloak },
    { title: 'Folded cloak and brooch', draw: foldedCloak },
  ]),
  part('lembas', 'Lembas', [
    { title: 'Leaf-wrapped parcel', draw: leafParcel },
    { title: 'Stack of wafers', draw: cakeStack },
    { title: 'Broken wafer', draw: brokenWafer },
  ]),
  part('staff', 'Staff', [
    { title: 'Crystal-tipped staff', draw: crystalStaff },
    { title: 'Crook staff', draw: crookStaff },
    { title: 'Rune-carved staff', draw: runeStaff },
  ]),
];
