// HOLLOW DAWN — loot, inventory, healing, barricades and the supply airdrop.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

// module-level temps (never allocate in update loops)
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const IDENT_Q = new THREE.Quaternion();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const WHITE = new THREE.Color(1, 1, 1);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const rand = (a, b) => a + Math.random() * (b - a);
function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1, t = x - 1;
  return 1 + c3 * t * t * t + c1 * t * t;
}

// ---------------------------------------------------------------- geometry helpers
function colored(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  _e.set(rx, ry, rz, 'XYZ'); _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
  g.applyMatrix4(_m4);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const B = (w, h, d, hex, x, y, z, rx, ry, rz) => colored(new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, ry, rz);
const C = (rt, rb, h, seg, hex, x, y, z, rx, ry, rz) => colored(new THREE.CylinderGeometry(rt, rb, h, seg), hex, x, y, z, rx, ry, rz);

function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// Flat-shaded vertex-colour material; `glow` self-lights the surface with its own colour
// so loot stays readable in deep night without blooming.
function litMaterial(glow, extra) {
  const m = new THREE.MeshStandardMaterial(Object.assign({
    vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.08,
  }, extra || {}));
  if (glow > 0) {
    m.emissive.setRGB(glow, glow, glow);
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;'
      );
    };
    m.customProgramCacheKey = () => 'hd-loot-vglow';
  }
  return m;
}

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [t, a] of stops) grd.addColorStop(t, `rgba(255,255,255,${a})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- item models
const DARK = '#1c2026', WOOD = '#7a5334', WOOD2 = '#8f6a43', WOOD3 = '#5e4128';
const STEEL = '#8d99ae', RUST = '#8a4f2e', EMBER = '#ff7a3c', BONE = '#e8e4d8', BLOOD = '#b3202a';

function weaponGeo(id) {
  const def = CONFIG.weapons[id];
  const col = (def && def.color) || '#4a5568';
  const p = [];
  switch (id) {
    case 'pistol':
      p.push(B(0.05, 0.07, 0.24, col, 0, 0.05, 0));
      p.push(B(0.045, 0.15, 0.07, DARK, 0, -0.05, 0.08, 0.25));
      p.push(B(0.02, 0.03, 0.02, EMBER, 0, 0.095, -0.1));
      break;
    case 'smg':
      p.push(B(0.07, 0.11, 0.36, col, 0, 0.03, 0));
      p.push(C(0.018, 0.018, 0.16, 6, DARK, 0, 0.04, -0.26, HALF_PI));
      p.push(B(0.04, 0.24, 0.06, DARK, 0, -0.13, -0.04, 0.12));
      p.push(B(0.045, 0.13, 0.06, DARK, 0, -0.08, 0.12, 0.3));
      p.push(B(0.03, 0.04, 0.24, STEEL, 0, 0.05, 0.3));
      p.push(B(0.04, 0.12, 0.03, STEEL, 0, 0.02, 0.42));
      p.push(B(0.02, 0.03, 0.04, EMBER, 0, 0.1, -0.1));
      break;
    case 'shotgun':
      p.push(B(0.06, 0.11, 0.3, WOOD, 0, -0.03, 0.36, -0.12));
      p.push(B(0.07, 0.1, 0.26, DARK, 0, 0.02, 0.1));
      p.push(C(0.022, 0.022, 0.6, 6, '#2a2f38', 0, 0.045, -0.32, HALF_PI));
      p.push(C(0.02, 0.02, 0.44, 6, STEEL, 0, -0.005, -0.26, HALF_PI));
      p.push(B(0.06, 0.06, 0.2, WOOD2, 0, -0.01, -0.24));
      p.push(B(0.02, 0.025, 0.02, EMBER, 0, 0.075, -0.6));
      break;
    case 'rifle':
      p.push(B(0.07, 0.12, 0.4, col, 0, 0.02, 0));
      p.push(B(0.065, 0.08, 0.3, '#3f4a58', 0, 0.03, -0.34));
      p.push(C(0.016, 0.016, 0.24, 6, DARK, 0, 0.04, -0.6, HALF_PI));
      p.push(B(0.045, 0.22, 0.09, DARK, 0, -0.14, -0.06, 0.25));
      p.push(B(0.045, 0.13, 0.06, DARK, 0, -0.09, 0.14, 0.3));
      p.push(B(0.055, 0.13, 0.26, col, 0, 0.0, 0.33));
      p.push(B(0.03, 0.025, 0.3, DARK, 0, 0.095, -0.05));
      p.push(B(0.02, 0.05, 0.02, EMBER, 0, 0.11, -0.46));
      break;
    case 'sniper':
      p.push(B(0.07, 0.1, 0.5, col, 0, 0.02, 0.05));
      p.push(C(0.017, 0.02, 0.7, 6, DARK, 0, 0.04, -0.55, HALF_PI));
      p.push(C(0.03, 0.03, 0.08, 6, DARK, 0, 0.04, -0.92, HALF_PI));
      p.push(C(0.035, 0.035, 0.34, 8, DARK, 0, 0.13, 0, HALF_PI));
      p.push(C(0.046, 0.036, 0.05, 8, '#7fb7e6', 0, 0.13, -0.19, HALF_PI));
      p.push(B(0.02, 0.05, 0.03, DARK, 0, 0.09, -0.1));
      p.push(B(0.02, 0.05, 0.03, DARK, 0, 0.09, 0.1));
      p.push(B(0.06, 0.14, 0.32, col, 0, -0.01, 0.44));
      p.push(B(0.045, 0.1, 0.1, DARK, 0, -0.07, 0));
      p.push(B(0.012, 0.2, 0.012, STEEL, 0.05, -0.08, -0.4, 0, 0, 0.3));
      p.push(B(0.012, 0.2, 0.012, STEEL, -0.05, -0.08, -0.4, 0, 0, -0.3));
      break;
    case 'flamethrower': {
      // CINDERMAW: fat orange fuel tank slung under a long shrouded nozzle, pilot flame at the tip
      const FUEL = (CONFIG.ammoTypes.fuel && CONFIG.ammoTypes.fuel.color) || '#ff9f43';
      p.push(B(0.08, 0.11, 0.46, col, 0, 0.03, 0.02));
      p.push(C(0.062, 0.062, 0.14, 8, '#3a3f4a', 0, 0.04, -0.28, HALF_PI));
      p.push(C(0.028, 0.042, 0.3, 8, DARK, 0, 0.04, -0.48, HALF_PI));
      p.push(C(0.05, 0.034, 0.06, 8, STEEL, 0, 0.04, -0.65, HALF_PI));
      p.push(B(0.022, 0.022, 0.035, EMBER, 0, 0.0, -0.66));
      p.push(C(0.078, 0.078, 0.34, 10, FUEL, 0, -0.1, 0.05, HALF_PI));
      p.push(C(0.064, 0.064, 0.03, 10, DARK, 0, -0.1, -0.13, HALF_PI));
      p.push(C(0.064, 0.064, 0.03, 10, DARK, 0, -0.1, 0.23, HALF_PI));
      p.push(C(0.014, 0.014, 0.26, 6, '#2a2f38', 0.07, -0.03, -0.08, HALF_PI));
      p.push(B(0.045, 0.14, 0.06, DARK, 0, -0.06, 0.22, 0.3));
      p.push(B(0.04, 0.12, 0.05, DARK, 0, -0.04, -0.2, -0.2));
      p.push(B(0.05, 0.1, 0.18, col, 0, 0.01, 0.34));
      break;
    }
    case 'rocket': {
      // SKYFALL: long olive tube, flared ends, red warhead poking out the front, side sight
      const RED = (CONFIG.ammoTypes.rockets && CONFIG.ammoTypes.rockets.color) || '#e84a5f';
      p.push(C(0.072, 0.072, 1.0, 10, col, 0, 0.06, -0.05, HALF_PI));
      p.push(C(0.094, 0.078, 0.1, 10, DARK, 0, 0.06, -0.56, HALF_PI));
      p.push(C(0.078, 0.1, 0.1, 10, DARK, 0, 0.06, 0.48, HALF_PI));
      p.push(C(0.0, 0.058, 0.15, 8, RED, 0, 0.06, -0.68, -HALF_PI));
      p.push(C(0.075, 0.075, 0.04, 10, RED, 0, 0.06, -0.36, HALF_PI));
      p.push(C(0.075, 0.075, 0.04, 10, BONE, 0, 0.06, 0.3, HALF_PI));
      p.push(B(0.05, 0.08, 0.13, '#3a3f4a', -0.095, 0.11, -0.14));
      p.push(B(0.02, 0.02, 0.02, EMBER, -0.095, 0.13, -0.215));
      p.push(B(0.045, 0.14, 0.06, DARK, 0, -0.06, 0.08, 0.3));
      p.push(B(0.04, 0.12, 0.05, DARK, 0, -0.05, -0.2));
      p.push(B(0.1, 0.035, 0.2, DARK, 0, -0.025, 0.24));
      break;
    }
    case 'gatling': {
      // HURRICANE: six-barrel cluster, boxy receiver, belt box on the side, carry handle
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        p.push(C(0.014, 0.014, 0.62, 6, DARK, Math.cos(a) * 0.046, 0.04 + Math.sin(a) * 0.046, -0.43, HALF_PI));
      }
      p.push(C(0.075, 0.075, 0.05, 10, STEEL, 0, 0.04, -0.66, HALF_PI));
      p.push(C(0.075, 0.075, 0.05, 10, STEEL, 0, 0.04, -0.3, HALF_PI));
      p.push(B(0.15, 0.16, 0.34, col, 0, 0.03, 0.04));
      p.push(B(0.12, 0.13, 0.15, '#4b5a3a', 0.13, -0.03, 0.05));
      p.push(B(0.035, 0.04, 0.22, DARK, 0, 0.15, 0.02));
      p.push(B(0.045, 0.14, 0.06, DARK, 0, -0.1, 0.18, 0.3));
      p.push(B(0.02, 0.04, 0.02, EMBER, 0, 0.12, -0.12));
      break;
    }
    default:
      p.push(B(0.07, 0.11, 0.42, col, 0, 0.02, 0));
      p.push(C(0.018, 0.018, 0.2, 6, DARK, 0, 0.04, -0.3, HALF_PI));
      p.push(B(0.045, 0.14, 0.06, DARK, 0, -0.09, 0.12, 0.3));
  }
  return merge(p);
}

function ammoGeo() {
  // Greys/whites: the per-instance colour (ammo type) tints the whole box.
  return merge([
    B(0.34, 0.2, 0.22, '#6a6a6a', 0, 0, 0),
    B(0.36, 0.05, 0.24, '#ffffff', 0, 0.115, 0),
    B(0.345, 0.07, 0.225, '#ffffff', 0, -0.01, 0),
    B(0.14, 0.03, 0.04, '#3a3a3a', 0, 0.155, 0),
    C(0.024, 0.024, 0.1, 6, '#ffffff', 0.23, -0.05, 0.05),
    C(0.004, 0.024, 0.04, 6, '#dddddd', 0.23, 0.02, 0.05),
    C(0.024, 0.024, 0.1, 6, '#ffffff', 0.25, -0.05, -0.03),
    C(0.004, 0.024, 0.04, 6, '#dddddd', 0.25, 0.02, -0.03),
  ]);
}
// Fuel: a jerry can in the fuel colour. Rockets: a strapped pair of rockets.
function fuelGeo() {
  const FUEL = (CONFIG.ammoTypes.fuel && CONFIG.ammoTypes.fuel.color) || '#ff9f43';
  return merge([
    B(0.32, 0.38, 0.15, FUEL, 0, 0, 0),
    B(0.27, 0.3, 0.02, '#c9732a', 0, -0.015, 0.08), B(0.27, 0.3, 0.02, '#c9732a', 0, -0.015, -0.08),
    B(0.24, 0.035, 0.022, FUEL, 0, -0.015, 0.09, 0, 0, 0.9), B(0.24, 0.035, 0.022, FUEL, 0, -0.015, 0.09, 0, 0, -0.9),
    B(0.2, 0.04, 0.06, DARK, -0.04, 0.24, 0),
    B(0.035, 0.07, 0.06, DARK, -0.125, 0.21, 0), B(0.035, 0.07, 0.06, DARK, 0.045, 0.21, 0),
    C(0.03, 0.036, 0.09, 8, DARK, 0.115, 0.22, 0, 0, 0, -0.6),
    B(0.06, 0.04, 0.02, BONE, 0.07, 0.1, 0.082),
  ]);
}
function rocketsGeo() {
  const RED = (CONFIG.ammoTypes.rockets && CONFIG.ammoTypes.rockets.color) || '#e84a5f';
  const OLIVE = '#556b2f';
  const p = [];
  for (const sx of [-0.065, 0.065]) {
    p.push(C(0.05, 0.05, 0.46, 8, OLIVE, sx, 0, 0.0, HALF_PI));
    p.push(C(0.0, 0.05, 0.13, 8, RED, sx, 0, -0.295, -HALF_PI));
    p.push(C(0.052, 0.052, 0.035, 8, RED, sx, 0, -0.17, HALF_PI));
    p.push(B(0.15, 0.012, 0.07, DARK, sx, 0, 0.21), B(0.012, 0.15, 0.07, DARK, sx, 0, 0.21));
    p.push(C(0.03, 0.04, 0.03, 8, '#3a3f4a', sx, 0, 0.245, HALF_PI));
  }
  p.push(B(0.25, 0.11, 0.035, '#3a3f4a', 0, 0, -0.06), B(0.25, 0.11, 0.035, '#3a3f4a', 0, 0, 0.1));
  return merge(p);
}

// The Hollow King's hoard: charred iron-bound chest, gold bands, ember seam (separate glow mesh).
const CHAR = '#2b211c', CHAR2 = '#3a2b22', GOLD = '#d9a441', GOLD2 = '#f2c766';
function chestBodyGeo() {
  const p = [];
  p.push(B(0.16, 0.1, 1.0, DARK, 0.6, 0.05, 0), B(0.16, 0.1, 1.0, DARK, -0.6, 0.05, 0));
  p.push(B(1.4, 0.76, 0.92, CHAR, 0, 0.48, 0));
  for (let k = -2; k <= 2; k++) p.push(B(0.02, 0.7, 0.935, CHAR2, k * 0.24 + 0.12, 0.48, 0));
  for (const sx of [-0.45, 0.45]) p.push(B(0.12, 0.8, 0.96, GOLD, sx, 0.48, 0));
  p.push(B(1.44, 0.07, 0.96, GOLD, 0, 0.12, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.push(B(0.15, 0.15, 0.15, GOLD2, sx * 0.67, 0.8, sz * 0.43));
    p.push(B(0.15, 0.15, 0.15, GOLD2, sx * 0.67, 0.16, sz * 0.43));
  }
  // lock plate with a bone skull
  p.push(B(0.3, 0.32, 0.04, GOLD, 0, 0.6, 0.475));
  p.push(B(0.16, 0.13, 0.03, BONE, 0, 0.64, 0.505), B(0.1, 0.06, 0.03, BONE, 0, 0.55, 0.505));
  p.push(B(0.04, 0.04, 0.02, DARK, -0.04, 0.65, 0.522), B(0.04, 0.04, 0.02, DARK, 0.04, 0.65, 0.522));
  for (const sx of [-1, 1]) p.push(B(0.05, 0.1, 0.34, DARK, sx * 0.725, 0.58, 0), B(0.06, 0.05, 0.05, GOLD, sx * 0.735, 0.58, 0.18), B(0.06, 0.05, 0.05, GOLD, sx * 0.735, 0.58, -0.18));
  return merge(p);
}
function chestLidGeo() {
  // origin at the hinge (rear top edge); the lid extends toward +Z
  const p = [];
  p.push(B(1.44, 0.14, 0.96, CHAR, 0, 0.07, 0.48));
  p.push(B(1.36, 0.12, 0.8, CHAR2, 0, 0.19, 0.48));
  p.push(B(1.24, 0.08, 0.54, CHAR, 0, 0.28, 0.48));
  for (const sx of [-0.45, 0.45]) {
    p.push(B(0.13, 0.15, 0.98, GOLD, sx, 0.075, 0.48));
    p.push(B(0.13, 0.13, 0.82, GOLD, sx, 0.195, 0.48));
    p.push(B(0.13, 0.09, 0.56, GOLD, sx, 0.285, 0.48));
  }
  p.push(B(1.46, 0.05, 0.05, GOLD2, 0, 0.025, 0.965));
  p.push(B(0.24, 0.12, 0.05, GOLD, 0, -0.02, 0.975));
  // little crown of spikes along the ridge
  for (const x of [-0.27, 0, 0.27]) p.push(C(0.0, 0.055, x === 0 ? 0.2 : 0.14, 6, GOLD2, x, x === 0 ? 0.42 : 0.39, 0.48));
  return merge(p);
}
function chestSeamGeo() {
  // glowing ember gap between body and lid + keyhole glints (drawn with a bright basic material)
  return merge([
    B(1.415, 0.045, 0.935, '#ffffff', 0, 0.86, 0),
    B(0.05, 0.09, 0.02, '#ffffff', 0, 0.5, 0.5),
    B(0.03, 0.03, 0.02, '#ffffff', -0.04, 0.65, 0.528), B(0.03, 0.03, 0.02, '#ffffff', 0.04, 0.65, 0.528),
  ]);
}

function bandageGeo() {
  return merge([
    C(0.1, 0.1, 0.15, 10, BONE, 0, 0, 0, 0, 0, HALF_PI),
    C(0.104, 0.104, 0.04, 10, BLOOD, 0, 0, 0, 0, 0, HALF_PI),
    C(0.035, 0.035, 0.16, 8, '#bdb8aa', 0, 0, 0, 0, 0, HALF_PI),
    B(0.02, 0.1, 0.16, BONE, 0.0, -0.13, 0.03, 0.3),
  ]);
}
function medkitGeo() {
  return merge([
    B(0.38, 0.26, 0.24, BONE, 0, 0, 0),
    B(0.39, 0.03, 0.25, '#c9c4b6', 0, 0.05, 0),
    B(0.17, 0.055, 0.02, BLOOD, 0, -0.03, 0.125), B(0.055, 0.17, 0.02, BLOOD, 0, -0.03, 0.125),
    B(0.17, 0.055, 0.02, BLOOD, 0, -0.03, -0.125), B(0.055, 0.17, 0.02, BLOOD, 0, -0.03, -0.125),
    B(0.14, 0.04, 0.05, '#3a3f4a', 0, 0.15, 0),
    B(0.05, 0.05, 0.02, STEEL, 0.12, 0.07, 0.125), B(0.05, 0.05, 0.02, STEEL, -0.12, 0.07, 0.125),
  ]);
}
function vestGeo() {
  return merge([
    B(0.42, 0.46, 0.2, '#3f5266', 0, 0, 0),
    B(0.3, 0.22, 0.03, '#7fb7e6', 0, 0.04, 0.11),
    B(0.32, 0.3, 0.03, '#56708a', 0, 0.02, -0.11),
    B(0.09, 0.12, 0.2, '#2c3a48', 0.15, 0.27, 0), B(0.09, 0.12, 0.2, '#2c3a48', -0.15, 0.27, 0),
    B(0.1, 0.1, 0.05, '#2c3a48', 0.11, -0.14, 0.12), B(0.1, 0.1, 0.05, '#2c3a48', -0.11, -0.14, 0.12),
    B(0.44, 0.05, 0.22, '#1f2a36', 0, -0.2, 0),
  ]);
}
function scrapGeo() {
  return merge([
    B(0.5, 0.05, 0.1, WOOD, 0, -0.06, 0, 0, 0.3, 0.1),
    B(0.45, 0.05, 0.1, WOOD2, 0.02, 0.0, 0.03, 0.1, -0.5, -0.08),
    B(0.34, 0.02, 0.3, STEEL, -0.05, 0.05, 0, 0.2, 0.8, 0.1),
    C(0.11, 0.11, 0.04, 8, '#b9792e', 0.12, 0.1, -0.06, 0.5, 0, 0.3),
    C(0.03, 0.03, 0.4, 6, '#6b7686', -0.1, -0.01, 0.14, 0, 0.4, HALF_PI),
    B(0.16, 0.02, 0.2, RUST, 0.16, -0.02, 0.12, -0.2, 0.2, 0.3),
  ]);
}

function barricadeGeo(level) {
  const cfg = CONFIG.barricade;
  const W = cfg.width, H = cfg.height, pz = cfg.depth * 0.26;
  const p = [];
  // posts (sunk a little so slopes leave no gap)
  p.push(B(0.16, H + 0.55, 0.16, WOOD3, -W * 0.42, H * 0.5 - 0.2, 0, 0, 0, 0.03));
  if (level < 2) p.push(B(0.16, H + 0.5, 0.16, WOOD3, W * 0.42, H * 0.5 - 0.2, 0, 0, 0, -0.04));
  else p.push(B(0.16, H * 0.6, 0.16, WOOD3, W * 0.42, H * 0.18, 0, 0.12, 0, -0.3));
  // planks across the front
  const PW = W * 0.97;
  if (level === 0) {
    p.push(B(PW, 0.26, 0.07, WOOD, 0, 0.2, pz, 0, 0, 0.03));
    p.push(B(PW, 0.24, 0.07, WOOD2, 0.03, 0.52, pz, 0, 0, -0.04));
    p.push(B(PW, 0.26, 0.07, WOOD, -0.02, 0.86, pz, 0, 0, 0.05));
    p.push(B(PW, 0.24, 0.07, WOOD2, 0, 1.2, pz, 0, 0, -0.03));
  } else if (level === 1) {
    p.push(B(PW, 0.26, 0.07, WOOD, 0, 0.2, pz, 0, 0, 0.05));
    p.push(B(PW * 0.62, 0.24, 0.07, WOOD2, -W * 0.17, 0.52, pz, 0, 0, -0.12));
    p.push(B(PW, 0.24, 0.07, WOOD2, 0.04, 1.14, pz, 0.06, 0, -0.1));
    p.push(B(PW * 0.4, 0.22, 0.07, WOOD, W * 0.28, 0.8, pz, 0.1, 0, 0.3));
  } else {
    p.push(B(PW * 0.9, 0.26, 0.07, WOOD, -0.05, 0.22, pz, 0.08, 0, 0.1));
    p.push(B(PW * 0.55, 0.22, 0.07, WOOD2, -W * 0.2, 0.86, pz, 0.15, 0, -0.42));
  }
  // sheet metal
  const sz = cfg.depth * 0.4;
  if (level === 0) {
    p.push(B(W * 0.46, 0.95, 0.04, STEEL, -W * 0.2, 0.62, sz, 0, 0, 0.05));
    p.push(B(W * 0.35, 0.7, 0.04, RUST, W * 0.27, 0.95, -sz, 0, 0, -0.06));
    p.push(B(0.05, 0.05, 0.03, DARK, -W * 0.38, 1.0, sz + 0.02)); p.push(B(0.05, 0.05, 0.03, DARK, -W * 0.03, 1.0, sz + 0.02));
    p.push(B(0.05, 0.05, 0.03, DARK, -W * 0.38, 0.25, sz + 0.02)); p.push(B(0.05, 0.05, 0.03, DARK, -W * 0.03, 0.25, sz + 0.02));
  } else if (level === 1) {
    p.push(B(W * 0.46, 0.95, 0.04, STEEL, -W * 0.2, 0.55, sz, 0.1, 0, 0.22));
    p.push(B(W * 0.35, 0.7, 0.04, RUST, W * 0.27, 0.9, -sz, 0, 0, -0.14));
  } else {
    p.push(B(W * 0.46, 0.8, 0.04, STEEL, -W * 0.12, 0.34, sz, 0.5, 0, 0.5));
  }
  // diagonal back brace + scavenged stakes on top
  if (level < 2) p.push(B(W * 0.95, 0.16, 0.06, WOOD3, 0, 0.7, -pz, 0, 0, level === 0 ? 0.48 : 0.6));
  if (level === 0) {
    p.push(B(0.15, 0.55, 0.05, WOOD2, -W * 0.22, H + 0.05, pz + 0.02, 0, 0, 0.08));
    p.push(B(0.13, 0.45, 0.05, WOOD, W * 0.08, H, pz + 0.02, 0, 0, -0.1));
    p.push(B(0.15, 0.5, 0.05, WOOD2, W * 0.3, H + 0.02, pz + 0.02, 0, 0, 0.05));
  } else if (level === 1) {
    p.push(B(0.15, 0.5, 0.05, WOOD2, -W * 0.22, H - 0.02, pz + 0.02, 0, 0, 0.3));
  }
  return merge(p);
}

function crateBodyGeo() {
  const OLIVE = '#4b5a3a';
  const p = [];
  p.push(B(0.14, 0.1, 1.24, DARK, 0.6, 0.05, 0), B(0.14, 0.1, 1.24, DARK, -0.6, 0.05, 0));
  p.push(B(1.62, 0.86, 1.12, OLIVE, 0, 0.53, 0));
  p.push(B(1.64, 0.22, 1.14, EMBER, 0, 0.55, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(B(0.1, 0.92, 0.1, STEEL, sx * 0.81, 0.54, sz * 0.56));
  for (const sz of [-1, 1]) {
    p.push(B(1.7, 0.07, 0.07, STEEL, 0, 0.14, sz * 0.57), B(1.7, 0.07, 0.07, STEEL, 0, 0.94, sz * 0.57));
    for (let k = -3; k <= 3; k++) p.push(B(0.07, 0.27, 0.02, DARK, k * 0.23, 0.55, sz * 0.575, 0, 0, 0.6));
    p.push(B(0.34, 0.13, 0.02, BONE, -0.5, 0.8, sz * 0.565));
  }
  for (const sx of [-1, 1]) p.push(B(0.07, 0.07, 1.2, STEEL, sx * 0.82, 0.14, 0), B(0.07, 0.07, 1.2, STEEL, sx * 0.82, 0.94, 0));
  // beacon mast on the side
  p.push(B(0.06, 1.55, 0.06, DARK, 0.93, 0.78, 0.45));
  p.push(B(0.16, 0.05, 0.16, STEEL, 0.93, 1.56, 0.45));
  return merge(p);
}
function crateLidGeo() {
  // origin at the hinge (rear top edge); the lid extends toward +Z
  return merge([
    B(1.74, 0.12, 1.24, '#3e4b30', 0, 0.06, 0.62),
    B(0.12, 0.13, 1.26, STEEL, 0.5, 0.065, 0.62), B(0.12, 0.13, 1.26, STEEL, -0.5, 0.065, 0.62),
    B(0.6, 0.125, 0.3, EMBER, 0, 0.066, 0.62),
    B(0.3, 0.05, 0.06, DARK, 0, 0.14, 1.12),
  ]);
}
function canopyGeo() {
  const g = new THREE.SphereGeometry(3.2, 12, 3, 0, TAU, 0, HALF_PI).toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(EMBER), b = new THREE.Color(BONE);
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const gore = Math.floor((Math.atan2(cz, cx) + Math.PI) / (TAU / 12)) % 12;
    const c = gore % 2 ? a : b;
    for (let k = 0; k < 3; k++) { col[(t + k) * 3] = c.r; col[(t + k) * 3 + 1] = c.g; col[(t + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ================================================================= init
export function init(game) {
  const scene = game.scene;
  const LCFG = CONFIG.loot;
  const BCFG = CONFIG.barricade;
  const ACFG = LCFG.airdrop;
  let time = 0;

  const hAt = (x, z) => {
    const w = game.world;
    if (w && w.heightAt) { const h = w.heightAt(x, z); if (Number.isFinite(h)) return h; }
    return 0;
  };

  const root = new THREE.Group();
  root.name = 'loot';
  scene.add(root);

  // ------------------------------------------------------------- ground items
  const ITEM_CAP = 110;
  const itemMat = litMaterial(0.34);
  const visuals = {};
  const visList = [];
  function makeVisual(key, geo, scale, hover, tiltZ) {
    const mesh = new THREE.InstancedMesh(geo, itemMat, ITEM_CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.setColorAt(0, WHITE);
    mesh.count = 0;
    root.add(mesh);
    const vis = { key, mesh, items: [], scale, hover, tiltZ };
    visuals[key] = vis; visList.push(vis);
    return vis;
  }
  for (const id of ['pistol', 'smg', 'shotgun', 'rifle', 'sniper']) makeVisual('w:' + id, weaponGeo(id), 1.55, 0.62, 0.28);
  // heavy weapons (hotbar 5): boss-chest specials, plus the gatling when it gets swapped out
  makeVisual('w:flamethrower', weaponGeo('flamethrower'), 1.4, 0.66, 0.22);
  makeVisual('w:rocket', weaponGeo('rocket'), 1.3, 0.66, 0.18);
  makeVisual('w:gatling', weaponGeo('gatling'), 1.3, 0.66, 0.2);
  makeVisual('w:any', weaponGeo('any'), 1.55, 0.62, 0.28);
  makeVisual('ammo', ammoGeo(), 1.3, 0.5, 0.0);
  makeVisual('a:fuel', fuelGeo(), 1.15, 0.52, 0.0);
  makeVisual('a:rockets', rocketsGeo(), 1.5, 0.5, 0.0);
  makeVisual('m:bandage', bandageGeo(), 1.45, 0.52, 0.2);
  makeVisual('m:medkit', medkitGeo(), 1.25, 0.52, 0.0);
  makeVisual('vest', vestGeo(), 1.15, 0.62, 0.0);
  makeVisual('scrap', scrapGeo(), 1.3, 0.42, 0.0);

  const ringGeo = new THREE.PlaneGeometry(1.5, 1.5);
  ringGeo.rotateX(-HALF_PI);
  const ringMat = new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 0.2], [0.45, 0.07], [0.68, 0.05], [0.8, 0.95], [0.9, 0.18], [1, 0]]),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, ITEM_CAP);
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ringMesh.frustumCulled = false;
  ringMesh.setColorAt(0, WHITE);
  ringMesh.count = 0;
  ringMesh.renderOrder = 2;
  root.add(ringMesh);

  const RING = {
    weapon: new THREE.Color(EMBER), med: new THREE.Color('#58e0c2'),
    armor: new THREE.Color('#7fb7e6'), scrap: new THREE.Color('#b8b29f'),
  };
  const AMMO_COL = {};
  for (const k of Object.keys(CONFIG.ammoTypes)) AMMO_COL[k] = new THREE.Color(CONFIG.ammoTypes[k].color);

  const items = [];
  const killDrops = [];      // live kill drops, oldest first (subset of items)
  const spots = [];          // { pos: Vector3, item, compound }
  const inventory = { bandage: 0, medkit: 0, scrap: 0 };
  let colorsDirty = true;

  function itemName(kind, id) {
    if (kind === 'weapon') return (CONFIG.weapons[id] && CONFIG.weapons[id].name) || id;
    if (kind === 'ammo') return (CONFIG.ammoTypes[id] && CONFIG.ammoTypes[id].name) || id;
    if (kind === 'med') return id === 'medkit' ? 'Medkit' : 'Bandage';
    if (kind === 'armor') return 'Armor vest';
    if (kind === 'scrap') return 'Scrap';
    return id;
  }
  function visualFor(kind, id) {
    if (kind === 'weapon') return visuals['w:' + id] || visuals['w:any'];
    if (kind === 'ammo') return visuals['a:' + id] || visuals.ammo;
    if (kind === 'med') return visuals['m:' + id] || visuals['m:bandage'];
    if (kind === 'armor') return visuals.vest;
    return visuals.scrap;
  }
  function addItem(kind, id, amount, pos, spot) {
    let y = pos.y;
    if (!Number.isFinite(y)) y = hAt(pos.x, pos.z);
    const vis = visualFor(kind, id);
    const item = {
      kind, id, amount,
      position: new THREE.Vector3(pos.x, y, pos.z),
      name: itemName(kind, id),
      _spot: spot || null,
      _vis: vis,
      _phase: Math.random() * TAU,
      _pop: 0,
      // the generic ammo box is grey and takes the ammo colour; dedicated models carry their own colours
      _tint: kind === 'ammo' && vis === visuals.ammo ? (AMMO_COL[id] || WHITE) : WHITE,
      _ring: kind === 'ammo' ? (AMMO_COL[id] || WHITE) : (RING[kind] || WHITE),
      // kill drops (see spawnKillDrop): lifetime, blink phase and the pop-out hop from the corpse
      _kill: false, _life: 0, _blink: 0, _hopT: 0, _hx: 0, _hy: 0, _hz: 0,
    };
    items.push(item);
    item._vis.items.push(item);
    if (spot) spot.item = item;
    colorsDirty = true;
    return item;
  }
  function removeItem(item) {
    let i = items.indexOf(item);
    if (i >= 0) items.splice(i, 1);
    i = item._vis.items.indexOf(item);
    if (i >= 0) item._vis.items.splice(i, 1);
    if (item._spot && item._spot.item === item) item._spot.item = null;
    if (item._kill) { i = killDrops.indexOf(item); if (i >= 0) killDrops.splice(i, 1); }
    colorsDirty = true;
  }
  function clearItems() {
    items.length = 0;
    killDrops.length = 0;
    for (const v of visList) v.items.length = 0;
    for (const s of spots) s.item = null;
    colorsDirty = true;
  }

  let tableTotal = 0;
  for (const e of LCFG.table) tableTotal += e.w;
  function rollEntry() {
    let r = Math.random() * tableTotal;
    for (const e of LCFG.table) { r -= e.w; if (r <= 0) return e; }
    return LCFG.table[LCFG.table.length - 1];
  }
  const rollAmount = (e) => e.amount[0] + Math.floor(Math.random() * (e.amount[1] - e.amount[0] + 1));
  function fillSpot(spot) {
    const e = rollEntry();
    return addItem(e.kind, e.id, rollAmount(e), spot.pos, spot);
  }

  function spawnInitial() {
    clearItems();
    spots.length = 0;
    const world = game.world;
    const comps = (world && world.compounds) || [];
    for (let ci = 0; ci < comps.length; ci++) {
      const ls = comps[ci].lootSpots || [];
      for (let k = 0; k < ls.length; k++) spots.push({ pos: ls[k], item: null, compound: ci });
    }
    for (const s of spots) if (Math.random() < 0.8) fillSpot(s);

    // Guarantee a gun (and something to feed it) in the compound nearest the spawn.
    const sp = (world && world.playerSpawn) || (game.player && game.player.position);
    if (!sp || !comps.length) return;
    let best = -1, bd = Infinity;
    for (let ci = 0; ci < comps.length; ci++) {
      const c = comps[ci].center; if (!c) continue;
      const d = (c.x - sp.x) * (c.x - sp.x) + (c.z - sp.z) * (c.z - sp.z);
      if (d < bd) { bd = d; best = ci; }
    }
    const local = spots.filter((s) => s.compound === best);
    if (!local.length) return;
    local.sort((a, b) =>
      ((a.pos.x - sp.x) ** 2 + (a.pos.z - sp.z) ** 2) - ((b.pos.x - sp.x) ** 2 + (b.pos.z - sp.z) ** 2));
    let gun = null;
    for (const s of local) if (s.item && s.item.kind === 'weapon' && s.item.id !== 'sniper') { gun = s.item; break; }
    if (!gun) {
      const pool = LCFG.table.filter((e) => e.kind === 'weapon' && e.id !== 'sniper');
      const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : 'smg';
      const s = local[0];
      if (s.item) removeItem(s.item);
      gun = addItem('weapon', pick, 1, s.pos, s);
    }
    const gdef = CONFIG.weapons[gun.id];
    if (gdef && gdef.ammoType && local.length > 1) {
      let has = false;
      for (const s of local) if (s.item && s.item.kind === 'ammo' && s.item.id === gdef.ammoType) { has = true; break; }
      if (!has) {
        let s = null;
        for (const c of local) if (c.item !== gun && (!c.item || c.item.kind !== 'weapon')) { s = c; break; }
        if (s) {
          if (s.item) removeItem(s.item);
          addItem('ammo', gdef.ammoType, gdef.mag * 2, s.pos, s);
        }
      }
    }
  }

  function respawnDay() {
    const pl = game.player;
    const empty = [];
    for (const s of spots) {
      if (s.item) continue;
      if (pl && pl.position) {
        const dx = s.pos.x - pl.position.x, dz = s.pos.z - pl.position.z;
        if (dx * dx + dz * dz < 144) continue;       // never pop in next to the player
      }
      empty.push(s);
    }
    for (let i = empty.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = empty[i]; empty[i] = empty[j]; empty[j] = t;
    }
    const n = Math.ceil(empty.length * LCFG.dayRespawnFraction);
    for (let i = 0; i < n; i++) fillSpot(empty[i]);
  }

  // ------------------------------------------------------------- kill drops
  const DCFG = CONFIG.drops || { chance: {}, life: 40, table: [] };
  const KILL_CAP = 40;              // live kill drops; the oldest goes first
  const HOP_DUR = 0.55, HOP_H = 0.85;
  const BLINK_T = 5;                // blink during the last seconds of life
  // 'ammo:auto' rolls `amount` light-round-sized; scale it per pool so a shell/rocket drop is not a fortune
  const AUTO_SCALE = { light: 1, heavy: 1, shells: 0.45, sniper: 0.3, belt: 3, fuel: 1.6, rockets: 0.08 };
  const AUTO_HEAVY_W = 0.35;        // weight of a hotbar-5 weapon's ammo against 1 per gun
  let dropTableTotal = 0;
  for (const e of DCFG.table || []) dropTableTotal += e.w;
  const _pick = { kind: 'scrap', id: 'scrap', amount: 1 };
  const _poolT = [], _poolW = [];
  const _dropPos = new THREE.Vector3(), _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
  const SCRAP_ENTRY = (DCFG.table || []).find((e) => e.kind === 'scrap') || { kind: 'scrap', id: 'scrap', amount: [1, 3] };

  function ownsAmmoUser(type) {
    const w = game.weapons, slots = w && w.slots;
    if (!slots) return false;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s && s.def && s.def.slot !== 'melee' && s.def.ammoType === type) return true;
    }
    return false;
  }
  function pickToScrap() {
    _pick.kind = 'scrap'; _pick.id = 'scrap'; _pick.amount = rollAmount(SCRAP_ENTRY);
  }
  // Ammo for a random gun the player owns (melee skipped). Fills _pick; false when nothing fits.
  function pickAutoAmmo(base) {
    const w = game.weapons, slots = w && w.slots;
    _poolT.length = 0; _poolW.length = 0;
    let total = 0;
    if (slots) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i], d = s && s.def;
        if (!d || d.slot === 'melee' || !d.ammoType || !CONFIG.ammoTypes[d.ammoType]) continue;
        const wt = d.slot === 'heavy' ? AUTO_HEAVY_W : 1;
        const k = _poolT.indexOf(d.ammoType);
        if (k >= 0) { _poolW[k] += wt; } else { _poolT.push(d.ammoType); _poolW.push(wt); }
        total += wt;
      }
    }
    if (!_poolT.length) return false;
    let r = Math.random() * total, type = _poolT[_poolT.length - 1];
    for (let i = 0; i < _poolT.length; i++) { r -= _poolW[i]; if (r <= 0) { type = _poolT[i]; break; } }
    _pick.kind = 'ammo'; _pick.id = type;
    _pick.amount = Math.max(1, Math.round(base * (AUTO_SCALE[type] != null ? AUTO_SCALE[type] : 1)));
    return true;
  }
  function rollKillDrop() {
    let e = null;
    if (dropTableTotal > 0) {
      let r = Math.random() * dropTableTotal;
      for (const t of DCFG.table) { r -= t.w; if (r <= 0) { e = t; break; } }
      if (!e) e = DCFG.table[DCFG.table.length - 1];
    }
    if (!e) { pickToScrap(); return _pick; }
    _pick.kind = e.kind; _pick.id = e.id; _pick.amount = rollAmount(e);
    if (e.kind === 'ammo') {
      if (e.id === 'auto') { if (!pickAutoAmmo(_pick.amount)) pickToScrap(); }
      // explicit ammo (fuel, rockets, ...) only for a weapon you actually carry
      else if (!CONFIG.ammoTypes[e.id] || !ownsAmmoUser(e.id)) pickToScrap();
    } else if (e.kind === 'weapon' && !CONFIG.weapons[e.id]) pickToScrap();
    return _pick;
  }

  // Where a drop popping out of a body at `src` lands: a short hop sideways that never crosses a wall,
  // nudged out of colliders, resting on the ground or whatever the body stood on. null = sea / nowhere.
  function dropLanding(src, out, minR, maxR, radius) {
    const w = game.world, sea = CONFIG.world.seaLevel;
    const footY = Number.isFinite(src.y) ? src.y : hAt(src.x, src.z);
    const a = Math.random() * TAU, dx = Math.cos(a), dz = Math.sin(a);
    let r = rand(minR, maxR);
    if (w && w.raycast && r > 0) {
      _ro.set(src.x, footY + 0.5, src.z); _rd.set(dx, 0, dz);
      let hit = null;
      try { hit = w.raycast(_ro, _rd, r + radius); } catch (err) { hit = null; }
      if (hit && Number.isFinite(hit.distance)) r = Math.max(0, hit.distance - radius);
    }
    out.set(src.x + dx * r, footY, src.z + dz * r);
    if (w && w.resolveCircle) { try { w.resolveCircle(out, radius, 1.0); } catch (err) { /* keep the raw point */ } }
    let y = NaN;
    if (w && w.floorAt) { try { y = w.floorAt(out.x, out.z, radius * 0.8, footY); } catch (err) { y = NaN; } }
    if (!Number.isFinite(y)) y = hAt(out.x, out.z);
    if (!(y > sea + 0.03)) {
      // the hop went wrong (shore, odd geometry): fall back to the body's own spot
      out.set(src.x, footY, src.z);
      y = hAt(src.x, src.z);
      if (Number.isFinite(footY) && footY > y) y = footY;
      if (!(y > sea + 0.03)) return null;
    }
    out.y = y;
    return out;
  }

  function spawnKillDrop(src) {
    const p = dropLanding(src, _dropPos, 0.45, 1.15, 0.3);
    if (!p) return null;
    const pk = rollKillDrop();
    const it = addItem(pk.kind, pk.id, pk.amount, p);
    it._kill = true;
    it._life = DCFG.life || 40;
    it._blink = 0;
    it._hopT = HOP_DUR;
    it._hx = src.x - p.x; it._hz = src.z - p.z;
    const sy = Number.isFinite(src.y) ? src.y : p.y;
    it._hy = Math.max(-3, Math.min(3, sy + 0.35 - p.y));
    killDrops.push(it);
    while (killDrops.length > KILL_CAP) removeItem(killDrops[0]);
    return it;
  }

  function onZombieKilled(e) {
    if (!e || game.state !== 'playing') return;
    const z = e.zombie;
    const type = e.type || (z && z.type);
    if (e.boss || type === 'boss') return;            // the boss pays out through its chest
    const src = (e.position && Number.isFinite(e.position.x)) ? e.position : (z && z.position);
    if (!src) return;
    const base = (DCFG.chance && DCFG.chance[type]) || 0;
    const mods = game.mods;
    let chance = base * (mods && Number.isFinite(mods.dropMult) ? mods.dropMult : 1);
    // a drop multiplier past 100% turns the overflow into the chance of a second drop
    for (let k = 0; k < 3 && chance > 0; k++, chance -= 1) {
      if (Math.random() < Math.min(1, chance)) spawnKillDrop(src);
    }
  }
  game.on('zombieKilled', onZombieKilled);

  function updateKillDrops(dt) {
    for (let i = killDrops.length - 1; i >= 0; i--) {
      const it = killDrops[i];
      it._life -= dt;
      if (it._life <= 0) {
        emitParticle(1, it.position.x, it.position.y + 0.45, it.position.z, rand(-0.5, 0.5), rand(0.5, 1.1), rand(-0.5, 0.5), 0.5, 0.3, 1.0, 0.22);
        removeItem(it);
      }
    }
  }

  function updateItems(dt) {
    let ri = 0;
    const near = api.nearest;
    for (let vi = 0; vi < visList.length; vi++) {
      const vis = visList[vi], list = vis.items, mesh = vis.mesh;
      const n = Math.min(list.length, ITEM_CAP);
      if (n === 0 && mesh.count === 0) continue;
      mesh.visible = n > 0;
      for (let i = 0; i < n; i++) {
        const it = list[i];
        const isNear = it === near;
        if (it._pop < 1) it._pop = Math.min(1, it._pop + dt * 3.2);
        const pop = it._pop < 1 ? Math.max(0.01, easeOutBack(it._pop)) : 1;
        const bob = Math.sin(time * 2.1 + it._phase) * 0.06;
        let px = it.position.x, py = it.position.y + vis.hover + bob, pz = it.position.z, vk = 1;
        if (it._kill) {
          if (it._hopT > 0) {
            // pop out of the body: eased slide + a parabolic arc onto the landing spot
            it._hopT = Math.max(0, it._hopT - dt);
            const f = 1 - it._hopT / HOP_DUR, g = 1 - f, ge = g * g;
            px += it._hx * ge; pz += it._hz * ge;
            py += it._hy * g + Math.sin(Math.PI * f) * HOP_H;
            if (it._hopT === 0) {
              emitParticle(1, it.position.x, it.position.y + 0.1, it.position.z, rand(-0.7, 0.7), rand(0.3, 0.8), rand(-0.7, 0.7), 0.45, 0.25, 0.8, 0.2);
            }
          }
          if (it._life < BLINK_T) {
            // blink faster and faster, then shrink away
            it._blink += dt * TAU * (2.5 + (BLINK_T - it._life) * 1.5);
            if (Math.sin(it._blink) < -0.2) vk = 0.001;
            if (it._life < 0.35) vk *= Math.max(0.001, it._life / 0.35);
          }
        }
        const sc = vis.scale * pop * (isNear ? 1.22 : 1) * vk;
        _e.set(0, time * (isNear ? 2.4 : 0.9) + it._phase, vis.tiltZ, 'YXZ');
        _q.setFromEuler(_e);
        _m4.compose(_v.set(px, py, pz), _q, _s.set(sc, sc, sc));
        mesh.setMatrixAt(i, _m4);
        if (colorsDirty) mesh.setColorAt(i, it._tint);
        if (ri < ITEM_CAP) {
          const rs = (isNear ? 1.25 : 1) * (0.92 + 0.1 * Math.sin(time * 3 + it._phase)) * pop * vk;
          _m4.compose(_v.set(it.position.x, it.position.y + 0.07, it.position.z), IDENT_Q, _s.set(rs, 1, rs));
          ringMesh.setMatrixAt(ri, _m4);
          if (colorsDirty) ringMesh.setColorAt(ri, it._ring);
          ri++;
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (colorsDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    ringMesh.count = ri;
    ringMesh.instanceMatrix.needsUpdate = true;
    if (colorsDirty && ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
    colorsDirty = false;
  }

  // ------------------------------------------------------------- particles (flare smoke, dust, sparks)
  const PN = 200;
  const pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3);
  const pSize = new Float32Array(PN), pAlpha = new Float32Array(PN), pTint = new Float32Array(PN);
  const pAge = new Float32Array(PN), pLife = new Float32Array(PN);
  const pS0 = new Float32Array(PN), pS1 = new Float32Array(PN), pAmax = new Float32Array(PN), pSeed = new Float32Array(PN);
  const pKind = new Uint8Array(PN);      // 0 smoke, 1 dust, 2 spark, 3 ember
  let pNext = 0, pAlive = 0;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aTint', new THREE.BufferAttribute(pTint, 1).setUsage(THREE.DynamicDrawUsage));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 }, uGlow: { value: 1 }, uDay: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aAlpha; attribute float aTint;
      uniform float uScale;
      varying float vAlpha; varying float vTint;
      void main() {
        vAlpha = aAlpha; vTint = aTint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(aSize * uScale / max(0.5, -mv.z), 1024.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uGlow; uniform float uDay;
      varying float vAlpha; varying float vTint;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.15, 1.0, d)) * vAlpha;
        if (a < 0.004) discard;
        vec3 col;
        if (vTint < 0.5) {
          col = mix(vec3(1.0, 0.2, 0.11), vec3(0.6, 0.07, 0.07), vTint * 2.0) * uGlow;
        } else if (vTint < 1.5) {
          col = vec3(0.62, 0.55, 0.45) * (0.18 + 0.82 * uDay);
        } else if (vTint < 2.5) {
          col = vec3(3.2, 1.7, 0.5);
        } else {
          col = vec3(2.9, 1.3, 0.3);
        }
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const pPoints = new THREE.Points(pGeo, pMat);
  pPoints.frustumCulled = false;
  pPoints.renderOrder = 6;
  root.add(pPoints);

  function emitParticle(kind, x, y, z, vx, vy, vz, life, s0, s1, amax) {
    const i = pNext; pNext = (pNext + 1) % PN;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pAge[i] = 0; pLife[i] = life; pS0[i] = s0; pS1[i] = s1; pAmax[i] = amax;
    pKind[i] = kind; pSeed[i] = Math.random() * TAU;
    pAlive = Math.max(pAlive, 1);
  }
  function clearParticles() {
    pLife.fill(0); pAlpha.fill(0); pSize.fill(0);
    pGeo.attributes.aAlpha.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
    pAlive = 0;
  }
  function updateParticles(dt) {
    if (pAlive === 0) return;
    const cam = game.camera;
    const h = game.renderer && game.renderer.domElement ? game.renderer.domElement.height : 900;
    pMat.uniforms.uScale.value = h / (2 * Math.tan((cam.fov * Math.PI / 180) * 0.5));
    const nightK = 1 - clamp01(game.dayFactor);
    pMat.uniforms.uGlow.value = 0.9 + 1.5 * nightK;
    pMat.uniforms.uDay.value = clamp01(game.dayFactor);
    let alive = 0;
    const drag = Math.exp(-2.4 * dt);
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) continue;
      const age = (pAge[i] += dt);
      if (age >= pLife[i]) { pLife[i] = 0; pAlpha[i] = 0; pSize[i] = 0; continue; }
      alive++;
      const f = age / pLife[i];
      const k = pKind[i], i3 = i * 3;
      if (k === 0) {
        // flare smoke: rises, slows, leans with the wind as it climbs
        pVel[i3 + 1] *= 1 - 0.05 * dt;
        pPos[i3] += (pVel[i3] + (0.5 + 1.6 * f) + Math.sin(age * 1.1 + pSeed[i]) * 0.5) * dt;
        pPos[i3 + 1] += pVel[i3 + 1] * dt;
        pPos[i3 + 2] += (pVel[i3 + 2] + (0.25 + 0.8 * f) + Math.cos(age * 0.9 + pSeed[i]) * 0.5) * dt;
        pSize[i] = pS0[i] + (pS1[i] - pS0[i]) * Math.sqrt(f);
        pAlpha[i] = pAmax[i] * Math.min(1, age * 3) * (f > 0.55 ? (1 - f) / 0.45 : 1);
        pTint[i] = Math.min(0.49, f * 0.6);
      } else if (k === 1) {
        pVel[i3] *= drag; pVel[i3 + 1] *= drag; pVel[i3 + 2] *= drag;
        pPos[i3] += pVel[i3] * dt; pPos[i3 + 1] += pVel[i3 + 1] * dt; pPos[i3 + 2] += pVel[i3 + 2] * dt;
        pSize[i] = pS0[i] + (pS1[i] - pS0[i]) * f;
        pAlpha[i] = pAmax[i] * (1 - f);
        pTint[i] = 1;
      } else if (k === 2) {
        pVel[i3 + 1] -= 9 * dt;
        pPos[i3] += pVel[i3] * dt; pPos[i3 + 1] += pVel[i3 + 1] * dt; pPos[i3 + 2] += pVel[i3 + 2] * dt;
        pSize[i] = pS0[i] * (1 - f * 0.5);
        pAlpha[i] = pAmax[i] * (1 - f * f);
        pTint[i] = 2;
      } else {
        // ember: drifts up and wanders (boss chest)
        pPos[i3] += (pVel[i3] + Math.sin(age * 2.3 + pSeed[i]) * 0.35) * dt;
        pPos[i3 + 1] += pVel[i3 + 1] * dt;
        pPos[i3 + 2] += (pVel[i3 + 2] + Math.cos(age * 1.9 + pSeed[i]) * 0.35) * dt;
        pSize[i] = pS0[i] * (1 - f * 0.6);
        pAlpha[i] = pAmax[i] * Math.min(1, age * 4) * (1 - f);
        pTint[i] = 3;
      }
    }
    pAlive = alive;
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;
    pGeo.attributes.aTint.needsUpdate = true;
  }

  // ------------------------------------------------------------- debris pool (barricade break, crate open)
  const DEB_N = 48;
  const debGeo = new THREE.BoxGeometry(1, 1, 1);
  const debMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, metalness: 0.1 });
  const debMesh = new THREE.InstancedMesh(debGeo, debMat, DEB_N);
  debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debMesh.frustumCulled = false;
  debMesh.castShadow = true;
  for (let i = 0; i < DEB_N; i++) { debMesh.setMatrixAt(i, ZERO_M); debMesh.setColorAt(i, WHITE); }
  root.add(debMesh);
  const debris = [];
  for (let i = 0; i < DEB_N; i++) {
    debris.push({ active: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), s: new THREE.Vector3(), life: 0 });
  }
  let debNext = 0, debActive = 0;
  const DEB_COLS = [new THREE.Color(WOOD), new THREE.Color(WOOD2), new THREE.Color(WOOD3), new THREE.Color(STEEL), new THREE.Color(RUST)];
  const CRATE_COLS = [new THREE.Color('#4b5a3a'), new THREE.Color(STEEL), new THREE.Color(EMBER)];
  const CHEST_COLS = [new THREE.Color(CHAR), new THREE.Color(GOLD), new THREE.Color(EMBER)];

  function spawnDebris(pos, yaw, n, power, cols) {
    const cx = Math.cos(yaw), sx = -Math.sin(yaw);
    const palette = cols || DEB_COLS;
    for (let k = 0; k < n; k++) {
      const i = debNext; debNext = (debNext + 1) % DEB_N;
      const d = debris[i];
      const off = (Math.random() - 0.5) * BCFG.width * 0.85;
      d.active = true;
      d.p.set(pos.x + cx * off, pos.y + rand(0.3, 1.3), pos.z + sx * off);
      d.v.set(rand(-2.6, 2.6) * power, rand(2.4, 5.6) * power, rand(-2.6, 2.6) * power);
      d.r.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
      d.w.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
      const ci = Math.floor(Math.random() * palette.length);
      if (palette === DEB_COLS && ci >= 3) d.s.set(rand(0.3, 0.5), 0.03, rand(0.25, 0.4));
      else d.s.set(rand(0.45, 0.9), 0.06, rand(0.12, 0.18));
      d.life = rand(2.2, 3.2);
      debMesh.setColorAt(i, palette[ci]);
    }
    if (debMesh.instanceColor) debMesh.instanceColor.needsUpdate = true;
    debActive = 1;
  }
  function clearDebris() {
    for (let i = 0; i < DEB_N; i++) { debris[i].active = false; debMesh.setMatrixAt(i, ZERO_M); }
    debMesh.instanceMatrix.needsUpdate = true;
    debActive = 0;
  }
  function updateDebris(dt) {
    if (debActive === 0) return;
    let n = 0;
    for (let i = 0; i < DEB_N; i++) {
      const d = debris[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) { d.active = false; debMesh.setMatrixAt(i, ZERO_M); continue; }
      n++;
      d.v.y -= 18 * dt;
      d.p.x += d.v.x * dt; d.p.y += d.v.y * dt; d.p.z += d.v.z * dt;
      const g = hAt(d.p.x, d.p.z) + 0.05;
      if (d.p.y < g) {
        d.p.y = g;
        d.v.y = Math.abs(d.v.y) > 1.2 ? -d.v.y * 0.32 : 0;
        d.v.x *= 0.55; d.v.z *= 0.55;
        d.w.multiplyScalar(0.45);
      }
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      const k = d.life < 0.5 ? d.life / 0.5 : 1;
      _e.set(d.r.x, d.r.y, d.r.z, 'XYZ'); _q.setFromEuler(_e);
      _m4.compose(d.p, _q, _s.set(d.s.x * k, d.s.y * k, d.s.z * k));
      debMesh.setMatrixAt(i, _m4);
    }
    debMesh.instanceMatrix.needsUpdate = true;
    debActive = n;
  }

  // ------------------------------------------------------------- barricades
  const barricades = [];
  const barMat = litMaterial(0.1);
  const barMeshes = [];
  for (let lv = 0; lv < 3; lv++) {
    const m = new THREE.InstancedMesh(barricadeGeo(lv), barMat, BCFG.max + 1);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true; m.receiveShadow = true;
    m.count = 0;
    root.add(m);
    barMeshes.push(m);
  }
  let lastPlace = -10, lastHitEmit = -10;

  function removeBarricade(b, broken) {
    if (!b || !b._alive) return;
    b._alive = false;
    const i = barricades.indexOf(b);
    if (i >= 0) barricades.splice(i, 1);
    const w = game.world;
    if (b._collider && w && w.removeCollider) { try { w.removeCollider(b._collider); } catch (e) { /* already gone */ } }
    b._collider = null;
    spawnDebris(b.position, b.yaw, broken ? 9 : 5, broken ? 1 : 0.6);
    if (broken) {
      for (let k = 0; k < 6; k++) {
        emitParticle(1, b.position.x + rand(-1, 1), b.position.y + rand(0.2, 1.1), b.position.z + rand(-1, 1),
          rand(-2, 2), rand(0.5, 2), rand(-2, 2), rand(0.8, 1.3), 0.8, 2.6, 0.4);
      }
      game.emit('barricadeBroken', { position: b.position });
    }
  }

  function placeBarricade() {
    const pl = game.player, world = game.world;
    if (!pl || !world || pl.alive === false) return;
    if (time - lastPlace < 0.25) return;
    if (inventory.scrap < BCFG.cost) { game.emit('toast', `Need ${BCFG.cost} scrap`); return; }
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    const x = pl.position.x + fx * BCFG.placeDist, z = pl.position.z + fz * BCFG.placeDist;
    const y = hAt(x, z);
    if (!(y > CONFIG.world.seaLevel + 0.05) || Math.abs(y - pl.position.y) > 2.2) {
      game.emit('toast', "Can't build there");
      return;
    }
    // not on top of another barricade (stacking them made an unbreakable plug) ...
    for (let i = 0; i < barricades.length; i++) {
      const o = barricades[i].position, ox = o.x - x, oz = o.z - z;
      if (ox * ox + oz * oz < 0.8 * 0.8) { game.emit('toast', 'Already barricaded'); return; }
    }
    // ... and not with its middle buried in a wall, rock or crate (scrap wasted on nothing)
    if (world.resolveCircle) {
      _v.set(x, y, z);
      let hit = null;
      try { if (world.resolveCircle(_v, 0.12, 1.2)) hit = world.lastHitCollider; } catch (e) { hit = null; }
      if (hit && hit.type !== 'barricade') { game.emit('toast', "Can't build there"); return; }
    }
    const quarter = Math.round(pl.yaw / HALF_PI);
    const yaw = quarter * HALF_PI;
    const alongX = quarter % 2 === 0;           // facing +-Z: the wall spans X
    const hw = BCFG.width * 0.5, hd = BCFG.depth * 0.5;
    const hx = alongX ? hw : hd, hz = alongX ? hd : hw;
    const box = new THREE.Box3(
      new THREE.Vector3(x - hx, y - 0.5, z - hz),
      new THREE.Vector3(x + hx, y + BCFG.height, z + hz));
    const b = {
      position: new THREE.Vector3(x, y, z), yaw, health: BCFG.health, maxHealth: BCFG.health,
      _alive: true, _collider: null, _age: 0, _wobble: 0, _level: 0,
      _flip: Math.random() < 0.5 ? Math.PI : 0, _phase: Math.random() * TAU,
    };
    if (world.addCollider) { try { b._collider = world.addCollider(box, 'barricade', b) || null; } catch (e) { b._collider = null; } }
    barricades.push(b);
    inventory.scrap -= BCFG.cost;
    lastPlace = time;
    for (let k = 0; k < 5; k++) {
      emitParticle(1, x + rand(-1.1, 1.1) * (alongX ? 1 : 0.2), y + 0.15, z + rand(-1.1, 1.1) * (alongX ? 0.2 : 1),
        rand(-1.5, 1.5), rand(0.4, 1.4), rand(-1.5, 1.5), rand(0.6, 1.0), 0.6, 2.0, 0.35);
    }
    game.emit('barricadePlaced', { position: b.position });
    while (barricades.length > BCFG.max) removeBarricade(barricades[0], false);
  }

  function damageBarricade(b, dmg) {
    if (!b || !b._alive || !(dmg > 0)) return false;
    b.health -= dmg;
    b._wobble = 1;
    if (time - lastHitEmit > 0.28) { lastHitEmit = time; game.emit('barricadeHit', { position: b.position }); }
    if (b.health <= 0) { b.health = 0; removeBarricade(b, true); return true; }
    const r = b.health / b.maxHealth;
    const lv = r > 0.6 ? 0 : r > 0.3 ? 1 : 2;
    if (lv !== b._level) { b._level = lv; b._wobble = 1.6; spawnDebris(b.position, b.yaw, 3, 0.7); }
    return false;
  }

  const barCounts = [0, 0, 0];
  function updateBarricades(dt) {
    barCounts[0] = barCounts[1] = barCounts[2] = 0;
    const decay = Math.exp(-5 * dt);
    for (let i = 0; i < barricades.length; i++) {
      const b = barricades[i];
      b._age += dt;
      b._wobble *= decay;
      const pop = b._age < 0.38 ? Math.max(0.02, easeOutBack(b._age / 0.38)) : 1;
      const tilt = b._wobble > 0.01 ? Math.sin(time * 38 + b._phase) * 0.075 * b._wobble : 0;
      _e.set(tilt, b.yaw + b._flip, tilt * 0.45, 'YXZ');
      _q.setFromEuler(_e);
      _m4.compose(b.position, _q, _s.set(0.55 + 0.45 * pop, pop, 0.55 + 0.45 * pop));
      const m = barMeshes[b._level];
      m.setMatrixAt(barCounts[b._level]++, _m4);
    }
    for (let lv = 0; lv < 3; lv++) {
      const m = barMeshes[lv];
      if (m.count === 0 && barCounts[lv] === 0) continue;
      m.count = barCounts[lv];
      m.instanceMatrix.needsUpdate = true;
    }
  }
  function clearBarricades() {
    const w = game.world;
    for (const b of barricades) {
      b._alive = false;
      if (b._collider && w && w.removeCollider) { try { w.removeCollider(b._collider); } catch (e) { /* ignore */ } }
      b._collider = null;
    }
    barricades.length = 0;
    for (const m of barMeshes) m.count = 0;
  }

  // ------------------------------------------------------------- airdrop
  const crateMat = litMaterial(0.2);
  const crate = new THREE.Group();
  crate.visible = false;
  root.add(crate);
  const crateBody = new THREE.Mesh(crateBodyGeo(), crateMat);
  crateBody.castShadow = true; crateBody.receiveShadow = true;
  crate.add(crateBody);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.98, -0.62);
  const lid = new THREE.Mesh(crateLidGeo(), crateMat);
  lid.castShadow = true;
  lidPivot.add(lid);
  crate.add(lidPivot);

  const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const innerGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0).rotateX(-HALF_PI), innerMat);
  innerGlow.position.y = 0.9;
  innerGlow.visible = false;
  crate.add(innerGlow);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lampMat);
  lamp.position.set(0.93, 1.68, 0.45);
  crate.add(lamp);

  const glowTex = radialTexture([[0, 1], [0.2, 0.55], [0.5, 0.14], [1, 0]]);
  const flareMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const flare = new THREE.Sprite(flareMat);
  flare.position.copy(lamp.position);
  flare.renderOrder = 5;
  crate.add(flare);

  // parachute
  const chute = new THREE.Group();
  crate.add(chute);
  const canopy = new THREE.Mesh(canopyGeo(), litMaterial(0.28, { side: THREE.DoubleSide, roughness: 0.95, metalness: 0 }));
  canopy.position.y = 5.4; canopy.scale.y = 0.72;
  canopy.castShadow = true;
  chute.add(canopy);
  const cordPos = new Float32Array(8 * 2 * 3);
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) / 8 * TAU;
    const rx = Math.cos(a) * 3.15, rz = Math.sin(a) * 3.15;
    cordPos.set([rx, 5.4, rz, Math.sign(rx) * 0.8, 1.0, Math.sign(rz) * 0.56], k * 6);
  }
  const cordGeo = new THREE.BufferGeometry();
  cordGeo.setAttribute('position', new THREE.BufferAttribute(cordPos, 3));
  const cords = new THREE.LineSegments(cordGeo, new THREE.LineBasicMaterial({ color: 0xd8d2c2 }));
  cords.frustumCulled = false;
  chute.add(cords);

  // soft vertical light beam (unfogged so it reads across the island)
  const BEAM_H = 180;
  const beamGeo = new THREE.CylinderGeometry(0.8, 1.7, BEAM_H, 18, 1, true);
  beamGeo.translate(0, BEAM_H / 2, 0);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1.7, 0.3, 0.16) }, uIntensity: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uIntensity;
      varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        f = f * f;
        float h = pow(1.0 - vH, 1.7) * 0.92 + 0.08 * (1.0 - vH);
        gl_FragColor = vec4(uColor * (uIntensity * f * h), 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false;
  beam.visible = false;
  beam.renderOrder = 4;
  root.add(beam);

  // Always present (intensity 0 when idle) so the light count never changes -> no shader recompiles.
  const dropLight = new THREE.PointLight(0xff3b22, 0, 42, 1.5);
  dropLight.castShadow = false;
  dropLight.position.set(0, -50, 0);
  scene.add(dropLight);
  const COL_RED = new THREE.Color(1.0, 0.2, 0.1), COL_GOLD = new THREE.Color(1.0, 0.72, 0.32);

  let drop = null;
  const dropItem = { kind: 'airdrop', id: 'airdrop', amount: 1, position: new THREE.Vector3(), name: 'Supply crate' };
  let smokeAcc = 0;

  function removeAirdrop() {
    if (drop) {
      const w = game.world;
      if (drop._collider && w && w.removeCollider) { try { w.removeCollider(drop._collider); } catch (e) { /* ignore */ } }
      drop._collider = null;
    }
    drop = null;
    api.airdrop = null;
    crate.visible = false;
    beam.visible = false;
    beamMat.uniforms.uIntensity.value = 0;
    dropLight.intensity = 0;
  }

  function pickDropPoint() {
    const world = game.world, pl = game.player;
    let best = null, bestErr = Infinity;
    if (world && world.randomOpenPoint) {
      for (let i = 0; i < 16; i++) {
        let p = null;
        try { p = world.randomOpenPoint(); } catch (e) { p = null; }
        if (!p) continue;
        let err = 0;
        if (pl && pl.position) {
          const d = Math.hypot(p.x - pl.position.x, p.z - pl.position.z);
          err = d < 40 ? 40 - d : d > 110 ? d - 110 : 0;
        }
        if (err < bestErr) { best = p; bestErr = err; if (err === 0) break; }
      }
    }
    if (!best) {
      const px = pl && pl.position ? pl.position.x : 0, pz = pl && pl.position ? pl.position.z : 0;
      const a = Math.random() * TAU;
      best = new THREE.Vector3(px + Math.cos(a) * 50, 0, pz + Math.sin(a) * 50);
    }
    return best;
  }

  function spawnAirdrop() {
    removeAirdrop();
    const p = pickDropPoint();
    const gy = hAt(p.x, p.z);
    drop = {
      position: new THREE.Vector3(p.x, gy, p.z), landed: false, opened: false, y: gy + ACFG.startHeight,
      _groundY: gy, _t: 0, _landT: 0, _openT: 0, _beam: 0, _collider: null, _ph: Math.random() * TAU,
    };
    api.airdrop = drop;
    dropItem.position.copy(drop.position);
    crate.visible = true;
    crate.position.set(p.x, drop.y, p.z);
    crate.rotation.set(0, 0, 0);
    crate.scale.set(1, 1, 1);
    lidPivot.rotation.x = 0;
    innerGlow.visible = false;
    chute.visible = true; cords.visible = true;
    chute.position.set(0, 0, 0); chute.rotation.set(0, 0, 0); chute.scale.set(1, 1, 1);
    flare.visible = true;
    beam.position.set(p.x, gy + 0.6, p.z);
    beam.visible = true;
    smokeAcc = 0;
    game.emit('airdropIncoming', { position: drop.position });
    return drop;
  }

  function landAirdrop() {
    const d = drop, world = game.world;
    d.landed = true; d._landT = 0; d.y = d._groundY;
    crate.position.copy(d.position);
    crate.rotation.set(0, 0, 0);
    cords.visible = false;
    if (world && world.addCollider) {
      const box = new THREE.Box3(
        new THREE.Vector3(d.position.x - 0.92, d._groundY - 0.5, d.position.z - 0.68),
        new THREE.Vector3(d.position.x + 0.92, d._groundY + 1.15, d.position.z + 0.68));
      try { d._collider = world.addCollider(box, 'crate', d) || null; } catch (e) { d._collider = null; }
    }
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU + rand(-0.15, 0.15), sp = rand(4, 7.5);
      emitParticle(1, d.position.x + Math.cos(a) * 0.9, d._groundY + 0.25, d.position.z + Math.sin(a) * 0.9,
        Math.cos(a) * sp, rand(0.6, 2.2), Math.sin(a) * sp, rand(1.1, 1.8), 1.2, 4.6, 0.5);
    }
    game.emit('airdropLanded', { position: d.position });
  }

  // Hotbar 5 holds one heavy weapon and give() overwrites it: the one it replaces is left on the
  // ground beside (x, y, z) with the rounds it had in it, instead of vanishing.
  const _wdrop = new THREE.Vector3(), _wsrc = new THREE.Vector3();
  function giveHeavy(id, x, y, z) {
    const w = game.weapons;
    if (!w || !w.give) return false;
    const slots = w.slots;
    const prev = slots && slots[4];
    if (w.give(id) === false) return false;
    if (prev && prev.id !== id && slots.indexOf(prev) === -1) {
      _wsrc.set(x, y, z);
      const p = dropLanding(_wsrc, _wdrop, 1.7, 2.1, 0.35) || _wdrop.set(x + 1.8, hAt(x + 1.8, z), z);
      const it = addItem('weapon', prev.id, 1, p);
      it._mag = prev.mag | 0;
    }
    return true;
  }

  function openCrate() {
    const d = drop;
    if (!d || !d.landed || d.opened) return;
    d.opened = true; d._openT = 0;
    innerGlow.visible = true;
    const w = game.weapons, n = ACFG.beltRounds;
    let had = false;
    if (w) {
      try {
        had = !!(w.has && w.has('gatling'));
        if (!had && w.give) giveHeavy('gatling', d.position.x, d._groundY, d.position.z);
        if (w.addAmmo) w.addAmmo('belt', n);
      } catch (e) { console.error('[loot] crate reward failed', e); }
    }
    inventory.medkit += 1;
    const cx = d.position.x, cy = d._groundY + 1.0, cz = d.position.z;
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * TAU, sp = rand(0.8, 3.4);
      emitParticle(2, cx + rand(-0.6, 0.6), cy, cz + rand(-0.4, 0.4),
        Math.cos(a) * sp, rand(3.5, 8), Math.sin(a) * sp, rand(0.7, 1.4), rand(0.22, 0.4), 0, 1);
    }
    for (let k = 0; k < 6; k++) {
      emitParticle(1, cx + rand(-0.7, 0.7), cy, cz + rand(-0.5, 0.5), rand(-1, 1), rand(1, 2.5), rand(-1, 1), rand(0.9, 1.4), 0.8, 2.6, 0.3);
    }
    _v.set(cx, d._groundY + 0.6, cz);
    spawnDebris(_v, 0, 4, 0.8, CRATE_COLS);
    const gdef = CONFIG.weapons.gatling;
    if (!had) game.emit('pickup', { kind: 'weapon', id: 'gatling', amount: 1, name: gdef.name });
    else game.emit('pickup', { kind: 'ammo', id: 'belt', amount: n, name: CONFIG.ammoTypes.belt.name });
    game.emit('toast', `Supply crate: +${n} belt rounds, +1 medkit`);
    if (!had && game.hud && game.hud.announce) {
      try { game.hud.announce(gdef.name.toUpperCase(), 'Slot 5 — hold fire to spin it up'); } catch (e) { /* hud optional */ }
    }
  }

  function updateAirdrop(dt) {
    const d = drop;
    if (!d) { if (dropLight.intensity !== 0) dropLight.intensity = 0; return; }
    const nightK = 1 - clamp01(game.dayFactor);
    const pulse = 0.5 + 0.5 * Math.sin(time * 5.2);
    const wx = 0, wz = 0;

    if (!d.landed) {
      d._t += dt;
      const p = Math.min(1, d._t / ACFG.fallTime), s = 1 - p;
      d.y = d._groundY + ACFG.startHeight * s;
      const sw = Math.min(1, s * 5);
      crate.position.set(
        d.position.x + Math.sin(d._t * 0.55 + d._ph) * 3.2 * s, d.y,
        d.position.z + Math.cos(d._t * 0.42 + d._ph) * 3.2 * s);
      crate.rotation.set(Math.sin(d._t * 1.1 + 1) * 0.09 * sw, 0, Math.sin(d._t * 1.4) * 0.13 * sw);
      const br = 1 + Math.sin(d._t * 2.3) * 0.035;
      chute.scale.set(br, 2 - br, br);
      // flare smoke trail marking the descent
      smokeAcc += dt * 8;
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        emitParticle(0, crate.position.x + rand(-0.4, 0.4), d.y + 1.3, crate.position.z + rand(-0.4, 0.4),
          wx + rand(-0.3, 0.3), rand(0.4, 1.4), wz + rand(-0.3, 0.3), rand(4.5, 6), 1.0, 4.5, 0.5);
      }
      if (p >= 1) landAirdrop();
    } else {
      d._landT += dt;
      const k = d._landT;
      // impact squash
      const sq = k < 0.7 ? 1 - 0.2 * Math.exp(-k * 8) * Math.cos(k * 20) : 1;
      crate.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5);
      // canopy settles beside the crate, then is gone
      if (chute.visible) {
        const c = clamp01(k / 1.9);
        const ce = c * c * (3 - 2 * c);
        chute.position.set(ce * 3.4, -ce * 5.0, ce * 1.2);
        chute.rotation.z = -ce * 0.55;
        const fade = k > 4 ? Math.max(0, 1 - (k - 4) / 1.2) : 1;
        chute.scale.set((1 + ce * 0.25) * fade, Math.max(0.04, 1 - ce * 0.94) * fade, (1 + ce * 0.25) * fade);
        if (fade <= 0) chute.visible = false;
      }
      if (!d.opened) {
        // tall red flare column
        smokeAcc += dt * 12;
        while (smokeAcc >= 1) {
          smokeAcc -= 1;
          emitParticle(0, d.position.x + 0.93 + rand(-0.25, 0.25), d._groundY + 1.7, d.position.z + 0.45 + rand(-0.25, 0.25),
            rand(-0.35, 0.35), rand(4.6, 6.6), rand(-0.35, 0.35), rand(8, 9.6), 1.1, 8.5, 0.6);
        }
      } else {
        d._openT += dt;
        const o = clamp01(d._openT / 0.5);
        lidPivot.rotation.x = -1.92 * easeOutBack(o);
        if (d._openT < 0.6) {
          const kick = 1 + 0.14 * Math.exp(-d._openT * 9) * Math.sin(d._openT * 26);
          crate.scale.set(2 - kick, kick, 2 - kick);
        }
      }
    }

    // beam
    const beamTarget = d.opened ? 0 : d.landed ? 1 : 0.75;
    d._beam += (beamTarget - d._beam) * Math.min(1, dt * 1.6);
    if (d._beam > 0.01) {
      beam.visible = true;
      beamMat.uniforms.uIntensity.value = d._beam * (0.4 + 0.85 * nightK) * (0.86 + 0.14 * Math.sin(time * 3.1));
    } else {
      beam.visible = false;
    }

    // beacon: lamp, flare sprite, point light
    dropLight.position.set(crate.position.x, crate.position.y + 1.9, crate.position.z);
    if (!d.opened) {
      const p2 = pulse * pulse;
      lampMat.color.setRGB(0.5 + 3.4 * p2, 0.08 + 0.34 * p2, 0.05 + 0.16 * p2);
      const fs = (2.6 + 2.4 * p2) * (0.75 + 0.5 * nightK);
      flare.scale.set(fs, fs, 1);
      flareMat.color.setRGB(1.6 + 1.2 * p2, 0.3 + 0.2 * p2, 0.16);
      flare.visible = true;
      dropLight.color.copy(COL_RED);
      dropLight.intensity = (d.landed ? 1 : 0.55) * (26 + 58 * p2) * (0.4 + 0.6 * nightK);
    } else {
      const flash = Math.exp(-d._openT * 2.6);
      const linger = Math.max(0, 1 - d._openT / 30);
      lampMat.color.setRGB(0.18, 0.04, 0.03);
      const fs = 7 * flash;
      flare.visible = flash > 0.03;
      flare.position.set(0, 1.2, 0);
      flare.scale.set(fs, fs, 1);
      flareMat.color.setRGB(2.6, 1.7, 0.6);
      innerMat.color.setRGB(1.1 + 2.6 * flash + 0.5 * linger, 0.7 + 1.5 * flash + 0.25 * linger, 0.25 + 0.4 * flash);
      dropLight.color.copy(COL_GOLD);
      dropLight.intensity = 240 * flash + 16 * linger;
    }
    if (!d.opened) flare.position.copy(lamp.position);
  }

  // ------------------------------------------------------------- boss reward chest
  // Falls out of the sky where the boss died, sits under a golden beam until opened with F.
  const BOSS = CONFIG.boss || {};
  const CHEST_MAX = 3, CHEST_DELAY = 0.9, CHEST_FALL = 0.45, CHEST_H = 9;
  const CHEST_LINGER = 22, CHEST_SINK = 2.2;
  const CHEST_NAME = (BOSS.name || 'The Hollow King') + "'s hoard";
  const CHEST_PROMPT = '[F] Open ' + CHEST_NAME.replace(/^The /, 'the ');
  const CHEST_AMMO = { fuel: 120, rockets: 6 };          // the always-part, for whichever special you carry
  const CHEST_AMMO_BOTH = { fuel: 60, rockets: 3 };      // ... or a bit of both when you carry neither
  const CHEST_DUP = { fuel: 150, rockets: 6 };           // rolled a special you already own: its ammo instead
  const HEAVY_HINT = { flamethrower: 'Slot 5 — hold fire to burn them down', rocket: 'Slot 5 — mind the blast radius' };
  const chestMat = litMaterial(0.3);
  const chestSeamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.0, 0.3) });
  const chestBodyG = chestBodyGeo(), chestLidG = chestLidGeo(), chestSeamG = chestSeamGeo();
  const chestInnerG = new THREE.PlaneGeometry(1.2, 0.78).rotateX(-HALF_PI);
  const chestPoolTex = radialTexture([[0, 0.9], [0.3, 0.4], [0.65, 0.1], [1, 0]]);
  const chestPoolG = new THREE.PlaneGeometry(1, 1).rotateX(-HALF_PI);
  const CHEST_BEAM_COL = new THREE.Color(1.3, 0.78, 0.2);
  const chests = [];
  const chestFree = [];

  function makeChestObj() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(chestBodyG, chestMat);
    body.castShadow = true; body.receiveShadow = true;
    const seam = new THREE.Mesh(chestSeamG, chestSeamMat);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.86, -0.46);
    const lidM = new THREE.Mesh(chestLidG, chestMat);
    lidM.castShadow = true;
    lidPivot.add(lidM);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const inner = new THREE.Mesh(chestInnerG, innerMat);
    inner.position.y = 0.8; inner.visible = false;
    const fMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const fl = new THREE.Sprite(fMat);
    fl.position.set(0, 1.25, 0); fl.renderOrder = 5;
    group.add(body, seam, lidPivot, inner, fl);
    const bMat = beamMat.clone();
    bMat.uniforms.uColor.value.copy(CHEST_BEAM_COL);
    bMat.uniforms.uIntensity.value = 0;
    const bm = new THREE.Mesh(beamGeo, bMat);
    bm.frustumCulled = false; bm.renderOrder = 4;
    const pMat = new THREE.MeshBasicMaterial({
      map: chestPoolTex, color: 0xffb347, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const pool = new THREE.Mesh(chestPoolG, pMat);
    pool.renderOrder = 3;
    root.add(group, bm, pool);
    return { group, lidPivot, inner, innerMat, flare: fl, flareMat: fMat, beam: bm, beamMat: bMat, pool, poolMat: pMat };
  }
  function hideChestObj(o) {
    o.group.visible = false; o.beam.visible = false; o.pool.visible = false;
    o.beamMat.uniforms.uIntensity.value = 0;
  }

  function removeChest(c) {
    const i = chests.indexOf(c);
    if (i >= 0) chests.splice(i, 1);
    const w = game.world;
    if (c.collider && w && w.removeCollider) { try { w.removeCollider(c.collider); } catch (e) { /* ignore */ } }
    c.collider = null;
    hideChestObj(c.obj);
    chestFree.push(c.obj);
    if (api.nearest === c.item) { api.nearest = null; api.prompt = ''; }
  }
  function clearChests() { while (chests.length) removeChest(chests[chests.length - 1]); }

  const _cpos = new THREE.Vector3();
  function spawnBossChest(pos) {
    const pl = game.player;
    const src = pos || (pl && pl.position);
    if (!src) return null;
    while (chests.length >= CHEST_MAX) removeChest(chests[0]);
    _wsrc.set(src.x, Number.isFinite(src.y) ? src.y : hAt(src.x, src.z), src.z);
    const p = dropLanding(_wsrc, _cpos, 0, 0, 1.0);
    if (!p) {
      // died in the surf: put it on the nearest dry land the world can find
      _cpos.set(src.x, 0, src.z);
      const w = game.world;
      if (w && w.resolveCircle) { try { w.resolveCircle(_cpos, 1.0, 1.2); } catch (e) { /* ignore */ } }
      _cpos.y = hAt(_cpos.x, _cpos.z);
    }
    // face the player, snapped to a quarter turn so the axis-aligned collider fits
    let yaw = 0;
    if (pl && pl.position) yaw = Math.round(Math.atan2(pl.position.x - _cpos.x, pl.position.z - _cpos.z) / HALF_PI) * HALF_PI;
    const obj = chestFree.pop() || makeChestObj();
    const c = {
      position: _cpos.clone(), yaw, obj, t: 0, landed: false, opened: false, landT: 0, openT: 0,
      beam: 0, emberAcc: 0, collider: null, item: null, reward: null,
    };
    c.item = { kind: 'bossChest', id: 'bossChest', amount: 1, position: c.position, name: CHEST_NAME, _chest: c };
    obj.group.visible = false;
    obj.group.position.copy(c.position);
    obj.group.rotation.set(0, yaw, 0);
    obj.group.scale.set(1, 1, 1);
    obj.lidPivot.rotation.x = 0;
    obj.inner.visible = false;
    obj.flare.visible = false;
    obj.beam.position.set(c.position.x, c.position.y + 0.6, c.position.z);
    obj.beam.visible = false;
    obj.pool.position.set(c.position.x, c.position.y + 0.04, c.position.z);
    obj.pool.visible = false;
    chests.push(c);
    game.emit('bossChestSpawned', { position: c.position });
    return c;
  }

  function landChest(c) {
    c.landed = true; c.landT = 0;
    const o = c.obj, P = c.position, w = game.world;
    o.group.position.copy(P);
    if (w && w.addCollider) {
      const odd = Math.abs(Math.round(c.yaw / HALF_PI)) % 2 === 1;
      const hx = odd ? 0.5 : 0.74, hz = odd ? 0.74 : 0.5;
      const box = new THREE.Box3(new THREE.Vector3(P.x - hx, P.y - 0.5, P.z - hz), new THREE.Vector3(P.x + hx, P.y + 1.05, P.z + hz));
      try { c.collider = w.addCollider(box, 'crate', c) || null; } catch (e) { c.collider = null; }
    }
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU + rand(-0.15, 0.15), sp = rand(4.5, 8);
      emitParticle(1, P.x + Math.cos(a) * 0.8, P.y + 0.2, P.z + Math.sin(a) * 0.8,
        Math.cos(a) * sp, rand(0.5, 2), Math.sin(a) * sp, rand(1.0, 1.7), 1.1, 4.4, 0.5);
    }
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * TAU, sp = rand(1.5, 5);
      emitParticle(2, P.x + rand(-0.5, 0.5), P.y + 0.4, P.z + rand(-0.4, 0.4), Math.cos(a) * sp, rand(3, 7), Math.sin(a) * sp, rand(0.6, 1.2), rand(0.2, 0.36), 0, 1);
    }
    const pl = game.player;
    if (pl && pl.position && pl.addShake) {
      const dd = Math.hypot(pl.position.x - P.x, pl.position.z - P.z);
      if (dd < 30) pl.addShake(0.035 * (1 - dd / 30));
    }
    if (game.audio && game.audio.play) game.audio.play('airdropLanded', { position: P });
    game.emit('toast', `${CONFIG.boss && CONFIG.boss.name ? CONFIG.boss.name : 'The boss'} left a hoard behind — [F] to open`);
    game.emit('bossChestLanded', { position: P });
  }

  function openChest(c) {
    if (!c || !c.landed || c.opened) return;
    c.opened = true; c.openT = 0;
    const w = game.weapons, P = c.position, parts = [];
    let newWeapon = null, evKind = 'ammo', evId = 'fuel', evAmount = 0, evName = '';
    try {
      // 1) maybe a special weapon (flamethrower / rocket launcher, 50/50)
      const chance = Number.isFinite(BOSS.rewardWeaponChance) ? BOSS.rewardWeaponChance : 0.65;
      if (w && Math.random() < chance) {
        const wid = Math.random() < 0.5 ? 'flamethrower' : 'rocket';
        const def = CONFIG.weapons[wid];
        if (def) {
          if (w.has && w.has(wid)) {
            const n = CHEST_DUP[def.ammoType] || def.mag || 1;
            if (w.addAmmo) w.addAmmo(def.ammoType, n);
            parts.push(`+${n} ${(CONFIG.ammoTypes[def.ammoType] || {}).name || def.ammoType}`);
          } else if (giveHeavy(wid, P.x, P.y, P.z)) {
            newWeapon = wid;
            parts.push(def.name);
          }
        }
      }
      // 2) always: ammo for whichever special you carry now (both, small, when neither)
      if (w && w.addAmmo) {
        const hasF = !!(w.has && w.has('flamethrower')), hasR = !!(w.has && w.has('rocket'));
        const grant = (type, n) => {
          w.addAmmo(type, n);
          parts.push(`+${n} ${(CONFIG.ammoTypes[type] || {}).name || type}`);
          if (!evAmount) { evId = type; evAmount = n; evName = (CONFIG.ammoTypes[type] || {}).name || type; }
        };
        if (hasF && !hasR) grant('fuel', CHEST_AMMO.fuel);
        else if (hasR && !hasF) grant('rockets', CHEST_AMMO.rockets);
        else if (hasF && hasR) { grant('fuel', CHEST_AMMO_BOTH.fuel); grant('rockets', CHEST_AMMO_BOTH.rockets); }
        else {
          // no special weapon rolled and none carried: fuel / rockets would be dead weight, give usable loot instead
          for (let k = 0; k < 2; k++) if (pickAutoAmmo(40)) grant(_pick.id, _pick.amount);
          const pl = game.player;
          if (pl && pl.addArmor) { pl.addArmor(50); parts.push('+50 armor'); }
        }
      }
    } catch (e) { console.error('[loot] boss chest reward failed', e); }
    // 3) always: a medkit and scrap
    inventory.medkit += 1;
    inventory.scrap += 10;
    parts.push('+1 medkit', '+10 scrap');
    c.reward = { weapon: newWeapon, parts: parts.slice() };

    const o = c.obj;
    o.inner.visible = true;
    const cx = P.x, cy = P.y + 0.95, cz = P.z;
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * TAU, sp = rand(0.8, 3.8);
      emitParticle(2, cx + rand(-0.5, 0.5), cy, cz + rand(-0.35, 0.35), Math.cos(a) * sp, rand(4, 9), Math.sin(a) * sp, rand(0.8, 1.5), rand(0.22, 0.42), 0, 1);
    }
    for (let k = 0; k < 14; k++) {
      emitParticle(3, cx + rand(-0.5, 0.5), cy, cz + rand(-0.35, 0.35), rand(-0.6, 0.6), rand(1.8, 3.6), rand(-0.6, 0.6), rand(1.6, 2.6), rand(0.16, 0.28), 0, 1);
    }
    _v.set(cx, P.y + 0.6, cz);
    spawnDebris(_v, c.yaw, 4, 0.8, CHEST_COLS);

    if (newWeapon) {
      const def = CONFIG.weapons[newWeapon];
      game.emit('pickup', { kind: 'weapon', id: newWeapon, amount: 1, name: def.name });
      if (game.hud && game.hud.announce) {
        try { game.hud.announce(def.name.toUpperCase(), HEAVY_HINT[newWeapon] || 'Slot 5'); } catch (e) { /* hud optional */ }
      }
    } else {
      game.emit('pickup', { kind: evKind, id: evId, amount: evAmount, name: evName || 'Ammo' });
    }
    game.emit('toast', `${CHEST_NAME}: ${parts.join(', ')}`);
    game.emit('bossChestOpened', { position: P, weapon: newWeapon, parts: c.reward.parts });
  }

  function updateChests(dt) {
    if (!chests.length) return;
    const nightK = 1 - clamp01(game.dayFactor);
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.4);
    chestSeamMat.color.setRGB(1.6 + 1.6 * pulse, 0.6 + 0.6 * pulse, 0.16 + 0.2 * pulse);
    for (let i = chests.length - 1; i >= 0; i--) {
      const c = chests[i], o = c.obj, P = c.position;
      c.t += dt;
      let beamTarget = 0;
      if (!c.landed) {
        beamTarget = 0.8;
        if (c.t >= CHEST_DELAY) {
          const f = Math.min(1, (c.t - CHEST_DELAY) / CHEST_FALL);
          o.group.visible = true;
          o.group.position.set(P.x, P.y + CHEST_H * (1 - f * f), P.z);
          o.group.rotation.set(0, c.yaw + (1 - f) * 2.4, 0);
          if (f >= 1) landChest(c);
        }
      } else if (!c.opened) {
        beamTarget = 1;
        c.landT += dt;
        const k = c.landT;
        const sq = k < 0.7 ? 1 - 0.22 * Math.exp(-k * 8) * Math.cos(k * 20) : 1;
        o.group.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5);
        o.group.rotation.set(0, c.yaw, 0);
        // the lid rattles now and then
        const rattle = Math.max(0, Math.sin(time * 1.3 + i * 2.1) - 0.86) * 7;
        o.lidPivot.rotation.x = -0.06 * rattle * (0.5 + 0.5 * Math.sin(time * 40));
        o.flare.visible = true;
        const fs = (2.2 + 1.6 * pulse) * (0.7 + 0.5 * nightK);
        o.flare.scale.set(fs, fs, 1);
        o.flareMat.color.setRGB(1.5 + 0.8 * pulse, 0.95 + 0.4 * pulse, 0.3);
        o.flare.position.set(0, 1.25, 0);
        c.emberAcc += dt * 11;
        while (c.emberAcc >= 1) {
          c.emberAcc -= 1;
          const a = Math.random() * TAU, r = rand(0.2, 0.8);
          emitParticle(3, P.x + Math.cos(a) * r, P.y + rand(0.7, 1.0), P.z + Math.sin(a) * r * 0.7,
            rand(-0.2, 0.2), rand(0.9, 2.0), rand(-0.2, 0.2), rand(1.4, 2.4), rand(0.12, 0.22), 0, 0.9);
        }
      } else {
        c.openT += dt;
        const oT = c.openT;
        o.lidPivot.rotation.x = -1.95 * easeOutBack(clamp01(oT / 0.55));
        if (oT < 0.6) {
          const kick = 1 + 0.16 * Math.exp(-oT * 9) * Math.sin(oT * 26);
          o.group.scale.set(2 - kick, kick, 2 - kick);
        } else o.group.scale.set(1, 1, 1);
        const flash = Math.exp(-oT * 2.4), linger = Math.max(0, 1 - oT / CHEST_LINGER);
        o.innerMat.color.setRGB(1.2 + 2.6 * flash + 0.6 * linger, 0.8 + 1.6 * flash + 0.35 * linger, 0.25 + 0.4 * flash);
        o.flare.visible = flash > 0.03;
        const fs = 8 * flash;
        o.flare.scale.set(fs, fs, 1);
        o.flareMat.color.setRGB(2.6, 1.8, 0.7);
        if (oT > CHEST_LINGER) {
          // spent: sinks into the ground and is gone
          if (c.collider) {
            const w = game.world;
            if (w && w.removeCollider) { try { w.removeCollider(c.collider); } catch (e) { /* ignore */ } }
            c.collider = null;
          }
          const s = (oT - CHEST_LINGER) / CHEST_SINK;
          o.group.position.y = P.y - s * 1.3;
          if (s >= 1) { removeChest(c); continue; }
        }
      }
      c.beam += (beamTarget - c.beam) * Math.min(1, dt * 1.8);
      if (c.beam > 0.01) {
        o.beam.visible = true;
        o.beamMat.uniforms.uIntensity.value = c.beam * (0.35 + 0.7 * nightK) * (0.86 + 0.14 * Math.sin(time * 3.1 + i));
      } else o.beam.visible = false;
      const poolK = c.landed ? (c.opened ? Math.max(0, 1 - c.openT / 3) : 1) : c.beam * 0.4;
      o.pool.visible = poolK > 0.01;
      if (o.pool.visible) {
        const ps = 5.5 + 0.6 * pulse;
        o.pool.scale.set(ps, 1, ps);
        o.poolMat.opacity = poolK * (0.35 + 0.45 * nightK) * (0.8 + 0.2 * pulse);
      }
    }
  }
  game.on('bossKilled', (e) => {
    if (!e || game.state !== 'playing') return;
    const z = e.zombie;
    const p = (e.position && Number.isFinite(e.position.x)) ? e.position : (z && z.position);
    if (p) spawnBossChest(p);
  });

  // ------------------------------------------------------------- pickup / prompt
  function updateNearest() {
    api.nearest = null;
    api.prompt = '';
    const pl = game.player;
    if (!pl || !pl.position || pl.alive === false) return;
    const px = pl.position.x, py = pl.position.y, pz = pl.position.z;
    const fx = -Math.sin(pl.yaw || 0), fz = -Math.cos(pl.yaw || 0);
    const R = LCFG.pickupRange, R2 = R * R;
    let best = null, bestScore = Infinity;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const dx = it.position.x - px, dz = it.position.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > R2) continue;
      if (Math.abs(it.position.y - py) > 2.4) continue;
      const d = Math.sqrt(d2);
      const dot = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
      const score = d - dot * 0.9;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (drop && drop.landed && !drop.opened) {
      const dx = drop.position.x - px, dz = drop.position.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < R + 1.3 && Math.abs(drop.position.y - py) < 3) {
        const dot = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
        const score = d - 1.6 - dot * 0.9;
        if (score < bestScore) { bestScore = score; best = dropItem; }
      }
    }
    for (let i = 0; i < chests.length; i++) {
      const c = chests[i];
      if (!c.landed || c.opened) continue;
      const dx = c.position.x - px, dz = c.position.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < R + 1.3 && Math.abs(c.position.y - py) < 3) {
        const dot = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
        const score = d - 1.7 - dot * 0.9;
        if (score < bestScore) { bestScore = score; best = c.item; }
      }
    }
    if (!best) return;
    api.nearest = best;
    if (best === dropItem) { api.prompt = '[F] Open supply crate'; return; }
    if (best._chest) { api.prompt = CHEST_PROMPT; return; }
    let txt = '[F] ' + best.name;
    if (best.kind === 'weapon') {
      const w = game.weapons;
      const bdef = CONFIG.weapons[best.id];
      if (w && w.has && w.has(best.id)) txt += ' (take ammo)';
      else if (bdef && bdef.slot === 'heavy') {
        const out = w && w.slots && w.slots[4];
        if (out && out.def && out.def.name) txt += ' (swap ' + out.def.name + ')';
      } else if (w && w.slots && w.slots[1] && w.slots[2] && w.slots[3]) {
        // gun slots full: say which gun gets left behind
        const ci = w.currentIndex, out = w.slots[ci >= 1 && ci <= 3 ? ci : 1];
        if (out && out.def && out.def.name) txt += ' (swap ' + out.def.name + ')';
      }
    } else if (best.kind !== 'armor' && best.amount > 1) {
      txt += ' x' + best.amount;
    }
    api.prompt = txt;
  }

  function pickup() {
    updateNearest();
    const it = api.nearest;
    if (!it) return;
    if (it === dropItem) { openCrate(); updateNearest(); return; }
    if (it._chest) { openChest(it._chest); updateNearest(); return; }
    const pl = game.player, w = game.weapons;
    let evKind = it.kind, evId = it.id, evAmount = it.amount, evName = it.name;
    let swapped = null;
    if (it.kind === 'weapon') {
      if (!w || !w.give) return;
      const wdef = CONFIG.weapons[it.id];
      const had = !!(w.has && w.has(it.id));
      const slots = w.slots;
      // With all three gun slots full give() overwrites the held gun: remember it so it can be
      // dropped where this one lay instead of vanishing.
      let out = null;
      if (!had && wdef && wdef.slot === 'gun' && slots && slots[1] && slots[2] && slots[3]) {
        const ci = w.currentIndex;
        out = slots[ci >= 1 && ci <= 3 ? ci : 1];
      } else if (!had && wdef && wdef.slot === 'heavy' && slots && slots[4] && slots[4].id !== it.id) {
        out = slots[4];          // hotbar 5 holds one heavy weapon: the old one is left here
      }
      if (had && wdef && wdef.ammoType && it._mag != null && w.addAmmo) {
        // a gun we dropped earlier and already replaced: only the rounds left in it
        if (it._mag > 0) w.addAmmo(wdef.ammoType, it._mag);
      } else if (w.give(it.id) === false) return;
      if (had && wdef && wdef.ammoType) {
        // already owned: it was stripped for ammo, so report it as ammo
        evKind = 'ammo'; evId = wdef.ammoType; evAmount = it._mag != null ? it._mag : wdef.mag;
        evName = (CONFIG.ammoTypes[wdef.ammoType] && CONFIG.ammoTypes[wdef.ammoType].name) || it.name;
      } else if (slots) {
        if (it._mag != null) {
          // a dropped gun comes back with the magazine it was dropped with (no free refills by swapping)
          for (let i = 0; i < slots.length; i++) if (slots[i] && slots[i].id === it.id) slots[i].mag = Math.min(slots[i].mag, it._mag);
        }
        if (out && slots.indexOf(out) === -1) swapped = out;
      }
    } else if (it.kind === 'ammo') {
      if (!w || !w.addAmmo) return;
      w.addAmmo(it.id, it.amount);
    } else if (it.kind === 'med') {
      inventory[it.id] = (inventory[it.id] || 0) + it.amount;
    } else if (it.kind === 'armor') {
      if (pl && pl.armor >= CONFIG.player.maxArmor) { game.emit('toast', 'Armor already full'); return; }
      if (pl && pl.addArmor) pl.addArmor(it.amount);
    } else if (it.kind === 'scrap') {
      inventory.scrap += it.amount;
    }
    // little puff where the item was
    for (let k = 0; k < 3; k++) {
      emitParticle(1, it.position.x, it.position.y + 0.5, it.position.z, rand(-0.8, 0.8), rand(0.6, 1.5), rand(-0.8, 0.8), 0.5, 0.3, 0.9, 0.25);
    }
    const spot = it._spot;
    removeItem(it);
    if (swapped) {
      const d = addItem('weapon', swapped.id, 1, it.position, spot);
      d._mag = swapped.mag | 0;
    }
    game.emit('pickup', { kind: evKind, id: evId, amount: evAmount, name: evName });
    updateNearest();
  }

  // ------------------------------------------------------------- healing
  const heal = { active: false, id: '', t: 0, time: 1 };
  function endHeal(completed) {
    if (!heal.active) return;
    heal.active = false;
    api.healing = false;
    api.healProgress = 0;
    let amount = 0;
    if (completed) {
      const def = CONFIG.meds[heal.id];
      const pl = game.player;
      if (inventory[heal.id] > 0) {
        inventory[heal.id] -= 1;
        amount = def.heal;
        if (pl && pl.heal) pl.heal(amount);
      }
    }
    game.emit('healEnd', { id: heal.id, amount, completed: !!completed });
  }
  function tryHeal() {
    if (heal.active) return;
    const pl = game.player;
    if (!pl || pl.alive === false) return;
    const maxH = pl.maxHealth || CONFIG.player.maxHealth;
    if (pl.health >= maxH) { game.emit('toast', 'Health is full'); return; }
    let id = null;
    if (pl.health <= 60 && inventory.medkit > 0) id = 'medkit';
    else if (inventory.bandage > 0) id = 'bandage';
    else if (inventory.medkit > 0) id = 'medkit';
    if (!id) { game.emit('toast', 'No meds left'); return; }
    heal.active = true; heal.id = id; heal.t = 0; heal.time = CONFIG.meds[id].time;
    api.healing = true; api.healProgress = 0;
    game.emit('healStart', { id });
  }
  function updateHeal(dt) {
    if (!heal.active) return;
    const pl = game.player;
    if (!pl || pl.alive === false || (pl.input && pl.input.fire) || pl.isSprinting) { endHeal(false); return; }
    heal.t += dt;
    api.healProgress = clamp01(heal.t / heal.time);
    if (heal.t >= heal.time) endHeal(true);
  }

  // ------------------------------------------------------------- input
  game.on('keydown', (code) => {
    if (code === 'KeyF') pickup();
    else if (code === 'KeyH') tryHeal();
    else if (code === 'KeyB') placeBarricade();
  });

  // ------------------------------------------------------------- api
  const api = {
    items,
    inventory,
    nearest: null,
    prompt: '',
    healing: false,
    healProgress: 0,
    airdrop: null,
    barricades,
    spawnInitial,
    respawnDay,
    spawnAirdrop,
    damageBarricade,
    addItem, removeItem,
    killDrops,
    bossChests: chests,
    spawnKillDrop,
    spawnBossChest,
    openBossChest: openChest,
    update(dt) {
      time += dt;
      updateKillDrops(dt);
      updateNearest();
      updateHeal(dt);
      updateItems(dt);
      updateBarricades(dt);
      updateDebris(dt);
      updateAirdrop(dt);
      updateChests(dt);
      updateParticles(dt);
    },
    reset() {
      if (heal.active) { heal.active = false; }
      api.healing = false; api.healProgress = 0;
      api.nearest = null; api.prompt = '';
      const sl = CONFIG.startLoadout || {};
      inventory.bandage = sl.bandage || 0;
      inventory.medkit = sl.medkit || 0;
      inventory.scrap = sl.scrap || 0;
      clearBarricades();
      clearDebris();
      clearParticles();
      removeAirdrop();
      clearChests();
      lastPlace = -10; lastHitEmit = -10;
      try { spawnInitial(); } catch (e) { console.error('[loot] spawnInitial failed', e); }
      // push one frame of instance data so nothing stale shows before the first update
      updateItems(0);
      updateBarricades(0);
    },
  };
  return api;
}
