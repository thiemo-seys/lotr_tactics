// What is laid over each frame (docs/viewer-spec.md section 3, Arena): the scene is drawn into a
// texture, with its depth; blurred round the board, more the further along the ground from what
// the camera looks at, in two passes, across and down; then graded, warmer and softer away from the
// board, with a vignette, and written to the canvas in display colours. The numbers are in look.ts.

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { BLUR, GRADE } from './look.js';

/** Works out, from the depth buffer, how far along the ground from the focus a pixel is, and so how blurred it is. */
const BLUR_MASK = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 projectionInverse;
  uniform mat4 cameraWorld;
  uniform vec3 focus;
  uniform float inner;
  uniform float outer;

  float blurAt(vec2 uv) {
    float depth = texture2D(tDepth, uv).x;
    if (depth >= 1.0) return 1.0;
    vec4 view = projectionInverse * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec3 world = (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
    return smoothstep(inner, outer, length(world.xz - focus.xz));
  }
`;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * One direction of the blur: nine taps along `direction`, spread by how blurred the pixel is. A tap on
 * something in focus counts for little, so the board and units don't smear into the blur round them.
 */
const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tColour;
  uniform vec2 direction;
  varying vec2 vUv;
  ${BLUR_MASK}

  void main() {
    float amount = blurAt(vUv);
    vec4 sum = texture2D(tColour, vUv) * 0.2270270270;
    float total = 0.2270270270;
    if (amount > 0.001) {
      float weights[4] = float[4](0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);
      for (int i = 0; i < 4; i++) {
        vec2 offset = direction * amount * float(i + 1);
        float a = 0.15 + 0.85 * blurAt(vUv + offset);
        float b = 0.15 + 0.85 * blurAt(vUv - offset);
        sum += texture2D(tColour, vUv + offset) * weights[i] * a + texture2D(tColour, vUv - offset) * weights[i] * b;
        total += weights[i] * (a + b);
      }
    }
    gl_FragColor = sum / total;
  }
`;

/** The grade and the vignette, in display colours, written to the canvas. */
const GRADE_FRAGMENT = /* glsl */ `
  uniform sampler2D tColour;
  uniform vec3 warmth;
  uniform float saturation;
  uniform float contrast;
  uniform float centre;
  uniform float vignette;
  uniform float vignetteInner;
  uniform float vignetteOuter;
  uniform float aspect;
  varying vec2 vUv;
  ${BLUR_MASK}

  vec3 toDisplay(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec3 colour = toDisplay(texture2D(tColour, vUv).rgb);
    vec3 graded = colour * warmth;
    float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
    graded = mix(vec3(luma), graded, saturation);
    graded = (graded - 0.5) * contrast + 0.5;
    colour = mix(colour, graded, mix(centre, 1.0, blurAt(vUv)));
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    colour *= mix(1.0 - vignette, 1.0, 1.0 - smoothstep(vignetteInner, vignetteOuter, length(p)));
    gl_FragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
  }
`;

export class Post {
  /** The scene as drawn, multisampled, with its depth. */
  private readonly scene: THREE.WebGLRenderTarget;
  /** The scene blurred across, then across and down. */
  private readonly across: THREE.WebGLRenderTarget;
  private readonly down: THREE.WebGLRenderTarget;
  private readonly blur: THREE.ShaderMaterial;
  private readonly grade: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  private pixelRatio = 1;

  constructor() {
    const options = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.scene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
    this.across = new THREE.WebGLRenderTarget(1, 1, options);
    this.down = new THREE.WebGLRenderTarget(1, 1, options);
    const mask = () => ({
      tDepth: { value: this.scene.depthTexture },
      projectionInverse: { value: new THREE.Matrix4() },
      cameraWorld: { value: new THREE.Matrix4() },
      focus: { value: new THREE.Vector3() },
      inner: { value: BLUR.inner },
      outer: { value: BLUR.outer },
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tColour: { value: null }, direction: { value: new THREE.Vector2() }, ...mask() },
      vertexShader: VERTEX,
      fragmentShader: BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.grade = new THREE.ShaderMaterial({
      uniforms: {
        tColour: { value: this.down.texture },
        warmth: { value: new THREE.Vector3(...GRADE.warmth) },
        saturation: { value: GRADE.saturation },
        contrast: { value: GRADE.contrast },
        centre: { value: GRADE.centre },
        vignette: { value: GRADE.vignette },
        vignetteInner: { value: GRADE.vignetteInner },
        vignetteOuter: { value: GRADE.vignetteOuter },
        aspect: { value: 1 },
        ...mask(),
      },
      vertexShader: VERTEX,
      fragmentShader: GRADE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
  }

  /** Sizes the textures for a canvas of `width` by `height` CSS pixels at `pixelRatio`. */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    for (const target of [this.scene, this.across, this.down]) target.setSize(w, h);
    this.grade.uniforms.aspect!.value = width / Math.max(1, height);
  }

  /** Draws `scene` from `camera`, in focus round `focus`, to the canvas. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, focus: THREE.Vector3): void {
    for (const material of [this.blur, this.grade]) {
      const u = material.uniforms;
      (u.projectionInverse!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
      (u.cameraWorld!.value as THREE.Matrix4).copy(camera.matrixWorld);
      (u.focus!.value as THREE.Vector3).copy(focus);
    }
    renderer.setRenderTarget(this.scene);
    renderer.render(scene, camera);

    const { width, height } = this.scene;
    const spread = (BLUR.maxRadius * this.pixelRatio) / 4;
    this.quad.material = this.blur;
    this.blur.uniforms.tColour!.value = this.scene.texture;
    (this.blur.uniforms.direction!.value as THREE.Vector2).set(spread / width, 0);
    renderer.setRenderTarget(this.across);
    this.quad.render(renderer);
    this.blur.uniforms.tColour!.value = this.across.texture;
    (this.blur.uniforms.direction!.value as THREE.Vector2).set(0, spread / height);
    renderer.setRenderTarget(this.down);
    this.quad.render(renderer);

    this.quad.material = this.grade;
    renderer.setRenderTarget(null);
    this.quad.render(renderer);
  }
}
