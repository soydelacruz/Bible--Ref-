import {
  ACESFilmicToneMapping,
  AddEquation,
  CustomBlending,
  OneFactor,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { seededRandom } from '../../core/lib/random.ts';
import { crossBeams, CROSS_PROPORTIONS, type Beam } from './cross-geometry.ts';

/** Largest device pixel ratio rendered: past this the cost grows and the picture does not. */
const MAX_PIXEL_RATIO = 2;
/** Where the light comes from: high on the left, in front, like a window at dawn. */
const LIGHT_POSITION = new Vector3(-7.5, 10, 6.5);
/** How long dawn takes on arrival: the light rises and the camera settles. */
const DAWN_MS = 2600;
const DUST_COUNT = 900;

export interface CrossScene {
  dispose(): void;
}

/**
 * Hand-drawn wood: long grain lines that waver and part around a few knots, over a warm, uneven
 * base. Drawn once on a canvas, it serves as both the color and the bump of the timber.
 */
function woodTexture(seed: number): CanvasTexture {
  const width = 256;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for the wood texture.');
  const random = seededRandom(seed);

  const base = context.createLinearGradient(0, 0, width, 0);
  base.addColorStop(0, '#4a2f1d');
  base.addColorStop(0.45, '#6a4529');
  base.addColorStop(0.55, '#634026');
  base.addColorStop(1, '#46301f');
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  const knots = Array.from({ length: 3 }, () => ({
    x: width * (0.2 + random() * 0.6),
    y: height * (0.12 + random() * 0.76),
    size: 10 + random() * 16,
  }));

  for (let line = 0; line < 150; line += 1) {
    const x0 = random() * width;
    const wave = 2 + random() * 6;
    const frequency = 0.004 + random() * 0.01;
    const phase = random() * Math.PI * 2;
    const dark = random() < 0.62;
    context.strokeStyle = dark
      ? `rgba(36, 20, 10, ${String(0.12 + random() * 0.3)})`
      : `rgba(150, 104, 64, ${String(0.06 + random() * 0.14)})`;
    context.lineWidth = 0.6 + random() * 1.8;
    context.beginPath();
    for (let y = 0; y <= height; y += 8) {
      let x = x0 + Math.sin(y * frequency + phase) * wave;
      for (const knot of knots) {
        const near = Math.exp(-((y - knot.y) ** 2) / (2 * (knot.size * 2.4) ** 2));
        x += Math.sign(x - knot.x || 1) * near * knot.size * 1.6;
      }
      if (y === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  for (const knot of knots) {
    for (let ring = 5; ring > 0; ring -= 1) {
      context.strokeStyle = `rgba(30, 16, 8, ${String(0.12 + ring * 0.05)})`;
      context.lineWidth = 1.2;
      context.beginPath();
      context.ellipse(
        knot.x,
        knot.y,
        (knot.size * ring) / 5,
        (knot.size * ring) / 2.6,
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
    context.fillStyle = 'rgba(24, 12, 6, 0.7)';
    context.beginPath();
    context.ellipse(knot.x, knot.y, knot.size / 4, knot.size / 2.2, 0, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** One timber: a softly rounded box whose grain runs along its length. */
function beamMesh(beam: Beam, seed: number): Mesh {
  const [width, height, depth] = beam.size;
  const geometry = new RoundedBoxGeometry(width, height, depth, 4, 0.045);
  const texture: Texture = woodTexture(seed);
  if (width > height) {
    // The crossbar lies on its side, so its grain does too.
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI / 2;
  }
  const material = new MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: 1.4,
    roughness: 0.82,
    metalness: 0,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...beam.position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * How the beam and the dust are drawn: their light is added to what is there, alpha included, so
 * over the transparent canvas they brighten the page behind it instead of blacking it out.
 */
const ADD_LIGHT = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
} as const;

const SHAFT_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlong;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    vAlong = uv.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHAFT_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlong;
  void main() {
    // Brightest through the middle of the beam, fading at its edges and toward its far end.
    float facing = pow(abs(dot(normalize(vNormal), normalize(vView))), 3.5);
    float fade = smoothstep(0.0, 0.25, vAlong) * smoothstep(1.0, 0.55, vAlong);
    // Premultiplied light: alpha is its own brightness, so the beam only adds light to the page
    // behind the canvas and never covers it.
    vec3 light = vec3(1.0, 0.82, 0.58) * facing * fade * uStrength;
    gl_FragColor = vec4(light, max(light.r, max(light.g, light.b)));
  }
`;

/** The shaft of light from the window to the cross: a faint, open cone drawn additively. */
function lightShaft(
  from: Vector3,
  to: Vector3,
  strength: { value: number },
): { mesh: Mesh; material: ShaderMaterial } {
  const length = from.distanceTo(to) * 1.25;
  const geometry = new CylinderGeometry(0.3, 2.3, length, 64, 1, true);
  const material = new ShaderMaterial({
    vertexShader: SHAFT_VERTEX,
    fragmentShader: SHAFT_FRAGMENT,
    uniforms: { uStrength: strength },
    transparent: true,
    ...ADD_LIGHT,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  const direction = new Vector3().subVectors(to, from).normalize();
  // A cylinder stands along +y; point its narrow top at the window and its wide end past the cross.
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), direction));
  mesh.position.copy(from).addScaledVector(direction, length / 2);
  return { mesh, material };
}

const DUST_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3 uOrigin;
  uniform vec3 uDirection;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vGlow;
  void main() {
    vec3 p = position;
    // Motes sink slowly and sway, wrapping round so the air never empties.
    p.y = mod(p.y - uTime * (0.05 + aSeed * 0.07) + 6.0, 12.0) - 6.0;
    p.x += sin(uTime * 0.21 + aSeed * 40.0) * 0.35;
    p.z += cos(uTime * 0.17 + aSeed * 23.0) * 0.25;
    // Only motes inside the shaft of light catch it.
    vec3 offset = p - uOrigin;
    float along = dot(offset, uDirection);
    float radius = 0.3 + along * 0.13;
    float apart = length(offset - uDirection * along);
    vGlow = smoothstep(radius, radius * 0.25, apart) * smoothstep(2.0, 7.0, along);
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (1.2 + aSeed * 2.6) * uPixelRatio * (16.0 / -view.z);
    gl_Position = projectionMatrix * view;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.0, d);
    vec3 light = vec3(1.0, 0.86, 0.66) * disc * vGlow * uStrength;
    gl_FragColor = vec4(light, max(light.r, max(light.g, light.b)));
  }
`;

function dust(origin: Vector3, direction: Vector3, pixelRatio: number) {
  const random = seededRandom(7);
  const positions = new Float32Array(DUST_COUNT * 3);
  const seeds = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i += 1) {
    positions[i * 3] = -7 + random() * 10;
    positions[i * 3 + 1] = -6 + random() * 12;
    positions[i * 3 + 2] = -3 + random() * 8;
    seeds[i] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  const time = { value: 0 };
  const strength = { value: 0 };
  const material = new ShaderMaterial({
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    uniforms: {
      uTime: time,
      uStrength: strength,
      uOrigin: { value: origin },
      uDirection: { value: direction },
      uPixelRatio: { value: pixelRatio },
    },
    transparent: true,
    ...ADD_LIGHT,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return { points, time, strength };
}

/** The camera distance at which the whole cross fills the frame without touching its edges. */
function fitDistance(camera: PerspectiveCamera, portrait: boolean): number {
  const [, crossbar] = crossBeams();
  const height = CROSS_PROPORTIONS.height * (portrait ? 1.9 : 1.32);
  const width = crossbar.size[0] * (portrait ? 2.1 : 2.6);
  const tan = Math.tan(MathUtils.degToRad(camera.fov / 2));
  return Math.max(height / (2 * tan), width / (2 * tan * camera.aspect));
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/**
 * Draws the cross in `host`: a timber Latin cross turning slowly in a shaft of dawn light, with
 * dust drifting through the beam. With `still`, one unmoving frame, redrawn only on resize.
 * Throws if the browser cannot draw WebGL.
 */
export function startCrossScene(host: HTMLElement, { still }: { still: boolean }): CrossScene {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  const pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  host.append(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);

  const cross = new Group();
  crossBeams().forEach((beam, index) => cross.add(beamMesh(beam, 11 + index * 31)));
  const pivot = new Group();
  pivot.add(cross);
  scene.add(pivot);

  scene.add(new AmbientLight(0x3a2a20, 0.55));
  const key = new SpotLight(0xffd6a0, 0, 0, 0.36, 0.85, 1.4);
  key.position.copy(LIGHT_POSITION);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0008;
  key.shadow.radius = 6;
  const keyTarget = new Object3D();
  key.target = keyTarget;
  scene.add(key, keyTarget);
  // A cool, faint light from behind the right shoulder, so the far edges read against the dark.
  const rim = new DirectionalLight(0x9aaccc, 0);
  rim.position.set(6, 4, -7);
  scene.add(rim);

  const shaftOrigin = LIGHT_POSITION.clone();
  const shaftDirection = new Vector3();
  const shaftStrength = { value: 0 };
  const shaft = lightShaft(shaftOrigin, new Vector3(), shaftStrength);
  scene.add(shaft.mesh);
  const motes = dust(shaftOrigin, shaftDirection, pixelRatio);
  scene.add(motes.points);

  let portrait = false;
  let distance = 15;
  const layout = () => {
    const width = host.clientWidth || window.innerWidth;
    const height = host.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    portrait = height > width;
    distance = fitDistance(camera, portrait);
    // On a wide screen the cross stands right of center and the verse has the left; on a tall one
    // it stands high, with the verse beneath.
    pivot.position.set(portrait ? 0 : 1.9, portrait ? 2.3 : 0.25, 0);
    keyTarget.position.copy(pivot.position);
    shaftDirection.subVectors(pivot.position, shaftOrigin).normalize();
    const next = lightShaft(shaftOrigin, pivot.position, shaftStrength);
    shaft.mesh.geometry.dispose();
    shaft.mesh.geometry = next.mesh.geometry;
    shaft.mesh.quaternion.copy(next.mesh.quaternion);
    shaft.mesh.position.copy(next.mesh.position);
    next.material.dispose();
    camera.updateProjectionMatrix();
  };
  layout();

  let pointerX = 0;
  let pointerY = 0;
  const onPointer = (event: PointerEvent) => {
    pointerX = (event.clientX / window.innerWidth) * 2 - 1;
    pointerY = (event.clientY / window.innerHeight) * 2 - 1;
  };

  const start = performance.now();
  let turnX = 0;
  let turnY = 0;
  const frame = (now: number) => {
    const elapsed = now - start;
    const dawn = still ? 1 : easeOutExpo(Math.min(1, elapsed / DAWN_MS));
    const t = elapsed / 1000;
    key.intensity = 260 * dawn;
    rim.intensity = 0.7 * dawn;
    shaftStrength.value = 0.16 * dawn;
    motes.strength.value = 0.9 * dawn;
    motes.time.value = still ? 0 : t;
    // A slow sway, and a lean toward the pointer that eases in rather than snapping.
    const sway = still ? -0.18 : Math.sin(t * 0.16) * 0.24 - 0.12;
    turnY += (sway + pointerX * 0.22 - turnY) * 0.04;
    turnX += (pointerY * 0.05 - turnX) * 0.04;
    pivot.rotation.set(still ? 0 : turnX, still ? sway : turnY, 0);
    camera.position.set(-0.6, 0.55, distance * (1 + (1 - dawn) * 0.14));
    // On a tall screen the camera holds still and the cross stands above its aim, leaving room
    // beneath for the verse.
    camera.lookAt(pivot.position.x * 0.55, portrait ? 0.4 : pivot.position.y * 0.8, 0);
    renderer.render(scene, camera);
  };

  const resize = new ResizeObserver(() => {
    layout();
    if (still) frame(performance.now());
  });
  resize.observe(host);

  const play = () => {
    renderer.setAnimationLoop(document.visibilityState === 'visible' ? frame : null);
  };
  if (still) {
    frame(performance.now());
  } else {
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', play);
    play();
  }

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', play);
      scene.traverse((object) => {
        if (!(object instanceof Mesh) && !(object instanceof Points)) return;
        // Every mesh and point cloud here has one geometry and one material of these two kinds.
        const { geometry, material } = object as Mesh<
          BufferGeometry,
          MeshStandardMaterial | ShaderMaterial
        >;
        geometry.dispose();
        if (material instanceof MeshStandardMaterial) material.map?.dispose();
        material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
