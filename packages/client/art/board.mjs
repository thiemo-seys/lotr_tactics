/* global console, process, URL, window */
// Renders .glb models on the game's board with three.js in headless Chromium, with the camera,
// lights, board and team colours of packages/client/src/scene.ts, so a model can be judged at the
// size it is played at. Each model is recoloured blue (near side) and red (far side) through its
// `team` material, the way the client will, and stands next to today's pawn for scale.
//
//   node packages/client/art/board.mjs <out dir> <model.glb> [--toon] [--scale=2]
//   node packages/client/art/board.mjs <out dir> --lineup <a.glb> <b.glb> ... [--scale=2]
//
// Writes board.png (the game's default camera, 1600x900), board-zoom.png (the same angle, closer)
// and labels.json (where each model is in both pictures). --lineup puts each model, up to 7, in its
// own column, blue from behind and red from the front; otherwise one model stands in a small fight.
// --toon draws three-step toon shading, and any material named `outline` unlit, as a client could.
// --scale=2 renders at twice the pixel density.
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
const [outDir, ...models] = args.filter((a) => !a.startsWith('--'));
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
};

const PAGE = `<!doctype html><html><head><style>html,body{margin:0;background:#12161c;overflow:hidden}</style>
<script type="importmap">{"imports":{"three":"${ORIGIN}/three/build/three.module.js","three/addons/":"${ORIGIN}/three/examples/jsm/"}}</script>
</head><body><script type="module" src="${ORIGIN}/main.js"></script></body></html>`;

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
}

let zoomTarget;
if (config.lineup) {
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
}
// The game's camera, behind team A's back row.
window.overview = () => view(new THREE.Vector3(0, 12.5, 12.5), new THREE.Vector3(0, 0, -0.4));
window.zoom = () => {
  const offset = new THREE.Vector3(0, 12.5, 12.9).multiplyScalar(config.lineup ? 0.55 : 0.36);
  view(zoomTarget.clone().add(offset), zoomTarget);
};
window.labels = () => marks.map(({ index, team, position }) => {
  const v = position.clone().project(camera);
  return { index, team, x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
});
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
fs.writeFileSync(path.join(outDir, 'labels.json'), JSON.stringify(labels, null, 1));
if (problems.length > 0) console.error(problems.join('\n'));
await browser.close();
console.log(`BOARD ${path.join(outDir, 'board.png')} ${path.join(outDir, 'board-zoom.png')}`);
