// Low-poly floating island where every focus session grows a tree.
// All geometry is generated in code: there are no model or texture files.

import * as THREE from '../../node_modules/three/build/three.module.js';
import { treePosition, islandRadius } from './core.js';

const MATS = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!MATS.has(key)) {
    MATS.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...opts }));
  }
  return MATS.get(key);
}

// Small deterministic PRNG so a tree always looks the same between launches.
function rng(seed) {
  let s = Math.floor(seed * 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function mesh(geo, material, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Shared low-poly geometries.
const G = {
  ico: new THREE.IcosahedronGeometry(1, 0),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 7),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 6),
  trunk: new THREE.CylinderGeometry(0.7, 1, 1, 6),
  sphere: new THREE.SphereGeometry(1, 6, 5),
  box: new THREE.BoxGeometry(1, 1, 1),
  leaf: new THREE.ConeGeometry(1, 1, 3),
};
G.cyl.translate(0, 0.5, 0);
G.trunk.translate(0, 0.5, 0);

const PALETTE = {
  oak: { trunk: '#7a5235', leaves: ['#4f9a4a', '#5eac52', '#458a43'] },
  pine: { trunk: '#6b4a30', leaves: ['#2f6b45', '#377a4e', '#2a5f3e'] },
  cherry: { trunk: '#6e4a3a', leaves: ['#f2a7c3', '#f7c2d6', '#e993b4'] },
  palm: { trunk: '#a58157', leaves: ['#5aa04a', '#4c8f3f', '#68b052'] },
  withered: { trunk: '#5c4a3b', leaves: ['#8a7356', '#7a6650', '#9a8462'] },
};

// ---------------------------------------------------------------------------
// Tree builders. Each returns { group, sway } where sway is the part that moves in the wind.
// ---------------------------------------------------------------------------
function buildFullTree(species, colors, rand) {
  const g = new THREE.Group();
  const sway = new THREE.Group();
  const leaf = (i) => mat(colors.leaves[i % colors.leaves.length]);
  const trunkMat = mat(colors.trunk);
  const h = 0.9 + rand() * 0.25;

  if (species === 'pine') {
    g.add(mesh(G.trunk, trunkMat, { sx: 0.1, sz: 0.1, sy: 0.5 }));
    sway.position.y = 0.35;
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const w = 0.62 - i * 0.15;
      sway.add(mesh(G.cone, leaf(i), { y: 0.3 + i * 0.42 * h, sx: w, sz: w, sy: 0.75, ry: rand() * Math.PI }));
    }
  } else if (species === 'palm') {
    // Curved trunk built from tilted segments.
    let x = 0, y = 0;
    const lean = 0.08 + rand() * 0.08;
    for (let i = 0; i < 5; i++) {
      const seg = mesh(G.trunk, trunkMat, { x, y, sx: 0.09 - i * 0.008, sz: 0.09 - i * 0.008, sy: 0.3, rz: -lean * (i + 1) * 0.6 });
      g.add(seg);
      x += Math.sin(lean * (i + 1) * 0.6) * 0.3;
      y += Math.cos(lean * (i + 1) * 0.6) * 0.3 * 0.97;
    }
    sway.position.set(x, y, 0);
    const fronds = 7;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + rand() * 0.3;
      const f = new THREE.Group();
      f.rotation.y = a;
      f.add(mesh(G.leaf, leaf(i), { x: 0.38, y: -0.08, sx: 0.12, sy: 0.75, sz: 0.04, rz: -Math.PI / 2 - 0.45 }));
      sway.add(f);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      sway.add(mesh(G.sphere, mat('#6b4a2c'), { x: Math.cos(a) * 0.07, y: -0.08, z: Math.sin(a) * 0.07, sx: 0.06, sy: 0.06, sz: 0.06 }));
    }
  } else {
    // Oak and cherry: chunky trunk with a cluster of low-poly blobs.
    g.add(mesh(G.trunk, trunkMat, { sx: 0.13, sz: 0.13, sy: 0.6 * h }));
    g.add(mesh(G.trunk, trunkMat, { x: 0.08, y: 0.35, sx: 0.05, sz: 0.05, sy: 0.3, rz: -0.7 }));
    sway.position.y = 0.6 * h;
    const blobs = species === 'cherry' ? 5 : 4;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + rand();
      const r = i === 0 ? 0 : 0.22 + rand() * 0.1;
      const s = i === 0 ? 0.42 : 0.26 + rand() * 0.1;
      sway.add(mesh(G.ico, leaf(i), {
        x: Math.cos(a) * r, z: Math.sin(a) * r, y: (i === 0 ? 0.3 : 0.15 + rand() * 0.25),
        sx: s, sy: s * 0.9, sz: s, rx: rand(), ry: rand(),
      }));
    }
    if (species === 'cherry') {
      for (let i = 0; i < 6; i++) {
        const a = rand() * Math.PI * 2;
        sway.add(mesh(G.ico, mat('#fff1f6'), { x: Math.cos(a) * 0.35, y: 0.1 + rand() * 0.45, z: Math.sin(a) * 0.35, sx: 0.05, sy: 0.05, sz: 0.05 }));
      }
    }
  }
  g.add(sway);
  return { group: g, sway };
}

export function buildTree(species, stage, { withered = false, seed = 0.5 } = {}) {
  const rand = rng(seed);
  const colors = withered ? PALETTE.withered : PALETTE[species] || PALETTE.oak;
  const root = new THREE.Group();
  let sway = root;

  if (stage === 'seed') {
    root.add(mesh(G.sphere, mat('#6b4a2c'), { y: 0.02, sx: 0.18, sy: 0.07, sz: 0.18 }));
    root.add(mesh(G.sphere, mat(withered ? '#5c4a3b' : '#c99a5b'), { y: 0.09, sx: 0.06, sy: 0.08, sz: 0.06 }));
  } else if (stage === 'sprout') {
    root.add(mesh(G.sphere, mat('#6b4a2c'), { y: 0.02, sx: 0.16, sy: 0.05, sz: 0.16 }));
    sway = new THREE.Group();
    sway.add(mesh(G.cyl, mat(withered ? '#7a6650' : '#6fae4f'), { sx: 0.02, sz: 0.02, sy: 0.25 }));
    const leafMat = mat(withered ? '#8a7356' : '#7cc45a');
    sway.add(mesh(G.ico, leafMat, { x: 0.06, y: 0.25, sx: 0.08, sy: 0.03, sz: 0.05, rz: 0.4 }));
    sway.add(mesh(G.ico, leafMat, { x: -0.06, y: 0.22, sx: 0.08, sy: 0.03, sz: 0.05, rz: -0.4 }));
    root.add(sway);
  } else {
    const full = buildFullTree(species, colors, rand);
    sway = full.sway;
    if (stage === 'sapling') full.group.scale.setScalar(0.55);
    root.add(full.group);
  }

  if (withered) sway.scale.multiplyScalar(0.8);
  const baked = bakeTree(root, sway);
  if (withered) baked.rotation.z = (rand() - 0.5) * 0.35;
  baked.userData.phase = rand() * Math.PI * 2;
  return baked;
}

// Merge a tree's many small meshes into two (trunk + swaying crown) so big forests stay fast.
const BAKED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 });

function mergeParts(parts) {
  let count = 0;
  const geos = parts.map(({ mesh, matrix }) => {
    const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone());
    g.applyMatrix4(matrix);
    count += g.attributes.position.count;
    return { g, color: mesh.material.color };
  });
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let off = 0;
  for (const { g, color } of geos) {
    const p = g.attributes.position;
    pos.set(p.array, off * 3);
    for (let i = 0; i < p.count; i++) col.set([color.r, color.g, color.b], (off + i) * 3);
    off += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  const m = new THREE.Mesh(out, BAKED_MAT);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function disposeTree(t) {
  t.traverse((o) => { if (o.isMesh && o.material === BAKED_MAT) o.geometry.dispose(); });
}

function bakeTree(root, sway) {
  root.updateMatrixWorld(true);
  const swayInv = sway.matrixWorld.clone().invert();
  const fixed = [];
  const moving = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    let underSway = false;
    for (let q = o; q; q = q.parent) if (q === sway && sway !== root) { underSway = true; break; }
    if (underSway) moving.push({ mesh: o, matrix: swayInv.clone().multiply(o.matrixWorld) });
    else fixed.push({ mesh: o, matrix: o.matrixWorld });
  });
  const out = new THREE.Group();
  const base = mergeParts(fixed);
  out.add(base);
  if (sway === root || !moving.length) {
    out.userData.sway = base;
  } else {
    const crown = new THREE.Group();
    sway.matrixWorld.decompose(crown.position, crown.quaternion, crown.scale);
    crown.add(mergeParts(moving));
    out.add(crown);
    out.userData.sway = crown;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------
function jitter(geo, amount, seed, keepTop = false) {
  const rand = rng(seed);
  const pos = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    // Round so seam vertices (e.g. -0 vs 0) share the same offset and the mesh has no cracks.
    const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    if (!map.has(key)) map.set(key, [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]);
    const [dx, dy, dz] = map.get(key);
    const isTop = keepTop && pos.getY(i) > 0.1;
    pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + (isTop ? 0 : dy), pos.getZ(i) + dz);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildIsland() {
  const g = new THREE.Group();
  // Unit-radius island, scaled in x/z when the forest grows.
  const top = jitter(new THREE.CylinderGeometry(1, 0.97, 0.3, 28, 1).toNonIndexed(), 0.04, 0.11, true);
  const grass = mesh(top, mat('#6fb35a'), { y: -0.15 });
  grass.castShadow = false;
  g.add(grass);
  const dirt = jitter(new THREE.CylinderGeometry(0.97, 0.85, 0.5, 20, 1).toNonIndexed(), 0.06, 0.23);
  g.add(mesh(dirt, mat('#8a6243'), { y: -0.55 }));
  const rock = jitter(new THREE.ConeGeometry(0.85, 2.2, 12, 3).toNonIndexed(), 0.12, 0.37);
  g.add(mesh(rock, mat('#6d6a66'), { y: -1.9, rx: Math.PI }));
  const tip = jitter(new THREE.ConeGeometry(0.4, 1.2, 8, 2).toNonIndexed(), 0.08, 0.41);
  g.add(mesh(tip, mat('#5a5753'), { y: -2.9, x: 0.15, rx: Math.PI }));
  return g;
}

function buildCloud(rand) {
  const g = new THREE.Group();
  const white = mat('#ffffff', { roughness: 1 });
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.5 + rand() * 0.6;
    const m = mesh(G.ico, white, { x: i * 0.7 - n * 0.35, y: rand() * 0.3, z: rand() * 0.4, sx: s, sy: s * 0.7, sz: s });
    m.castShadow = false;
    g.add(m);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Decorations (unlocked by streaks and totals)
// ---------------------------------------------------------------------------
function buildFlowers(R, rand) {
  const g = new THREE.Group();
  const colors = ['#f7d154', '#f08aa0', '#ffffff', '#b48ee8', '#f5a25d'];
  const n = Math.round(14 + R * 3);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = R - 0.4 - rand() * 1.8;
    const f = new THREE.Group();
    f.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    f.add(mesh(G.cyl, mat('#5a9a44'), { sx: 0.012, sz: 0.012, sy: 0.14 }));
    f.add(mesh(G.ico, mat(colors[i % colors.length]), { y: 0.15, sx: 0.045, sy: 0.03, sz: 0.045 }));
    g.add(f);
  }
  return g;
}

function buildRocks(R, rand) {
  const g = new THREE.Group();
  const n = Math.round(5 + R);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = R - 0.35 - rand() * 0.9;
    const s = 0.12 + rand() * 0.22;
    g.add(mesh(G.dodeca, mat(i % 3 ? '#8b8a85' : '#7c8c6a'), {
      x: Math.cos(a) * r, z: Math.sin(a) * r, y: s * 0.3, sx: s, sy: s * 0.7, sz: s, rx: rand(), ry: rand(),
    }));
  }
  return g;
}

function buildPond(R) {
  const g = new THREE.Group();
  const a = Math.PI * 0.25;
  const r = R - 1.9;
  g.position.set(Math.cos(a) * r, 0.005, Math.sin(a) * r);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 9), mat('#4d9ad0', { roughness: 0.15, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1.05, 0.75, 1);
  water.receiveShadow = true;
  g.add(water);
  const rand = rng(0.77);
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    const s = 0.09 + rand() * 0.08;
    g.add(mesh(G.dodeca, mat('#9a9890'), { x: Math.cos(t) * 1.1, z: Math.sin(t) * 0.8, y: 0.03, sx: s, sy: s * 0.6, sz: s }));
  }
  // Lily pads
  for (let i = 0; i < 3; i++) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.12, 6), mat('#4c8f3f'));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set((rand() - 0.5) * 1.1, 0.01, (rand() - 0.5) * 0.7);
    g.add(pad);
  }
  g.userData.water = water;
  return g;
}

function buildRabbit() {
  const g = new THREE.Group();
  const fur = mat('#e9e2d6');
  const body = new THREE.Group();
  body.add(mesh(G.sphere, fur, { y: 0.1, sx: 0.12, sy: 0.1, sz: 0.09 }));
  body.add(mesh(G.sphere, fur, { x: 0.1, y: 0.18, sx: 0.07, sy: 0.07, sz: 0.065 }));
  body.add(mesh(G.box, fur, { x: 0.09, y: 0.28, z: 0.025, sx: 0.025, sy: 0.12, sz: 0.03 }));
  body.add(mesh(G.box, fur, { x: 0.09, y: 0.28, z: -0.025, sx: 0.025, sy: 0.12, sz: 0.03 }));
  body.add(mesh(G.sphere, mat('#ffffff'), { x: -0.12, y: 0.12, sx: 0.035, sy: 0.035, sz: 0.035 }));
  g.add(body);
  g.userData.body = body;
  return g;
}

function buildDeer() {
  const g = new THREE.Group();
  const coat = mat('#a8714a');
  const dark = mat('#5a3d28');
  g.add(mesh(G.box, coat, { y: 0.42, sx: 0.42, sy: 0.18, sz: 0.16 }));
  for (const [x, z] of [[0.16, 0.06], [0.16, -0.06], [-0.16, 0.06], [-0.16, -0.06]]) {
    g.add(mesh(G.box, dark, { x, z, y: 0.17, sx: 0.04, sy: 0.34, sz: 0.04 }));
  }
  const head = new THREE.Group();
  head.position.set(0.2, 0.5, 0);
  head.add(mesh(G.box, coat, { y: 0.1, x: 0.02, sx: 0.07, sy: 0.22, sz: 0.07, rz: -0.3 }));
  head.add(mesh(G.box, coat, { x: 0.1, y: 0.22, sx: 0.14, sy: 0.08, sz: 0.08 }));
  head.add(mesh(G.box, dark, { x: 0.04, y: 0.34, z: 0.04, sx: 0.015, sy: 0.12, sz: 0.015, rz: 0.3 }));
  head.add(mesh(G.box, dark, { x: 0.04, y: 0.34, z: -0.04, sx: 0.015, sy: 0.12, sz: 0.015, rz: 0.3 }));
  g.add(head);
  g.add(mesh(G.box, mat('#f2ead8'), { x: -0.22, y: 0.47, sx: 0.04, sy: 0.06, sz: 0.06 }));
  g.userData.head = head;
  return g;
}

function buildBird() {
  const g = new THREE.Group();
  const m = mat('#3a3f4a');
  g.add(mesh(G.sphere, m, { sx: 0.08, sy: 0.05, sz: 0.05 }));
  const wl = mesh(G.box, m, { sx: 0.06, sy: 0.01, sz: 0.16 });
  const wr = mesh(G.box, m, { sx: 0.06, sy: 0.01, sz: 0.16 });
  wl.geometry = G.box;
  const lw = new THREE.Group(); lw.add(wl); wl.position.z = 0.08;
  const rw = new THREE.Group(); rw.add(wr); wr.position.z = -0.08;
  g.add(lw, rw);
  g.userData.wings = [lw, rw];
  return g;
}

// ---------------------------------------------------------------------------
// Sky colours through the day (local time)
// ---------------------------------------------------------------------------
const SKY_KEYS = [
  [0, '#070b1e', '#151d3d'],
  [4.5, '#0d1430', '#2a2c56'],
  [6, '#4a5fa8', '#e9b49a'],
  [7.5, '#5d93d8', '#dfe3e6'],
  [10, '#4d98e0', '#bfe2f6'],
  [16, '#4f95d8', '#cfe6f2'],
  [18, '#4e5f9e', '#f39a6a'],
  [19.3, '#232a5a', '#7a5478'],
  [21, '#0b1028', '#1c2347'],
  [24, '#070b1e', '#151d3d'],
];

function skyAt(hour) {
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const [h0, t0, b0] = SKY_KEYS[i];
    const [h1, t1, b1] = SKY_KEYS[i + 1];
    if (hour >= h0 && hour <= h1) {
      const k = (hour - h0) / (h1 - h0);
      return {
        top: new THREE.Color(t0).lerp(new THREE.Color(t1), k),
        bottom: new THREE.Color(b0).lerp(new THREE.Color(b1), k),
      };
    }
  }
  return { top: new THREE.Color(SKY_KEYS[0][1]), bottom: new THREE.Color(SKY_KEYS[0][2]) };
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class Forest {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    this.clock = new THREE.Clock();
    this.hourOverride = null;

    this.world = new THREE.Group(); // bobs gently
    this.scene.add(this.world);

    this._sky();
    this._lights();
    this.island = buildIsland();
    this.world.add(this.island);
    this.treeLayer = new THREE.Group();
    this.decorLayer = new THREE.Group();
    this.world.add(this.treeLayer, this.decorLayer);
    this._clouds();

    this.treeMeshes = [];
    this.trees = [];
    this.decor = new Set();
    this.growing = null;
    this.particles = [];
    this.animals = [];
    this.radius = islandRadius(0);
    this.targetRadius = this.radius;

    this._controls();
    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
    this.applyTimeOfDay();
    setInterval(() => this.applyTimeOfDay(), 30_000);
    this._applyRadius(true);
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _sky() {
    const geo = new THREE.SphereGeometry(200, 24, 12);
    this.skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: `varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
        void main(){ float h = clamp(vPos.y * 1.4 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, skyMat);
    this.scene.add(this.sky);

    // Stars
    const n = 700;
    const pos = new Float32Array(n * 3);
    const rand = rng(0.123);
    for (let i = 0; i < n; i++) {
      const u = rand() * Math.PI * 2;
      const v = Math.acos(rand() * 0.95);
      pos[i * 3] = Math.sin(v) * Math.cos(u) * 180;
      pos[i * 3 + 1] = Math.cos(v) * 180;
      pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 180;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.scene.add(this.stars);

    this.sunMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 1), new THREE.MeshBasicMaterial({ color: '#fff3c4', fog: false }));
    this.moonMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), new THREE.MeshBasicMaterial({ color: '#e8ecff', fog: false }));
    this.scene.add(this.sunMesh, this.moonMesh);
    this.scene.fog = new THREE.Fog('#bfe2f6', 60, 190);
  }

  _lights() {
    this.hemi = new THREE.HemisphereLight('#dff1ff', '#5b6b3a', 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight('#9fb4ff', 0.0);
    this.scene.add(this.moon);
    // Warm lantern glow at night
    this.glow = new THREE.PointLight('#ffcf8a', 0, 14, 1.6);
    this.glow.position.set(0, 2.5, 0);
    this.world.add(this.glow);
  }

  _clouds() {
    this.clouds = new THREE.Group();
    const rand = rng(0.5);
    for (let i = 0; i < 7; i++) {
      const c = buildCloud(rand);
      const a = (i / 7) * Math.PI * 2;
      const r = 16 + rand() * 10;
      c.position.set(Math.cos(a) * r, -1 + rand() * 7, Math.sin(a) * r);
      c.userData.speed = 0.01 + rand() * 0.015;
      c.userData.angle = a;
      c.userData.r = r;
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  }

  // ------------------------------------------------------------- controls
  _controls() {
    this.view = { theta: 0.7, phi: 1.05, dist: 20, tTheta: 0.7, tPhi: 1.05, tDist: 20 };
    this.lastInteract = 0;
    const pointers = new Map();
    let pinchStart = 0;
    let pinchDist = 0;
    const el = this.canvas;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        pinchDist = this.view.tDist;
      }
      this.lastInteract = performance.now();
    });
    el.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (pointers.size === 1) {
        this.view.tTheta -= (e.clientX - p.x) * 0.006;
        this.view.tPhi = clamp(this.view.tPhi - (e.clientY - p.y) * 0.005, 0.35, 1.45);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart > 0) { this.view.tDist = clamp(pinchDist * (pinchStart / d), this.minDist(), this.maxDist()); this.userZoomed = true; }
      }
      this.lastInteract = performance.now();
    });
    const up = (e) => { pointers.delete(e.pointerId); pinchStart = 0; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    // Mouse wheel, trackpad scroll and trackpad pinch (ctrlKey) all zoom.
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.ctrlKey ? 0.01 : 0.0015;
      this.view.tDist = clamp(this.view.tDist * Math.exp(e.deltaY * k), this.minDist(), this.maxDist());
      this.userZoomed = true;
      this.lastInteract = performance.now();
    }, { passive: false });
  }

  minDist() { return 4; }
  maxDist() { return Math.max(30, this.targetRadius * 4.5); }

  _resize() {
    const w = this.canvas.parentElement.clientWidth;
    const h = this.canvas.parentElement.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------- time of day
  setHourOverride(h) {
    this.hourOverride = h;
    this.applyTimeOfDay();
  }

  currentHour() {
    if (this.hourOverride !== null) return this.hourOverride;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }

  applyTimeOfDay() {
    const hour = this.currentHour();
    const { top, bottom } = skyAt(hour);
    this.skyUniforms.top.value.copy(top);
    this.skyUniforms.bottom.value.copy(bottom);
    this.scene.fog.color.copy(bottom);

    // Sun rises at 6 and sets at 18; moon is opposite.
    const t = ((hour - 6) / 12) * Math.PI;
    const elevation = Math.sin(t);
    const sunDir = new THREE.Vector3(Math.cos(t), Math.max(elevation, -0.3), 0.45).normalize();
    this.sunMesh.position.copy(sunDir).multiplyScalar(150);
    this.moonMesh.position.copy(sunDir).multiplyScalar(-150).setY(Math.max(-sunDir.y, -0.2) * 150);
    this.sunMesh.visible = elevation > -0.1;
    this.moonMesh.visible = elevation < 0.15;

    const day = clamp(elevation * 2.2 + 0.2, 0, 1);
    const night = 1 - clamp(elevation * 3 + 0.6, 0, 1);
    const golden = clamp(1 - Math.abs(elevation) * 3.5, 0, 1);
    this.sun.position.copy(sunDir).multiplyScalar(30);
    this.sun.intensity = 1.9 * day;
    this.sun.color.set('#fff3dd').lerp(new THREE.Color('#ffb070'), golden);
    this.moon.position.copy(this.moonMesh.position).normalize().multiplyScalar(30);
    this.moon.intensity = 0.9 * night;
    this.hemi.intensity = 0.5 + 0.4 * day;
    this.hemi.color.set('#dff1ff').lerp(new THREE.Color('#6a7cc8'), night);
    this.stars.material.opacity = night * 0.95;
    this.glow.intensity = night * 6;
    this.isNight = night > 0.5;
    this.renderer.toneMappingExposure = 0.85 + 0.25 * day;
  }

  // ------------------------------------------------------------- trees
  /** trees: [{ id, species, withered, seed }] in planting order. */
  setTrees(trees) {
    this.trees = trees;
    for (const m of this.treeMeshes) { this.treeLayer.remove(m); disposeTree(m); }
    this.treeMeshes = trees.map((t, i) => {
      const m = buildTree(t.species, 'tree', { withered: t.withered, seed: t.seed });
      const p = treePosition(i, t.seed);
      m.position.set(p.x, 0, p.z);
      m.rotation.y = t.seed * Math.PI * 2;
      const s = 0.9 + (t.seed % 0.2);
      m.scale.setScalar(s);
      m.userData.baseScale = s;
      this.treeLayer.add(m);
      return m;
    });
    this.targetRadius = islandRadius(trees.length + (this.growing ? 1 : 0));
    this._placeGrowing();
    // Frame the whole island unless the user has zoomed in themselves.
    if (!this.userZoomed) this.view.tDist = clamp(this.targetRadius * 2.0 + 6, this.minDist(), this.maxDist());
  }

  setDecor(ids) {
    const key = [...ids].sort().join(',');
    if (key === this._decorKey) return;
    this._decorKey = key;
    this.decor = new Set(ids);
    this._rebuildDecor();
  }

  _rebuildDecor() {
    this.decorLayer.clear();
    this.animals = [];
    const R = this.radius;
    const rand = rng(0.31);
    if (this.decor.has('flowers')) this.decorLayer.add(buildFlowers(R, rand));
    if (this.decor.has('rocks')) this.decorLayer.add(buildRocks(R, rng(0.52)));
    if (this.decor.has('pond')) {
      this.pond = buildPond(R);
      this.decorLayer.add(this.pond);
    } else this.pond = null;
    if (this.decor.has('rabbit')) {
      for (let i = 0; i < 3; i++) {
        const r = buildRabbit();
        r.userData.kind = 'rabbit';
        r.userData.angle = i * 2.1;
        r.userData.r = R - 0.8 - i * 0.3;
        r.userData.speed = 0.12 + i * 0.03;
        this.decorLayer.add(r);
        this.animals.push(r);
      }
    }
    if (this.decor.has('deer')) {
      for (let i = 0; i < 2; i++) {
        const d = buildDeer();
        const a = Math.PI * (1.1 + i * 0.25);
        d.position.set(Math.cos(a) * (R - 1.1), 0, Math.sin(a) * (R - 1.1));
        d.rotation.y = -a + Math.PI / 2 + i;
        d.userData.kind = 'deer';
        d.userData.phase = i * 3;
        this.decorLayer.add(d);
        this.animals.push(d);
      }
    }
    if (this.decor.has('birds')) {
      for (let i = 0; i < 4; i++) {
        const b = buildBird();
        b.userData.kind = 'bird';
        b.userData.angle = i * 1.6;
        b.userData.r = R * 0.6 + i * 0.6;
        b.userData.h = 4 + i * 0.5;
        b.userData.speed = 0.25 + i * 0.04;
        this.decorLayer.add(b);
        this.animals.push(b);
      }
    }
  }

  /** Show the tree that grows during the current focus session. progress 0..1, or null to remove. */
  setGrowing(g) {
    if (!g) {
      if (this.growing) { this.treeLayer.remove(this.growing.mesh); disposeTree(this.growing.mesh); }
      this.growing = null;
      if (this.growRing) this.treeLayer.remove(this.growRing);
      this.targetRadius = islandRadius(this.trees.length);
      if (!this.userZoomed) this.view.tDist = clamp(this.targetRadius * 2.0 + 6, this.minDist(), this.maxDist());
      return;
    }
    const stage = g.progress < 0.1 ? 'seed' : g.progress < 0.35 ? 'sprout' : g.progress < 0.7 ? 'sapling' : 'tree';
    if (!this.growing || this.growing.stage !== stage || this.growing.species !== g.species) {
      if (this.growing) { this.treeLayer.remove(this.growing.mesh); disposeTree(this.growing.mesh); }
      const mesh = buildTree(g.species, stage, { seed: g.seed });
      const firstStage = !this.growing;
      this.growing = { stage, species: g.species, mesh, seed: g.seed, pop: 0 };
      // Soft glowing ring marks the tree that is growing right now.
      if (!this.growRing) {
        this.growRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 24), new THREE.MeshBasicMaterial({ color: '#c8ff9a', transparent: true, opacity: 0.6, depthWrite: false }));
        this.growRing.rotation.x = -Math.PI / 2;
        this.growRing.position.y = 0.02;
      }
      this.treeLayer.add(this.growRing);
      this.treeLayer.add(mesh);
      this.targetRadius = islandRadius(this.trees.length + 1);
      this._placeGrowing();
      if (firstStage && !this.userZoomed) this.view.tDist = clamp(9 + this.targetRadius * 0.5, this.minDist(), this.maxDist());
    }
    this.growing.progress = g.progress;
    // Smooth growth within each stage.
    const ranges = { seed: [0, 0.1], sprout: [0.1, 0.35], sapling: [0.35, 0.7], tree: [0.7, 1] };
    const [a, b] = ranges[stage];
    const k = clamp((g.progress - a) / (b - a), 0, 1);
    const scale = stage === 'tree' ? 0.75 + 0.25 * k : 0.7 + 0.3 * k;
    this.growing.targetScale = scale * 1.15;
  }

  _placeGrowing() {
    if (!this.growing) return;
    const p = treePosition(this.trees.length, this.growing.seed);
    this.growing.mesh.position.set(p.x, 0, p.z);
    if (this.growRing) this.growRing.position.set(p.x, 0.02, p.z);
  }

  growingPosition() {
    if (!this.growing) return null;
    return this.growing.mesh.position.clone();
  }

  celebrate(pos, colors = ['#ffe680', '#9be27a', '#ffffff']) { this._burst(pos, colors, 1); }
  witherPuff(pos) { this._burst(pos, ['#8a7356', '#a08a64', '#6b5a45'], -1); }

  _burst(pos, colors, dir) {
    if (!pos) return;
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(G.ico, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }));
      m.scale.setScalar(0.05 + Math.random() * 0.04);
      m.position.copy(pos).add(new THREE.Vector3(0, dir > 0 ? 0.6 : 1.1, 0));
      const a = Math.random() * Math.PI * 2;
      m.userData.vel = new THREE.Vector3(Math.cos(a) * (0.6 + Math.random()), dir > 0 ? 1.5 + Math.random() * 1.5 : 0.2, Math.sin(a) * (0.6 + Math.random()));
      m.userData.life = 1.4;
      m.userData.gravity = dir > 0 ? -2.5 : -0.9;
      this.world.add(m);
      this.particles.push(m);
    }
  }

  _applyRadius(force) {
    const prev = this.radius;
    this.radius += (this.targetRadius - this.radius) * (force ? 1 : 0.05);
    this.island.scale.set(this.radius, 1 + this.radius * 0.12, this.radius);
    const s = this.sun.shadow.camera;
    const ext = this.radius + 3;
    s.left = -ext; s.right = ext; s.top = ext; s.bottom = -ext; s.near = 1; s.far = 80;
    s.updateProjectionMatrix();
    if (force || Math.abs(prev - this.radius) > 0.002) {
      if (force || Math.abs(this._decorRadius - this.radius) > 0.25 || this._decorRadius === undefined) {
        this._decorRadius = this.radius;
        if (this.decor.size) this._rebuildDecor();
      }
    }
  }

  // ------------------------------------------------------------- loop
  _frame() {
    if (!this.canvas.clientWidth) return; // hidden (mini mode)
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    if (Math.abs(this.targetRadius - this.radius) > 0.001) this._applyRadius(false);

    // Camera: damped orbit with slow idle auto-rotate.
    const v = this.view;
    if (performance.now() - this.lastInteract > 6000) v.tTheta += dt * 0.04;
    v.theta += (v.tTheta - v.theta) * 0.12;
    v.phi += (v.tPhi - v.phi) * 0.12;
    v.dist += (v.tDist - v.dist) * 0.12;
    // While a tree grows the camera drifts toward it; otherwise it frames the whole island.
    const want = this.growing ? this.growing.mesh.position.clone().setY(0.7) : new THREE.Vector3(0, 0.6, 0);
    if (!this.camTarget) this.camTarget = want.clone();
    this.camTarget.lerp(want, 0.03);
    const target = this.camTarget;
    this.camera.position.set(
      target.x + v.dist * Math.sin(v.phi) * Math.sin(v.theta),
      target.y + v.dist * Math.cos(v.phi),
      target.z + v.dist * Math.sin(v.phi) * Math.cos(v.theta),
    );
    this.camera.lookAt(target);

    // Floating bob
    this.world.position.y = Math.sin(t * 0.5) * 0.12;
    this.world.rotation.z = Math.sin(t * 0.3) * 0.006;

    // Wind sway
    const wind = 0.035;
    for (const m of this.treeMeshes) {
      const s = m.userData.sway;
      s.rotation.z = Math.sin(t * 1.3 + m.userData.phase) * wind;
      s.rotation.x = Math.cos(t * 1.1 + m.userData.phase) * wind * 0.6;
    }
    if (this.growing) {
      const g = this.growing;
      g.pop = Math.min(1, g.pop + dt * 2.5);
      const pop = 1 + Math.sin(g.pop * Math.PI) * 0.12;
      const cur = g.mesh.scale.x || 0.01;
      const next = cur + ((g.targetScale || 1) * pop - cur) * 0.08;
      g.mesh.scale.setScalar(next);
      const s = g.mesh.userData.sway;
      s.rotation.z = Math.sin(t * 1.6 + g.mesh.userData.phase) * wind * 1.4;
      this.growRing.material.opacity = 0.35 + 0.25 * Math.sin(t * 2);
      this.growRing.scale.setScalar(1 + 0.08 * Math.sin(t * 2));
    }

    // Clouds drift
    for (const c of this.clouds.children) {
      c.userData.angle += dt * c.userData.speed;
      c.position.x = Math.cos(c.userData.angle) * c.userData.r;
      c.position.z = Math.sin(c.userData.angle) * c.userData.r;
    }

    // Animals
    for (const a of this.animals) {
      const u = a.userData;
      if (u.kind === 'rabbit') {
        u.angle += dt * u.speed * (Math.sin(t * 0.7 + u.r) > -0.3 ? 1 : 0);
        a.position.set(Math.cos(u.angle) * u.r, 0, Math.sin(u.angle) * u.r);
        a.rotation.y = -u.angle - Math.PI;
        u.body.position.y = Math.abs(Math.sin(t * 6 + u.r)) * 0.12;
      } else if (u.kind === 'deer') {
        u.head.rotation.z = -0.9 * (0.5 + 0.5 * Math.sin(t * 0.4 + u.phase));
      } else if (u.kind === 'bird') {
        u.angle += dt * u.speed;
        a.position.set(Math.cos(u.angle) * u.r, u.h + Math.sin(t + u.r) * 0.3, Math.sin(u.angle) * u.r);
        a.rotation.y = -u.angle;
        const flap = Math.sin(t * 10 + u.r) * 0.6;
        u.wings[0].rotation.x = flap;
        u.wings[1].rotation.x = -flap;
      }
    }
    if (this.pond) this.pond.userData.water.material.color.setHSL(0.56, 0.55, 0.52 + Math.sin(t) * 0.02);

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.userData.life -= dt;
      p.userData.vel.y += p.userData.gravity * dt;
      p.position.addScaledVector(p.userData.vel, dt);
      p.rotation.x += dt * 4;
      p.material.opacity = clamp(p.userData.life / 1.4, 0, 1);
      if (p.userData.life <= 0) {
        this.world.remove(p);
        p.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
