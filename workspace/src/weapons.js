// HOLLOW DAWN — weapons: inventory slots, hitscan fire, melee, reload, gun models, pooled FX.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// ---- palette used by the gun models
const DARK = '#1b1e24', GUN = '#2c313a', STEEL = '#8d99ae', BRASS = '#f2c14e', EMBER = '#ff7a3c';
const HOUSING = '#4a5261', OLIVE = '#45523c', TAPE = '#b8b09c', HANDLE = '#5a4630';

// ---- per-weapon feel (animation / FX only; gameplay numbers live in CONFIG)
const FEEL = {
  bat:     { kickZ: 0,     kickR: 0,     flash: 0,    light: 0,  draw: 0.25 },
  pistol:  { kickZ: 0.03,  kickR: 0.16,  flash: 0.2,  light: 28, draw: 0.26 },
  smg:     { kickZ: 0.016, kickR: 0.045, flash: 0.22, light: 26, draw: 0.3 },
  shotgun: { kickZ: 0.085, kickR: 0.24,  flash: 0.46, light: 60, draw: 0.4 },
  rifle:   { kickZ: 0.024, kickR: 0.055, flash: 0.3,  light: 36, draw: 0.36 },
  sniper:  { kickZ: 0.11,  kickR: 0.26,  flash: 0.52, light: 70, draw: 0.5 },
  gatling: { kickZ: 0.01,  kickR: 0.012, flash: 0.4,  light: 46, draw: 0.65 },
  flamethrower: { kickZ: 0.004, kickR: 0.004, flash: 0, light: 0, draw: 0.5 },
  rocket:  { kickZ: 0.16,  kickR: 0.22,  flash: 0.75, light: 95, draw: 0.55 },
};
const FEEL_DEFAULT = FEEL.rifle;
const MODEL_SCALE = 1.15;
const NEG_Z = new THREE.Vector3(0, 0, -1);
// fallback when game.mods is missing (main.js always sets it; this only guards stand-alone use)
const MOD_FALLBACK = { damageMult: 1, headshotMult: 1, fireRateMult: 1, reloadMult: 1, ammoSaveChance: 0, igniteChance: 0, blastMult: 1 };

// ---- flamethrower / rocket tuning (FX + feel only; gameplay numbers come from CONFIG)
const FLAME_RATE = 120;         // flame billboards per second while spraying
const FLAME_CORE_RATE = 70;     // white-hot core billboards per second
const FLAME_SMOKE_RATE = 26;
const FLAME_EMBER_RATE = 20;
const FLAME_MAX_CHECKS = 24;    // zombies tested per tick (each costs one world ray)
const FLAME_HIT_EVT = 0.22;     // min seconds between aggregated 'hit' events from the flame
const BARREL_FLAME_DAMAGE = 20;
const IGNITE_BULLET_DPS = 18, IGNITE_BULLET_TIME = 2.5;   // mods.igniteChance burn
const ROCKET_POOL = 8;
const ROCKET_GRAVITY = 2.2;     // m/s^2, the slight drop
const ROCKET_TRAIL_RATE = 75;   // smoke puffs per second of flight

function makePuffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // lumpy edge so overlapping puffs do not read as perfect discs
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * TAU, r = 18 + Math.random() * 12;
    const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r, s = 5 + Math.random() * 7;
    const gg = g.createRadialGradient(x, y, 0, x, y, s);
    gg.addColorStop(0, 'rgba(0,0,0,0.55)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg;
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- geometry helpers (build-time only)
const _bc = new THREE.Color();
const _be = new THREE.Euler();
const _bm = new THREE.Matrix4();

function part(geo, x, y, z, color, rx, ry, rz) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (rx || ry || rz) {
    _be.set(rx || 0, ry || 0, rz || 0);
    _bm.makeRotationFromEuler(_be);
    g.applyMatrix4(_bm);
  }
  g.translate(x, y, z);
  _bc.set(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _bc.r; col[i * 3 + 1] = _bc.g; col[i * 3 + 2] = _bc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function box(P, w, h, d, x, y, z, color, rx, ry, rz) {
  P.push(part(new THREE.BoxGeometry(w, h, d), x, y, z, color, rx, ry, rz));
}
// cylinder along Z; rFront is the radius at the -Z (muzzle) end
function cyl(P, rFront, rRear, len, x, y, z, color, seg) {
  const g = new THREE.CylinderGeometry(rRear, rFront, len, seg || 8).toNonIndexed();
  g.rotateX(Math.PI / 2);
  P.push(part(g, x, y, z, color));
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.22, 'rgba(255,214,130,0.92)');
  grad.addColorStop(0.5, 'rgba(255,128,48,0.36)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  g.translate(64, 64);
  for (let i = 0; i < 7; i++) {
    g.rotate(TAU / 7 + (Math.random() - 0.5) * 0.3);
    const len = 60 * (0.6 + Math.random() * 0.4);
    g.beginPath();
    g.moveTo(-6, 0); g.lineTo(0, -len); g.lineTo(6, 0); g.closePath();
    g.fillStyle = 'rgba(255,224,160,0.5)';
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function init(game) {
  const W = CONFIG.weapons;
  const scene = game.scene;

  // ------------------------------------------------------------------ state
  const slots = [null, null, null, null, null];
  // reserve pools: one per CONFIG.ammoTypes entry (light, heavy, shells, sniper, belt, fuel, rockets, ...)
  const ammo = {};
  for (const k in (CONFIG.ammoTypes || {})) ammo[k] = 0;
  for (const k of ['light', 'heavy', 'shells', 'sniper', 'belt', 'fuel', 'rockets']) if (!(k in ammo)) ammo[k] = 0;
  const mods = () => game.mods || MOD_FALLBACK;
  const reloadDur = (def) => (def.reload || 1) / ((mods().reloadMult > 0 ? mods().reloadMult : 1));
  function consumeRound(cur) {
    const save = mods().ammoSaveChance || 0;
    if (save > 0 && Math.random() < save) return;
    cur.mag -= 1;
  }
  let currentIndex = 0;
  let fireCooldown = 0;
  let reloading = false, reloadT = 0;
  let drawT = 0, drawDur = 0.3;
  let bloom = 0, sinceShot = 10, spread = 0;
  let spin = 0, heat = 0, barrelAngle = 0, smokeT = 0;
  let kickZ = 0, kickR = 0;
  let prevFire = false, semiQueue = 0, dryEmitted = false;
  let swinging = false, swingT = 0, swingHitDone = false;
  const SWING_DUR = 0.42, SWING_HIT = 0.36;
  let flashT = 0, flashDur = 0.05, lightT = 0, lightPeak = 0;
  const LIGHT_DUR = 0.07;

  // ------------------------------------------------------------------ temps
  const _origin = new THREE.Vector3(), _dir = new THREE.Vector3(), _d = new THREE.Vector3();
  const _right = new THREE.Vector3(), _upv = new THREE.Vector3();
  const _muzzle = new THREE.Vector3(), _end = new THREE.Vector3(), _hitPt = new THREE.Vector3();
  const _v = new THREE.Vector3(), _mid = new THREE.Vector3(), _scl = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
  const _col = new THREE.Color();
  const dmgInfo = { headshot: false, point: _hitPt, dir: _d, source: 'bullet' };
  const meleeDir = new THREE.Vector3();
  const meleeInfo = { headshot: false, point: _hitPt, dir: meleeDir, source: 'melee' };
  // flamethrower: muzzle, stream direction, reach (to the first wall) of the current frame
  const _fMuz = new THREE.Vector3(), _fDir = new THREE.Vector3(), _fRight = new THREE.Vector3(), _fUp = new THREE.Vector3();
  const _fPt = new THREE.Vector3(), _fKnock = new THREE.Vector3(), _fd = new THREE.Vector3(), _pv = new THREE.Vector3();
  const flameInfo = { headshot: false, point: _fPt, dir: _fKnock, source: 'fire' };
  const flameList = [];
  const barrelEvt = { collider: null, damage: BARREL_FLAME_DAMAGE, point: new THREE.Vector3() };
  let flameReach = 0, flameBarrel = null, flameHold = 0, flameOn = false, flameHeat = 0, flameHitT = 0;
  let flameAcc = 0, coreAcc = 0, fSmokeAcc = 0, emberAcc = 0, flameLightOn = false, suppressBlood = false;
  const _rA = new THREE.Vector3(), _rB = new THREE.Vector3(), _rDir = new THREE.Vector3();
  const meleeList = [];
  const NO_INPUT = { fire: false, aim: false };

  // event payload rings (no per-shot allocation, payloads stay valid for a while)
  const shotEvts = [], hitEvts = [], meleeEvts = [];
  for (let i = 0; i < 16; i++) shotEvts.push({ weaponId: '', origin: new THREE.Vector3(), dir: new THREE.Vector3() });
  for (let i = 0; i < 32; i++) hitEvts.push({ zombie: null, headshot: false, killed: false, point: new THREE.Vector3() });
  for (let i = 0; i < 4; i++) meleeEvts.push({ hit: false });
  let shotEvtI = 0, hitEvtI = 0, meleeEvtI = 0;

  // per-shot distinct-zombie hit aggregation (shotgun pellets)
  const HIT_MAX = 12;
  const hitZ = new Array(HIT_MAX).fill(null);
  const hitHS = new Array(HIT_MAX).fill(false);
  const hitKill = new Array(HIT_MAX).fill(false);
  const hitPts = [];
  for (let i = 0; i < HIT_MAX; i++) hitPts.push(new THREE.Vector3());
  let nHit = 0;

  // ------------------------------------------------------------------ mount + models
  let mount = game.player && game.player.weaponMount;
  if (!mount) {
    mount = new THREE.Object3D();
    mount.position.set(0.26, -0.24, -0.5);
    game.camera.add(mount);
  }
  const rig = new THREE.Group();
  mount.add(rig);

  const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.3 });
  const heatMat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.45, metalness: 0.5,
    emissive: new THREE.Color('#ff5a1e'), emissiveIntensity: 0,
  });

  const flameTipMat = new THREE.MeshStandardMaterial({
    color: '#3a2a22', roughness: 0.4, metalness: 0.6, emissive: new THREE.Color('#ff6a1e'), emissiveIntensity: 0.6,
  });
  const flashTex = makeFlashTexture();
  const pilotMat = new THREE.SpriteMaterial({
    map: flashTex, color: new THREE.Color(0.55, 0.75, 2.2), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const pilotOuterMat = new THREE.SpriteMaterial({
    map: flashTex, color: new THREE.Color(2.2, 1.0, 0.3), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });

  const models = {};
  let gatCluster = null;
  let pilot = null, pilotOuter = null, rocketWarhead = null;

  function finishModel(id, P, mx, my, mz) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(mergeGeometries(P, false), gunMat);
    mesh.castShadow = true;
    g.add(mesh);
    let muzzle = null;
    if (mx !== undefined) {
      muzzle = new THREE.Object3D();
      muzzle.position.set(mx, my, mz);
      g.add(muzzle);
    }
    g.scale.setScalar(MODEL_SCALE);
    g.visible = false;
    rig.add(g);
    models[id] = { group: g, muzzle };
    for (let i = 0; i < P.length; i++) P[i].dispose();
    return g;
  }

  function buildModels() {
    let P, c;

    // Fence Post (melee) — length along -Z, grip at origin
    c = W.bat.color; P = [];
    box(P, 0.034, 0.034, 0.3, 0, 0, -0.05, HANDLE);
    box(P, 0.04, 0.04, 0.1, 0, 0, 0.02, TAPE);
    box(P, 0.06, 0.06, 0.6, 0, 0, -0.5, c);
    box(P, 0.045, 0.045, 0.04, 0, 0, -0.82, c);
    box(P, 0.008, 0.12, 0.008, 0, 0, -0.68, STEEL);
    box(P, 0.12, 0.008, 0.008, 0, 0, -0.6, STEEL);
    box(P, 0.008, 0.11, 0.008, 0, 0, -0.52, STEEL, 0, 0, 0.6);
    box(P, 0.072, 0.072, 0.012, 0, 0, -0.44, '#6f747c', 0, 0, 0.3);
    box(P, 0.072, 0.072, 0.012, 0, 0, -0.74, '#6f747c', 0, 0, 0.7);
    finishModel('bat', P);

    // P9 Sidearm
    c = W.pistol.color; P = [];
    box(P, 0.03, 0.115, 0.045, 0, -0.02, 0.012, DARK, -0.22);
    box(P, 0.034, 0.042, 0.2, 0, 0.062, -0.05, c);
    box(P, 0.03, 0.02, 0.15, 0, 0.034, -0.04, DARK);
    cyl(P, 0.009, 0.009, 0.02, 0, 0.066, -0.158, STEEL, 6);
    box(P, 0.012, 0.008, 0.05, 0, 0.012, -0.045, DARK);
    box(P, 0.02, 0.008, 0.01, 0, 0.087, 0.04, DARK);
    box(P, 0.006, 0.008, 0.008, 0, 0.087, -0.14, EMBER);
    finishModel('pistol', P, 0, 0.066, -0.17);

    // Vesper SMG
    c = W.smg.color; P = [];
    box(P, 0.032, 0.11, 0.045, 0, -0.02, 0.012, DARK, -0.2);
    box(P, 0.05, 0.075, 0.34, 0, 0.06, -0.1, c);
    box(P, 0.02, 0.012, 0.26, 0, 0.104, -0.1, DARK);
    cyl(P, 0.022, 0.022, 0.12, 0, 0.062, -0.33, DARK, 6);
    cyl(P, 0.011, 0.011, 0.06, 0, 0.062, -0.42, STEEL, 6);
    box(P, 0.028, 0.2, 0.04, 0, -0.07, -0.13, DARK, 0.08);
    box(P, 0.012, 0.012, 0.2, 0.02, 0.075, 0.17, STEEL);
    box(P, 0.012, 0.012, 0.2, -0.02, 0.075, 0.17, STEEL);
    box(P, 0.05, 0.08, 0.015, 0, 0.06, 0.275, DARK);
    box(P, 0.052, 0.01, 0.06, 0, 0.072, 0.0, EMBER);
    finishModel('smg', P, 0, 0.062, -0.455);

    // Brakeman 12 (pump shotgun)
    c = W.shotgun.color; P = [];
    box(P, 0.042, 0.085, 0.3, 0, 0.0, 0.2, c, 0.2);
    box(P, 0.036, 0.06, 0.1, 0, 0.015, 0.03, c, 0.35);
    box(P, 0.05, 0.08, 0.26, 0, 0.06, -0.1, DARK);
    cyl(P, 0.017, 0.017, 0.56, 0, 0.082, -0.5, GUN, 8);
    cyl(P, 0.015, 0.015, 0.42, 0, 0.045, -0.43, DARK, 6);
    box(P, 0.05, 0.05, 0.17, 0, 0.042, -0.4, c);
    box(P, 0.006, 0.01, 0.006, 0, 0.104, -0.76, BRASS);
    finishModel('shotgun', P, 0, 0.082, -0.79);

    // Kestrel AR
    c = W.rifle.color; P = [];
    box(P, 0.032, 0.1, 0.045, 0, -0.02, 0.014, DARK, -0.25);
    box(P, 0.05, 0.09, 0.32, 0, 0.06, -0.09, c);
    box(P, 0.056, 0.06, 0.27, 0, 0.062, -0.385, HOUSING);
    box(P, 0.058, 0.008, 0.2, 0, 0.062, -0.385, DARK);
    cyl(P, 0.011, 0.011, 0.2, 0, 0.066, -0.6, STEEL, 6);
    cyl(P, 0.017, 0.017, 0.05, 0, 0.066, -0.72, DARK, 6);
    box(P, 0.03, 0.2, 0.065, 0, -0.07, -0.14, DARK, 0.22);
    box(P, 0.03, 0.03, 0.1, 0, 0.07, 0.1, DARK);
    box(P, 0.04, 0.1, 0.22, 0, 0.045, 0.2, HOUSING);
    box(P, 0.045, 0.12, 0.02, 0, 0.04, 0.315, DARK);
    box(P, 0.02, 0.012, 0.3, 0, 0.108, -0.1, DARK);
    box(P, 0.016, 0.03, 0.02, 0, 0.125, -0.02, DARK);
    box(P, 0.016, 0.035, 0.016, 0, 0.11, -0.5, DARK);
    box(P, 0.052, 0.012, 0.05, 0, 0.085, -0.2, EMBER);
    finishModel('rifle', P, 0, 0.066, -0.75);

    // Longreach .308 (bolt action, scoped)
    c = W.sniper.color; P = [];
    box(P, 0.048, 0.08, 0.5, 0, 0.04, -0.05, c);
    box(P, 0.045, 0.11, 0.26, 0, 0.02, 0.3, c, 0.12);
    box(P, 0.04, 0.03, 0.16, 0, 0.09, 0.27, DARK);
    box(P, 0.034, 0.09, 0.045, 0, -0.025, 0.02, c, -0.3);
    cyl(P, 0.013, 0.016, 0.66, 0, 0.07, -0.62, GUN, 8);
    box(P, 0.04, 0.03, 0.07, 0, 0.07, -0.97, DARK);
    cyl(P, 0.022, 0.022, 0.3, 0, 0.15, -0.06, DARK, 8);
    cyl(P, 0.032, 0.022, 0.07, 0, 0.15, -0.24, DARK, 8);
    cyl(P, 0.022, 0.028, 0.05, 0, 0.15, 0.11, DARK, 8);
    cyl(P, 0.027, 0.027, 0.005, 0, 0.15, -0.277, '#7fb7e6', 8);
    box(P, 0.016, 0.04, 0.02, 0, 0.115, -0.14, DARK);
    box(P, 0.016, 0.04, 0.02, 0, 0.115, 0.02, DARK);
    box(P, 0.012, 0.012, 0.05, 0.04, 0.075, 0.04, STEEL);
    box(P, 0.03, 0.05, 0.08, 0, -0.015, -0.1, DARK);
    box(P, 0.01, 0.01, 0.16, 0.028, 0.01, -0.3, DARK);
    box(P, 0.01, 0.01, 0.16, -0.028, 0.01, -0.3, DARK);
    finishModel('sniper', P, 0, 0.07, -1.01);

    // HURRICANE Gatling — carried by a top handle, barrel axis below the grip
    c = W.gatling.color; P = [];
    const A = -0.14;
    box(P, 0.17, 0.18, 0.3, 0, A, 0.1, HOUSING);
    box(P, 0.174, 0.05, 0.2, 0, A + 0.03, 0.1, c);
    cyl(P, 0.09, 0.09, 0.16, 0, A, -0.13, DARK, 10);
    cyl(P, 0.086, 0.086, 0.03, 0, A, -0.215, c, 10);
    box(P, 0.028, 0.028, 0.22, 0, 0.0, -0.02, DARK);
    box(P, 0.022, 0.06, 0.022, 0, -0.03, -0.11, DARK);
    box(P, 0.022, 0.06, 0.022, 0, -0.03, 0.07, DARK);
    box(P, 0.05, 0.06, 0.08, 0, A, 0.27, DARK);
    box(P, 0.03, 0.1, 0.04, 0, A - 0.04, 0.3, DARK, -0.2);
    box(P, 0.12, 0.17, 0.22, -0.15, A - 0.03, 0.08, OLIVE);
    box(P, 0.124, 0.03, 0.224, -0.15, A + 0.01, 0.08, EMBER);
    box(P, 0.126, 0.012, 0.226, -0.15, A + 0.06, 0.08, DARK);
    box(P, 0.07, 0.03, 0.06, -0.085, A + 0.07, 0.02, c, 0, 0, -0.3);
    box(P, 0.03, 0.02, 0.34, 0, A - 0.1, -0.3, DARK);
    box(P, 0.03, 0.05, 0.02, 0, A - 0.085, -0.46, DARK);
    const gat = finishModel('gatling', P, 0, A, -0.87);

    gatCluster = new THREE.Group();
    gatCluster.position.set(0, A, 0);
    const B = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      cyl(B, 0.014, 0.014, 0.64, Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.53, '#5c6675', 6);
    }
    const barrels = new THREE.Mesh(mergeGeometries(B, false), heatMat);
    barrels.castShadow = true;
    const C = [];
    cyl(C, 0.072, 0.072, 0.022, 0, 0, -0.3, DARK, 10);
    cyl(C, 0.072, 0.072, 0.022, 0, 0, -0.55, DARK, 10);
    cyl(C, 0.068, 0.068, 0.03, 0, 0, -0.81, DARK, 10);
    cyl(C, 0.016, 0.016, 0.62, 0, 0, -0.52, DARK, 6);
    const clamps = new THREE.Mesh(mergeGeometries(C, false), gunMat);
    gatCluster.add(barrels, clamps);
    gat.add(gatCluster);
    for (let i = 0; i < B.length; i++) B[i].dispose();
    for (let i = 0; i < C.length; i++) C[i].dispose();

    // CINDERMAW Projector (flamethrower): receiver + long shrouded barrel, big fuel tank on the left side
    c = (W.flamethrower && W.flamethrower.color) || '#c0392b'; P = [];
    const TANK_X = -0.115, TANK_Y = 0.02;
    box(P, 0.034, 0.11, 0.046, 0, -0.02, 0.014, DARK, -0.22);            // pistol grip
    box(P, 0.012, 0.008, 0.05, 0, 0.012, -0.03, DARK);                    // trigger guard
    box(P, 0.06, 0.08, 0.36, 0, 0.06, -0.1, GUN);                         // receiver
    box(P, 0.062, 0.02, 0.3, 0, 0.105, -0.1, c);                          // red top stripe
    box(P, 0.04, 0.09, 0.2, 0, 0.04, 0.18, DARK);                         // stock
    box(P, 0.045, 0.11, 0.02, 0, 0.035, 0.285, DARK);                     // butt plate
    cyl(P, 0.072, 0.072, 0.34, TANK_X, TANK_Y, 0.0, c, 12);               // fuel tank
    cyl(P, 0.06, 0.06, 0.025, TANK_X, TANK_Y, -0.18, STEEL, 12);          // tank caps
    cyl(P, 0.06, 0.06, 0.025, TANK_X, TANK_Y, 0.18, STEEL, 12);
    cyl(P, 0.075, 0.075, 0.022, TANK_X, TANK_Y, -0.1, DARK, 12);          // straps
    cyl(P, 0.075, 0.075, 0.022, TANK_X, TANK_Y, 0.1, DARK, 12);
    cyl(P, 0.0735, 0.0735, 0.03, TANK_X, TANK_Y, 0.0, BRASS, 12);         // hazard band
    cyl(P, 0.03, 0.03, 0.2, TANK_X, TANK_Y + 0.1, 0.02, STEEL, 8);        // pressure bottle
    cyl(P, 0.012, 0.012, 0.05, TANK_X, TANK_Y + 0.1, -0.1, DARK, 6);      // regulator
    box(P, 0.07, 0.03, 0.05, -0.055, 0.03, -0.06, DARK);                  // tank brackets
    box(P, 0.07, 0.03, 0.05, -0.055, 0.03, 0.08, DARK);
    cyl(P, 0.013, 0.013, 0.1, TANK_X + 0.01, TANK_Y, -0.24, DARK, 6);     // hose out of the tank
    box(P, 0.016, 0.016, 0.11, -0.065, 0.04, -0.31, DARK, 0, -0.7, 0);    // hose to the barrel
    cyl(P, 0.022, 0.022, 0.46, 0, 0.07, -0.5, STEEL, 8);                  // fuel line / barrel
    cyl(P, 0.04, 0.04, 0.3, 0, 0.07, -0.47, DARK, 10);                    // heat shroud
    for (let i = 0; i < 5; i++) cyl(P, 0.044, 0.044, 0.012, 0, 0.07, -0.35 - i * 0.06, HOUSING, 10);
    box(P, 0.03, 0.12, 0.04, 0, -0.01, -0.38, DARK, 0.15);                // front grip
    box(P, 0.03, 0.03, 0.08, 0, 0.032, -0.69, '#2a2a2a');                 // igniter housing
    box(P, 0.014, 0.014, 0.02, 0, 0.032, -0.735, EMBER);
    cyl(P, 0.034, 0.024, 0.05, 0, 0.07, -0.75, DARK, 10);                 // nozzle flare
    P.push(part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10), -0.03, 0.12, 0.02, STEEL));  // gauge
    P.push(part(new THREE.CylinderGeometry(0.017, 0.017, 0.004, 10), -0.03, 0.127, 0.02, '#e8e4d8'));
    const ft = finishModel('flamethrower', P, 0, 0.07, -0.79);
    const tip = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 14), flameTipMat);
    tip.position.set(0, 0.07, -0.776);
    ft.add(tip);
    pilotOuter = new THREE.Sprite(pilotOuterMat);
    pilotOuter.position.set(0, 0.05, -0.765);
    pilotOuter.scale.set(0.05, 0.07, 1);
    pilotOuter.renderOrder = 21;
    pilot = new THREE.Sprite(pilotMat);
    pilot.position.set(0, 0.046, -0.766);
    pilot.scale.set(0.03, 0.04, 1);
    pilot.renderOrder = 22;
    ft.add(pilotOuter, pilot);

    // SKYFALL Launcher: shoulder tube with sight, grips and a warhead showing at the front when loaded
    c = (W.rocket && W.rocket.color) || '#556b2f'; P = [];
    const TY = 0.15, BAND = '#3b4a26';
    cyl(P, 0.058, 0.058, 0.96, 0, TY, -0.06, c, 12);                      // tube
    cyl(P, 0.07, 0.064, 0.07, 0, TY, -0.52, DARK, 12);                    // front bell
    cyl(P, 0.064, 0.076, 0.09, 0, TY, 0.4, DARK, 12);                     // venturi
    cyl(P, 0.061, 0.061, 0.03, 0, TY, -0.3, BAND, 12);
    cyl(P, 0.061, 0.061, 0.03, 0, TY, 0.1, BAND, 12);
    cyl(P, 0.0605, 0.0605, 0.02, 0, TY, 0.28, BRASS, 12);                 // warning stripe
    box(P, 0.034, 0.12, 0.05, 0, -0.01, 0.01, DARK, -0.2);                // pistol grip
    box(P, 0.03, 0.07, 0.14, 0, 0.075, -0.01, DARK);                      // grip mount
    box(P, 0.012, 0.008, 0.05, 0, 0.02, -0.04, DARK);                     // trigger guard
    box(P, 0.03, 0.11, 0.04, 0, 0.04, -0.26, DARK, 0.12);                 // front grip
    box(P, 0.03, 0.03, 0.08, 0, 0.09, -0.26, DARK);
    box(P, 0.05, 0.03, 0.16, 0, TY - 0.07, 0.2, '#2a2a2a');               // shoulder pad
    box(P, 0.02, 0.05, 0.02, -0.055, TY + 0.06, -0.08, DARK);             // sight post
    box(P, 0.036, 0.04, 0.11, -0.065, TY + 0.1, -0.08, GUN);              // sight body
    cyl(P, 0.016, 0.016, 0.02, -0.065, TY + 0.1, -0.145, '#7fb7e6', 8);   // lens
    box(P, 0.01, 0.03, 0.01, 0, TY + 0.072, 0.25, DARK);                  // rear iron
    box(P, 0.01, 0.025, 0.01, 0, TY + 0.07, -0.46, EMBER);                // front iron
    const rl = finishModel('rocket', P, 0, TY, -0.6);
    const rear = new THREE.Object3D();
    rear.position.set(0, TY, 0.47);
    rl.add(rear);
    models.rocket.rear = rear;
    const WH = [];
    cyl(WH, 0.008, 0.046, 0.18, 0, 0, -0.09, BAND, 10);                   // warhead cone (base at z 0)
    cyl(WH, 0.047, 0.047, 0.02, 0, 0, -0.01, BRASS, 10);
    cyl(WH, 0.006, 0.006, 0.03, 0, 0, -0.195, STEEL, 6);                  // fuze tip
    rocketWarhead = new THREE.Mesh(mergeGeometries(WH, false), gunMat);
    rocketWarhead.position.set(0, TY, -0.54);
    rocketWarhead.castShadow = true;
    rl.add(rocketWarhead);
    for (let i = 0; i < WH.length; i++) WH[i].dispose();
  }
  buildModels();

  // Flamethrower fuel rig on the survivor's back (seen from the third-person camera). Hung on the
  // model's upper-body group so it follows crouch / lean; looked up defensively (player.js owns the model).
  let fuelRig = null;
  {
    const root = game.player && game.player.model;
    const body = root && root.children && root.children[0];
    let upper = null;
    if (body && body.children) for (let i = 0; i < body.children.length && !upper; i++) if (body.children[i].isGroup) upper = body.children[i];
    if (upper) {
      const F = [], red = (W.flamethrower && W.flamethrower.color) || '#c0392b';
      for (let s = -1; s <= 1; s += 2) {
        const x = s * 0.085;
        F.push(part(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 12), x, 0.36, 0.33, red));
        F.push(part(new THREE.CylinderGeometry(0.06, 0.075, 0.04, 12), x, 0.59, 0.33, STEEL));
        F.push(part(new THREE.CylinderGeometry(0.075, 0.06, 0.04, 12), x, 0.13, 0.33, STEEL));
        F.push(part(new THREE.CylinderGeometry(0.077, 0.077, 0.04, 12), x, 0.42, 0.33, BRASS));
        F.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), x, 0.63, 0.33, DARK));
      }
      F.push(part(new THREE.BoxGeometry(0.34, 0.05, 0.06), 0, 0.5, 0.27, DARK));              // harness bar
      F.push(part(new THREE.BoxGeometry(0.34, 0.05, 0.06), 0, 0.22, 0.27, DARK));
      F.push(part(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), 0, 0.62, 0.33, STEEL, 0, 0, Math.PI / 2)); // manifold
      F.push(part(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 6), 0.16, 0.1, 0.25, DARK, 0.5, 0, 0.35));   // hose to the gun
      fuelRig = new THREE.Mesh(mergeGeometries(F, false), gunMat);
      fuelRig.castShadow = true;
      fuelRig.visible = false;
      upper.add(fuelRig);
      for (let i = 0; i < F.length; i++) F[i].dispose();
    }
  }

  // projectile rocket geometry (world units, nose towards -Z)
  const rocketGeo = (() => {
    const R = [];
    cyl(R, 0.05, 0.05, 0.5, 0, 0, 0.05, '#4b5a32', 10);
    cyl(R, 0.006, 0.05, 0.22, 0, 0, -0.31, '#2f3a20', 10);
    cyl(R, 0.051, 0.051, 0.03, 0, 0, -0.17, BRASS, 10);
    cyl(R, 0.034, 0.046, 0.08, 0, 0, 0.34, DARK, 8);
    box(R, 0.005, 0.1, 0.13, 0, 0.075, 0.24, DARK);
    box(R, 0.005, 0.1, 0.13, 0, -0.075, 0.24, DARK);
    box(R, 0.1, 0.005, 0.13, 0.075, 0, 0.24, DARK);
    box(R, 0.1, 0.005, 0.13, -0.075, 0, 0.24, DARK);
    const g = mergeGeometries(R, false);
    for (let i = 0; i < R.length; i++) R[i].dispose();
    return g;
  })();

  // ------------------------------------------------------------------ muzzle flash + light
  const flashMat = new THREE.MeshBasicMaterial({
    map: flashTex, color: 0xffffff, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  const flash = new THREE.Group();
  const flameGeo = new THREE.PlaneGeometry(1, 1);
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -0.42);
  const flashStar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flashMat);
  const flameA = new THREE.Mesh(flameGeo, flashMat);
  const flameB = new THREE.Mesh(flameGeo, flashMat);
  flameA.scale.set(0.6, 1, 1.7);
  flameB.scale.set(0.6, 1, 1.7);
  flameB.rotation.z = Math.PI / 2;
  flash.add(flashStar, flameA, flameB);
  flash.visible = false;
  flashStar.renderOrder = flameA.renderOrder = flameB.renderOrder = 20;
  rig.add(flash);

  const muzzleLight = new THREE.PointLight(0xffb060, 0, 16, 2);
  muzzleLight.castShadow = false;
  scene.add(muzzleLight);

  // ------------------------------------------------------------------ tracers (pooled, instanced)
  const TR_N = 64, TR_S = 12, TR_SPEED = 340, TR_STREAK = 14;
  const trData = new Float32Array(TR_N * TR_S); // sx sy sz dx dy dz dist head width r g b
  let trCursor = 0, trDirty = false;
  const trMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
    TR_N,
  );
  trMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trMesh.setColorAt(0, _col.set(0xffffff));
  trMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  trMesh.frustumCulled = false;
  trMesh.count = 0;
  trMesh.visible = false;
  trMesh.renderOrder = 19;
  scene.add(trMesh);

  function addTracer(from, to, r, g, b, width) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(dist > 0.8)) return;
    const o = trCursor * TR_S;
    trCursor = (trCursor + 1) % TR_N;
    trData[o] = from.x; trData[o + 1] = from.y; trData[o + 2] = from.z;
    trData[o + 3] = dx / dist; trData[o + 4] = dy / dist; trData[o + 5] = dz / dist;
    trData[o + 6] = dist; trData[o + 7] = 0; trData[o + 8] = width;
    trData[o + 9] = r; trData[o + 10] = g; trData[o + 11] = b;
    trDirty = true;
  }

  function updateTracers(dt) {
    if (!trDirty && trMesh.count === 0) return;
    const ic = trMesh.instanceColor.array;
    let c = 0;
    for (let i = 0, o = 0; i < TR_N; i++, o += TR_S) {
      const dist = trData[o + 6];
      if (dist <= 0) continue;
      let head = trData[o + 7] + TR_SPEED * dt;
      trData[o + 7] = head;
      const tail = head - TR_STREAK;
      if (tail >= dist) { trData[o + 6] = 0; continue; }
      if (head > dist) head = dist;
      const t0 = tail > 0 ? tail : 0;
      const len = head - t0;
      if (len <= 0.01) continue;
      const m = (t0 + head) * 0.5;
      _v.set(trData[o + 3], trData[o + 4], trData[o + 5]);
      _mid.set(trData[o] + _v.x * m, trData[o + 1] + _v.y * m, trData[o + 2] + _v.z * m);
      _q.setFromUnitVectors(Z_AXIS, _v);
      const w = trData[o + 8];
      _scl.set(w, w, len);
      _m4.compose(_mid, _q, _scl);
      trMesh.setMatrixAt(c, _m4);
      ic[c * 3] = trData[o + 9]; ic[c * 3 + 1] = trData[o + 10]; ic[c * 3 + 2] = trData[o + 11];
      c++;
    }
    trMesh.count = c;
    trMesh.visible = c > 0;
    trMesh.instanceMatrix.needsUpdate = true;
    trMesh.instanceColor.needsUpdate = true;
    trDirty = false;
  }

  // ------------------------------------------------------------------ particles (pooled, instanced)
  const PS = 15; // px py pz vx vy vz life maxLife s0 s1 grav drag r g b
  const partGeo = new THREE.OctahedronGeometry(1, 0);

  function makeSystem(n, additive) {
    const mat = additive
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })
      : new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(partGeo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, _col.set(0xffffff));
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    if (additive) mesh.renderOrder = 18;
    scene.add(mesh);
    return { mesh, n, additive, data: new Float32Array(n * PS), cursor: 0, dirty: false };
  }
  const solid = makeSystem(320, false);
  const glow = makeSystem(160, true);

  function emitP(sys, x, y, z, vx, vy, vz, life, s0, s1, grav, drag, r, g, b) {
    const d = sys.data, o = sys.cursor * PS;
    sys.cursor = (sys.cursor + 1) % sys.n;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = life; d[o + 7] = life; d[o + 8] = s0; d[o + 9] = s1;
    d[o + 10] = grav; d[o + 11] = drag;
    d[o + 12] = r; d[o + 13] = g; d[o + 14] = b;
    sys.dirty = true;
  }

  function updateSystem(sys, dt) {
    const mesh = sys.mesh;
    if (!sys.dirty && mesh.count === 0) return;
    const d = sys.data, im = mesh.instanceMatrix.array, ic = mesh.instanceColor.array, add = sys.additive;
    let c = 0;
    for (let i = 0, o = 0; i < sys.n; i++, o += PS) {
      let life = d[o + 6];
      if (life <= 0) continue;
      life -= dt;
      d[o + 6] = life;
      if (life <= 0) continue;
      let dr = 1 - d[o + 11] * dt; if (dr < 0) dr = 0;
      d[o + 3] *= dr; d[o + 4] = d[o + 4] * dr - d[o + 10] * dt; d[o + 5] *= dr;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      const k = life / d[o + 7];
      let s = d[o + 9] + (d[o + 8] - d[o + 9]) * k;
      let fade = 1;
      if (add) fade = k;
      else if (k < 0.25) s *= k * 4;
      const m = c * 16;
      im[m] = s; im[m + 1] = 0; im[m + 2] = 0; im[m + 3] = 0;
      im[m + 4] = 0; im[m + 5] = s; im[m + 6] = 0; im[m + 7] = 0;
      im[m + 8] = 0; im[m + 9] = 0; im[m + 10] = s; im[m + 11] = 0;
      im[m + 12] = d[o]; im[m + 13] = d[o + 1]; im[m + 14] = d[o + 2]; im[m + 15] = 1;
      const q = c * 3;
      ic[q] = d[o + 12] * fade; ic[q + 1] = d[o + 13] * fade; ic[q + 2] = d[o + 14] * fade;
      c++;
    }
    mesh.count = c;
    mesh.visible = c > 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    sys.dirty = false;
  }

  function clearSystem(sys) {
    sys.data.fill(0);
    sys.cursor = 0;
    sys.dirty = false;
    sys.mesh.count = 0;
    sys.mesh.visible = false;
  }

  const rnd = () => Math.random() * 2 - 1;
  const ambientLum = () => 0.45 + 0.55 * (typeof game.dayFactor === 'number' ? game.dayFactor : 1);

  function spawnImpact(point, normal) {
    if (!point) return;
    const nx = normal ? normal.x : 0, ny = normal ? normal.y : 1, nz = normal ? normal.z : 0;
    const x = point.x + nx * 0.03, y = point.y + ny * 0.03, z = point.z + nz * 0.03;
    for (let i = 0; i < 5; i++) {
      const sp = 2 + Math.random() * 3.5, b = 0.8 + Math.random() * 0.4;
      emitP(glow, x, y, z, nx * sp + rnd() * 2.2, ny * sp + rnd() * 2.2 + 0.8, nz * sp + rnd() * 2.2,
        0.12 + Math.random() * 0.18, 0.035, 0.008, 9, 1, 1.0 * b, 0.72 * b, 0.32 * b);
    }
    const lum = ambientLum();
    for (let i = 0; i < 4; i++) {
      const sp = 0.6 + Math.random() * 1.3, b = lum * (0.85 + Math.random() * 0.3);
      emitP(solid, x, y, z, nx * sp + rnd() * 0.7, ny * sp + rnd() * 0.7 + 0.3, nz * sp + rnd() * 0.7,
        0.35 + Math.random() * 0.35, 0.035, 0.12, 0.6, 3, 0.42 * b, 0.38 * b, 0.33 * b);
    }
  }

  function spawnBlood(point, dir) {
    if (!point) return;
    if (suppressBlood) {
      // flame damage: no blood spray, the odd ember off the burning body instead
      if (Math.random() < 0.35) {
        emitP(glow, point.x + rnd() * 0.2, point.y + rnd() * 0.3, point.z + rnd() * 0.2, rnd() * 0.8, 1.2 + Math.random() * 1.6, rnd() * 0.8,
          0.4 + Math.random() * 0.4, 0.04, 0.01, -1.5, 1.2, 1.0, 0.5, 0.12);
      }
      return;
    }
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 0;
    const lum = ambientLum();
    for (let i = 0; i < 6; i++) {
      const sp = 1.2 + Math.random() * 2.6, b = lum * (0.7 + Math.random() * 0.5);
      emitP(solid, point.x, point.y, point.z,
        dx * sp + rnd() * 1.6, dy * sp + rnd() * 1.4 + 1.2 + Math.random() * 1.2, dz * sp + rnd() * 1.6,
        0.35 + Math.random() * 0.3, 0.055, 0.03, 11, 0.5, 0.56 * b, 0.05 * b, 0.07 * b);
    }
    emitP(solid, point.x, point.y, point.z, dx * 0.8, 0.3, dz * 0.8, 0.22, 0.07, 0.19, 0, 2, 0.36 * lum, 0.03 * lum, 0.05 * lum);
  }

  // World position of the held gun's muzzle (null for the melee weapon). player.js mounts the
  // first-person flashlight here so the cone never floods the view model itself.
  function getMuzzleWorld(out) {
    const cur = slots[currentIndex], m = cur && models[cur.id];
    if (!m || !m.muzzle || !out) return null;
    m.muzzle.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(m.muzzle.matrixWorld);
  }

  function spawnTracer(from, to) {
    if (!from || !to) return;
    addTracer(from, to, 1.0, 0.86, 0.55, 0.03);
  }

  // ------------------------------------------------------------------ billboard puffs (flame stream, smoke, rocket trails)
  // One instanced draw for everything: premultiplied output with blend (One, OneMinusSrcAlpha), so a
  // puff with opaque = 0 adds light (fire) and one with opaque = 1 covers what is behind it (smoke).
  const BK_FLAME = 0, BK_SMOKE = 1, BK_EMBER = 2, BK_HOT = 3, BK_PALE = 4;
  const BB_N = 900, BS = 16; // px py pz vx vy vz age life s0 s1 kind rot spin stopLeft lum seed
  const bbData = new Float32Array(BB_N * BS);
  let bbCursor = 0, bbLive = 0;
  const bbGeo = new THREE.InstancedBufferGeometry();
  {
    const plane = new THREE.PlaneGeometry(1, 1);
    bbGeo.setIndex(plane.index);
    bbGeo.setAttribute('position', plane.attributes.position);
    bbGeo.setAttribute('uv', plane.attributes.uv);
  }
  const bbPos = new THREE.InstancedBufferAttribute(new Float32Array(BB_N * 3), 3);
  const bbPar = new THREE.InstancedBufferAttribute(new Float32Array(BB_N * 4), 4);   // size, rot, alpha, opaque
  const bbCol = new THREE.InstancedBufferAttribute(new Float32Array(BB_N * 3), 3);
  bbPos.setUsage(THREE.DynamicDrawUsage); bbPar.setUsage(THREE.DynamicDrawUsage); bbCol.setUsage(THREE.DynamicDrawUsage);
  bbGeo.setAttribute('iPos', bbPos);
  bbGeo.setAttribute('iPar', bbPar);
  bbGeo.setAttribute('iCol', bbCol);
  bbGeo.instanceCount = 0;
  const bbMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
    vertexShader: /* glsl */`
      attribute vec3 iPos; attribute vec4 iPar; attribute vec3 iCol;
      varying vec2 vUv; varying vec3 vCol; varying vec2 vA;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vCol = iCol; vA = iPar.zw;
        vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
        float c = cos(iPar.y), s = sin(iPar.y);
        mvPosition.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iPar.x;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv; varying vec3 vCol; varying vec2 vA;
      #include <fog_pars_fragment>
      void main() {
        float a = texture2D(map, vUv).a * vA.x;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vCol * a, a * vA.y);
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float ff = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float ff = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor *= 1.0 - ff * 0.85;
        #endif
      }`,
    transparent: true, depthWrite: false, fog: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  bbMat.uniforms.map.value = makePuffTexture();
  const bbMesh = new THREE.Mesh(bbGeo, bbMat);
  bbMesh.frustumCulled = false;
  bbMesh.visible = false;
  bbMesh.renderOrder = 17;
  scene.add(bbMesh);

  function emitB(kind, x, y, z, vx, vy, vz, life, s0, s1, stop, lum) {
    const d = bbData, o = bbCursor * BS;
    bbCursor = (bbCursor + 1) % BB_N;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = 0; d[o + 7] = life; d[o + 8] = s0; d[o + 9] = s1;
    d[o + 10] = kind; d[o + 11] = Math.random() * TAU; d[o + 12] = rnd() * (kind === BK_FLAME ? 3.5 : 1.2);
    d[o + 13] = stop > 0 ? stop : 1e6; d[o + 14] = lum == null ? 1 : lum; d[o + 15] = Math.random();
    bbLive = 1;
  }

  function updateBillboards(dt) {
    if (!bbLive) return;
    const d = bbData, P3 = bbPos.array, P4 = bbPar.array, C3 = bbCol.array;
    let c = 0, spawned = false;
    for (let i = 0, o = 0; i < BB_N; i++, o += BS) {
      const life = d[o + 7];
      if (life <= 0) continue;
      const age = d[o + 6] + dt;
      if (age >= life) {
        d[o + 7] = 0;
        // a dying flame lump leaves a wisp of smoke behind
        if (d[o + 10] === BK_FLAME && d[o + 15] < 0.28) {
          spawned = true;                  // may land in a slot this loop already passed: keep bbLive set
          emitB(BK_SMOKE, d[o], d[o + 1] + 0.2, d[o + 2], d[o + 3] * 0.3, 0.8 + d[o + 4] * 0.2, d[o + 5] * 0.3,
            0.9 + d[o + 15] * 2, d[o + 9] * 0.6, d[o + 9] * 1.5, 0, d[o + 14]);
        }
        continue;
      }
      d[o + 6] = age;
      const kind = d[o + 10], k = age / life;
      let drag = 1.2, lift = 0;
      if (kind === BK_FLAME) { drag = 1.25; lift = 5.5 * k; }
      else if (kind === BK_SMOKE) { drag = 1.4; lift = 1.1; }
      else if (kind === BK_EMBER) { drag = 0.9; lift = 1.8; }
      else if (kind === BK_HOT) { drag = 3.2; lift = 0.5; }
      else { drag = 2.4; lift = 0.55; }
      let dr = 1 - drag * dt; if (dr < 0) dr = 0;
      let vx = d[o + 3] * dr, vy = d[o + 4] * dr + lift * dt, vz = d[o + 5] * dr;
      // flame hits a wall: splash out sideways and up instead of passing through
      const stop = d[o + 13];
      if (stop < 1e5) {
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz) * dt;
        const left = stop - sp;
        if (left <= 0) {
          vx = vx * 0.12 + rnd() * 2.4; vz = vz * 0.12 + rnd() * 2.4; vy = Math.abs(vy) * 0.25 + 1.4;
          d[o + 13] = 1e6;
        } else d[o + 13] = left;
      }
      d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
      const px = d[o] + vx * dt, py = d[o + 1] + vy * dt, pz = d[o + 2] + vz * dt;
      d[o] = px; d[o + 1] = py; d[o + 2] = pz;
      const rot = d[o + 11] + d[o + 12] * dt;
      d[o + 11] = rot;

      const ek = 1 - (1 - k) * (1 - k);
      const size = d[o + 8] + (d[o + 9] - d[o + 8]) * ek;
      let r, g, b, alpha, opaque = 0;
      if (kind === BK_FLAME) {
        if (k < 0.12) { const t = k / 0.12; r = 3.0 - 0.3 * t; g = 2.4 - 0.8 * t; b = 1.3 - 0.95 * t; }
        else if (k < 0.5) { const t = (k - 0.12) / 0.38; r = 2.7 - 0.9 * t; g = 1.6 - 1.08 * t; b = 0.35 - 0.28 * t; }
        else { const t = (k - 0.5) / 0.5; r = 1.8 - 1.45 * t; g = 0.52 - 0.45 * t; b = 0.07 - 0.05 * t; }
        alpha = (k < 0.06 ? k / 0.06 : 1) * Math.pow(1 - k, 1.25) * 0.4;
      } else if (kind === BK_HOT) {
        r = 3.2 - 1.2 * k; g = 2.6 - 1.6 * k; b = 1.5 - 1.3 * k;
        alpha = (1 - k) * 0.45;
      } else if (kind === BK_EMBER) {
        r = 2.6; g = 1.1 - 0.6 * k; b = 0.25 - 0.2 * k;
        alpha = 1 - k;
      } else {
        const lum = d[o + 14], pale = kind === BK_PALE;
        const base = (pale ? 0.36 : 0.11) * lum;
        r = base * 1.04; g = base; b = base * (pale ? 0.98 : 0.92);
        alpha = (k < 0.15 ? k / 0.15 : 1) * (1 - k) * (pale ? 0.6 : 0.52);
        opaque = 1;
      }
      const q3 = c * 3, q4 = c * 4;
      P3[q3] = px; P3[q3 + 1] = py; P3[q3 + 2] = pz;
      P4[q4] = size; P4[q4 + 1] = rot; P4[q4 + 2] = alpha; P4[q4 + 3] = opaque;
      C3[q3] = r; C3[q3 + 1] = g; C3[q3 + 2] = b;
      c++;
    }
    bbGeo.instanceCount = c;
    bbMesh.visible = c > 0;
    if (c === 0) { if (!spawned) bbLive = 0; return; }
    bbPos.needsUpdate = true; bbPar.needsUpdate = true; bbCol.needsUpdate = true;
  }

  function clearBillboards() {
    bbData.fill(0); bbCursor = 0; bbLive = 0;
    bbGeo.instanceCount = 0; bbMesh.visible = false;
  }

  // ------------------------------------------------------------------ rockets (pooled projectiles)
  const rocketMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.3 });
  const exhaustMat = new THREE.SpriteMaterial({
    map: flashTex, color: new THREE.Color(3.0, 1.9, 0.9), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const rockets = [];
  for (let i = 0; i < ROCKET_POOL; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(rocketGeo, rocketMat);
    body.castShadow = true;
    const ex = new THREE.Sprite(exhaustMat);
    ex.position.set(0, 0, 0.45);
    ex.scale.set(0.7, 0.7, 1);
    ex.renderOrder = 20;
    g.add(body, ex);
    g.visible = false;
    scene.add(g);
    rockets.push({ group: g, exhaust: ex, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), prev: new THREE.Vector3(), dist: 0, age: 0, trail: 0, def: null });
  }
  const rocketLight = new THREE.PointLight(0xff9a4a, 0, 18, 2);
  rocketLight.castShadow = false;
  scene.add(rocketLight);

  function clearRockets() {
    for (let i = 0; i < rockets.length; i++) { rockets[i].active = false; rockets[i].group.visible = false; }
    rocketLight.intensity = 0;
  }

  function explodeRocket(r, x, y, z) {
    r.active = false;
    r.group.visible = false;
    const def = r.def || W.rocket, m = mods();
    const sk = game.skills;
    // skills.blast applies game.mods.blastMult itself (radius and damage): pass the unscaled radius
    const radius = def.blastRadius || 6.5, damage = def.damage * (m.damageMult || 1);
    if (sk && sk.blast) {
      sk.blast(x, y, z, { radius, damage, knock: def.blastKnock || 14, selfRadius: def.selfRadius || 0, selfDamage: def.selfDamage || 0, shake: 0.3 });
    } else {
      // fallback (skills module missing): plain radial damage
      const zs = game.zombies;
      if (zs && zs.inRadius && zs.damage) {
        _rA.set(x, y, z);
        zs.inRadius(_rA, radius, flameList);
        for (let i = 0; i < flameList.length; i++) {
          const zb = flameList[i];
          const dd = Math.hypot(zb.position.x - x, zb.position.z - z);
          if (dd < radius) zs.damage(zb, damage * (1 - dd / radius), { source: 'blast' });
        }
        flameList.length = 0;
      }
    }
  }

  function updateRockets(dt) {
    const zs = game.zombies, world = game.world;
    let lit = null;
    for (let i = 0; i < rockets.length; i++) {
      const r = rockets[i];
      if (!r.active) continue;
      const def = r.def || W.rocket;
      r.age += dt;
      r.vel.y -= ROCKET_GRAVITY * dt;
      const speed = r.vel.length();
      const step = speed * dt;
      _rDir.copy(r.vel).divideScalar(speed || 1);
      // sweep this frame's segment: zombie first, then scenery / terrain
      let tHit = Infinity, hx = 0, hy = 0, hz = 0;
      if (zs && zs.raycast) {
        const zh = zs.raycast(r.pos, _rDir, step + 0.15);
        if (zh && zh.zombie) { tHit = zh.distance; hx = zh.point.x; hy = zh.point.y; hz = zh.point.z; }
      }
      if (world && world.raycast) {
        const wh = world.raycast(r.pos, _rDir, step + 0.05);
        if (wh && wh.distance < tHit) {
          tHit = wh.distance;
          // stop just short of the surface so the fireball is not buried in it
          hx = wh.point.x - _rDir.x * 0.15; hy = wh.point.y - _rDir.y * 0.15; hz = wh.point.z - _rDir.z * 0.15;
          if (wh.collider && wh.collider.type === 'barrel') {
            barrelEvt.collider = wh.collider; barrelEvt.damage = 999; barrelEvt.point.copy(wh.point);
            game.emit('barrelHit', barrelEvt);
            barrelEvt.damage = BARREL_FLAME_DAMAGE;
          }
        }
      }
      r.prev.copy(r.pos);
      if (tHit < Infinity) { explodeRocket(r, hx, hy, hz); continue; }
      r.pos.addScaledVector(r.vel, dt);
      r.dist += step;
      if (r.dist >= def.range || r.pos.y < -20) { explodeRocket(r, r.pos.x, r.pos.y, r.pos.z); continue; }
      r.group.position.copy(r.pos);
      r.group.quaternion.setFromUnitVectors(NEG_Z, _rDir);
      const fl = 0.55 + Math.random() * 0.35;
      r.exhaust.scale.set(fl, fl, 1);
      // exhaust: hot flame right behind the motor, a thick smoke trail spread along the segment
      const lum = ambientLum();
      for (let k = 0; k < 2; k++) {
        const f = Math.random();
        emitB(BK_HOT, r.prev.x + (r.pos.x - r.prev.x) * f - _rDir.x * 0.4, r.prev.y + (r.pos.y - r.prev.y) * f - _rDir.y * 0.4,
          r.prev.z + (r.pos.z - r.prev.z) * f - _rDir.z * 0.4,
          -_rDir.x * 7 + rnd(), -_rDir.y * 7 + rnd(), -_rDir.z * 7 + rnd(), 0.07 + Math.random() * 0.05, 0.32, 0.08, 0, 1);
      }
      r.trail += dt * ROCKET_TRAIL_RATE;
      while (r.trail >= 1) {
        r.trail -= 1;
        const f = Math.random();
        emitB(BK_PALE, r.prev.x + (r.pos.x - r.prev.x) * f - _rDir.x * 0.45, r.prev.y + (r.pos.y - r.prev.y) * f - _rDir.y * 0.45,
          r.prev.z + (r.pos.z - r.prev.z) * f - _rDir.z * 0.45,
          -_rDir.x * 1.5 + rnd() * 0.5, -_rDir.y * 1.5 + rnd() * 0.5 + 0.2, -_rDir.z * 1.5 + rnd() * 0.5,
          1.2 + Math.random() * 0.8, 0.16, 0.9 + Math.random() * 0.6, 0, lum);
      }
      if (!lit) lit = r;
    }
    if (lit) {
      rocketLight.position.copy(lit.pos);
      rocketLight.intensity = 22 + Math.random() * 10;
    } else if (rocketLight.intensity !== 0) rocketLight.intensity = 0;
  }

  // ------------------------------------------------------------------ inventory
  function entry(id) { const def = W[id]; return { id, def, mag: def.mag || 0 }; }

  function has(id) {
    for (let i = 0; i < slots.length; i++) if (slots[i] && slots[i].id === id) return true;
    return false;
  }

  function addAmmo(type, n) {
    if (!(type in ammo)) return;
    ammo[type] = Math.max(0, Math.round(ammo[type] + (n || 0)));
  }

  function showCurrent() {
    const cur = slots[currentIndex];
    for (const id in models) models[id].group.visible = !!cur && cur.id === id;
    flash.visible = false;
    flashT = 0;
    const m = cur && models[cur.id];
    if (m && m.muzzle) {
      if (flash.parent !== m.muzzle) m.muzzle.add(flash);
    }
  }

  function cancelActions() {
    reloading = false; reloadT = 0;
    swinging = false; swingT = 0; swingHitDone = false;
    semiQueue = 0; bloom = 0; kickZ = 0; kickR = 0;
  }

  function equip(index, silent) {
    cancelActions();
    currentIndex = index;
    const cur = slots[index];
    drawDur = (FEEL[cur.id] || FEEL_DEFAULT).draw;
    drawT = drawDur;
    fireCooldown = 0;
    showCurrent();
    if (!silent) game.emit('weaponSwitch', { index, weaponId: cur.id });
  }

  function select(index) {
    index = index | 0;
    if (index < 0 || index >= slots.length || !slots[index] || index === currentIndex) return false;
    equip(index, false);
    return true;
  }

  function cycle(dir) {
    const step = dir > 0 ? 1 : -1;
    for (let i = 1; i < slots.length; i++) {
      const idx = (currentIndex + step * i + slots.length * 2) % slots.length;
      if (slots[idx]) { select(idx); return; }
    }
  }

  function placeIndex(def) {
    if (def.slot === 'heavy') return 4;
    for (let i = 1; i <= 3; i++) if (!slots[i]) return i;
    if (currentIndex >= 1 && currentIndex <= 3) return currentIndex;
    return 1;
  }

  function give(weaponId) {
    const def = W[weaponId];
    if (!def || def.slot === 'melee') return false;
    if (has(weaponId)) {
      if (def.ammoType) addAmmo(def.ammoType, def.mag);
      return true;
    }
    const idx = placeIndex(def);
    slots[idx] = entry(weaponId);
    equip(idx, false);
    return true;
  }

  function reset() {
    for (let i = 0; i < slots.length; i++) slots[i] = null;
    slots[0] = entry('bat');
    currentIndex = 0;
    const lo = CONFIG.startLoadout || {};
    const list = lo.weapons || [];
    let first = 0;
    for (let i = 0; i < list.length; i++) {
      const def = W[list[i]];
      if (!def || def.slot === 'melee' || has(def.id)) continue;
      const idx = placeIndex(def);
      slots[idx] = entry(def.id);
      if (!first) first = idx;
    }
    for (const k in ammo) ammo[k] = (lo.ammo && lo.ammo[k]) || 0;
    spin = 0; heat = 0; smokeT = 0; sinceShot = 10; spread = 0;
    prevFire = false; dryEmitted = false;
    lightT = 0; muzzleLight.intensity = 0;
    heatMat.emissiveIntensity = 0;
    trData.fill(0); trCursor = 0; trDirty = false; trMesh.count = 0; trMesh.visible = false;
    clearSystem(solid); clearSystem(glow);
    stopFlame();
    flameHeat = 0; flameTipMat.emissiveIntensity = 0.6;
    clearBillboards();
    clearRockets();
    equip(first, true);
    drawT = 0;
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  }

  // ------------------------------------------------------------------ reload
  function startReload() {
    const cur = slots[currentIndex];
    if (!cur || reloading) return false;   // allowed while the weapon is still being drawn: R right after a swap must not be swallowed
    const def = cur.def;
    if (!def.ammoType || cur.mag >= def.mag || !(ammo[def.ammoType] > 0)) return false;
    reloading = true; reloadT = 0;
    if (cur.id === 'flamethrower') stopFlame();
    game.emit('reloadStart', { weaponId: cur.id });
    return true;
  }

  function finishReload(cur) {
    const def = cur.def;
    const take = Math.min(def.mag - cur.mag, ammo[def.ammoType] || 0);
    cur.mag += take;
    ammo[def.ammoType] -= take;
    reloading = false; reloadT = 0;
    game.emit('reloadEnd', { weaponId: cur.id });
  }

  // ------------------------------------------------------------------ firing
  function getAim(p, o, d) {
    if (p.getAimRay) p.getAimRay(o, d);
    else { game.camera.getWorldPosition(o); game.camera.getWorldDirection(d); }
  }

  function computeSpread(def, p, aim) {
    if (!def.pellets) return 0;
    let s = aim ? def.spreadAim : def.spreadHip;
    let mv = 0;
    if (p.isMoving) mv = def.spreadMove * (p.isSprinting ? 1.8 : 1);
    if (p.isGrounded === false) mv += def.spreadMove * 1.5;
    if (aim) mv *= 0.5;
    s += mv;
    if (p.isCrouching) s *= 0.75;
    return s + bloom;
  }

  function recordHit(zb, hs, killed, pt) {
    for (let i = 0; i < nHit; i++) {
      if (hitZ[i] === zb) { if (hs) hitHS[i] = true; if (killed) hitKill[i] = true; return; }
    }
    if (nHit >= HIT_MAX) return;
    hitZ[nHit] = zb; hitHS[nHit] = hs; hitKill[nHit] = killed; hitPts[nHit].copy(pt);
    nHit++;
  }

  function flushHits() {
    for (let i = 0; i < nHit; i++) {
      const e = hitEvts[hitEvtI]; hitEvtI = (hitEvtI + 1) % hitEvts.length;
      e.zombie = hitZ[i]; e.headshot = hitHS[i]; e.killed = hitKill[i]; e.point.copy(hitPts[i]);
      hitZ[i] = null;
      game.emit('hit', e);
    }
    nHit = 0;
  }

  function fireShot(cur, def, p, aim) {
    const feel = FEEL[cur.id] || FEEL_DEFAULT;
    const model = models[cur.id];
    getAim(p, _origin, _dir);
    if (model && model.muzzle) {
      model.muzzle.updateWorldMatrix(true, false);
      _muzzle.setFromMatrixPosition(model.muzzle.matrixWorld);
    } else {
      _muzzle.copy(_origin).addScaledVector(_dir, 0.6);
    }

    const sp = computeSpread(def, p, aim);
    _right.crossVectors(_dir, UP);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _upv.crossVectors(_right, _dir).normalize();

    const zs = game.zombies, world = game.world;
    const pellets = def.pellets || 1;
    const isGat = cur.id === 'gatling';
    const tr = isGat ? 1.0 : 1.0, tg = isGat ? 0.62 : 0.86, tb = isGat ? 0.3 : 0.55;
    const M = mods();
    const dmgBody = def.damage * (M.damageMult || 1);
    const dmgHead = dmgBody * (1 + ((def.headMult || 1) - 1) * (M.headshotMult == null ? 1 : M.headshotMult));
    nHit = 0;

    for (let i = 0; i < pellets; i++) {
      const ang = sp * Math.sqrt(Math.random()), az = Math.random() * TAU, t = Math.tan(ang);
      _d.copy(_dir).addScaledVector(_right, Math.cos(az) * t).addScaledVector(_upv, Math.sin(az) * t).normalize();

      let zHit = null, zDist = Infinity, zb = null, hs = false;
      if (zs && zs.raycast) {
        zHit = zs.raycast(_origin, _d, def.range);
        if (zHit && zHit.zombie) { zDist = zHit.distance; zb = zHit.zombie; hs = !!zHit.headshot; _hitPt.copy(zHit.point); }
        else zHit = null;
      }
      let wHit = null;
      if (world && world.raycast) wHit = world.raycast(_origin, _d, def.range);

      if (zHit && (!wHit || zDist <= wHit.distance)) {
        _end.copy(_hitPt);
        dmgInfo.headshot = hs;
        let killed = false;
        if (zs.damage) killed = zs.damage(zb, hs ? dmgHead : dmgBody, dmgInfo) === true;
        if (!killed && zb.alive === false) killed = true;
        recordHit(zb, hs, killed, _end);
      } else if (wHit) {
        _end.copy(wHit.point);
        spawnImpact(_end, wHit.normal);
        if (wHit.collider && wHit.collider.type === 'barrel') game.emit('barrelHit', { collider: wHit.collider, damage: dmgBody, point: _end });
      } else {
        _end.copy(_origin).addScaledVector(_d, Math.min(def.range, 160));
      }
      addTracer(_muzzle, _end, tr, tg, tb, isGat ? 0.034 : 0.028);
    }

    // perk: incendiary rounds (one roll per zombie per shot, so the shotgun is not a guaranteed ignite)
    const ign = M.igniteChance || 0;
    if (ign > 0 && zs && zs.ignite) {
      for (let i = 0; i < nHit; i++) {
        const zb = hitZ[i];
        if (!hitKill[i] && zb && zb.alive !== false && Math.random() < ign) zs.ignite(zb, IGNITE_BULLET_DPS, IGNITE_BULLET_TIME);
      }
    }

    consumeRound(cur);
    sinceShot = 0;
    const base = aim ? def.spreadAim : def.spreadHip;
    const bloomMax = Math.max(0, def.spreadMax - base);
    bloom = Math.min(bloomMax, bloom + (def.spreadPerShot || 0));

    if (p.addRecoil) {
      const rm = (aim ? 0.72 : 1) * (p.isCrouching ? 0.82 : 1);
      p.addRecoil(def.recoilPitch * rm * (0.85 + Math.random() * 0.3), rnd() * def.recoilYaw * rm);
    }
    kickZ = Math.min(feel.kickZ * 2.2, kickZ + feel.kickZ);
    kickR = Math.min(feel.kickR * 2.0, kickR + feel.kickR);

    // muzzle flash + light pulse
    if (model && model.muzzle) {
      const s = feel.flash * (0.8 + Math.random() * 0.5);
      flash.scale.set(s, s, s * (0.8 + Math.random() * 0.6));
      flash.rotation.z = Math.random() * TAU;
      flashDur = isGat ? 0.05 : 0.055;
      flashT = flashDur;
      flashMat.opacity = 1;
      flash.visible = true;
    }
    muzzleLight.position.copy(_muzzle).addScaledVector(_dir, 0.35);
    lightPeak = feel.light * (0.85 + Math.random() * 0.3);
    lightT = LIGHT_DUR;
    muzzleLight.intensity = lightPeak;

    if (isGat) heat = Math.min(1, heat + 0.016);

    const se = shotEvts[shotEvtI]; shotEvtI = (shotEvtI + 1) % shotEvts.length;
    se.weaponId = cur.id; se.origin.copy(_muzzle); se.dir.copy(_dir);
    game.emit('shot', se);
    flushHits();
  }

  function meleeHit(def, p) {
    const zs = game.zombies, world = game.world;
    const yaw = p.yaw || 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const px = p.position.x, pz = p.position.z;
    let hit = false, n = 0;
    if (zs && zs.inRadius) {
      zs.inRadius(p.position, def.range + 1.2, meleeList);
      const cosArc = Math.cos(def.arc);
      meleeDir.set(fx, 0.18, fz).normalize();
      for (let i = 0; i < meleeList.length && n < 3; i++) {
        const zb = meleeList[i];
        if (!zb || zb.alive === false) continue;
        const dx = zb.position.x - px, dz = zb.position.z - pz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d - (zb.radius || 0.4) > def.range) continue;
        if (Math.abs(zb.position.y - p.position.y) > 2.2) continue;
        if (d > 0.7 && (dx * fx + dz * fz) / d < cosArc) continue;
        _hitPt.set(zb.position.x, zb.position.y + (zb.height || 1.7) * 0.72, zb.position.z);
        let killed = false;
        if (zs.damage) killed = zs.damage(zb, def.damage * (mods().damageMult || 1), meleeInfo) === true;
        if (!killed && zb.alive === false) killed = true;
        const e = hitEvts[hitEvtI]; hitEvtI = (hitEvtI + 1) % hitEvts.length;
        e.zombie = zb; e.headshot = false; e.killed = killed; e.point.copy(_hitPt);
        game.emit('hit', e);
        hit = true; n++;
      }
      meleeList.length = 0;
    }
    if (!hit && world && world.raycast) {
      // thud + sparks when the post connects with scenery
      getAim(p, _origin, _dir);
      const wHit = world.raycast(_origin, _dir, def.range + 3.6);
      if (wHit) {
        _end.copy(wHit.point);
        const ex = _end.x - px, ez = _end.z - pz;
        if (ex * ex + ez * ez <= def.range * def.range) spawnImpact(_end, wHit.normal);
      }
    }
    if (p.addRecoil) p.addRecoil(hit ? 0.012 : 0.004, hit ? -0.01 : -0.004);
    const me = meleeEvts[meleeEvtI]; meleeEvtI = (meleeEvtI + 1) % meleeEvts.length;
    me.hit = hit;
    game.emit('melee', me);
  }

  // ------------------------------------------------------------------ flamethrower
  function stopFlame() {
    flameHold = 0; flameOn = false;
    flameAcc = 0; coreAcc = 0; fSmokeAcc = 0; emberAcc = 0;
    if (flameLightOn) { flameLightOn = false; if (lightT <= 0) muzzleLight.intensity = 0; }
  }

  // Muzzle, stream direction (muzzle -> what the crosshair is on) and reach to the first wall for this frame.
  function computeFlameRay(p, def) {
    const model = models.flamethrower;
    getAim(p, _origin, _dir);
    if (model && model.muzzle) {
      model.muzzle.updateWorldMatrix(true, false);
      _fMuz.setFromMatrixPosition(model.muzzle.matrixWorld);
    } else _fMuz.copy(_origin).addScaledVector(_dir, 0.6);
    const world = game.world;
    let aimDist = def.range + 6;
    if (world && world.raycast) {
      const wh = world.raycast(_origin, _dir, aimDist);
      if (wh) aimDist = Math.max(1.5, wh.distance);
    }
    _fd.copy(_origin).addScaledVector(_dir, aimDist).sub(_fMuz);
    const len = _fd.length();
    if (len > 0.5) _fDir.copy(_fd).divideScalar(len); else _fDir.copy(_dir);
    if (_fDir.dot(_dir) < 0.5) _fDir.copy(_dir);
    _fRight.crossVectors(_fDir, UP);
    if (_fRight.lengthSq() < 1e-6) _fRight.set(1, 0, 0);
    _fRight.normalize();
    _fUp.crossVectors(_fRight, _fDir).normalize();
    flameReach = def.range; flameBarrel = null;
    if (world && world.raycast) {
      const wc = world.raycast(_fMuz, _fDir, def.range);
      if (wc) {
        flameReach = Math.max(0.3, wc.distance);
        if (wc.collider && wc.collider.type === 'barrel') { flameBarrel = wc.collider; barrelEvt.point.copy(wc.point); }
      }
    }
  }

  function emitBarrelFlame(collider) {
    barrelEvt.collider = collider; barrelEvt.damage = BARREL_FLAME_DAMAGE;
    game.emit('barrelHit', barrelEvt);
  }

  // One fuel tick: everything inside the cone that is not behind a wall gets burnt.
  function fireFlame(cur, def, p) {
    const zs = game.zombies, world = game.world, M = mods();
    const dmg = def.damage * (M.damageMult || 1);
    const burnDps = (def.igniteDps || 0) * (M.damageMult || 1);
    consumeRound(cur);
    sinceShot = 0;
    flameHold = 0.13;

    // fuel barrels: the stream's axis, plus one random ray inside the cone
    if (flameBarrel) emitBarrelFlame(flameBarrel);
    if (world && world.raycast) {
      const tc = Math.tan(def.cone || 0.3) * Math.sqrt(Math.random()), az = Math.random() * TAU;
      _d.copy(_fDir).addScaledVector(_fRight, Math.cos(az) * tc).addScaledVector(_fUp, Math.sin(az) * tc).normalize();
      const wr = world.raycast(_fMuz, _d, def.range);
      if (wr && wr.collider && wr.collider.type === 'barrel' && wr.collider !== flameBarrel) {
        barrelEvt.point.copy(wr.point);
        emitBarrelFlame(wr.collider);
      }
    }

    let hits = 0, kills = 0, first = null;
    if (zs && zs.inRadius && zs.damage) {
      zs.inRadius(_fMuz, def.range + 1.5, flameList);
      const tanC = Math.tan((def.cone || 0.3) * 0.7);   // matches the visible stream (+/-0.15 rad jitter, ~2 m puffs)
      const fx = _fDir.x, fy = _fDir.y, fz = _fDir.z;
      _fKnock.set(fx * 0.3, 0, fz * 0.3);    // a short dir = only a light shove per tick
      let checks = 0;
      for (let i = 0; i < flameList.length && checks < FLAME_MAX_CHECKS; i++) {
        const zb = flameList[i];
        if (!zb || zb.alive === false) continue;
        const h = zb.height || 1.75, rr = zb.radius || 0.42;
        const cx = zb.position.x - _fMuz.x, cy = zb.position.y + h * 0.5 - _fMuz.y, cz = zb.position.z - _fMuz.z;
        const along = cx * fx + cy * fy + cz * fz;
        if (along < -rr || along > flameReach + rr) continue;
        const d2 = cx * cx + cy * cy + cz * cz;
        const lat2 = d2 - along * along;
        const allow = (along > 0 ? along : 0) * tanC + rr + 0.3;
        if (lat2 > allow * allow) continue;
        checks++;
        const dist = Math.sqrt(d2);
        if (world && world.raycast && dist > rr + 0.3) {
          _d.set(cx / dist, cy / dist, cz / dist);
          if (world.raycast(_fMuz, _d, dist - rr)) continue;   // behind a wall / crate
        }
        _fPt.set(zb.position.x, zb.position.y + h * 0.6, zb.position.z);
        suppressBlood = true;
        let killed = false;
        try { killed = zs.damage(zb, dmg, flameInfo) === true; } finally { suppressBlood = false; }
        if (!killed && zb.alive === false) killed = true;
        if (!killed && zs.ignite && burnDps > 0) zs.ignite(zb, burnDps, def.igniteTime || 3);
        hits++; if (killed) kills++;
        if (!first) first = zb;
      }
      flameList.length = 0;
    }
    if (hits > 0 && (kills > 0 || flameHitT <= 0)) {
      flameHitT = FLAME_HIT_EVT;
      const e = hitEvts[hitEvtI]; hitEvtI = (hitEvtI + 1) % hitEvts.length;
      e.zombie = first; e.headshot = false; e.killed = kills > 0; e.point.copy(_fPt);
      game.emit('hit', e);
    }

    if (p.addRecoil) p.addRecoil(def.recoilPitch * (0.5 + Math.random()), rnd() * def.recoilYaw);
    const feel = FEEL.flamethrower;
    kickZ = Math.min(feel.kickZ * 2, kickZ + feel.kickZ);
    kickR = Math.min(feel.kickR * 2, kickR + feel.kickR);

    const se = shotEvts[shotEvtI]; shotEvtI = (shotEvtI + 1) % shotEvts.length;
    se.weaponId = cur.id; se.origin.copy(_fMuz); se.dir.copy(_fDir);
    game.emit('shot', se);
  }

  // Per-frame stream visuals while the trigger keeps the flame alive.
  function updateFlameFX(dt, p) {
    if (!flameOn) {
      if (flameLightOn) { flameLightOn = false; if (lightT <= 0) muzzleLight.intensity = 0; }
      return;
    }
    const pv = p && p.velocity;
    if (pv) _pv.copy(pv).multiplyScalar(0.6); else _pv.set(0, 0, 0);
    const lum = ambientLum();
    const stop = Math.max(0.2, flameReach - 0.25);
    flameAcc += dt * FLAME_RATE;
    while (flameAcc >= 1) {
      flameAcc -= 1;
      const j = 0.15, sp = 19 + Math.random() * 6;
      _d.copy(_fDir).addScaledVector(_fRight, rnd() * j).addScaledVector(_fUp, rnd() * j).normalize();
      const f = Math.random() * 0.06;
      emitB(BK_FLAME, _fMuz.x + _fDir.x * f, _fMuz.y + _fDir.y * f, _fMuz.z + _fDir.z * f,
        _d.x * sp + _pv.x, _d.y * sp + _pv.y, _d.z * sp + _pv.z,
        0.5 + Math.random() * 0.2, 0.07 + Math.random() * 0.05, 1.3 + Math.random() * 0.7, stop, lum);
    }
    coreAcc += dt * FLAME_CORE_RATE;
    while (coreAcc >= 1) {
      coreAcc -= 1;
      const j = 0.04, sp = 16 + Math.random() * 4;
      _d.copy(_fDir).addScaledVector(_fRight, rnd() * j).addScaledVector(_fUp, rnd() * j).normalize();
      emitB(BK_HOT, _fMuz.x, _fMuz.y, _fMuz.z, _d.x * sp + _pv.x, _d.y * sp + _pv.y, _d.z * sp + _pv.z,
        0.16 + Math.random() * 0.08, 0.05, 0.32, stop, 1);
    }
    fSmokeAcc += dt * FLAME_SMOKE_RATE;
    while (fSmokeAcc >= 1) {
      fSmokeAcc -= 1;
      const t = flameReach * (0.55 + Math.random() * 0.45);
      emitB(BK_SMOKE, _fMuz.x + _fDir.x * t + rnd() * 0.5, _fMuz.y + _fDir.y * t + 0.6 + Math.random() * 0.4, _fMuz.z + _fDir.z * t + rnd() * 0.5,
        _fDir.x * 2.5 + rnd() * 0.6, 1.4 + Math.random() * 0.8, _fDir.z * 2.5 + rnd() * 0.6,
        1.1 + Math.random() * 0.7, 0.7, 2.2 + Math.random() * 1.2, 0, lum);
    }
    emberAcc += dt * FLAME_EMBER_RATE;
    while (emberAcc >= 1) {
      emberAcc -= 1;
      const t = flameReach * (0.25 + Math.random() * 0.75);
      emitB(BK_EMBER, _fMuz.x + _fDir.x * t, _fMuz.y + _fDir.y * t, _fMuz.z + _fDir.z * t,
        _fDir.x * 5 + rnd() * 3, 1.5 + Math.random() * 2.5, _fDir.z * 5 + rnd() * 3,
        0.6 + Math.random() * 0.5, 0.05, 0.02, 0, 1);
    }
    // nozzle burst + flickering light that walks with the stream
    if (models.flamethrower && models.flamethrower.muzzle) {
      const s = 0.22 + Math.random() * 0.12;
      flash.scale.set(s, s, s * (1.2 + Math.random() * 0.6));
      flash.rotation.z = Math.random() * TAU;
      flashDur = 0.06; flashT = 0.06;
      flashMat.opacity = 1;
      flash.visible = true;
    }
    muzzleLight.position.copy(_fMuz).addScaledVector(_fDir, Math.min(2.2, flameReach * 0.5));
    muzzleLight.intensity = 36 + Math.random() * 18;
    flameLightOn = true;
  }

  // ------------------------------------------------------------------ rocket launcher
  function fireRocket(cur, def, p, aim) {
    const feel = FEEL.rocket;
    const model = models.rocket;
    getAim(p, _origin, _dir);
    if (model && model.muzzle) {
      model.muzzle.updateWorldMatrix(true, false);
      _muzzle.setFromMatrixPosition(model.muzzle.matrixWorld);
    } else _muzzle.copy(_origin).addScaledVector(_dir, 0.6);

    // slight spread, then aim the rocket from the tube at whatever the crosshair ray meets
    const sp = computeSpread(def, p, aim);
    _right.crossVectors(_dir, UP);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _upv.crossVectors(_right, _dir).normalize();
    const ang = sp * Math.sqrt(Math.random()), az = Math.random() * TAU, t = Math.tan(ang);
    _d.copy(_dir).addScaledVector(_right, Math.cos(az) * t).addScaledVector(_upv, Math.sin(az) * t).normalize();
    const zs = game.zombies, world = game.world;
    let dist = def.range;
    if (zs && zs.raycast) { const zh = zs.raycast(_origin, _d, def.range); if (zh && zh.zombie) dist = Math.min(dist, zh.distance); }
    if (world && world.raycast) { const wh = world.raycast(_origin, _d, def.range); if (wh) dist = Math.min(dist, wh.distance); }
    _end.copy(_origin).addScaledVector(_d, dist);
    _rDir.copy(_end).sub(_muzzle);
    const len = _rDir.length();
    if (len > 1.5) _rDir.divideScalar(len); else _rDir.copy(_d);
    if (_rDir.dot(_d) < 0.3) _rDir.copy(_d);

    // pick a free rocket (or recycle the oldest one)
    let r = null, oldest = null;
    for (let i = 0; i < rockets.length; i++) {
      const q = rockets[i];
      if (!q.active) { r = q; break; }
      if (!oldest || q.age > oldest.age) oldest = q;
    }
    if (!r) { r = oldest; explodeRocket(r, r.pos.x, r.pos.y, r.pos.z); }
    r.def = def;
    r.pos.copy(_muzzle).addScaledVector(_rDir, 0.1);
    r.prev.copy(r.pos);
    r.vel.copy(_rDir).multiplyScalar(def.rocketSpeed || 58);
    r.dist = 0; r.age = 0; r.trail = 0; r.active = true;
    r.group.position.copy(r.pos);
    r.group.quaternion.setFromUnitVectors(NEG_Z, _rDir);
    r.group.visible = true;

    consumeRound(cur);
    sinceShot = 0;

    // a tube poked through a wall must not launch from the far side: check chest -> muzzle
    if (world && world.raycast && p.position) {
      _rA.set(p.position.x, p.position.y + 1.35, p.position.z);
      _rB.copy(r.pos).sub(_rA);
      const l = _rB.length();
      if (l > 0.05) {
        _rB.divideScalar(l);
        const wq = world.raycast(_rA, _rB, l);
        if (wq) explodeRocket(r, wq.point.x - _rB.x * 0.15, wq.point.y - _rB.y * 0.15, wq.point.z - _rB.z * 0.15);
      }
    }

    // recoil, kick, shake
    if (p.addRecoil) {
      const rm = (aim ? 0.8 : 1) * (p.isCrouching ? 0.85 : 1);
      p.addRecoil(def.recoilPitch * rm * (0.9 + Math.random() * 0.2), rnd() * def.recoilYaw * rm);
    }
    if (p.addShake) p.addShake(0.035);
    kickZ = Math.min(feel.kickZ * 1.5, kickZ + feel.kickZ);
    kickR = Math.min(feel.kickR * 1.5, kickR + feel.kickR);

    // muzzle flash + light
    if (model && model.muzzle) {
      const s = feel.flash * (0.85 + Math.random() * 0.3);
      flash.scale.set(s, s, s * (0.9 + Math.random() * 0.4));
      flash.rotation.z = Math.random() * TAU;
      flashDur = 0.09; flashT = flashDur;
      flashMat.opacity = 1;
      flash.visible = true;
    }
    muzzleLight.position.copy(_muzzle).addScaledVector(_rDir, 0.4);
    lightPeak = feel.light * (0.9 + Math.random() * 0.2);
    lightT = LIGHT_DUR;
    muzzleLight.intensity = lightPeak;

    // back-blast out of the rear of the tube + a puff at the front
    const lum = ambientLum();
    let rx = _muzzle.x - _rDir.x * 1.1, ry = _muzzle.y - _rDir.y * 1.1, rz = _muzzle.z - _rDir.z * 1.1;
    if (model && model.rear) {
      model.rear.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(model.rear.matrixWorld);
      rx = _v.x; ry = _v.y; rz = _v.z;
    }
    for (let i = 0; i < 16; i++) {
      const s = 3 + Math.random() * 7;
      emitB(BK_PALE, rx + rnd() * 0.1, ry + rnd() * 0.1, rz + rnd() * 0.1,
        -_rDir.x * s + rnd() * 1.8, -_rDir.y * s + rnd() * 1.8 + 0.6, -_rDir.z * s + rnd() * 1.8,
        0.9 + Math.random() * 0.9, 0.25, 1.4 + Math.random() * 0.9, 0, lum);
    }
    for (let i = 0; i < 9; i++) {
      const s = 6 + Math.random() * 7;
      emitB(BK_HOT, rx, ry, rz, -_rDir.x * s + rnd() * 2, -_rDir.y * s + rnd() * 2, -_rDir.z * s + rnd() * 2,
        0.1 + Math.random() * 0.08, 0.22, 0.75, 0, 1);
    }
    for (let i = 0; i < 6; i++) {
      emitB(BK_PALE, _muzzle.x, _muzzle.y, _muzzle.z, _rDir.x * 2.5 + rnd() * 1.2, _rDir.y * 2.5 + rnd() * 1.2 + 0.3, _rDir.z * 2.5 + rnd() * 1.2,
        0.7 + Math.random() * 0.6, 0.2, 1.0 + Math.random() * 0.5, 0, lum);
    }

    const se = shotEvts[shotEvtI]; shotEvtI = (shotEvtI + 1) % shotEvts.length;
    se.weaponId = cur.id; se.origin.copy(_muzzle); se.dir.copy(_rDir);
    game.emit('shot', se);
  }

  function fireOnce(cur, def, p, aim) {
    if (cur.id === 'flamethrower') fireFlame(cur, def, p);
    else if (cur.id === 'rocket') fireRocket(cur, def, p, aim);
    else fireShot(cur, def, p, aim);
  }

  // ------------------------------------------------------------------ view-model animation
  const sm = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;

  function animate(dt, cur, firing) {
    const id = cur.id;
    const kd = Math.exp(-dt * 16);
    kickZ *= kd; kickR *= kd;
    let px = 0, py = 0, pz = kickZ, rx = kickR, ry = 0, rz = 0;

    if (drawT > 0) {
      const k = drawT / drawDur, e = k * k;
      py -= 0.22 * e; rx -= 1.0 * e; rz += 0.3 * e;
    }
    const reloadK = reloading ? Math.min(1, reloadT / reloadDur(cur.def)) : 0;
    if (reloading) {
      const t = reloadK;
      const amt = id === 'gatling' ? 0.55 : id === 'rocket' ? 0.8 : 1;
      const dip = sm(t / 0.16) * sm((1 - t) / 0.16) * amt;
      py -= 0.1 * dip; rx += 0.42 * dip; rz -= 0.5 * dip;
      const slap = Math.max(0, 1 - Math.abs(t - 0.62) / 0.05);
      py += 0.035 * slap * amt; rx -= 0.08 * slap * amt;
      const tug = Math.max(0, 1 - Math.abs(t - 0.3) / 0.07);
      py -= 0.03 * tug * amt;
    }
    if (id === 'bat') {
      let bx = 0.9, by = 0.15, bz = 0;
      if (swinging) {
        const s = swingT / SWING_DUR;
        if (s < 0.22) {
          const a = sm(s / 0.22);
          bx = lerp(0.9, 1.25, a); by = lerp(0.15, -1.0, a); bz = lerp(0, -0.4, a);
        } else if (s < 0.5) {
          let a = (s - 0.22) / 0.28; a = 1 - (1 - a) * (1 - a);
          bx = lerp(1.25, 0.1, a); by = lerp(-1.0, 1.3, a); bz = lerp(-0.4, 0.5, a);
          pz -= 0.16 * Math.sin(Math.PI * a); px -= 0.08 * a;
        } else {
          const a = sm((s - 0.5) / 0.5);
          bx = lerp(0.1, 0.9, a); by = lerp(1.3, 0.15, a); bz = lerp(0.5, 0, a);
          px -= 0.08 * (1 - a);
        }
      }
      rx += bx; ry += by; rz += bz;
    } else if (id === 'gatling') {
      if (firing) { px += rnd() * 0.004; py += rnd() * 0.004; rz += rnd() * 0.006; }
      else if (spin > 0.05) { px += rnd() * 0.0012 * spin; py += rnd() * 0.0012 * spin; }
    } else if (id === 'flamethrower') {
      if (flameOn) { px += rnd() * 0.0025; py += rnd() * 0.0025; rz += rnd() * 0.004; }
    }
    // rocket launcher: the warhead shows at the front of the tube while loaded and slides in during the reload
    if (rocketWarhead) {
      if (id === 'rocket') {
        let vis = cur.mag > 0, z = 0;
        if (reloading) {
          vis = reloadK > 0.3;
          z = -0.32 * (1 - sm((reloadK - 0.3) / 0.32));
        }
        rocketWarhead.visible = vis;
        rocketWarhead.position.z = -0.54 + z;
      }
    }
    rig.position.set(px, py, pz);
    rig.rotation.set(rx, ry, rz);

    if (gatCluster) {
      barrelAngle = (barrelAngle + spin * 30 * dt) % TAU;
      gatCluster.rotation.z = -barrelAngle;
    }
    heatMat.emissiveIntensity = heat * heat * 3.2;
  }

  function updateFX(dt) {
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) flash.visible = false;
      else flashMat.opacity = flashT / flashDur;
    }
    if (lightT > 0) {
      lightT -= dt;
      muzzleLight.intensity = lightT > 0 ? lightPeak * (lightT / LIGHT_DUR) : 0;
    }
    updateTracers(dt);
    updateSystem(solid, dt);
    updateSystem(glow, dt);
    updateRockets(dt);
    updateBillboards(dt);
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    updateFX(dt);
    const p = game.player;
    if (!p || !p.position) return;
    let cur = slots[currentIndex];
    if (!cur) {
      if (!slots[0]) slots[0] = entry('bat');
      equip(0, true);
      cur = slots[0];
    }
    const def = cur.def;
    const input = p.input || NO_INPUT;
    const alive = p.alive !== false;
    const fire = alive && !!input.fire && !game.buildMode;
    const aim = alive && (!!input.aim || !!p.isAiming);
    const pressed = fire && !prevFire;
    prevFire = fire;
    if (!fire) dryEmitted = false;

    if (drawT > 0) drawT -= dt;
    if (fireCooldown > 0) fireCooldown -= dt;
    sinceShot += dt;

    const frm = mods().fireRateMult > 0 ? mods().fireRateMult : 1;
    const interval = 60 / ((def.rpm || 60) * frm);
    if (bloom > 0 && sinceShot > Math.min(0.3, Math.max(0.1, interval * 1.3))) {
      bloom = Math.max(0, bloom - (def.spreadRecover || 0.1) * dt);
    }

    if (reloading) {
      reloadT += dt;
      if (reloadT >= reloadDur(def)) finishReload(cur);
    }

    const isFlame = cur.id === 'flamethrower';
    if (fuelRig && fuelRig.visible !== isFlame) fuelRig.visible = isFlame;
    if (flameHitT > 0) flameHitT -= dt;
    if (!isFlame || !alive) { if (flameHold > 0 || flameOn) stopFlame(); }
    else if (flameHold > 0) flameHold -= dt;
    if (isFlame && (fire || flameHold > 0)) computeFlameRay(p, def);

    const ready = drawT <= 0 && !reloading;
    const isGat = def.spinUp > 0;
    const gdef = W.gatling;
    // the motor may already wind up while the gun is still being shouldered (it only FIRES once ready),
    // otherwise swap-to-first-round is draw + spin-up, which reads as an unresponsive trigger
    if (isGat && !reloading && (fire || aim)) spin = Math.min(1, spin + dt / def.spinUp);
    else if (spin > 0) spin = Math.max(0, spin - dt / ((gdef && gdef.spinDown) || 1.4));

    let firedNow = false;

    if (def.slot === 'melee') {
      if (swinging) {
        swingT += dt;
        if (!swingHitDone && swingT >= SWING_DUR * SWING_HIT) { swingHitDone = true; meleeHit(def, p); }
        if (swingT >= SWING_DUR) { swinging = false; swingT = 0; }
      }
      if (fire && ready && !swinging && fireCooldown <= 0) {
        swinging = true; swingT = 0; swingHitDone = false;
        fireCooldown = interval;
      }
      if (fireCooldown < 0) fireCooldown = 0;
      spread = 0;
    } else {
      if (pressed) semiQueue = 0.14;
      else if (semiQueue > 0) semiQueue -= dt;
      const want = def.auto ? fire : semiQueue > 0;

      if (want && ready) {
        if (cur.mag <= 0) {
          if (ammo[def.ammoType] > 0) startReload();
          else if (!dryEmitted) { dryEmitted = true; game.emit('dryFire'); }
          semiQueue = 0;
        } else if (!isGat || spin >= 1) {
          let n = 0;
          while (fireCooldown <= 0 && cur.mag > 0 && n < 3) {
            fireOnce(cur, def, p, aim);
            fireCooldown += interval;
            firedNow = true;
            n++;
            if (!def.auto) { semiQueue = 0; break; }
          }
        }
      }
      if (fireCooldown < 0) fireCooldown = 0;
      // single-shot launcher: start loading the next rocket by itself once the tube is empty
      if (cur.id === 'rocket' && alive && cur.mag <= 0 && !reloading && drawT <= 0 && fireCooldown <= 0 && ammo[def.ammoType] > 0) startReload();
      spread = isFlame ? 0 : computeSpread(def, p, aim);
    }

    // flamethrower stream FX, pilot light and nozzle glow
    if (isFlame) {
      flameOn = flameHold > 0 && alive && !reloading;
      if (flameOn) flameHeat = Math.min(1, flameHeat + dt * 0.7);
      updateFlameFX(dt, p);
      if (pilot) {
        const show = !flameOn && alive;
        pilot.visible = pilotOuter.visible = show;
        if (show) {
          const f = 0.85 + Math.random() * 0.3;
          pilot.scale.set(0.026 * f, 0.036 * (0.8 + Math.random() * 0.5), 1);
          pilotOuter.scale.set(0.045 * f, 0.065 * (0.8 + Math.random() * 0.5), 1);
        }
      }
    }
    if (flameHeat > 0 && !flameOn) flameHeat = Math.max(0, flameHeat - dt * 0.35);
    flameTipMat.emissiveIntensity = 0.6 + flameHeat * 4;

    // gatling heat: cools slowly while firing, faster when resting; wisps of smoke off hot barrels
    if (heat > 0) {
      heat = Math.max(0, heat - dt * (sinceShot > 0.2 ? 0.28 : 0.05));
      if (isGat && heat > 0.45 && sinceShot > 0.15) {
        smokeT -= dt;
        if (smokeT <= 0) {
          smokeT = 0.08;
          const model = models.gatling;
          if (model && model.muzzle) {
            model.muzzle.updateWorldMatrix(true, false);
            _v.setFromMatrixPosition(model.muzzle.matrixWorld);
            const b = ambientLum() * 0.55;
            emitP(solid, _v.x, _v.y, _v.z, rnd() * 0.15, 0.5 + Math.random() * 0.4, rnd() * 0.15,
              0.7, 0.025, 0.09, -0.2, 1, b, b, b * 1.05);
          }
        }
      }
    }

    animate(dt, cur, firedNow || (isGat && sinceShot < 0.08));
  }

  // ------------------------------------------------------------------ events
  game.on('keydown', (code) => {
    if (typeof code !== 'string') return;
    if (game.choosing) return;   // perk picker open: 1-3 pick a perk, not a weapon
    if (code === 'KeyR') { startReload(); return; }
    if (code.length === 6 && code.startsWith('Digit')) {
      const n = code.charCodeAt(5) - 49; // Digit1 -> 0
      if (n >= 0 && n < slots.length) select(n);
    }
  });
  game.on('wheel', (dir) => { if (dir) cycle(dir); });
  game.on('playerDied', () => {
    spin = 0; heat = 0; heatMat.emissiveIntensity = 0;
    flashT = 0; flash.visible = false;
    lightT = 0; muzzleLight.intensity = 0;
    reloading = false; reloadT = 0; swinging = false; prevFire = false;
    stopFlame();
    if (pilot) pilot.visible = pilotOuter.visible = false;
    // weapons.update no longer runs in the 'dead' state: nothing may hang frozen behind the game-over card
    clearRockets();
    clearBillboards();
  });

  // ------------------------------------------------------------------ api
  const api = {
    slots, ammo,
    get currentIndex() { return currentIndex; },
    get current() { return slots[currentIndex]; },
    get moveMult() { const c = slots[currentIndex]; return c && c.def.moveMult ? c.def.moveMult : 1; },
    get spread() { return spread; },
    get reloading() { return reloading; },
    get reloadProgress() {
      if (!reloading) return 0;
      const c = slots[currentIndex];
      const t = c ? reloadT / reloadDur(c.def) : 0;
      return t < 0 ? 0 : t > 1 ? 1 : t;
    },
    get spin() { return spin; },
    get heat() { return heat; },
    get fireCooldown() { return fireCooldown; },
    get flaming() { return flameOn; },
    get rocketsInFlight() { let n = 0; for (let i = 0; i < rockets.length; i++) if (rockets[i].active) n++; return n; },
    give, has, addAmmo, select, reload: startReload,
    spawnImpact, spawnBlood, spawnTracer, getMuzzleWorld,
    update, reset,
  };

  reset();
  return api;
}
