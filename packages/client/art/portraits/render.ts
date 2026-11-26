// Renders each unit's portrait for the shop's unit cards (docs/viewer-spec.md section 4, Portraits),
// in the page that art/portraits/portraits.mjs opens in headless Chromium. It loads the models the way
// the game does (src/models.ts), so a portrait has the unit's livery and trim, and poses a rigged model
// in its idle clip. The camera frames the head and shoulders from the model's `head` bone, turned a
// little to the left, on a clear background: the card draws the backdrop.

import * as THREE from 'three';
import { UNITS, type UnitId } from '@lotr-tactics/sim';
import { copyModel, loadModels, modelsLoaded } from '../../src/models.js';
import { PORTRAIT_FRAMING } from './framing.js';

/** How far the model turns to its left, in radians, so its face isn't flat on. */
const TURN = 0.45;
/** The camera's vertical field of view in degrees: narrow, so the figure isn't distorted. */
const FOV = 24;
/** How far into its idle clip the model is posed, in seconds. */
const IDLE_AT = 0.4;
/** How much of the model the portrait shows, top to bottom, in lengths of its torso. */
const SPAN = 2.7;
/** How far above the base of its head the portrait is centred, in lengths of its torso. */
const LIFT = -0.05;

const canvas = document.getElementById('portrait') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 0);

const ids = Object.keys(UNITS) as UnitId[];
loadModels();

/** A warm key light from the front right, a rim light from behind, and a sky over brown earth. */
function lights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x3a2414, 1.3));
  const key = new THREE.DirectionalLight(0xffe2b0, 2.6);
  key.position.set(2.5, 4, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc070, 2.2);
  rim.position.set(-3, 3, -3);
  scene.add(rim);
}

/** The unit's portrait as a WebP data URL, or null if it has no model. */
function portrait(id: UnitId, size: number, quality: number): string | null {
  const copy = copyModel(id, 1);
  if (copy === null) return null;
  const scene = new THREE.Scene();
  lights(scene);
  scene.add(copy.object);
  copy.model.rotation.y = TURN;
  if (copy.clips !== null) {
    const mixer = new THREE.AnimationMixer(copy.model);
    mixer.clipAction(copy.clips.idle).play();
    mixer.update(IDLE_AT);
  }
  copy.object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(copy.object);
  const framing = PORTRAIT_FRAMING[id] ?? {};
  const bone = (name: string) => copy.model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()) ?? null;
  const head = bone('head');
  const hips = bone('hips');
  // A rigged model is framed by its torso, from its hips to the base of its head, so a rider, a tall
  // figure and one that crouches show at the same size; a static model by its height.
  const torso = head !== null && hips !== null ? head.distanceTo(hips) : (box.max.y - box.min.y) / 2.6;
  const at = head ?? new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - torso, (box.min.z + box.max.z) / 2);
  const span = torso * SPAN * (framing.zoom ?? 1);
  at.y += torso * (LIFT + (framing.lift ?? 0));
  at.x += torso * (framing.shift ?? 0);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);
  const distance = span / 2 / Math.tan(((FOV / 2) * Math.PI) / 180);
  camera.position.set(at.x, at.y + distance * 0.12, at.z + distance);
  camera.lookAt(at);
  renderer.setSize(size, size, false);
  renderer.render(scene, camera);
  return canvas.toDataURL('image/webp', quality);
}

/** Waits for every 1★ model to load, then renders each unit's portrait. */
async function portraits(size: number, quality: number): Promise<Record<string, string>> {
  for (let i = 0; i < 600 && modelsLoaded() < ids.length; i++) await new Promise((resolve) => setTimeout(resolve, 100));
  const out: Record<string, string> = {};
  for (const id of ids) {
    const url = portrait(id, size, quality);
    if (url !== null) out[id] = url;
  }
  return out;
}

(window as unknown as { portraits: typeof portraits }).portraits = portraits;
