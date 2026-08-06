// Renderer, lighting, and scene assembly. Quiet and focused: warm key light
// over the table, soft shadows, dark surround. Nothing moves but the dice.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildTable } from './table';
import { createDieMesh } from './dice-visual';
import { RailCamera } from './camera';
import { DICE } from './constants';

export interface CrapsScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cameraRig: RailCamera;
  dice: [THREE.Mesh, THREE.Mesh];
  /** Register a per-frame callback (delta seconds). */
  onFrame(cb: (delta: number) => void): void;
  /** Subtle depth of field on/off. */
  setDof(on: boolean): void;
  /** Where the camera should be focused (meters from the eye). */
  setFocusDistance(d: number): void;
}

export function createScene(container: HTMLElement): CrapsScene {
  // Render resolution comes from a pixel BUDGET rather than a flat cap, so a
  // small viewport can spend its budget on sharpness: a phone (≈0.4 MP of CSS
  // pixels) renders at the full 2x, where the old flat 1.5x cap left it soft.
  //
  // The budget only ever RAISES the ratio — it is floored at the old cap, so
  // a large window renders exactly as it always did. Without that floor the
  // budget term falls under 1.0 past ~2.6 MP and the canvas would be drawn
  // smaller than its own CSS box and upscaled: blurrier than doing nothing.
  const PIXEL_BUDGET = 2.6e6;
  const RATIO_CAP = 2;
  const RATIO_FLOOR = 1.5;
  const pixelRatio = () => {
    const css = Math.max(1, container.clientWidth * container.clientHeight);
    const budgeted = Math.max(Math.sqrt(PIXEL_BUDGET / css), RATIO_FLOOR);
    return Math.min(window.devicePixelRatio, RATIO_CAP, budgeted);
  };
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0c10');

  // Soft procedural environment so chips, dice, and wood pick up gentle
  // reflections — generated, not downloaded.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  pmrem.dispose(); // the generated texture stays; the generator's targets go

  // Warm key light over the table.
  const key = new THREE.DirectionalLight('#ffe7c4', 3.4);
  key.position.set(0.4, 2.2, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -1.9;
  key.shadow.camera.right = 1.9;
  key.shadow.camera.top = 1.3;
  key.shadow.camera.bottom = -1.3;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 5;
  key.shadow.bias = -0.0003;
  scene.add(key);
  scene.add(key.target);

  // Soft fill so shadowed sides aren't pitch black.
  const fill = new THREE.HemisphereLight('#46545e', '#1c1712', 0.9);
  scene.add(fill);

  // Faint bounce from the player side so the near rail and dice faces read.
  const bounce = new THREE.DirectionalLight('#d8c9b0', 0.5);
  bounce.position.set(0.3, 0.8, 1.8);
  scene.add(bounce);
  scene.add(bounce.target);

  scene.add(buildTable());

  const dice: [THREE.Mesh, THREE.Mesh] = [createDieMesh(), createDieMesh()];
  // Resting spots on the felt in view of the rail camera before the first throw.
  dice[0].position.set(0.06, DICE.half, 0.1);
  dice[1].position.set(0.12, DICE.half, 0.15);
  dice[1].rotation.y = 0.7;
  scene.add(dice[0], dice[1]);

  const cameraRig = new RailCamera(container.clientWidth / container.clientHeight);
  cameraRig.resize(container.clientWidth / container.clientHeight, container.clientHeight);
  cameraRig.attach(renderer.domElement);

  // Subtle depth of field: full-scene render + bokeh, toggleable.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cameraRig.camera));
  const bokeh = new BokehPass(scene, cameraRig.camera, {
    focus: 1.3,
    aperture: 0.00012,
    maxblur: 0.0045,
  });
  composer.addPass(bokeh);
  composer.addPass(new OutputPass()); // applies tone mapping + sRGB after the bokeh
  let dofEnabled = true;
  let focusTarget = 1.3;

  const applySize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    const ratio = pixelRatio(); // re-derived: viewport size and DPR both vary
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    cameraRig.resize(w / h, h);
  };
  // ResizeObserver reports honest sizes on iOS rotation, where the classic
  // resize event often fires with stale dimensions; keep both, plus the
  // visual viewport (Safari toolbar collapse), a delayed orientation
  // re-check, and a slow watchdog that corrects any drift that slipped
  // through — the canvas can never stay letterboxed.
  new ResizeObserver(applySize).observe(container);
  window.addEventListener('resize', applySize);
  window.visualViewport?.addEventListener('resize', applySize);
  window.addEventListener('orientationchange', () => {
    applySize();
    setTimeout(applySize, 350);
    setTimeout(applySize, 900);
  });
  const sizeProbe = new THREE.Vector2();
  setInterval(() => {
    renderer.getSize(sizeProbe);
    if (
      Math.abs(sizeProbe.x - container.clientWidth) > 2 ||
      Math.abs(sizeProbe.y - container.clientHeight) > 2
    ) {
      applySize();
    }
  }, 700);

  const frameCallbacks: Array<(delta: number) => void> = [];
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.1);
    for (const cb of frameCallbacks) cb(delta);
    cameraRig.update(delta);
    if (dofEnabled) {
      // Ease the focal plane toward its target so focus pulls feel filmic.
      const uniforms = bokeh.uniforms as { focus: { value: number } };
      uniforms.focus.value += (focusTarget - uniforms.focus.value) * Math.min(1, 5 * delta);
      composer.render();
    } else {
      renderer.render(scene, cameraRig.camera);
    }
  });

  return {
    renderer,
    scene,
    cameraRig,
    dice,
    onFrame: (cb) => frameCallbacks.push(cb),
    setDof: (on) => {
      dofEnabled = on;
    },
    setFocusDistance: (d) => {
      focusTarget = d;
    },
  };
}
