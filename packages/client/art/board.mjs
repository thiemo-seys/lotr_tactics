/* global console, process, URL, window */
// Renders .glb models on the game's board with three.js in headless Chromium, with the camera,
// lights, board and team colours of packages/client/src/scene.ts, so a model can be judged at the
// size it is played at. Each model is recoloured blue (near side) and red (far side) through its
// `team` material, the way the client will, and stands next to today's pawn for scale.
//
//   node packages/client/art/board.mjs <out dir> <model.glb> [--toon] [--scale=2]
//   node packages/client/art/board.mjs <out dir> --lineup <a.glb> <b.glb> ... [--scale=2]
//   node packages/client/art/board.mjs <out dir> --stars <study.json> [--unit=N] [--scale=2]
//
// Writes board.png (the game's default camera, 1600x900), board-zoom.png (the same angle, closer)
// and labels.json (where each model is in both pictures). --lineup puts each model, up to 7, in its
// own column, blue from behind and red from the front; otherwise one model stands in a small fight.
// --toon draws three-step toon shading, and any material named `outline` unlit, as a client could.
// --scale=2 renders at twice the pixel density.
//
// --stars lays out a star-level study (star-study/README.md): three units in rows, at 1, 2 and 3
// stars from left to right, blue in rows 1 to 3 seen from behind and red in rows 4 to 6 seen from the
// front, each with the game's label (name, stars and a health bar). The JSON file says how each star
// shows; model paths in it are relative to the file. --unit=N shows only the Nth unit, close up, in
// rows 2 and 5. Also writes board-far.png, from behind the red side, and the scale, reach and
// height of each model in labels.json:
//
//   { "units": [{ "name": "Frodo", "models": ["frodo.glb", "frodo.glb", "frodo-3.glb"], "rider": false }],
//     "grow": [100, 110, 120],     // scale per star, in percent
//     "riderGrow": [100, 103, 103],// the same for Riders and Large units
//     "fit": true,                 // never grow a model past the hex's 0.94 radius
//     "base": "rim" | "pips" | "rim+pips" | "team" | null, // a low stand: silver and gold rim, pips, both, or the team colour
//     "trim": true,                // colour the `trim` material iron, silver, gold
//     "aura": [false, false, true] // a faint glow per star
//   }
//
// Playwright isn't one of the repo's dependencies: this uses the copy installed on the machine.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const load = createRequire(import.meta.url);
const { chromium } = load('playwright');

const THREE_ROOT = path.join(import.meta.dirname, '../node_modules/three');
const ORIGIN = 'http://preview.local';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [outDir, ...positional] = args.filter((a) => !a.startsWith('--'));
let models = positional;
let study = null;
if (flags.has('--stars') && positional.length === 1) {
  study = JSON.parse(fs.readFileSync(positional[0], 'utf8'));
  const focus = args.find((a) => a.startsWith('--unit='));
  if (focus) study.focus = Number(focus.slice('--unit='.length));
  const dir = path.dirname(path.resolve(positional[0]));
  models = [...new Set(study.units.flatMap((u) => u.models.map((m) => path.resolve(dir, m))))];
  study.units = study.units.map((u) => ({ ...u, models: u.models.map((m) => models.indexOf(path.resolve(dir, m))) }));
}
if (!outDir || models.length === 0) {
  console.error('usage: node board.mjs <out dir> <model.glb> [--toon] | --lineup <a.glb> <b.glb> ...');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const scale = Number(args.find((a) => a.startsWith('--scale='))?.slice('--scale='.length) ?? 1);
const config = {
  scale,
  width: 1600,
  height: 900,
  models: models.map((_, i) => `${ORIGIN}/models/${i}.glb`),
  toon: flags.has('--toon'),
  lineup: flags.has('--lineup'),
  study,
};

const PAGE = `<!doctype html><html><head><style>html,body{margin:0;background:#12161c;overflow:hidden;font-family:system-ui,sans-serif;color:#e5e7eb}
#labels{position:absolute;inset:0;pointer-events:none}
.unit-label{position:absolute;width:64px;margin-left:-32px;transform:translateY(-100%);text-align:center;text-shadow:0 1px 2px #000}
.unit-label .name{font-size:11px;white-space:nowrap}
.bar{height:5px;margin-top:2px;background:#0b0e13cc;border-radius:2px;overflow:hidden}
.bar i{display:block;height:100%;width:100%;background:#22c55e}
.team-B .bar i{background:#ef4444}</style>
<script type="importmap">{"imports":{"three":"${ORIGIN}/three/build/three.module.js","three/addons/":"${ORIGIN}/three/examples/jsm/"}}</script>
</head><body><div id="labels"></div><script type="module" src="${ORIGIN}/main.js"></script></body></html>`;

const MAIN = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const config = window.CONFIG;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(config.scale);
renderer.setSize(config.width, config.height);
document.body.append(renderer.domElement);

// From scene.ts.
const TEAM_COLOURS = { A: 0x4a90d9, B: 0xd9534f };
const BOARD_COLOURS = { A: [0x2b3d55, 0x31465f], B: [0x553230, 0x5f3936] };
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12161c);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(5, 12, 8);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(45, config.width / config.height, 0.1, 100);

// From layout.ts: 7 columns by 8 rows, team A's rows 0 to 3 nearest the camera.
const SQRT3 = Math.sqrt(3);
const HALF = { x: (SQRT3 * (7 - 0.5)) / 2, z: (1.5 * (8 - 1)) / 2 };
const at = (col, row) => ({ x: SQRT3 * (col + 0.5 * (row & 1)) - HALF.x, z: HALF.z - 1.5 * row });
const hex = new THREE.CylinderGeometry(0.94, 0.94, 0.12, 6);
const tileMaterials = new Map();
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 7; col++) {
    const colour = BOARD_COLOURS[row < 4 ? 'A' : 'B'][col % 2];
    if (!tileMaterials.has(colour)) tileMaterials.set(colour, new THREE.MeshStandardMaterial({ color: colour, flatShading: true }));
    const tile = new THREE.Mesh(hex, tileMaterials.get(colour));
    const p = at(col, row);
    tile.position.set(p.x, -0.06, p.z);
    scene.add(tile);
  }
}

// Today's pawn, from scene.ts.
const pawnGeometry = {
  body: new THREE.CylinderGeometry(0.3, 0.42, 0.9, 6),
  head: new THREE.IcosahedronGeometry(0.25, 0),
  nose: new THREE.ConeGeometry(0.09, 0.28, 4),
};
const noseMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, flatShading: true });
function pawn(team) {
  const material = new THREE.MeshStandardMaterial({ color: TEAM_COLOURS[team], flatShading: true });
  const body = new THREE.Mesh(pawnGeometry.body, material);
  body.position.y = 0.45;
  const head = new THREE.Mesh(pawnGeometry.head, material);
  head.position.y = 1.1;
  const nose = new THREE.Mesh(pawnGeometry.nose, noseMaterial);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.1, 0.3);
  const group = new THREE.Group();
  group.add(body, head, nose);
  return group;
}

const gradient = new THREE.DataTexture(new Uint8Array([90, 175, 255]), 3, 1, THREE.RedFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;

// Each copy gets its own materials, as the client will give it, with the team part recoloured.
function dress(material, team) {
  let m = material.clone();
  if (config.toon) {
    m = m.name === 'outline'
      ? new THREE.MeshBasicMaterial({ name: m.name, color: m.color, side: m.side })
      : new THREE.MeshToonMaterial({ name: m.name, color: m.color, gradientMap: gradient, side: m.side });
  }
  if (m.name === 'team') m.color.setHex(TEAM_COLOURS[team]);
  return m;
}

const loader = new GLTFLoader();
const gltfs = await Promise.all(config.models.map((url) => loader.loadAsync(url)));

// Turns an object at a hex to face a point, the way playback's facing() does.
function place(object, col, row, face) {
  const p = at(col, row);
  object.position.set(p.x, 0, p.z);
  object.rotation.y = Math.atan2(face.x - p.x, face.z - p.z);
  scene.add(object);
}
// Points above each model, for labelling screenshots.
const marks = [];
function model(index, team, col, row, face) {
  const p = at(col, row);
  marks.push({ index, team, position: new THREE.Vector3(p.x, 1.45, p.z) });
  const copy = gltfs[index].scene.clone(true);
  copy.traverse((o) => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => dress(m, team)) : dress(o.material, team);
  });
  place(copy, col, row, face);
  return copy;
}

// The star-level study's options (star-study/README.md).
const TRIM = [0x6b6f74, 0xc9ced4, 0xc4a04a]; // iron, silver, muted gold
const RIM = [0x4b4f55, 0xc9ced4, 0xc4a04a]; // plain, silver, gold
const PIP = [0xb8b2a6, 0xc9ced4, 0xc4a04a];
const BASE_HEIGHT = 0.05;
const BASE_RADIUS = 0.8;
const stand = new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS + 0.03, BASE_HEIGHT, 6);
const rimGeometry = new THREE.CylinderGeometry(BASE_RADIUS + 0.035, BASE_RADIUS + 0.06, BASE_HEIGHT * 0.8, 6, 1, true);
const pipGeometry = new THREE.OctahedronGeometry(0.075, 0);
const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x3d3a35, roughness: 0.9, flatShading: true });
function base(star, team) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(stand, stoneMaterial);
  top.position.y = BASE_HEIGHT / 2;
  // Hex corners line up with the tile's.
  group.add(top);
  const kind = config.study.base;
  if (kind === 'rim' || kind === 'team' || kind === 'rim+pips') {
    const colour = kind === 'team' ? TEAM_COLOURS[team] : RIM[star - 1];
    const rim = new THREE.Mesh(rimGeometry, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5, metalness: 0.1, flatShading: true, side: THREE.DoubleSide }));
    rim.position.y = BASE_HEIGHT * 0.4;
    group.add(rim);
  }
  if (kind === 'pips' || kind === 'team' || kind === 'rim+pips') {
    const pip = new THREE.MeshStandardMaterial({ color: kind === 'team' ? 0xe8e4da : PIP[star - 1], roughness: 0.5, metalness: 0.1, flatShading: true });
    for (let i = 0; i < star; i++) {
      const p = new THREE.Mesh(pipGeometry, pip);
      p.scale.set(1, 0.6, 1);
      // Along the edge towards the other team's half, centred.
      p.position.set((i - (star - 1) / 2) * 0.2, BASE_HEIGHT + 0.02, BASE_RADIUS * 0.84);
      group.add(p);
    }
  }
  return group;
}
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,240,200,0.9)');
  r.addColorStop(0.5, 'rgba(255,236,190,0.35)');
  r.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
let glow = null;
function aura() {
  glow ??= glowTexture();
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), material);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.012;
  group.add(disc);
  // A faint column of light: an open cylinder that fades upwards.
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const l = g.createLinearGradient(0, 0, 0, 64);
  l.addColorStop(0, 'rgba(255,236,190,0)');
  l.addColorStop(1, 'rgba(255,236,190,0.1)');
  g.fillStyle = l;
  g.fillRect(0, 0, 2, 64);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.62, 1.3, 12, 1, true),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  column.position.y = 0.65;
  group.add(column);
  return group;
}
// How far a model reaches from its centre, on the ground plane.
function reach(object) {
  let r = 0;
  const v = new THREE.Vector3();
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    if (!o.isMesh) return;
    const position = o.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      r = Math.max(r, Math.hypot(v.x, v.z));
    }
  });
  return r;
}
const labelLayer = document.getElementById('labels');
const labelled = [];
function starUnit(unit, star, team, col, row, face) {
  const s = config.study;
  const index = unit.models[star - 1];
  const raw = reach(gltfs[index].scene);
  const grow = (unit.rider ? s.riderGrow : s.grow) ?? [100, 100, 100];
  let factor = grow[star - 1] / 100;
  if (s.fit) factor = Math.min(factor, Math.max(1, 0.94 / raw));
  const copy = model(index, team, col, row, face);
  marks[marks.length - 1].star = star;
  marks[marks.length - 1].name = unit.name;
  const lift = s.base ? BASE_HEIGHT : 0;
  copy.scale.setScalar(factor);
  copy.position.y = lift;
  if (s.trim) {
    copy.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.name === 'trim') m.color.setHex(TRIM[star - 1]);
    });
  }
  const p = at(col, row);
  if (s.base) {
    const b = base(star, team);
    b.position.set(p.x, 0, p.z);
    b.rotation.y = copy.rotation.y;
    scene.add(b);
  }
  if (s.aura?.[star - 1]) {
    const a = aura();
    a.position.set(p.x, 0, p.z);
    scene.add(a);
  }
  const box = new THREE.Box3().setFromObject(copy);
  // The game's label sits at 1.8; it rises with the model.
  const top = 1.8 * Math.max(1, factor) + lift;
  const element = document.createElement('div');
  element.className = \`unit-label team-\${team}\`;
  element.innerHTML = \`<div class="name">\${unit.name} \${'★'.repeat(star)}</div><div class="bar"><i></i></div>\`;
  labelLayer.append(element);
  labelled.push({ element, position: new THREE.Vector3(p.x, top, p.z) });
  return { name: unit.name, star, team, scale: Math.round(factor * 1000) / 1000, reach: Math.round(raw * factor * 1000) / 1000, height: Math.round(box.max.y * 1000) / 1000 };
}
const measured = [];
function placeLabels() {
  for (const { element, position } of labelled) {
    const v = position.clone().project(camera);
    element.style.left = \`\${((v.x + 1) / 2) * config.width}px\`;
    element.style.top = \`\${((1 - v.y) / 2) * config.height}px\`;
  }
}

let zoomTarget;
if (config.study) {
  // Blue in rows 1 to 3, red mirrored in rows 6 to 4, so each unit faces itself across the middle.
  // With focus set, only that unit, blue in row 2 and red in row 5, as --lineup does.
  const focus = config.study.focus;
  config.study.units.forEach((unit, u) => {
    if (focus != null && focus !== u) return;
    for (let star = 1; star <= 3; star++) {
      const col = star + 1;
      const [blue, red] = focus == null ? [3 - u, 4 + u] : [2, 5];
      measured.push(starUnit(unit, star, 'A', col, blue, at(col, 6)));
      measured.push(starUnit(unit, star, 'B', col, red, at(col, 1)));
    }
  });
  const [blueRow, redRow] = [2, 5];
  zoomTarget = new THREE.Vector3(at(3, blueRow).x, 0.6, at(3, blueRow).z * 0.75 + at(3, redRow).z * 0.25);
  window.zoomFar = () => {
    const target = new THREE.Vector3(at(3, redRow).x, 0.6, at(3, redRow).z * 0.75 + at(3, blueRow).z * 0.25);
    view(target.clone().add(new THREE.Vector3(0, 12.5, -12.9).multiplyScalar(0.42)), target);
  };
} else if (config.lineup) {
  // One column per model: blue in row 2 facing up the board, red in row 5 facing down it.
  gltfs.forEach((_, i) => {
    const col = i + Math.floor((7 - gltfs.length) / 2);
    model(i, 'A', col, 2, at(col, 5));
    model(i, 'B', col, 5, at(col, 2));
  });
  zoomTarget = new THREE.Vector3(0, 0.5, (at(0, 2).z + at(0, 5).z) / 2);
} else {
  // A duel in the middle, a few more on each side turned a little, and a pawn on each side.
  const middle = { x: 0, z: 0 };
  model(0, 'A', 3, 3, at(3, 4));
  model(0, 'B', 3, 4, at(3, 3));
  model(0, 'A', 1, 2, at(0, 6));
  model(0, 'A', 5, 2, at(6, 5));
  model(0, 'A', 2, 1, middle);
  model(0, 'B', 1, 5, at(2, 2));
  model(0, 'B', 5, 5, at(4, 2));
  model(0, 'B', 4, 6, middle);
  place(pawn('A'), 4, 1, middle);
  place(pawn('B'), 2, 6, middle);
  zoomTarget = new THREE.Vector3(0, 0.5, 0);
}

function view(position, target) {
  camera.position.copy(position);
  camera.lookAt(target);
  renderer.render(scene, camera);
  if (config.study) placeLabels();
}
// The game's camera, behind team A's back row.
window.overview = () => view(new THREE.Vector3(0, 12.5, 12.5), new THREE.Vector3(0, 0, -0.4));
window.zoom = () => {
  const offset = new THREE.Vector3(0, 12.5, 12.9).multiplyScalar(config.study ? 0.42 : config.lineup ? 0.55 : 0.36);
  view(zoomTarget.clone().add(offset), zoomTarget);
};
window.labels = () => marks.map(({ index, team, position }) => {
  const v = position.clone().project(camera);
  return { index, team, x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
});
window.measured = () => measured;
window.overview();
window.READY = true;
`;

const types = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html' };

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.scale });
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});
await page.route(`${ORIGIN}/**`, (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/index.html') return route.fulfill({ body: PAGE, contentType: 'text/html' });
  if (url.pathname === '/main.js') return route.fulfill({ body: MAIN, contentType: 'text/javascript' });
  let file = null;
  if (url.pathname.startsWith('/three/')) file = path.join(THREE_ROOT, url.pathname.slice('/three/'.length));
  const model = url.pathname.match(/^\/models\/(\d+)\.glb$/);
  if (model) file = path.resolve(models[Number(model[1])]);
  if (file === null || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
  return route.fulfill({ path: file, contentType: types[path.extname(file)] ?? 'application/octet-stream' });
});
await page.addInitScript((c) => {
  window.CONFIG = c;
}, config);
await page.goto(`${ORIGIN}/index.html`);
try {
  await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
} catch (error) {
  console.error(problems.join('\n') || String(error));
  await browser.close();
  process.exit(1);
}
const labels = {};
await page.evaluate(() => window.overview());
await page.screenshot({ path: path.join(outDir, 'board.png') });
labels.overview = await page.evaluate(() => window.labels());
await page.evaluate(() => window.zoom());
await page.screenshot({ path: path.join(outDir, 'board-zoom.png') });
labels.zoom = await page.evaluate(() => window.labels());
if (study) {
  // From behind the red side, to see the blue models' fronts.
  await page.evaluate(() => window.zoomFar());
  await page.screenshot({ path: path.join(outDir, 'board-far.png') });
  labels.measured = await page.evaluate(() => window.measured());
}
fs.writeFileSync(path.join(outDir, 'labels.json'), JSON.stringify(labels, null, 1));
if (problems.length > 0) console.error(problems.join('\n'));
await browser.close();
console.log(`BOARD ${path.join(outDir, 'board.png')} ${path.join(outDir, 'board-zoom.png')}`);
