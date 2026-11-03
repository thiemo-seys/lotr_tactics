// The arena the board stands in (docs/viewer-spec.md section 3, Arena): one static .glb from
// public/arenas, built in Blender from packages/client/art/arenas, its faces shaded flat and darkened
// by the occlusion baked into its vertex colours. It only sets the scene, so a missing or broken file
// leaves the board on the background colour.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARENA } from './look.js';

/** Loads the arena, ready to add to the scene; null if it didn't load. */
export async function loadArena(): Promise<THREE.Object3D | null> {
  try {
    // Relative to the page, so the built client works from any folder.
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}arenas/${ARENA}.glb`);
    const arena = gltf.scene;
    arena.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      // Exported without normals: every face is shaded flat, as the models are.
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial) material.flatShading = true;
      }
    });
    // It never moves.
    arena.updateMatrixWorld(true);
    arena.traverse((object) => {
      object.matrixAutoUpdate = false;
    });
    return arena;
  } catch (error: unknown) {
    console.warn(`The arena ${ARENA} didn't load, so the board stands on the background.`, error);
    return null;
  }
}
