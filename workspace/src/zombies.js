// HOLLOW DAWN — the horde. Pooled zombies rendered with one InstancedMesh per body part.
// The Hollow King (type 'boss') rides the same instanced rig, plus a small bone crown / spine group,
// an ability state machine (charge, ground slam, summon, rubble throw) and its own health bar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Canonical (scale 1, height 1.75) body part dimensions, metres.
const TORSO_W = 0.48, TORSO_H = 0.62, TORSO_D = 0.27;
const HEAD_W = 0.27, HEAD_H = 0.3, HEAD_D = 0.29;
const ARM_W = 0.12, ARM_L = 0.66;
const LEG_W = 0.17, LEG_L = 0.82, LEG_D = 0.19;
const BASE_HEIGHT = 1.75;

const SPAWN_T = 0.8;      // seconds to claw out of the ground
const FALL_T = 0.55;      // seconds to topple
const SPIT_MAX = 24;
const SPIT_G = 12;
const SEP_FORCE = 3.6;
const PI = Math.PI, TAU = Math.PI * 2, HALF_PI = Math.PI / 2;

// boss tuning that is not in CONFIG.boss (local, see report)
const BOSS_SPAWN_T = 2.4;     // slow rise out of the ground
const BOSS_FALL_T = 2.3;      // long topple on death
const BOSS_LIE_T = 6.5;       // corpse stays this long before sinking
const BOSS_BURN_MULT = 3;     // dawn burn lasts this much longer than a normal zombie's
const BOSS_KNOCK = 0.06;      // share of normal bullet knockback it takes
const BOSS_STUN_RATE = 4;     // stuns wear off this many times faster
const HIGH_TIME = 6;          // seconds the player may stay up high before rubble starts flying
const ROCK_MAX = 4, ROCK_G = 15, ROCK_DAMAGE = 30, ROCK_SPLASH = 2.6;
const PLAYER_KNOCK_T = 0.42;

// Per-type silhouette. Angles in radians; arm/leg angle > 0 swings the limb forward.
const SHAPES = {
  walker:  { w: 1.0,  depth: 1.0,  lean: 0.40, armBase: 1.75, armSwing: 0.16, armLen: 1.0,  armThick: 1.0,  legSwing: 0.5,  legThick: 1.0,  head: 1.0,  headPitch: 0.15, splay: 0.10, sway: 1.0, turn: 6,   stride: 1.0,  sac: false },
  runner:  { w: 0.78, depth: 0.85, lean: 0.68, armBase: 1.35, armSwing: 0.85, armLen: 1.08, armThick: 0.8,  legSwing: 0.95, legThick: 0.82, head: 0.95, headPitch: 0.60, splay: 0.05, sway: 0.5, turn: 9,   stride: 0.72, sac: false },
  brute:   { w: 1.2,  depth: 1.35, lean: 0.30, armBase: 0.80, armSwing: 0.30, armLen: 1.22, armThick: 1.5,  legSwing: 0.4,  legThick: 1.3,  head: 0.78, headPitch: 0.20, splay: 0.22, sway: 1.6, turn: 3.5, stride: 1.0,  sac: false },
  spitter: { w: 0.9,  depth: 1.1,  lean: 0.12, armBase: 0.45, armSwing: 0.25, armLen: 1.12, armThick: 0.75, legSwing: 0.5,  legThick: 0.9,  head: 1.05, headPitch: 0.38, splay: 0.18, sway: 0.8, turn: 6,   stride: 1.0,  sac: true },
  // hunched, knuckle-dragging giant: long heavy arms hanging low, small head pushed forward
  boss:    { w: 1.22, depth: 1.32, lean: 0.62, armBase: 1.0,  armSwing: 0.32, armLen: 1.3,  armThick: 1.45, legSwing: 0.4,  legThick: 1.38, head: 0.84, headPitch: 0.42, splay: 0.3,  sway: 1.5, turn: 3.2, stride: 0.85, sac: false },
};
const CLOTH = ['#3b3f4a', '#4a3b34', '#3a4a3f', '#55504a', '#2f3a4d', '#4d3a45'];

// ---------------------------------------------------------------- module-level temps
const _mRoot = new THREE.Matrix4();
const _mTorso = new THREE.Matrix4();
const _mLocal = new THREE.Matrix4();
const _mPart = new THREE.Matrix4();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _flow = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function localTR(m, tx, ty, tz, rx, rz) {
  // m = T(tx,ty,tz) * Rx(rx) * Rz(rz)
  const c = Math.cos(rx), s = Math.sin(rx), cb = Math.cos(rz), sb = Math.sin(rz);
  m.set(
    cb, -sb, 0, tx,
    c * sb, c * cb, -s, ty,
    s * sb, s * cb, c, tz,
    0, 0, 0, 1,
  );
}

function writeScaled(m, sx, sy, sz, arr, o) {
  const e = m.elements;
  arr[o] = e[0] * sx; arr[o + 1] = e[1] * sx; arr[o + 2] = e[2] * sx; arr[o + 3] = 0;
  arr[o + 4] = e[4] * sy; arr[o + 5] = e[5] * sy; arr[o + 6] = e[6] * sy; arr[o + 7] = 0;
  arr[o + 8] = e[8] * sz; arr[o + 9] = e[9] * sz; arr[o + 10] = e[10] * sz; arr[o + 11] = 0;
  arr[o + 12] = e[12]; arr[o + 13] = e[13]; arr[o + 14] = e[14]; arr[o + 15] = 1;
}

function zeroMatrix(arr, o) {
  for (let i = 0; i < 16; i++) arr[o + i] = 0;
}

function wrapAngle(d) {
  d = (d + PI) % TAU;
  if (d < 0) d += TAU;
  return d - PI;
}

function taperedBox(w, h, d, yOffset, topMul, botMul) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) * (y > 0 ? topMul : botMul));
    p.setY(i, y + yOffset);
  }
  g.computeVertexNormals();
  return g;
}

function mergeTwo(a, b) {
  a = a.toNonIndexed(); b = b.toNonIndexed();
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const pa = a.attributes[name].array, pb = b.attributes[name].array;
    const out = new Float32Array(pa.length + pb.length);
    out.set(pa, 0); out.set(pb, pa.length);
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  return g;
}

// ---------------------------------------------------------------- tiny pooled point particles
function makeParticles(scene, max, additive, size) {
  const pos = new Float32Array(max * 3).fill(-9999);
  const col = new Float32Array(max * 3);
  const base = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const maxLife = new Float32Array(max);
  const grav = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3); posAttr.setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(col, 3); colAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', colAttr);
  const mat = new THREE.PointsMaterial({
    size, vertexColors: true, sizeAttenuation: true,
    transparent: additive, depthWrite: !additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: !additive, toneMapped: !additive,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 3 : 0;
  scene.add(points);
  let cursor = 0, live = 0, dirty = false;
  return {
    emit(x, y, z, vx, vy, vz, l, r, g, b, gr) {
      const i = cursor; cursor = (cursor + 1) % max;
      const j = i * 3;
      if (life[i] <= 0) live++;
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
      vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz;
      base[j] = r; base[j + 1] = g; base[j + 2] = b;
      col[j] = r; col[j + 1] = g; col[j + 2] = b;
      life[i] = l; maxLife[i] = l; grav[i] = gr;
      dirty = true;
    },
    update(dt) {
      if (live <= 0 && !dirty) return;
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        const j = i * 3;
        life[i] -= dt;
        if (life[i] <= 0) { pos[j + 1] = -9999; live--; continue; }
        vel[j + 1] -= grav[i] * dt;
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        if (additive) {
          const f = life[i] / maxLife[i];
          col[j] = base[j] * f; col[j + 1] = base[j + 1] * f; col[j + 2] = base[j + 2] * f;
        }
      }
      posAttr.needsUpdate = true; colAttr.needsUpdate = true;
      dirty = false;
    },
    clear() {
      for (let i = 0; i < max; i++) { life[i] = 0; pos[i * 3 + 1] = -9999; }
      live = 0; dirty = true;
    },
  };
}

// ================================================================= init
export function init(game) {
  const CONFIG = game.CONFIG;
  const DEFS = CONFIG.zombies;
  const MAX_ALIVE = CONFIG.maxZombiesAlive;
  const MAX = MAX_ALIVE + 24;
  const scene = game.scene;

  // ------------------------------------------------------------ meshes
  const glowArr = new Float32Array(MAX * 3);
  const glowAttr = new THREE.InstancedBufferAttribute(glowArr, 3);
  glowAttr.setUsage(THREE.DynamicDrawUsage);

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  bodyMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;');
  };
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
  const sacMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  const torsoGeo = taperedBox(TORSO_W, TORSO_H, TORSO_D, TORSO_H / 2, 1.14, 0.84);
  const headGeo = taperedBox(HEAD_W, HEAD_H, HEAD_D, HEAD_H / 2, 1.06, 0.8);
  const armGeo = taperedBox(ARM_W, ARM_L, ARM_W, -ARM_L / 2, 1.1, 0.85);
  const legGeo = taperedBox(LEG_W, LEG_L, LEG_D, -LEG_L / 2, 1.08, 0.82);
  const eyeA = new THREE.BoxGeometry(0.06, 0.036, 0.02); eyeA.translate(-0.066, HEAD_H * 0.58, -HEAD_D / 2 - 0.004);
  const eyeB = new THREE.BoxGeometry(0.06, 0.036, 0.02); eyeB.translate(0.066, HEAD_H * 0.58, -HEAD_D / 2 - 0.004);
  const eyeGeo = mergeTwo(eyeA, eyeB);
  const sacGeo = new THREE.IcosahedronGeometry(0.13, 1);
  const spitGeo = new THREE.IcosahedronGeometry(0.16, 0);

  function makePart(geo, mat, shadow, glow) {
    if (glow) geo.setAttribute('aGlow', glowAttr);
    const m = new THREE.InstancedMesh(geo, mat, MAX);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceMatrix.array.fill(0);
    m.setColorAt(0, _c1.set(0xffffff));
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = shadow;
    m.receiveShadow = false;
    scene.add(m);
    return m;
  }
  const mTorsoMesh = makePart(torsoGeo, bodyMat, true, true);
  const mHeadMesh = makePart(headGeo, bodyMat, true, true);
  const mArmL = makePart(armGeo, bodyMat, true, true);
  const mArmR = makePart(armGeo.clone(), bodyMat, true, false);
  mArmR.geometry.setAttribute('aGlow', glowAttr);
  const mLegL = makePart(legGeo, bodyMat, true, true);
  const mLegR = makePart(legGeo.clone(), bodyMat, true, false);
  mLegR.geometry.setAttribute('aGlow', glowAttr);
  const mEyes = makePart(eyeGeo, eyeMat, false, false);
  const mSac = makePart(sacGeo, sacMat, false, false);
  const bodyMeshes = [mTorsoMesh, mHeadMesh, mArmL, mArmR, mLegL, mLegR];
  const allMeshes = [mTorsoMesh, mHeadMesh, mArmL, mArmR, mLegL, mLegR, mEyes, mSac];
  const aTorso = mTorsoMesh.instanceMatrix.array, aHead = mHeadMesh.instanceMatrix.array;
  const aArmL = mArmL.instanceMatrix.array, aArmR = mArmR.instanceMatrix.array;
  const aLegL = mLegL.instanceMatrix.array, aLegR = mLegR.instanceMatrix.array;
  const aEyes = mEyes.instanceMatrix.array, aSac = mSac.instanceMatrix.array;

  const toxic = new THREE.Color(CONFIG.palette && CONFIG.palette.toxic ? CONFIG.palette.toxic : '#9be564');
  const spitMat = new THREE.MeshBasicMaterial({ color: _c1.copy(toxic).multiplyScalar(1.9).clone(), toneMapped: false, fog: false });
  const mSpit = new THREE.InstancedMesh(spitGeo, spitMat, SPIT_MAX);
  mSpit.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mSpit.instanceMatrix.array.fill(0);
  mSpit.frustumCulled = false;
  scene.add(mSpit);
  const aSpit = mSpit.instanceMatrix.array;

  const embers = makeParticles(scene, 1400, true, 0.14);
  const dust = makeParticles(scene, 420, false, 0.11);
  const bigEmbers = makeParticles(scene, 260, true, 0.3);     // boss death / rage / slam sparks

  // ------------------------------------------------------------ boss props (one boss at a time)
  const BC = CONFIG.boss;
  // local balance overrides (config.js is read-only for this module)
  const BOSS_AT_FRACTION = 0.28;     // CONFIG.boss.atFraction is 0.4: spawn ~29 s into a 105 s night (a ~74 s window before dawn)
  const BOSS_FIRST_NIGHT_HP = 0.65;  // the first boss night's King has 65% health (~3400); later nights keep healthPerNight
  const BOSS_GATLING_MULT = 0.35;    // gatling bullets deal 35% to the boss (otherwise ~8 s kills)
  let summonDue = null;              // boss whose summon resolves after the zombie list loop (spawn() may recycle list slots)
  const boneMat = new THREE.MeshLambertMaterial({ color: 0xcfc4a6, flatShading: true });
  const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.18), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  function spike(r, h, x, y, z, tilt, around, seg) {
    const g = new THREE.ConeGeometry(r, h, seg || 5);
    g.translate(0, h / 2, 0); g.rotateX(tilt); g.rotateY(around); g.translate(x, y, z);
    return g;
  }
  // crown: built in canonical head space (head box spans y 0..HEAD_H, face toward -z)
  const crownParts = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + PI;                     // k = 0 sits at the front (-z)
    const front = Math.cos(a - PI);                   // 1 at the front, -1 at the back
    const h = 0.12 + 0.09 * Math.max(0, front) + (k % 2) * 0.025;
    crownParts.push(spike(0.026, h, Math.sin(a) * 0.115, HEAD_H * 0.92, Math.cos(a) * 0.115, 0.38, a));
  }
  const band = new THREE.TorusGeometry(0.135, 0.02, 4, 12); band.rotateX(HALF_PI); band.translate(0, HEAD_H * 0.9, 0);
  crownParts.push(band);
  // horns sweeping out of the temples
  crownParts.push(spike(0.04, 0.24, -0.13, HEAD_H * 0.7, 0.01, 0.95, -HALF_PI, 6));
  crownParts.push(spike(0.04, 0.24, 0.13, HEAD_H * 0.7, 0.01, 0.95, HALF_PI, 6));
  for (const g of crownParts) { if (g.attributes.uv) g.deleteAttribute('uv'); }
  const crownGeo = mergeGeometries(crownParts.map((g) => (g.index ? g.toNonIndexed() : g)));
  const crownGroup = new THREE.Group();
  crownGroup.matrixAutoUpdate = false;
  const crownMesh = new THREE.Mesh(crownGeo, boneMat); crownMesh.castShadow = true;
  crownGroup.add(crownMesh);
  const haloGeo = new THREE.IcosahedronGeometry(0.034, 0);
  const haloL = new THREE.Mesh(haloGeo, haloMat); haloL.position.set(-0.066, HEAD_H * 0.58, -HEAD_D / 2 - 0.02);
  const haloR = new THREE.Mesh(haloGeo, haloMat); haloR.position.set(0.066, HEAD_H * 0.58, -HEAD_D / 2 - 0.02);
  haloL.renderOrder = haloR.renderOrder = 3;
  crownGroup.add(haloL, haloR);
  crownGroup.visible = false;
  scene.add(crownGroup);
  // spine ridge and shoulder spikes: canonical torso space (y 0..TORSO_H, back toward +z)
  const backParts = [];
  for (let k = 0; k < 5; k++) {
    const y = 0.12 + k * 0.11;
    backParts.push(spike(0.032, 0.07 + (k % 2) * 0.02 + k * 0.006, 0, y, TORSO_D * 0.42, 1.05 + k * 0.08, 0));
  }
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 0; k < 3; k++) {
      backParts.push(spike(0.03, 0.1 + k * 0.025, s * (0.17 + k * 0.035), TORSO_H * 0.97, 0.02 - k * 0.025, 0.35 + k * 0.1, s * HALF_PI));
    }
  }
  for (const g of backParts) { if (g.attributes.uv) g.deleteAttribute('uv'); }
  const backGeo = mergeGeometries(backParts.map((g) => (g.index ? g.toNonIndexed() : g)));
  const backGroup = new THREE.Group();
  backGroup.matrixAutoUpdate = false;
  const backMesh = new THREE.Mesh(backGeo, boneMat); backMesh.castShadow = true;
  backGroup.add(backMesh);
  backGroup.visible = false;
  scene.add(backGroup);

  // telegraphs: charge lane (scrolling chevrons), slam warning ring, the shockwave itself
  const laneCanvas = document.createElement('canvas'); laneCanvas.width = 64; laneCanvas.height = 128;
  {
    const g2 = laneCanvas.getContext('2d');
    if (g2) {
      g2.clearRect(0, 0, 64, 128);
      g2.fillStyle = 'rgba(255,255,255,0.18)'; g2.fillRect(0, 0, 64, 128);
      g2.fillStyle = '#fff'; g2.fillRect(0, 0, 5, 128); g2.fillRect(59, 0, 5, 128);
      g2.strokeStyle = '#fff'; g2.lineWidth = 9; g2.lineJoin = 'miter';
      for (let i = 0; i < 2; i++) {
        const y = 14 + i * 64;
        g2.beginPath(); g2.moveTo(9, y + 30); g2.lineTo(32, y + 4); g2.lineTo(55, y + 30); g2.stroke();
      }
    }
  }
  const laneTex = new THREE.CanvasTexture(laneCanvas);
  laneTex.wrapS = THREE.ClampToEdgeWrapping; laneTex.wrapT = THREE.RepeatWrapping;
  const laneGeo = new THREE.PlaneGeometry(1, 1); laneGeo.rotateX(-HALF_PI); laneGeo.translate(0, 0, -0.5);
  const tele = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const laneMat = tele(new THREE.Color(2.4, 0.3, 0.16)); laneMat.map = laneTex;
  const laneMesh = new THREE.Mesh(laneGeo, laneMat); laneMesh.visible = false; laneMesh.renderOrder = 2; laneMesh.frustumCulled = false;
  scene.add(laneMesh);
  const ringGeo = new THREE.RingGeometry(0.9, 1, 72); ringGeo.rotateX(-HALF_PI);
  const warnMat = tele(new THREE.Color(2.2, 0.32, 0.16));
  const warnRing = new THREE.Mesh(ringGeo, warnMat); warnRing.visible = false; warnRing.renderOrder = 2; warnRing.frustumCulled = false;
  scene.add(warnRing);
  const discGeo = new THREE.CircleGeometry(1, 48); discGeo.rotateX(-HALF_PI);
  const warnFillMat = tele(new THREE.Color(0.9, 0.08, 0.05));
  const warnFill = new THREE.Mesh(discGeo, warnFillMat); warnFill.visible = false; warnFill.renderOrder = 2; warnFill.frustumCulled = false;
  scene.add(warnFill);
  const waveGeo = new THREE.RingGeometry(0.78, 1, 72); waveGeo.rotateX(-HALF_PI);
  const waveMat = tele(new THREE.Color(2.6, 0.95, 0.3));
  const waveRing = new THREE.Mesh(waveGeo, waveMat); waveRing.visible = false; waveRing.renderOrder = 2; waveRing.frustumCulled = false;
  scene.add(waveRing);
  const shock = { active: false, x: 0, y: 0, z: 0, r: 0, max: 0, t: 0, hit: false, damage: 0 };

  // rubble chunks (lobbed at a player who camps up high)
  const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x5b5650, flatShading: true });
  const rocks = [];
  for (let i = 0; i < ROCK_MAX; i++) {
    const m = new THREE.Mesh(rockGeo, rockMat); m.visible = false; m.castShadow = true; scene.add(m);
    rocks.push({ active: false, mesh: m, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, sx: 0, sy: 0, sz: 0, trail: 0, spin: 0 });
  }
  let rocksLive = 0;
  const heldRock = new THREE.Mesh(rockGeo, rockMat); heldRock.visible = false; heldRock.castShadow = true; scene.add(heldRock);

  // boss state shared across the module
  let boss = null;            // living boss (alive === true) or null
  let decoZ = null;           // zombie the crown / spikes follow (living boss or its corpse)
  let bossNightDone = -1;     // night number whose boss has already been raised
  const knock = { x: 0, z: 0, t: 0 };   // shove applied to the player (charge, slam)
  const summonPts = new Float32Array(16);
  let summonN = 0;
  const fireInfo = { source: 'fire' };

  // ------------------------------------------------------------ pool
  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({
      // public
      type: 'walker', def: DEFS.walker, position: new THREE.Vector3(), yaw: 0,
      health: 0, maxHealth: 0, alive: false, radius: 0.4, height: 1.75, state: 'dead',
      // internal
      index: i, active: false, inGrid: false, shape: SHAPES.walker,
      vx: 0, vz: 0, kx: 0, kz: 0, speed: 0, phase: 0, moveFrac: 0, age: 0, seed: 0,
      stateTime: 0, rise: 0, fall: 0, fallSign: 1, sink: 0, flinch: 0,
      attackT: 0, nextAttack: 0.4, attackAnim: 0, windup: 0, barricadeT: 0,
      lungeT: 0, lungeCd: 0, spitCd: 0, spitAnim: 0, los: false, losT: 0,
      slowT: 0, slowMult: 1, stunT: 0,          // written by skills / build pieces
      wallT: 0, reachT: 0, reachClear: true,    // wall-avoid steering, melee line-of-sight cache
      burnT: 0, burnLevel: 0, emberAcc: 0, ash: false, headless: false,
      kY: 1, ws: 1, hs: 1, hsY: 1, headR: 0.2, hx: 0, hy: 0, hz: 0,
      spawnT: SPAWN_T, fallT: FALL_T, lieT: 2.4, igniteT: 0, igniteDps: 0,
      // boss
      boss: false, enraged: false, ab: 'idle', abT: 0, abDur: 0, abHit: false,
      cdCharge: 0, cdSlam: 0, cdSummon: 0, cdThrow: 0, cdAny: 0, highT: 0,
      cdx: 0, cdz: -1, chargeSpeed: 0, impactDone: false, killSent: false,
      handX: 0, handY: 0, handZ: 0,
      pw: 0, pArmL: 0, pArmR: 0, pLean: 0, pHead: 0, pSplay: 0,
      tw: 0, tArmL: 0, tArmR: 0, tLean: 0, tHead: 0, tSplay: 0, pk: 6,
    });
  }
  const list = [];
  let aliveCount = 0, remainingToSpawn = 0, waveTotal = 0;
  let wave = null, spawning = false, spawnTimer = 0;
  let healthMult = 1, speedMult = 1;
  let groanTimer = 3;
  let glowWasActive = false;

  const spits = [];
  for (let i = 0; i < SPIT_MAX; i++) spits.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, life: 0, damage: 0, trail: 0 });
  let spitsLive = 0;

  // ------------------------------------------------------------ spatial grid
  const WORLD_SIZE = CONFIG.world.size;
  const HALF = WORLD_SIZE / 2;
  const GCELL = 2;
  const GN = Math.ceil(WORLD_SIZE / GCELL);
  const gridHead = new Int16Array(GN * GN).fill(-1);
  const gridNext = new Int16Array(MAX).fill(-1);
  const gridUsed = new Int32Array(MAX);
  let gridUsedCount = 0;

  function cellOf(v) {
    const c = Math.floor((v + HALF) / GCELL);
    return c < 0 ? 0 : (c >= GN ? GN - 1 : c);
  }
  function gridInsert(z) {
    if (z.inGrid) return;
    const c = cellOf(z.position.x) + cellOf(z.position.z) * GN;
    if (gridHead[c] < 0) {
      if (gridUsedCount >= MAX) return;
      gridUsed[gridUsedCount++] = c;
    }
    gridNext[z.index] = gridHead[c];
    gridHead[c] = z.index;
    z.inGrid = true;
  }
  function gridRebuild() {
    for (let i = 0; i < gridUsedCount; i++) gridHead[gridUsed[i]] = -1;
    gridUsedCount = 0;
    for (let i = 0; i < MAX; i++) pool[i].inGrid = false;
    for (let i = 0; i < list.length; i++) if (list[i].alive) gridInsert(list[i]);
  }

  // ------------------------------------------------------------ helpers
  function groundY(x, z) {
    const w = game.world;
    return w && w.heightAt ? w.heightAt(x, z) : 0;
  }

  function hideSlot(i) {
    const o = i * 16;
    for (let m = 0; m < allMeshes.length; m++) zeroMatrix(allMeshes[m].instanceMatrix.array, o);
    glowArr[i * 3] = 0; glowArr[i * 3 + 1] = 0; glowArr[i * 3 + 2] = 0;
  }

  function markAllDirty() {
    for (let m = 0; m < allMeshes.length; m++) allMeshes[m].instanceMatrix.needsUpdate = true;
    glowAttr.needsUpdate = true;
  }

  function setColors(z) {
    const i = z.index, def = z.def;
    if (z.boss) {
      // dark bruised hide, near-black flayed torso and legs, burning eyes
      _c1.set(def.color);
      mHeadMesh.setColorAt(i, _c1); mArmL.setColorAt(i, _c1); mArmR.setColorAt(i, _c1);
      _c2.set('#2b1d29'); mTorsoMesh.setColorAt(i, _c2);
      _c2.set('#1b1520'); mLegL.setColorAt(i, _c2); mLegR.setColorAt(i, _c2);
      _c1.set(def.eye).multiplyScalar(3.2); mEyes.setColorAt(i, _c1);
      mSac.setColorAt(i, _c1);
      for (let m = 0; m < allMeshes.length; m++) allMeshes[m].instanceColor.needsUpdate = true;
      return;
    }
    const v = 0.82 + Math.random() * 0.3;
    _c1.set(def.color).multiplyScalar(v);                 // skin
    mHeadMesh.setColorAt(i, _c1);
    mArmL.setColorAt(i, _c1); mArmR.setColorAt(i, _c1);
    _c2.set(CLOTH[(Math.random() * CLOTH.length) | 0]).lerp(_c1, 0.3);   // shirt
    mTorsoMesh.setColorAt(i, _c2);
    _c2.set(CLOTH[(Math.random() * CLOTH.length) | 0]).multiplyScalar(0.7).lerp(_c1, 0.12);   // trousers
    mLegL.setColorAt(i, _c2); mLegR.setColorAt(i, _c2);
    _c1.set(def.eye).multiplyScalar(2.4);
    mEyes.setColorAt(i, _c1);
    _c1.copy(toxic).multiplyScalar(1.5 + Math.random() * 0.3);
    mSac.setColorAt(i, _c1);
    for (let m = 0; m < allMeshes.length; m++) allMeshes[m].instanceColor.needsUpdate = true;
  }

  function setEyeColor(z, r, g, b) {
    mEyes.setColorAt(z.index, _c1.setRGB(r, g, b));
    mEyes.instanceColor.needsUpdate = true;
  }

  function charColors(z) {
    _c1.setRGB(0.07, 0.06, 0.055);
    for (let m = 0; m < bodyMeshes.length; m++) {
      bodyMeshes[m].setColorAt(z.index, _c1);
      bodyMeshes[m].instanceColor.needsUpdate = true;
    }
    mSac.setColorAt(z.index, _c1); mSac.instanceColor.needsUpdate = true;
  }

  function removeAt(i) {
    const z = list[i];
    z.active = false; z.alive = false; z.state = 'dead';
    hideSlot(z.index);
    const last = list.pop();
    if (i < list.length) list[i] = last;
  }

  // ------------------------------------------------------------ spawn / clear
  function spawn(type, pos) {
    const def = DEFS[type] || DEFS.walker;
    const shape = SHAPES[def.id] || SHAPES.walker;
    let z = null;
    for (let i = 0; i < MAX; i++) if (!pool[i].active) { z = pool[i]; break; }
    if (!z) {
      // pool exhausted: recycle the oldest corpse
      let best = -1, bestT = -1;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.alive && c.state === 'dying' && c.stateTime > bestT) { bestT = c.stateTime; best = i; }
      }
      if (best < 0) return null;
      z = list[best];
      removeAt(best);
    }
    const player = game.player;
    const pp = player && player.position;
    if (pos) z.position.set(pos.x, 0, pos.z);
    else if (pp) { const a = Math.random() * TAU; z.position.set(pp.x + Math.cos(a) * 32, 0, pp.z + Math.sin(a) * 32); }
    else z.position.set(0, 0, 0);
    z.position.y = groundY(z.position.x, z.position.z);

    z.type = def.id; z.def = def; z.shape = shape;
    z.maxHealth = def.health * healthMult; z.health = z.maxHealth;
    z.radius = def.radius; z.height = def.height;
    z.alive = true; z.active = true; z.state = 'spawning';
    z.yaw = pp ? Math.atan2(-(pp.x - z.position.x), -(pp.z - z.position.z)) : Math.random() * TAU;
    z.vx = 0; z.vz = 0; z.kx = 0; z.kz = 0;
    z.speed = def.speed * speedMult * (0.88 + Math.random() * 0.24);
    z.phase = Math.random() * TAU; z.moveFrac = 0; z.age = 0; z.seed = Math.random() * 100;
    z.stateTime = 0; z.rise = -def.height; z.fall = 0; z.fallSign = 1; z.sink = 0; z.flinch = 0;
    z.attackT = 0; z.nextAttack = Math.min(0.45, 0.5 / def.attackRate); z.attackAnim = 0; z.windup = 0; z.barricadeT = 0;
    z.slowT = 0; z.slowMult = 1; z.stunT = 0;
    z.air = false; z.vy = 0; z.leapCd = 1 + Math.random() * 1.5; z.belowT = 0;
    z.wallT = 0; z.reachT = 0; z.reachClear = true;
    z.lungeT = 0; z.lungeCd = 1.5 + Math.random() * 2.5;
    z.spitCd = 1 + Math.random() * 1.5; z.spitAnim = 0; z.los = false; z.losT = Math.random() * 0.4;
    z.burnT = 0; z.burnLevel = 0; z.emberAcc = 0; z.ash = false; z.headless = false;
    z.kY = def.height / BASE_HEIGHT;
    z.ws = def.scale * shape.w;
    z.hs = def.scale * shape.head;
    z.hsY = z.kY * shape.head;
    z.headR = 0.19 * z.hs + 0.02;
    z.hx = z.position.x; z.hy = z.position.y - 1; z.hz = z.position.z;
    z.spawnT = SPAWN_T; z.fallT = FALL_T; z.lieT = 2.4; z.igniteT = 0; z.igniteDps = 0;
    z.boss = def.id === 'boss';
    z.enraged = false; z.ab = 'idle'; z.abT = 0; z.abDur = 0; z.abHit = false;
    z.cdCharge = 4.5; z.cdSlam = 3; z.cdSummon = 11; z.cdThrow = 0; z.cdAny = 2.5; z.highT = 0;
    z.cdx = 0; z.cdz = -1; z.chargeSpeed = 0; z.impactDone = false; z.killSent = false;
    z.handX = z.position.x; z.handY = z.position.y; z.handZ = z.position.z;
    z.pw = 0; z.tw = 0; z.pk = 6;
    if (z.boss) {
      z.spawnT = BOSS_SPAWN_T; z.rise = -def.height;
      z.speed = def.speed * speedMult;
      z.losT = 0;
    }

    setColors(z);
    list.push(z);
    aliveCount++;
    gridInsert(z);

    // dirt burst where it breaks the surface
    const px = z.position.x, py = z.position.y, pz = z.position.z;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU, r = Math.random() * z.radius;
      dust.emit(px + Math.cos(a) * r, py + 0.05, pz + Math.sin(a) * r,
        Math.cos(a) * (0.6 + Math.random() * 1.2), 1.8 + Math.random() * 2.2, Math.sin(a) * (0.6 + Math.random() * 1.2),
        0.55 + Math.random() * 0.35, 0.2, 0.15, 0.1, 9.5);
    }
    return z;
  }

  function clear() {
    for (let i = 0; i < MAX; i++) {
      const z = pool[i];
      z.active = false; z.alive = false; z.state = 'dead';
      hideSlot(i);
    }
    list.length = 0;
    aliveCount = 0;
    for (let i = 0; i < SPIT_MAX; i++) { spits[i].active = false; zeroMatrix(aSpit, i * 16); }
    spitsLive = 0;
    mSpit.instanceMatrix.needsUpdate = true;
    embers.clear(); dust.clear(); bigEmbers.clear();
    clearBossProps();
    gridRebuild();
    markAllDirty();
  }

  // ------------------------------------------------------------ night control
  function startNight(n) {
    wave = CONFIG.wave(Math.max(1, n | 0));
    waveTotal = wave.total;
    remainingToSpawn = wave.total;
    healthMult = wave.healthMult;
    speedMult = wave.speedMult;
    spawnTimer = 3;
    spawning = true;
    groanTimer = 2.5;
  }

  function startBurn(z) {
    if (!z.alive) return;
    z.alive = false; aliveCount--;
    z.state = 'burning'; z.stateTime = 0;
    z.burnT = 0.7 + Math.random() * 1.4;
    z.burnLevel = 0; z.rise = 0; z.windup = 0; z.attackAnim = 0;
    setEyeColor(z, 3.0, 1.2, 0.2);
    if (z.boss) {
      // the King smoulders a lot longer, but the sun still takes him: no reward
      z.burnT = (1.2 + Math.random() * 0.6) * BOSS_BURN_MULT;
      z.ab = 'idle'; z.tw = 0;
      hideTelegraphs();
      if (boss === z) {
        boss = null;
        bar.hideT = 1.2;
        game.emit('bossBurned', { zombie: z, position: z.position.clone() });
        game.emit('toast', 'THE HOLLOW KING BURNS IN THE DAWN');
        sfx('death', z.position.x, z.position.y, z.position.z);
      }
    }
  }

  function endNight() {
    spawning = false;
    remainingToSpawn = 0;
    for (let i = 0; i < list.length; i++) startBurn(list[i]);
  }

  function pickType(mix) {
    let total = 0;
    for (const k in mix) if (DEFS[k] && mix[k] > 0) total += mix[k];
    let r = Math.random() * total;
    for (const k in mix) {
      if (!DEFS[k] || !(mix[k] > 0)) continue;
      r -= mix[k];
      if (r <= 0) return k;
    }
    return 'walker';
  }

  function pickSpawnPoint() {
    const world = game.world, player = game.player;
    if (!world || !world.randomSpawnPoint) return null;
    const pp = player && player.position;
    let best = null, bestScore = -Infinity;
    const fx = pp ? -Math.sin(player.yaw || 0) : 0, fz = pp ? -Math.cos(player.yaw || 0) : -1;
    for (let t = 0; t < 4; t++) {
      const p = world.randomSpawnPoint(28, 60);
      if (!p) continue;
      if (!pp) return p;
      const dx = p.x - pp.x, dz = p.z - pp.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.3) return p;                 // outside the view cone
      const score = d * 0.02 - dot;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  // ------------------------------------------------------------ damage / death
  function kill(z, info) {
    z.alive = false; aliveCount--;
    z.state = 'dying'; z.stateTime = 0; z.ash = false;
    z.windup = 0; z.attackAnim = 0; z.lungeT = 0; z.rise = Math.max(z.rise, -z.height * 0.3);
    let sign = 1;
    if (info && info.dir) {
      const f = info.dir.x * -Math.sin(z.yaw) + info.dir.z * -Math.cos(z.yaw);
      sign = f > 0 ? -1 : 1;
    } else if (Math.random() < 0.35) sign = -1;
    z.fallSign = sign;
    const headshot = !!(info && info.headshot);
    z.headless = headshot && !z.boss;     // the King keeps his crowned head for the long fall
    if (z.igniteT > 1.2) z.igniteT = 1.2;  // a burning corpse smoulders a moment longer
    setEyeColor(z, 0.02, 0.02, 0.02);
    if (z.headless) {
      for (let i = 0; i < 10; i++) {
        dust.emit(z.hx, z.hy, z.hz, (Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3,
          0.5 + Math.random() * 0.3, 0.32, 0.03, 0.04, 10);
      }
    }
    if (z.boss) bossDeath(z);
    const position = z.position.clone();
    const source = info ? info.source : undefined;
    game.emit('zombieKilled', { zombie: z, headshot, type: z.type, position, boss: z.boss, source });
    if (z.boss && !z.killSent) {
      z.killSent = true;
      game.emit('bossKilled', { zombie: z, position: position.clone(), source });
    }
  }

  function damage(z, amount, info) {
    if (!z || !z.alive || !(amount > 0)) return false;
    const source = info ? info.source : undefined;
    if (z.boss && source === 'bullet') {
      const cw = game.weapons && game.weapons.current;
      if (cw && cw.id === 'gatling') amount *= BOSS_GATLING_MULT;
    }
    z.health -= amount;
    const burn = source === 'fire';        // damage-over-time and flame ticks: no blood, no shove
    if (z.boss) z.flinch = Math.max(z.flinch, burn ? 0.1 : 0.3);
    else z.flinch = burn ? Math.max(z.flinch, 0.25) : 1;
    const pos = z.position;
    let dir = info && info.dir;
    if (!dir) {
      const pp = game.player && game.player.position;
      if (pp) _v2.set(pos.x - pp.x, 0, pos.z - pp.z); else _v2.set(0, 0, 1);
      if (_v2.lengthSq() < 1e-6) _v2.set(0, 0, 1);
      dir = _v2.normalize();
    }
    if (!burn) {
      const imp = Math.min(2.6, (amount / z.maxHealth) * 6) * (z.boss ? BOSS_KNOCK : (z.type === 'brute' ? 0.25 : 1));
      z.kx += dir.x * imp; z.kz += dir.z * imp;
      const w = game.weapons;
      if (w && w.spawnBlood) {
        const pt = info && info.point ? info.point : _v1.set(pos.x, pos.y + z.height * 0.7, pos.z);
        try { w.spawnBlood(pt, dir); } catch (e) { /* fx only */ }
      }
    }
    if (z.health <= 0) {
      z.health = 0;
      kill(z, { dir, headshot: !!(info && info.headshot), source });
      return true;
    }
    if (z.boss && !z.enraged && z.health < z.maxHealth * BC.enrageAt) enrage(z);
    return false;
  }

  // Damage-over-time burn. Does not touch the dawn 'burning' state machine: the zombie keeps
  // chasing while it takes dps * dt through damage(z, dmg, { source: 'fire' }).
  function ignite(z, dps, seconds) {
    if (!z || !z.alive || !(seconds > 0) || !(dps > 0)) return;
    if (z.igniteT > 0) z.igniteDps = Math.max(z.igniteDps, dps);
    else { z.igniteDps = dps; z.emberAcc = Math.random(); }
    z.igniteT = Math.max(z.igniteT, seconds);
  }

  function igniteTick(z, dt) {
    z.igniteT -= dt;
    if (z.igniteT < 0) z.igniteT = 0;
    const pos = z.position;
    const big = z.boss ? 3 : 1;
    z.emberAcc += dt * (z.alive ? 12 : 6) * big;
    while (z.emberAcc >= 1) {
      z.emberAcc -= 1;
      const a = Math.random() * TAU, r = Math.random() * z.radius * 0.85;
      const hh = z.state === 'dying' ? 0.5 : z.height * 0.85;
      embers.emit(pos.x + Math.cos(a) * r, pos.y + 0.15 + Math.random() * hh, pos.z + Math.sin(a) * r,
        (Math.random() - 0.5) * 0.8 + z.vx * 0.3, 1.3 + Math.random() * 1.9, (Math.random() - 0.5) * 0.8 + z.vz * 0.3,
        0.4 + Math.random() * 0.45, 2.5, 0.7 + Math.random() * 0.55, 0.1, -0.8);
    }
    if (z.alive && z.igniteDps > 0) damage(z, z.igniteDps * dt, fireInfo);
  }

  // ------------------------------------------------------------ queries
  const hitResult = { zombie: null, point: new THREE.Vector3(), distance: 0, headshot: false };

  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const fx = ox - cx, fy = oy - cy, fz = oz - cz;
    const b = fx * dx + fy * dy + fz * dz;
    const c = fx * fx + fy * fy + fz * fz - r * r;
    if (c > 0 && b > 0) return -1;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t < 0 ? 0 : t;
  }

  function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
    if (y1 <= y0) return -1;
    const fx = ox - cx, fz = oz - cz;
    const a = dx * dx + dz * dz;
    const c = fx * fx + fz * fz - r * r;
    let t0, t1;
    if (a > 1e-9) {
      const b = fx * dx + fz * dz;
      const disc = b * b - a * c;
      if (disc < 0) return -1;
      const sq = Math.sqrt(disc);
      t0 = (-b - sq) / a; t1 = (-b + sq) / a;
    } else {
      if (c > 0) return -1;
      t0 = -Infinity; t1 = Infinity;
    }
    let ty0, ty1;
    if (dy > 1e-9 || dy < -1e-9) {
      ty0 = (y0 - oy) / dy; ty1 = (y1 - oy) / dy;
      if (ty0 > ty1) { const s = ty0; ty0 = ty1; ty1 = s; }
    } else {
      if (oy < y0 || oy > y1) return -1;
      ty0 = -Infinity; ty1 = Infinity;
    }
    let tIn = t0 > ty0 ? t0 : ty0;
    if (tIn < 0) tIn = 0;
    const tOut = t1 < ty1 ? t1 : ty1;
    if (tIn > tOut) return -1;
    return tIn;
  }

  function raycast(origin, dir, maxDist) {
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
    let bestT = maxDist, best = null, bestHead = false;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (!z.alive) continue;
      const pos = z.position;
      // coarse reject against a bounding sphere
      const mx = pos.x - ox, my = pos.y + z.height * 0.5 - oy, mz = pos.z - oz;
      const t = mx * dx + my * dy + mz * dz;
      const br = z.height * 0.6 + 0.7;
      if (t < -br || t - br > bestT) continue;
      if (mx * mx + my * my + mz * mz - t * t > br * br) continue;

      const tHead = z.headless ? -1 : raySphere(ox, oy, oz, dx, dy, dz, z.hx, z.hy, z.hz, z.headR);
      const bx = pos.x + (z.hx - pos.x) * 0.4, bz = pos.z + (z.hz - pos.z) * 0.4;
      const tBody = rayCylinder(ox, oy, oz, dx, dy, dz, bx, bz, z.radius * 0.92, pos.y, z.hy - z.headR * 0.55);
      let tHit = -1, head = false;
      if (tHead >= 0 && (tBody < 0 || tHead <= tBody + 0.1)) { tHit = tHead; head = true; }
      else if (tBody >= 0) tHit = tBody;
      if (tHit >= 0 && tHit < bestT) { bestT = tHit; best = z; bestHead = head; }
    }
    if (!best) return null;
    hitResult.zombie = best;
    hitResult.distance = bestT;
    hitResult.headshot = bestHead;
    hitResult.point.set(ox + dx * bestT, oy + dy * bestT, oz + dz * bestT);
    return hitResult;
  }

  function inRadius(pos, r, out) {
    out.length = 0;
    const span = r + 1.6;
    if (span > 24) {
      for (let i = 0; i < list.length; i++) {
        const z = list[i];
        if (!z.alive) continue;
        const dx = z.position.x - pos.x, dz = z.position.z - pos.z, rr = r + z.radius;
        if (dx * dx + dz * dz <= rr * rr && Math.abs(z.position.y - pos.y) <= r + z.height) out.push(z);
      }
      return out;
    }
    const x0 = cellOf(pos.x - span), x1 = cellOf(pos.x + span);
    const z0 = cellOf(pos.z - span), z1 = cellOf(pos.z + span);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        let j = gridHead[gx + gz * GN];
        while (j >= 0) {
          const z = pool[j];
          if (z.alive) {
            const dx = z.position.x - pos.x, dz = z.position.z - pos.z, rr = r + z.radius;
            if (dx * dx + dz * dz <= rr * rr && Math.abs(z.position.y - pos.y) <= r + z.height) out.push(z);
          }
          j = gridNext[j];
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------ spit projectiles
  function fireSpit(z, px, py, pz, player) {
    let s = null, idx = -1;
    for (let i = 0; i < SPIT_MAX; i++) if (!spits[i].active) { s = spits[i]; idx = i; break; }
    if (!s) return;
    const def = z.def;
    const sx = z.hx - Math.sin(z.yaw) * 0.25, sy = z.hy, sz = z.hz - Math.cos(z.yaw) * 0.25;
    let tx = px, ty = py + 1.0, tz = pz;
    let dx = tx - sx, dz = tz - sz;
    let t = Math.sqrt(dx * dx + dz * dz) / def.spitSpeed;
    if (t < 0.25) t = 0.25;
    const pv = player && player.velocity;
    if (pv) { tx += pv.x * t * 0.55; tz += pv.z * t * 0.55; dx = tx - sx; dz = tz - sz; }
    s.active = true; spitsLive++;
    s.x = sx; s.y = sy; s.z = sz;
    s.vx = dx / t; s.vz = dz / t; s.vy = (ty - sy) / t + 0.5 * SPIT_G * t;
    s.sx = z.position.x; s.sy = z.position.y + 1; s.sz = z.position.z;
    s.life = 0; s.damage = def.spitDamage; s.trail = 0;
    z.spitAnim = 1;
    void idx;
  }

  function splash(x, y, z) {
    for (let i = 0; i < 12; i++) {
      embers.emit(x, y + 0.05, z, (Math.random() - 0.5) * 4.5, 0.8 + Math.random() * 3, (Math.random() - 0.5) * 4.5,
        0.3 + Math.random() * 0.35, toxic.r * 1.8, toxic.g * 1.8, toxic.b * 1.8, 9);
    }
  }

  function updateSpits(dt, player, world) {
    if (spitsLive <= 0) return;
    const pp = player && player.position;
    const pr = (player && player.radius) || CONFIG.player.radius;
    for (let i = 0; i < SPIT_MAX; i++) {
      const s = spits[i];
      if (!s.active) continue;
      const ox = s.x, oy = s.y, oz = s.z;
      s.life += dt;
      s.vy -= SPIT_G * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      let hit = false;
      if (pp && player.alive !== false) {
        const top = pp.y + (player.eyeHeight || 1.6) + 0.1;
        const cy = s.y < pp.y + 0.1 ? pp.y + 0.1 : (s.y > top ? top : s.y);
        const dx = s.x - pp.x, dy = s.y - cy, dz = s.z - pp.z, rr = pr + 0.3;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          hit = true;
          if (player.damage) player.damage(s.damage, _v1.set(s.sx, s.sy, s.sz));
        }
      }
      if (!hit) {
        const g = groundY(s.x, s.z);
        if (s.y <= g + 0.05) { hit = true; s.y = g + 0.05; }
      }
      if (!hit && world && world.raycast) {
        const dx = s.x - ox, dy = s.y - oy, dz = s.z - oz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len > 1e-5) {
          _v1.set(ox, oy, oz); _v2.set(dx / len, dy / len, dz / len);
          const r = world.raycast(_v1, _v2, len);
          if (r && r.collider) { hit = true; s.x = r.point.x; s.y = r.point.y; s.z = r.point.z; }
        }
      }
      const o = i * 16;
      if (hit || s.life > 6) {
        splash(s.x, s.y, s.z);
        s.active = false; spitsLive--;
        zeroMatrix(aSpit, o);
      } else {
        const sc = 1 + Math.sin(s.life * 30) * 0.18;
        zeroMatrix(aSpit, o);
        aSpit[o] = sc; aSpit[o + 5] = sc; aSpit[o + 10] = sc;
        aSpit[o + 12] = s.x; aSpit[o + 13] = s.y; aSpit[o + 14] = s.z; aSpit[o + 15] = 1;
        s.trail -= dt;
        if (s.trail <= 0) {
          s.trail = 0.035;
          embers.emit(s.x, s.y, s.z, (Math.random() - 0.5) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.6,
            0.3, toxic.r * 1.2, toxic.g * 1.2, toxic.b * 1.2, 2);
        }
      }
    }
    mSpit.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ per-state updates
  function updateSpawning(z, dt) {
    z.stateTime += dt;
    let t = z.stateTime / z.spawnT;
    if (t >= 1) { t = 1; z.state = 'chase'; }
    const e = 1 - (1 - t) * (1 - t);
    z.rise = -(z.height * 0.95) * (1 - e);
    z.phase += dt * 9;
    if (z.boss && t < 1) {
      // the ground heaves: heavier dirt, a rumble on the camera
      const n = Math.random() < dt * 40 ? 2 : 0;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, r = z.radius * (0.6 + Math.random() * 0.9);
        dust.emit(z.position.x + Math.cos(a) * r, z.position.y + 0.05, z.position.z + Math.sin(a) * r,
          Math.cos(a) * 1.6, 2 + Math.random() * 3, Math.sin(a) * 1.6, 0.8, 0.18, 0.13, 0.09, 9.5);
      }
      shakeNear(z.position, 0.15 * dt, 40);
    }
    if (t < 1 && Math.random() < dt * 22) {
      const a = Math.random() * TAU;
      dust.emit(z.position.x + Math.cos(a) * z.radius * 0.8, z.position.y + 0.05, z.position.z + Math.sin(a) * z.radius * 0.8,
        Math.cos(a) * 0.9, 1.2 + Math.random() * 1.6, Math.sin(a) * 0.9, 0.5, 0.2, 0.15, 0.1, 9.5);
    }
  }

  function updateDying(z, dt) {
    z.stateTime += dt;
    const FT = z.fallT;
    const p = z.stateTime >= FT ? 1 : z.stateTime / FT;
    let ang;
    if (z.boss && !z.ash) {
      // stagger, sink to the knees, then topple like a felled tree
      if (p < 0.38) {
        const q = p / 0.38;
        ang = Math.sin(q * PI * 1.5) * 0.1 * (1 - q * 0.5);
        z.rise = -z.height * 0.16 * q;
      } else {
        const q = (p - 0.38) / 0.62;
        ang = q * q * HALF_PI;
      }
      if (p >= 1) {
        const b = z.stateTime - FT;
        if (b < 0.35) ang -= Math.sin(b / 0.35 * PI) * 0.05;
        if (!z.impactDone) { z.impactDone = true; bossImpact(z); }
      }
      if (z.stateTime < FT + BOSS_LIE_T * 0.7) {
        z.emberAcc += dt * 26;
        while (z.emberAcc >= 1) {
          z.emberAcc -= 1;
          const a = Math.random() * TAU, r = Math.random() * z.height * 0.5;
          embers.emit(z.position.x + Math.cos(a) * r, z.position.y + 0.3 + Math.random() * 1.4, z.position.z + Math.sin(a) * r,
            (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6,
            0.9 + Math.random() * 1.1, 2.6, 0.5 + Math.random() * 0.4, 0.1, -0.5);
        }
      }
    } else {
      ang = p * p * HALF_PI;
      if (p >= 1) {
        const b = z.stateTime - FT;       // small settle bounce
        if (b < 0.25) ang -= Math.sin(b / 0.25 * PI) * 0.07;
      }
      if (z.rise < 0) z.rise = Math.min(0, z.rise + dt * 2);
    }
    z.fall = z.fallSign * ang;
    const pos = z.position;
    const damp = Math.exp(-5 * dt);
    z.kx *= damp; z.kz *= damp;
    pos.x += z.kx * dt; pos.z += z.kz * dt;
    if (z.ash) z.burnLevel = Math.max(0, 1 - z.stateTime / 0.7);
    const lie = z.ash ? 0.15 : z.lieT, sinkDur = z.ash ? 0.7 : (z.boss ? 2.6 : 1.5);
    const st = z.stateTime - FT - lie;
    if (st > 0) {
      const s = st / sinkDur;
      z.sink = s * s * (0.5 * z.ws + 0.45);
      if (s >= 1) return true;
    }
    return false;
  }

  function updateBurning(z, dt) {
    z.stateTime += dt;
    z.burnLevel = Math.min(1, z.stateTime / 0.35);
    z.phase += dt * 13;
    z.moveFrac = 0.6;
    const pos = z.position;
    z.yaw += Math.sin(z.age * 7 + z.seed) * 3 * dt;
    const sp = 0.7;
    pos.x += -Math.sin(z.yaw) * sp * dt; pos.z += -Math.cos(z.yaw) * sp * dt;
    const world = game.world;
    if (world && world.resolveCircle) world.resolveCircle(pos, z.radius, z.height);
    pos.y = world && world.floorAt ? world.floorAt(pos.x, pos.z, z.radius * 0.7, pos.y, 0.5) : groundY(pos.x, pos.z);
    z.emberAcc += dt * 9 * (z.boss ? 3 : 1);
    while (z.emberAcc >= 1) {
      z.emberAcc -= 1;
      const a = Math.random() * TAU, r = Math.random() * z.radius * 0.8;
      embers.emit(pos.x + Math.cos(a) * r, pos.y + 0.3 + Math.random() * z.height * 0.8, pos.z + Math.sin(a) * r,
        (Math.random() - 0.5) * 0.9, 1.1 + Math.random() * 1.8, (Math.random() - 0.5) * 0.9,
        0.55 + Math.random() * 0.55, 2.4, 0.85 + Math.random() * 0.5, 0.12, -0.6);
    }
    if (z.stateTime >= z.burnT) {
      z.state = 'dying'; z.stateTime = 0; z.ash = true; z.fallSign = -1;
      z.kx = 0; z.kz = 0;
      charColors(z);
      setEyeColor(z, 0.02, 0.02, 0.02);
      for (let i = 0; i < 10; i++) {
        dust.emit(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 0.4 + Math.random() * z.height * 0.7, pos.z + (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6,
          0.7 + Math.random() * 0.4, 0.09, 0.085, 0.08, 5);
        embers.emit(pos.x, pos.y + 0.5 + Math.random() * z.height * 0.5, pos.z,
          (Math.random() - 0.5) * 2.4, 1 + Math.random() * 2.4, (Math.random() - 0.5) * 2.4,
          0.5 + Math.random() * 0.5, 2.6, 0.9, 0.12, 1.5);
      }
    }
  }

  function hasLineOfSight(z, px, py, pz, dist, world) {
    if (!world || !world.raycast) return true;
    _v1.set(z.position.x, z.position.y + z.height * 0.85, z.position.z);
    _v2.set(px - _v1.x, py + 1.1 - _v1.y, pz - _v1.z);
    const len = _v2.length();
    if (len < 0.5) return true;
    _v2.multiplyScalar(1 / len);
    const r = world.raycast(_v1, _v2, len);
    return !(r && r.distance < len - 0.7);
  }

  // Melee needs an unobstructed line chest-to-chest: no clawing through walls or barricades.
  // Only solid colliders block (terrain is ignored so slopes never cancel a strike).
  function strikeClear(z, px, py, pz, world) {
    if (!world || !world.raycast) return true;
    _v1.set(z.position.x, z.position.y + Math.min(z.height * 0.62, 1.2), z.position.z);
    _v2.set(px - _v1.x, py + 1.0 - _v1.y, pz - _v1.z);
    const len = _v2.length();
    if (len < 0.3) return true;
    _v2.multiplyScalar(1 / len);
    const r = world.raycast(_v1, _v2, len);
    return !(r && r.collider && r.distance < len - 0.05);
  }

  function updateChase(z, dt, player, world, px, py, pz, pr, playerAlive) {
    const def = z.def, sh = z.shape, pos = z.position;
    const dxp = px - pos.x, dzp = pz - pos.z;
    const dist = Math.sqrt(dxp * dxp + dzp * dzp) || 0.0001;
    const ndx = dxp / dist, ndz = dzp / dist;
    let dirX = ndx, dirZ = ndz;
    // Close in on a straight line, unless a wall just stopped us: then keep following the flow
    // field around it instead of grinding against the wall the player is standing behind.
    const wallAvoid = z.wallT > 0;
    if (wallAvoid) z.wallT -= dt;
    if ((dist > 3.2 || wallAvoid) && world && world.flowDir && world.flowDir(pos.x, pos.z, _flow)) {
      const fl = Math.sqrt(_flow.x * _flow.x + _flow.z * _flow.z);
      if (fl > 1e-4) { dirX = _flow.x / fl; dirZ = _flow.z / fl; }
    }
    const dy = py - pos.y;
    const stunned = z.stunT > 0;
    if (stunned) z.stunT -= dt;
    if (z.slowT > 0) z.slowT -= dt;
    // the boss reaches as far as the bat reaches him (no risk-free bat kiting just outside his swing)
    const near = !stunned && playerAlive && dist < (z.boss ? def.reach + z.radius * 0.6 + pr : def.reach + pr * 0.5) && dy > -2.2 && dy < 2.8;
    if (near) {
      z.reachT -= dt;
      if (z.reachT <= 0) { z.reachT = 0.3; z.reachClear = strikeClear(z, px, py, pz, world); }
    } else { z.reachT = 0; z.reachClear = true; }
    const inReach = near && z.reachClear;
    let speed = z.speed;
    let facePlayer = inReach;
    let accel = 7;

    // spitter: hold at range with line of sight and lob
    if (def.spitRange && !stunned) {
      z.losT -= dt;
      if (z.losT <= 0) {
        z.losT = 0.4 + Math.random() * 0.25;
        z.los = playerAlive && dist < def.spitRange && hasLineOfSight(z, px, py, pz, dist, world);
      }
      if (z.spitAnim > 0) z.spitAnim = Math.max(0, z.spitAnim - dt * 2.6);
      if (z.los && dist < def.spitRange * 0.85 && dist > def.reach + 1.2) {
        speed = 0; facePlayer = true;
        z.spitCd -= dt;
        if (z.spitCd <= 0) {
          z.spitCd = def.spitCooldown * (0.85 + Math.random() * 0.3);
          fireSpit(z, px, py, pz, player);
        }
      } else if (z.spitCd < 0.6) z.spitCd = 0.6;
    }

    // climbers: a player who got up high gets followed. Runners leap almost at once, walkers and
    // spitters only after milling about underneath for a while; brutes stay on the ground.
    if (z.leapCd > 0) z.leapCd -= dt;
    if (!z.air && playerAlive && !stunned && z.type !== 'brute' && !z.boss && dy > 1.3 && dist < 10) z.belowT += dt;
    else if (z.belowT > 0) z.belowT = Math.max(0, z.belowT - dt * 0.5);
    const leapWait = z.type === 'runner' ? 0.5 : 5.5 + (z.seed % 3);
    if (!z.air && z.belowT > leapWait && z.leapCd <= 0 && dist > 0.8 && dist < 10 && dy > 1.3 && dy < 6.5 &&
        !(world && world.ceilingAt && world.ceilingAt(pos.x, pos.z, z.radius, pos.y + z.height * 0.5) < py + 0.5)) {   // open sky only
      const H = dy + 0.9, G = 20;
      z.vy = Math.sqrt(2 * G * H);
      const t = z.vy / G + Math.sqrt(2 * 0.9 / G);
      const reachD = Math.max(0, dist - 0.6);
      z.vx = ndx * reachD / t; z.vz = ndz * reachD / t;
      z.air = true; z.leapCd = 3 + Math.random() * 2.5; z.belowT = 0;
      game.emit('zombieGroan', { zombie: z, position: pos });
    }

    // runner: short lunges when closing in
    if (z.type === 'runner') {
      if (z.lungeT > 0) { z.lungeT -= dt; speed *= 1.85; accel = 16; }
      else {
        z.lungeCd -= dt;
        if (z.lungeCd <= 0 && dist > 3 && dist < 8.5 && playerAlive) {
          z.lungeT = 0.5; z.lungeCd = 2.4 + Math.random() * 2.6;
        }
      }
    }

    if (inReach) speed *= 0.25;
    if (dist < z.radius + pr + 0.15) speed = 0;
    if (!playerAlive) speed *= 0.3;
    speed *= 1 - (z.boss ? 0.2 : 0.7) * z.flinch;
    if (z.slowT > 0) speed *= (z.slowMult > 0 ? z.slowMult : 1);
    if (stunned) speed = 0;

    // separation from neighbours
    let sepX = 0, sepZ = 0;
    const cx = cellOf(pos.x), cz = cellOf(pos.z);
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      if (gz < 0 || gz >= GN) continue;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= GN) continue;
        let j = gridHead[gx + gz * GN];
        while (j >= 0) {
          const o = pool[j];
          if (o !== z && o.alive) {
            const ex = pos.x - o.position.x, ez = pos.z - o.position.z;
            const minD = (z.radius + o.radius) * 0.95;
            const d2 = ex * ex + ez * ez;
            if (d2 < minD * minD) {
              if (d2 > 1e-6) {
                const d = Math.sqrt(d2);
                const push = (minD - d) / minD * (o.radius / z.radius);
                sepX += ex / d * push; sepZ += ez / d * push;
              } else {
                sepX += Math.cos(z.seed) * 0.5; sepZ += Math.sin(z.seed) * 0.5;
              }
            }
          }
          j = gridNext[j];
        }
      }
    }

    const tvx = dirX * speed + sepX * SEP_FORCE, tvz = dirZ * speed + sepZ * SEP_FORCE;
    const a = z.air ? 0 : Math.min(1, dt * accel);   // no steering mid-leap
    z.vx += (tvx - z.vx) * a; z.vz += (tvz - z.vz) * a;
    const damp = Math.exp(-6 * dt);
    z.kx *= damp; z.kz *= damp;
    // cap the step at just under one radius so fast lunges cannot tunnel through thin walls at low frame rates
    let mvx = (z.vx + z.kx) * dt, mvz = (z.vz + z.kz) * dt;
    const mvl = Math.sqrt(mvx * mvx + mvz * mvz), mvMax = z.radius * 0.9;
    if (mvl > mvMax) { const ms = mvMax / mvl; mvx *= ms; mvz *= ms; }
    pos.x += mvx; pos.z += mvz;

    // walls, barricades, shoreline
    let onBarricade = false;
    if (world && world.resolveCircle) {
      const pushed = world.resolveCircle(pos, z.radius, z.height);
      const col = pushed ? world.lastHitCollider : null;
      if (col && col.type === 'barricade') {
        onBarricade = true;
        z.barricadeT = 0.25;
        const loot = game.loot;
        if (loot && loot.damageBarricade) loot.damageBarricade(col.ref, CONFIG.barricadeDps * dt);
      } else if (col && !inReach && dist < 4.5) z.wallT = 0.7;
    }
    if (!onBarricade && z.barricadeT > 0) z.barricadeT -= dt;

    // never stand inside the player
    const ex = pos.x - px, ez = pos.z - pz;
    const minP = z.radius + pr;
    const e2 = ex * ex + ez * ez;
    if (e2 < minP * minP && Math.abs(dy) < 2 && e2 > 1e-6) {
      // yield only part of the overlap: player.js pushes the player back for the rest, so a horde can body-block
      const d = Math.sqrt(e2), k = ((minP - d) / d) * (z.type === 'brute' || z.boss ? 0.05 : 0.15);
      pos.x += ex * k; pos.z += ez * k;
    }

    // stand on rocks, crates and roofs; fall off edges; finish leaps
    const g = world && world.floorAt ? world.floorAt(pos.x, pos.z, z.radius * 0.7, pos.y, 0.5) : groundY(pos.x, pos.z);
    if (z.air) {
      const y0 = pos.y;
      z.vy -= 20 * dt; pos.y += z.vy * dt;
      if (z.vy > 0 && world && world.ceilingAt) {
        const ceil = world.ceilingAt(pos.x, pos.z, z.radius * 0.9, y0 + z.height - 0.05);
        if (pos.y + z.height > ceil) { pos.y = Math.max(y0, ceil - z.height); z.vy = 0; }
      }
      if (pos.y <= g && z.vy <= 0) { pos.y = g; z.air = false; z.vy = 0; }
      else if (pos.y < g) pos.y = g;
    } else if (g < pos.y - 0.6) { z.air = true; z.vy = 0; }
    else pos.y += (g - pos.y) * Math.min(1, dt * 14);

    // facing
    const actual = Math.sqrt(z.vx * z.vx + z.vz * z.vz);
    let targetYaw = z.yaw;
    if (facePlayer || dist < 2.2) targetYaw = Math.atan2(-ndx, -ndz);
    else if (actual > 0.25) targetYaw = Math.atan2(-z.vx, -z.vz);
    const dyaw = wrapAngle(targetYaw - z.yaw), maxStep = sh.turn * dt;
    z.yaw += dyaw > maxStep ? maxStep : (dyaw < -maxStep ? -maxStep : dyaw);

    // gait
    z.phase += actual * dt * (4.2 / z.kY) * sh.stride;
    let mf = actual / (z.speed || 1);
    if (mf > 1.4) mf = 1.4;
    z.moveFrac += (mf - z.moveFrac) * Math.min(1, dt * 8);

    // melee
    if (inReach) {
      z.state = 'attack';
      z.attackT += dt;
      z.windup = Math.min(1, z.attackT / z.nextAttack);
      if (z.attackT >= z.nextAttack) {
        z.attackT = 0; z.nextAttack = 1 / def.attackRate;
        z.attackAnim = 1; z.windup = 0;
        if (player && player.damage) player.damage(def.damage, pos);
        if ((z.type === 'brute' || z.boss) && player && player.addRecoil) player.addRecoil(z.boss ? 0.06 : 0.035, (Math.random() - 0.5) * 0.06);
        if (z.boss) shakeNear(pos, 0.03, 10);
        game.emit('zombieAttack', { zombie: z });
      }
    } else {
      if (z.attackT > 0) {
        z.attackT = Math.max(0, z.attackT - dt * 2);
        if (z.attackT === 0) z.nextAttack = Math.min(0.45, 0.5 / def.attackRate);
      }
      z.windup = Math.max(0, z.windup - dt * 4);
      if (z.barricadeT > 0) {
        z.state = 'attack';
        if (z.attackAnim <= 0) z.attackAnim = 1;
      } else z.state = (def.spitRange && speed === 0) ? 'spit' : 'chase';
    }
  }

  // ================================================================ THE HOLLOW KING
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndRange(r) { return Array.isArray(r) ? rnd(r[0], r[1]) : (r || 0); }

  function shakeNear(p, amount, range) {
    const pl = game.player;
    if (!pl || !pl.addShake || !pl.position) return;
    const dx = pl.position.x - p.x, dz = pl.position.z - p.z;
    const f = 1 - Math.sqrt(dx * dx + dz * dz) / range;
    if (f > 0) pl.addShake(amount * f);
  }

  function playerShielded() { return !!(game.skills && game.skills.invulnerable); }

  // ---- synthesized boss voice (own nodes on the shared audio graph)
  let noiseBuf = null;
  function sfxVoice(ctx, out, t, dur, type, f0, fp, f1, peak, lp, lfoHz) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(fp, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(Math.max(12, f1), t + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = lfoHz;
    const lg = ctx.createGain(); lg.gain.value = f0 * 0.07; lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.12);
    g.gain.setValueAtTime(peak, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  function sfxTone(ctx, out, t, dur, type, f0, f1, peak) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(12, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function sfxNoise(ctx, out, t, dur, peak, ftype, f0, f1, q) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05);
  }
  function sfx(kind, x, y, zz) {
    const A = game.audio, ctx = A && A.context, out = A && A.output;
    if (!ctx || !out || ctx.state !== 'running') return;
    let vol = 1;
    const pp = game.player && game.player.position;
    if (pp && x !== undefined) {
      const dx = x - pp.x, dy = y - pp.y, dz = zz - pp.z;
      vol = Math.max(0.16, Math.min(1, 1.2 - Math.sqrt(dx * dx + dy * dy + dz * dz) / 60));
    }
    try {
      const t = ctx.currentTime;
      if (!noiseBuf) {
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const bus = ctx.createGain(); bus.gain.value = vol; bus.connect(out);
      let len = 1;
      if (kind === 'roar' || kind === 'death' || kind === 'rage') {
        const death = kind === 'death', rage = kind === 'rage';
        len = death ? 3 : rage ? 2.1 : 1.8;
        const f0 = death ? 74 : 58, fp = death ? 66 : (rage ? 108 : 88), f1 = death ? 22 : 40;
        sfxVoice(ctx, bus, t, len, 'sawtooth', f0, fp, f1, 0.5, 640, 6.5);
        sfxVoice(ctx, bus, t, len, 'sawtooth', f0 * 1.51, fp * 1.49, f1 * 1.5, 0.2, 900, 7.4);
        sfxVoice(ctx, bus, t, len, 'square', f0 * 0.5, fp * 0.5, f1 * 0.5, 0.16, 280, 5);
        sfxNoise(ctx, bus, t, len * 0.85, 0.32, 'bandpass', 560, 240, 0.9);
        if (death) { sfxTone(ctx, bus, t + 2.2, 0.9, 'sine', 70, 24, 1.1); sfxNoise(ctx, bus, t + 2.2, 0.9, 0.7, 'lowpass', 500, 80, 0.7); }
      } else if (kind === 'slam' || kind === 'wall') {
        const big = kind === 'slam';
        len = big ? 1.1 : 0.8;
        sfxTone(ctx, bus, t, len, 'sine', big ? 92 : 80, 26, big ? 1.3 : 1.0);
        sfxNoise(ctx, bus, t, len, big ? 0.95 : 0.7, 'lowpass', 560, 90, 0.7);
        sfxNoise(ctx, bus, t, 0.28, 0.5, 'bandpass', 1700, 420, 1.2);
      } else if (kind === 'stomp') {
        len = 0.4;
        sfxTone(ctx, bus, t, 0.35, 'sine', 70, 34, 0.85);
        sfxNoise(ctx, bus, t, 0.3, 0.45, 'lowpass', 340, 90, 0.7);
      } else if (kind === 'throw') {
        len = 0.5;
        sfxNoise(ctx, bus, t, 0.45, 0.45, 'bandpass', 720, 240, 1.4);
        sfxVoice(ctx, bus, t, 0.4, 'sawtooth', 115, 120, 70, 0.22, 600, 9);
      } else if (kind === 'rock') {
        len = 0.6;
        sfxTone(ctx, bus, t, 0.45, 'sine', 120, 38, 0.9);
        sfxNoise(ctx, bus, t, 0.55, 0.7, 'lowpass', 1300, 180, 0.8);
      }
      setTimeout(() => { try { bus.disconnect(); } catch (e) { /* gone */ } }, (len + 0.5) * 1000);
    } catch (e) { /* never let a sound break the game */ }
  }

  // ---- pose control (targets are absolute rig angles; see writeInstance)
  function setPose(z, w, armL, armR, lean, head, splay, k) {
    z.tw = w; z.tArmL = armL; z.tArmR = armR; z.tLean = lean; z.tHead = head; z.tSplay = splay; z.pk = k;
  }
  function poseTick(z, dt) {
    if (z.tw > 0 && z.pw < 0.02) {
      z.pArmL = z.tArmL; z.pArmR = z.tArmR; z.pLean = z.tLean; z.pHead = z.tHead; z.pSplay = z.tSplay;
    }
    z.pw += (z.tw - z.pw) * Math.min(1, dt * (z.tw > z.pw ? z.pk : 4));
    if (z.pw < 0.001 && z.tw === 0) z.pw = 0;
    if (z.tw > 0) {
      const a = Math.min(1, dt * z.pk);
      z.pArmL += (z.tArmL - z.pArmL) * a; z.pArmR += (z.tArmR - z.pArmR) * a;
      z.pLean += (z.tLean - z.pLean) * a; z.pHead += (z.tHead - z.pHead) * a;
      z.pSplay += (z.tSplay - z.pSplay) * a;
    }
  }

  function turnTo(z, yaw, rate, dt) {
    const d = wrapAngle(yaw - z.yaw), m = rate * dt;
    z.yaw += d > m ? m : (d < -m ? -m : d);
  }

  function bossGround(z, world, dt, resolve) {
    const pos = z.position;
    if (resolve && world && world.resolveCircle) world.resolveCircle(pos, z.radius, z.height);
    const g = world && world.floorAt ? world.floorAt(pos.x, pos.z, z.radius * 0.7, pos.y, 0.5) : groundY(pos.x, pos.z);
    pos.y += (g - pos.y) * Math.min(1, dt * 12);
  }

  function emberBurst(x, y, z, n, spread, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = Math.random() * spread;
      bigEmbers.emit(x + Math.cos(a) * s * 0.3, y + Math.random() * up, z + Math.sin(a) * s * 0.3,
        Math.cos(a) * s, 1.5 + Math.random() * 4.5, Math.sin(a) * s,
        0.9 + Math.random() * 1.4, 2.8, 0.55 + Math.random() * 0.5, 0.12, 1.2);
    }
  }
  function dustRing(x, y, z, r, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, rr = r * (0.6 + Math.random() * 0.5);
      dust.emit(x + Math.cos(a) * rr, y + 0.1, z + Math.sin(a) * rr,
        Math.cos(a) * speed * (0.5 + Math.random()), 1 + Math.random() * 2.6, Math.sin(a) * speed * (0.5 + Math.random()),
        0.6 + Math.random() * 0.6, 0.2, 0.16, 0.11, 8);
    }
  }

  function pushPlayer(dx, dz, speed) {
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    knock.x = dx / l * speed; knock.z = dz / l * speed; knock.t = PLAYER_KNOCK_T;
  }

  function hideTelegraphs() {
    laneMesh.visible = false; warnRing.visible = false; warnFill.visible = false; heldRock.visible = false;
  }

  function clearBossProps() {
    boss = null; decoZ = null;
    crownGroup.visible = false; backGroup.visible = false;
    hideTelegraphs();
    shock.active = false; waveRing.visible = false;
    for (let i = 0; i < ROCK_MAX; i++) { rocks[i].active = false; rocks[i].mesh.visible = false; }
    rocksLive = 0;
    knock.t = 0; summonN = 0; summonDue = null;
    hideBarNow();
  }

  function pickBossPoint() {
    const world = game.world, pp = game.player && game.player.position;
    if (!world || !world.randomSpawnPoint) return null;
    let last = null;
    for (let t = 0; t < 8; t++) {
      const p = world.randomSpawnPoint(30, 45);
      if (!p) continue;
      last = p;
      if (!pp) return p;
      const dx = p.x - pp.x, dz = p.z - pp.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d >= 30 && d <= 45) return p;
    }
    return last;
  }

  function spawnBoss(pos) {
    if (boss && boss.alive) return boss;
    const z = spawn('boss', pos || pickBossPoint());
    if (!z) return null;
    const night = Math.max(game.night | 0, BC.firstNight);
    const scale = (1 + BC.healthPerNight * Math.max(0, night - BC.firstNight)) * (night <= BC.firstNight ? BOSS_FIRST_NIGHT_HP : 1);
    z.maxHealth = z.def.health * healthMult * scale; z.health = z.maxHealth;
    boss = z; decoZ = z;
    haloMat.color.setRGB(3.2, 0.25, 0.18); haloMat.opacity = 0.85;
    dustRing(z.position.x, z.position.y, z.position.z, z.radius * 1.4, 40, 3.5);
    shakeNear(z.position, 0.035, 70);
    sfx('roar', z.position.x, z.position.y, z.position.z);
    showBar(z, night);
    game.emit('bossSpawn', { zombie: z });
    game.emit('toast', 'THE HOLLOW KING RISES');
    return z;
  }

  function enrage(z) {
    z.enraged = true;
    z.speed *= 1.3;
    z.cdCharge = Math.min(z.cdCharge, 1.2);
    z.cdSummon = Math.min(z.cdSummon, 4);
    setEyeColor(z, 7, 0.5, 0.3);
    haloMat.color.setRGB(6, 0.5, 0.25); haloMat.opacity = 1;
    emberBurst(z.position.x, z.position.y + z.height * 0.5, z.position.z, 50, 5, z.height * 0.5);
    shakeNear(z.position, 0.03, 40);
    sfx('rage', z.position.x, z.position.y, z.position.z);
    game.emit('bossEnraged', { zombie: z });
    game.emit('toast', 'THE HOLLOW KING IS ENRAGED');
  }

  function bossDeath(z) {
    z.fallT = BOSS_FALL_T; z.lieT = BOSS_LIE_T; z.impactDone = false;
    z.ab = 'idle'; z.tw = 0; z.emberAcc = 0;
    z.kx *= 0.2; z.kz *= 0.2;
    hideTelegraphs();
    haloMat.opacity = 0;
    if (boss === z) boss = null;
    bar.hideT = 2.2;
    const p = z.position;
    emberBurst(p.x, p.y + z.height * 0.4, p.z, 110, 6, z.height * 0.7);
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * TAU, r = Math.random() * z.radius;
      embers.emit(p.x + Math.cos(a) * r, p.y + 0.4 + Math.random() * z.height, p.z + Math.sin(a) * r,
        Math.cos(a) * rnd(0.5, 3), rnd(1, 5), Math.sin(a) * rnd(0.5, 3), rnd(0.8, 2), 2.6, rnd(0.5, 1), 0.12, 0.6);
    }
    shakeNear(p, 0.05, 50);
    sfx('death', p.x, p.y, p.z);
    game.emit('toast', 'THE HOLLOW KING HAS FALLEN');
  }

  function bossImpact(z) {
    const p = z.position;
    // where the bulk of him hits the ground: half a body length along the fall
    const s = z.fallSign * z.height * 0.45;
    const fx = p.x + Math.sin(z.yaw) * s, fz = p.z + Math.cos(z.yaw) * s;
    dustRing(fx, p.y, fz, 1.6, 60, 4.5);
    emberBurst(fx, p.y + 0.3, fz, 50, 4, 0.6);
    shakeNear(p, 0.07, 45);
    sfx('slam', p.x, p.y, p.z);
  }

  function startAbility(z, ab, dur) {
    const cdm = z.enraged ? 0.6 : 1;
    z.ab = ab; z.abT = 0; z.abDur = dur; z.abHit = false;
    z.attackT = 0; z.windup = 0; z.state = 'chase';
    const p = z.position;
    if (ab === 'chargeWind') {
      z.cdCharge = rndRange(BC.charge.cooldown) * cdm;
      sfx('roar', p.x, p.y, p.z);
      game.emit('zombieGroan', { zombie: z, position: p });
    } else if (ab === 'slamWind') {
      z.cdSlam = rndRange(BC.slam.cooldown) * cdm;
      sfx('throw', p.x, p.y, p.z);
    } else if (ab === 'summonWind') {
      z.cdSummon = rndRange(BC.summon.cooldown) * cdm;
      sfx('roar', p.x, p.y, p.z);
      const want = Math.min(8, Math.max(0, BC.summon.count | 0));
      const sea = CONFIG.world.seaLevel + 0.3;
      summonN = 0;
      for (let k = 0; k < want; k++) {
        let x = p.x, zz = p.z;
        for (let t = 0; t < 4; t++) {
          const a = (k / want) * TAU + rnd(-0.35, 0.35), r = rnd(2.8, 4.6) * (1 - t * 0.2);
          x = p.x + Math.cos(a) * r; zz = p.z + Math.sin(a) * r;
          if (groundY(x, zz) > sea) break;
        }
        summonPts[summonN * 2] = x; summonPts[summonN * 2 + 1] = zz; summonN++;
      }
    } else if (ab === 'throwWind') {
      z.cdThrow = (z.enraged ? 2.6 : 3.6);
      heldRock.visible = true;
      dustRing(p.x, p.y, p.z, z.radius, 14, 1.5);
      sfx('throw', p.x, p.y, p.z);
    }
  }

  function endAbility(z) {
    z.ab = 'idle'; z.abT = 0; z.tw = 0; z.state = 'chase';
    z.cdAny = (z.enraged ? 0.9 : 1.6);
    hideTelegraphs();
  }

  function updateBoss(z, dt, player, world, px, py, pz, pr, playerAlive) {
    const pos = z.position;
    if (z.stunT > 0) z.stunT = Math.max(0, z.stunT - dt * (BOSS_STUN_RATE - 1));
    const kd = Math.exp(-8 * dt); z.kx *= kd; z.kz *= kd;
    const dxp = px - pos.x, dzp = pz - pos.z;
    const dist = Math.sqrt(dxp * dxp + dzp * dzp) || 1e-4;
    const dy = py - pos.y;
    z.cdCharge -= dt; z.cdSlam -= dt; z.cdSummon -= dt; z.cdThrow -= dt; z.cdAny -= dt;
    if (playerAlive && dy > 1.7 && dist < 45) z.highT += dt;
    else z.highT = Math.max(0, z.highT - dt * 0.5);
    z.losT -= dt;
    if (z.losT <= 0) { z.losT = 0.3; z.los = playerAlive && hasLineOfSight(z, px, py, pz, dist, world); }

    if (z.ab === 'idle') {
      updateChase(z, dt, player, world, px, py, pz, pr, playerAlive);
      z.tw = 0; poseTick(z, dt);
      if (!playerAlive || z.stunT > 0 || z.air || z.cdAny > 0 || z.attackT > 0.15) return;
      const level = dy > -1.6 && dy < 1.6;
      if (z.highT > HIGH_TIME && z.cdThrow <= 0 && dist > 1.2 && dist < 42 && z.los) startAbility(z, 'throwWind', z.enraged ? 0.7 : 0.95);
      else if (level && z.cdSlam <= 0 && dist < BC.slam.radius * 0.72) startAbility(z, 'slamWind', BC.slam.windup * (z.enraged ? 0.8 : 1));
      else if (level && z.cdCharge <= 0 && dist > 7 && dist < 30 && z.los) startAbility(z, 'chargeWind', BC.charge.windup * (z.enraged ? 0.8 : 1));
      else if (z.cdSummon <= 0 && dist < 38 && aliveCount < MAX_ALIVE - 3) startAbility(z, 'summonWind', 1.35);
      return;
    }

    const stunned = z.stunT > 0;
    if (stunned) z.stunT -= dt;
    if (stunned && z.ab === 'charge') { z.ab = 'stagger'; z.abT = 0; z.abDur = 0.8; laneMesh.visible = false; }
    z.abT += stunned ? 0 : dt;
    z.moveFrac += (0 - z.moveFrac) * Math.min(1, dt * 6);
    z.vx *= Math.exp(-8 * dt); z.vz *= Math.exp(-8 * dt);
    const toYaw = Math.atan2(-dxp, -dzp);
    const done = z.abT >= z.abDur;

    switch (z.ab) {
      case 'chargeWind': {
        if (z.abT < z.abDur * 0.65 && playerAlive) { z.cdx = dxp / dist; z.cdz = dzp / dist; }
        turnTo(z, Math.atan2(-z.cdx, -z.cdz), 6, dt);
        setPose(z, 1, 0.25, 0.15, 1.0, 1.0, 0.5, 8);
        // lane telegraph along the locked line
        const len = BC.charge.speed * (z.enraged ? 1.2 : 1) * BC.charge.time;
        const w = 2 * (z.radius + pr + 0.55), k = z.abT / z.abDur, locked = k >= 0.65;   // the real trample hit width
        laneMesh.visible = true;
        laneMesh.position.set(pos.x, pos.y + 0.14, pos.z);
        laneMesh.rotation.set(0, Math.atan2(-z.cdx, -z.cdz), 0);
        laneMesh.scale.set(w, 1, len);
        laneTex.repeat.set(1, len / (w * 1.1));
        laneTex.offset.y = (laneTex.offset.y + 1 - dt * (locked ? 3.5 : 1.2)) % 1;
        laneMat.opacity = locked ? 0.85 : 0.25 + 0.3 * k + 0.12 * Math.sin(z.age * 18);
        if (Math.random() < dt * 14) {
          const s = Math.random() < 0.5 ? -1 : 1;
          dust.emit(pos.x + Math.cos(z.yaw) * s * 0.5, pos.y + 0.05, pos.z - Math.sin(z.yaw) * s * 0.5,
            -z.cdx * 2.5 + rnd(-0.5, 0.5), 1 + Math.random(), -z.cdz * 2.5 + rnd(-0.5, 0.5), 0.5, 0.2, 0.15, 0.1, 9);
        }
        if (done) {
          z.ab = 'charge'; z.abT = 0; z.abDur = BC.charge.time; z.abHit = false;
          z.chargeSpeed = BC.charge.speed * (z.enraged ? 1.2 : 1);
          z.yaw = Math.atan2(-z.cdx, -z.cdz);
          shakeNear(pos, 0.02, 25);
          sfx('stomp', pos.x, pos.y, pos.z);
        }
        break;
      }
      case 'charge': {
        laneMat.opacity = Math.max(0, laneMat.opacity - dt * 2.5);
        if (laneMat.opacity <= 0.01) laneMesh.visible = false;
        setPose(z, 1, 0.4, 0.3, 1.1, 0.9, 0.35, 12);
        const tail = z.abDur - z.abT;
        const sp = z.chargeSpeed * (tail < 0.25 ? Math.max(0, tail / 0.25) : 1);
        let wall = false;
        const total = sp * dt, stepMax = z.radius * 0.8;
        const steps = Math.max(1, Math.ceil(total / stepMax)), step = total / steps;
        for (let s = 0; s < steps && !wall; s++) {
          const ox = pos.x, oz = pos.z;
          pos.x += z.cdx * step; pos.z += z.cdz * step;
          if (world && world.resolveCircle && world.resolveCircle(pos, z.radius, z.height)) {
            const col = world.lastHitCollider;
            if (col && col.type === 'barricade') {
              const loot = game.loot;
              if (loot && loot.damageBarricade) loot.damageBarricade(col.ref, 600);
            }
            // walls, buildings and rocks stop him dead; a tree trunk only does when hit square on
            const prog = (pos.x - ox) * z.cdx + (pos.z - oz) * z.cdz;
            if (prog < step * (col && col.type === 'tree' ? 0.12 : 0.45)) wall = true;
          }
        }
        z.vx = z.cdx * sp; z.vz = z.cdz * sp;
        z.phase += sp * dt * (4.2 / z.kY) * 0.9; z.moveFrac = 1.4;
        bossGround(z, world, dt, false);
        if (Math.random() < dt * 30) {
          dust.emit(pos.x + rnd(-0.8, 0.8), pos.y + 0.05, pos.z + rnd(-0.8, 0.8),
            -z.cdx * 1.5 + rnd(-1, 1), 1 + Math.random() * 2, -z.cdz * 1.5 + rnd(-1, 1), 0.6, 0.2, 0.15, 0.1, 8);
        }
        if (Math.random() < dt * 8) shakeNear(pos, 0.012, 22);
        // trample the player
        if (!z.abHit && playerAlive) {
          const ex = player.position.x - pos.x, ez = player.position.z - pos.z;
          const d = Math.sqrt(ex * ex + ez * ez), dyy = player.position.y - pos.y;
          if (d < z.radius + pr + 0.55 && dyy > -1.5 && dyy < 2.2 && !playerShielded()) {
            z.abHit = true;
            if (player.damage) player.damage(BC.charge.damage, pos);
            // thrown along the charge and away from its line
            const side = ex * -z.cdz + ez * z.cdx >= 0 ? 1 : -1;
            pushPlayer(z.cdx * 1.0 + -z.cdz * side * 0.55, z.cdz * 1.0 + z.cdx * side * 0.55, 15);
            if (player.addShake) player.addShake(0.06);
            if (player.addRecoil) player.addRecoil(0.09, side * 0.06);
            game.emit('zombieAttack', { zombie: z });
            z.ab = 'recover'; z.abT = 0; z.abDur = 0.8;
            break;
          }
        }
        if (wall) {
          z.ab = 'stagger'; z.abT = 0; z.abDur = 1.1;
          dustRing(pos.x + z.cdx * z.radius, pos.y + 0.6, pos.z + z.cdz * z.radius, 0.8, 26, 3);
          shakeNear(pos, 0.05, 30);
          sfx('wall', pos.x, pos.y, pos.z);
        } else if (done) { z.ab = 'recover'; z.abT = 0; z.abDur = 0.6; }
        break;
      }
      case 'stagger': {
        // dazed after hitting a wall: head lolls, arms hang. A window to unload into him.
        setPose(z, 1, 0.7 + Math.sin(z.age * 5) * 0.2, 0.6 - Math.sin(z.age * 5) * 0.2, 0.25, 1.1, 0.6, 5);
        z.yaw += Math.sin(z.age * 3.3) * 0.4 * dt;
        bossGround(z, world, dt, true);
        if (done) endAbility(z);
        break;
      }
      case 'slamWind': {
        turnTo(z, toYaw, 2.2, dt);
        setPose(z, 1, 3.4, 3.3, 0.1, 0.8, 0.28, 4.5);
        const k = Math.min(1, z.abT / z.abDur);
        const R = BC.slam.radius;
        // the shockwave is centred in front of him: draw the warning exactly where it will hit
        const wx = pos.x - Math.sin(z.yaw) * z.radius * 0.6, wz = pos.z - Math.cos(z.yaw) * z.radius * 0.6;
        warnRing.visible = true; warnFill.visible = true;
        warnRing.position.set(wx, pos.y + 0.16, wz); warnRing.scale.set(R, 1, R);
        warnFill.position.set(wx, pos.y + 0.15, wz); warnFill.scale.set(R * k, 1, R * k);
        warnMat.opacity = 0.35 + 0.45 * k + 0.15 * Math.sin(z.age * 20);
        warnFillMat.opacity = 0.18 + 0.25 * k;
        bossGround(z, world, dt, true);
        if (done) {
          const fx = pos.x - Math.sin(z.yaw) * z.radius * 0.6, fz = pos.z - Math.cos(z.yaw) * z.radius * 0.6;
          shock.active = true; shock.x = fx; shock.y = pos.y; shock.z = fz;
          shock.r = 0.4; shock.max = R; shock.t = 0; shock.hit = false; shock.damage = BC.slam.damage;
          warnRing.visible = false; warnFill.visible = false;
          dustRing(fx, pos.y, fz, 1.2, 46, 6);
          emberBurst(fx, pos.y + 0.2, fz, 34, 7, 0.4);
          shakeNear(pos, 0.07, 35);
          sfx('slam', fx, pos.y, fz);
          game.emit('bossSlam', { zombie: z, position: new THREE.Vector3(fx, pos.y, fz), radius: R });
          z.ab = 'slamRec'; z.abT = 0; z.abDur = 0.85;
        }
        break;
      }
      case 'slamRec': {
        setPose(z, 1, 1.5, 1.45, 1.05, 0.15, 0.4, 22);
        bossGround(z, world, dt, true);
        if (done) endAbility(z);
        break;
      }
      case 'summonWind': {
        setPose(z, 1, 2.8, 2.8, 0.05, 1.1, 0.95, 4);
        for (let k = 0; k < summonN; k++) {
          if (Math.random() < dt * 16) {
            const x = summonPts[k * 2], zz = summonPts[k * 2 + 1], g = groundY(x, zz);
            const a = Math.random() * TAU;
            dust.emit(x + Math.cos(a) * 0.3, g + 0.05, zz + Math.sin(a) * 0.3,
              Math.cos(a) * 0.8, 1.6 + Math.random() * 2, Math.sin(a) * 0.8, 0.6, 0.2, 0.15, 0.1, 9.5);
          }
        }
        if (Math.random() < dt * 6) shakeNear(pos, 0.008, 30);
        bossGround(z, world, dt, true);
        if (done) {
          summonDue = z;                    // spawned by resolveSummon() after the list loop
          z.ab = 'recover'; z.abT = 0; z.abDur = 0.6;
        }
        break;
      }
      case 'throwWind': {
        turnTo(z, toYaw, 6, dt);
        setPose(z, 1, 1.2, 3.7, 0.2, 0.65, 0.35, 6);
        heldRock.visible = true;
        heldRock.position.set(z.handX, z.handY, z.handZ);
        heldRock.rotation.set(z.age * 2, z.age * 1.3, 0);
        const sc = Math.min(1, 0.3 + z.abT / z.abDur);
        heldRock.scale.set(sc, sc, sc);
        bossGround(z, world, dt, true);
        if (done) {
          heldRock.visible = false;
          if (playerAlive) fireRock(z, player);
          z.ab = 'throwRec'; z.abT = 0; z.abDur = 0.5;
        }
        break;
      }
      case 'throwRec': {
        setPose(z, 1, 1.2, 1.3, 0.8, 0.4, 0.35, 20);
        bossGround(z, world, dt, true);
        if (done) endAbility(z);
        break;
      }
      default: {   // 'recover'
        z.tw = 0;
        bossGround(z, world, dt, true);
        if (done) endAbility(z);
      }
    }
    poseTick(z, dt);
  }

  // ---- slam shockwave: an expanding ring; standing on the ground when it passes hurts, a jump clears it
  function updateShock(dt, player, playerAlive) {
    if (!shock.active) return;
    shock.t += dt;
    shock.r += 17 * dt;
    const R = shock.max;
    if (!shock.hit && playerAlive) {
      const pp = player.position, pr = player.radius || CONFIG.player.radius;
      const dx = pp.x - shock.x, dz = pp.z - shock.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > R) shock.hit = true;                  // player centre outside the drawn ring is safe
      else if (shock.r >= d - pr) {
        shock.hit = true;
        const dyy = pp.y - shock.y;
        if (player.isGrounded !== false && dyy > -1.5 && dyy < 1.3 && !playerShielded()) {
          if (player.damage) player.damage(shock.damage, _v1.set(shock.x, shock.y, shock.z));
          pushPlayer(dx || 1, dz, 8);
          if (player.addShake) player.addShake(0.05);
        }
      }
    }
    const r = Math.min(shock.r, R);
    const fade = shock.r > R ? Math.max(0, 1 - (shock.r - R) / 3) : 1;
    waveRing.visible = fade > 0;
    waveRing.position.set(shock.x, shock.y + 0.18, shock.z);
    waveRing.scale.set(r, 1, r);
    waveMat.opacity = (1 - 0.5 * r / R) * fade;
    if (shock.r <= R) {
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * TAU;
        const x = shock.x + Math.cos(a) * r, zz = shock.z + Math.sin(a) * r;
        dust.emit(x, groundY(x, zz) + 0.1, zz, Math.cos(a) * 3, 1 + Math.random() * 1.6, Math.sin(a) * 3,
          0.4 + Math.random() * 0.3, 0.22, 0.17, 0.12, 8);
      }
    }
    if (fade <= 0) { shock.active = false; waveRing.visible = false; }
  }

  // ---- rubble
  function fireRock(z, player) {
    let s = null;
    for (let i = 0; i < ROCK_MAX; i++) if (!rocks[i].active) { s = rocks[i]; break; }
    if (!s) return;
    const pp = player.position;
    const sx = z.handX, sy = Math.max(z.handY, z.position.y + z.height * 0.8), sz = z.handZ;
    let tx = pp.x, ty = pp.y + 0.9, tz = pp.z;
    let dx = tx - sx, dz = tz - sz;
    let t = Math.sqrt(dx * dx + dz * dz) / 17;
    t = t < 0.7 ? 0.7 : (t > 2.1 ? 2.1 : t);
    const pv = player.velocity;
    if (pv) { tx += pv.x * t * 0.4; tz += pv.z * t * 0.4; dx = tx - sx; dz = tz - sz; }
    s.active = true; rocksLive++;
    s.x = sx; s.y = sy; s.z = sz;
    s.vx = dx / t; s.vz = dz / t; s.vy = (ty - sy) / t + 0.5 * ROCK_G * t;
    s.sx = z.position.x; s.sy = z.position.y + 1; s.sz = z.position.z;
    s.life = 0; s.trail = 0; s.spin = rnd(4, 9);
    s.mesh.visible = true; s.mesh.position.set(sx, sy, sz); s.mesh.scale.set(1, 1, 1);
    sfx('throw', sx, sy, sz);
    game.emit('bossThrow', { zombie: z });
  }

  function rockBurst(s, player, playerAlive, direct) {
    dustRing(s.x, s.y, s.z, 0.5, 26, 4);
    for (let i = 0; i < 8; i++) {
      bigEmbers.emit(s.x, s.y + 0.2, s.z, rnd(-3, 3), rnd(1, 4), rnd(-3, 3), rnd(0.3, 0.6), 0.5, 0.42, 0.36, 12);
    }
    shakeNear(_v1.set(s.x, s.y, s.z), 0.035, 18);
    sfx('rock', s.x, s.y, s.z);
    if (!direct && playerAlive && !playerShielded()) {
      const pp = player.position;
      const dx = pp.x - s.x, dy = pp.y + 0.8 - s.y, dz = pp.z - s.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < ROCK_SPLASH && player.damage) player.damage(ROCK_DAMAGE * 0.75 * (1 - d / ROCK_SPLASH) + 4, _v1.set(s.sx, s.sy, s.sz));
    }
  }

  function updateRocks(dt, player, world, playerAlive) {
    if (rocksLive <= 0) return;
    const pp = player && player.position;
    const pr = (player && player.radius) || CONFIG.player.radius;
    for (let i = 0; i < ROCK_MAX; i++) {
      const s = rocks[i];
      if (!s.active) continue;
      const ox = s.x, oy = s.y, oz = s.z;
      s.life += dt;
      s.vy -= ROCK_G * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      let hit = false, direct = false;
      if (pp && playerAlive) {
        const top = pp.y + (player.eyeHeight || 1.6) + 0.1;
        const cy = s.y < pp.y + 0.1 ? pp.y + 0.1 : (s.y > top ? top : s.y);
        const dx = s.x - pp.x, dy = s.y - cy, dz = s.z - pp.z, rr = pr + 0.6;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          hit = true; direct = true;
          if (!playerShielded() && player.damage) player.damage(ROCK_DAMAGE, _v1.set(s.sx, s.sy, s.sz));
          if (player.addShake) player.addShake(0.05);
        }
      }
      if (!hit) {
        const g = groundY(s.x, s.z);
        if (s.y <= g + 0.3) { hit = true; s.y = g + 0.3; }
      }
      if (!hit && world && world.raycast) {
        const dx = s.x - ox, dy = s.y - oy, dz = s.z - oz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len > 1e-5) {
          _v1.set(ox, oy, oz); _v2.set(dx / len, dy / len, dz / len);
          const r = world.raycast(_v1, _v2, len + 0.4);
          if (r && r.collider) { hit = true; s.x = r.point.x; s.y = r.point.y + 0.2; s.z = r.point.z; }
        }
      }
      if (hit || s.life > 6) {
        rockBurst(s, player, playerAlive, direct);
        s.active = false; rocksLive--; s.mesh.visible = false;
      } else {
        s.mesh.position.set(s.x, s.y, s.z);
        s.mesh.rotation.x += s.spin * dt; s.mesh.rotation.z += s.spin * 0.6 * dt;
        s.trail -= dt;
        if (s.trail <= 0) {
          s.trail = 0.03;
          dust.emit(s.x, s.y, s.z, rnd(-0.4, 0.4), rnd(0, 0.5), rnd(-0.4, 0.4), 0.45, 0.18, 0.15, 0.12, 2);
        }
      }
    }
  }

  function updatePlayerKnock(dt, player, world) {
    if (knock.t <= 0) return;
    if (!player || !player.position || player.alive === false) { knock.t = 0; return; }
    const f = knock.t / PLAYER_KNOCK_T;
    const pos = player.position;
    pos.x += knock.x * f * dt; pos.z += knock.z * f * dt;
    if (world && world.resolveCircle) world.resolveCircle(pos, player.radius || CONFIG.player.radius, (player.height || 1.7) - 0.08);
    knock.t -= dt;
  }

  // boss summons spawn here, outside update()'s list loop: spawn() can recycle a corpse with removeAt(), which would
  // swap an already-updated zombie (or the boss itself) into an index the loop has not reached yet
  function resolveSummon() {
    const z = summonDue;
    summonDue = null;
    if (!z || !z.alive) { summonN = 0; return; }
    const types = BC.summon.types && BC.summon.types.length ? BC.summon.types : ['walker'];
    let n = 0;
    for (let k = 0; k < summonN; k++) {
      if (aliveCount >= MAX_ALIVE) break;
      const t = types[(Math.random() * types.length) | 0];
      const add = spawn(t, _v1.set(summonPts[k * 2], 0, summonPts[k * 2 + 1]));
      if (add) n++;
    }
    summonN = 0;
    game.emit('bossSummon', { zombie: z, count: n });
  }

  function updateBossSchedule() {
    if (game.state !== 'playing' || game.phase !== 'night') return;
    const n = game.night | 0;
    if (n < BC.firstNight || bossNightDone === n) return;
    if (game.phaseTime < BOSS_AT_FRACTION * game.phaseDuration) return;
    if (boss) { bossNightDone = n; return; }
    if (spawnBoss()) bossNightDone = n;
  }

  // ---- boss health bar (DOM inside #hud; hud.js rebuilds #hud on init, so attach lazily)
  const BAR_CSS = `
.hk-bar{position:absolute;left:50%;top:138px;width:max(260px,min(580px,calc(100vw - 470px)));transform:translate(-50%,-10px);opacity:0;
  transition:opacity .4s ease,transform .4s ease;pointer-events:none;font-family:var(--display);color:var(--bone);line-height:1;
  text-shadow:0 1px 0 rgba(4,6,14,.9),0 0 10px rgba(4,6,14,.55);-webkit-font-smoothing:antialiased}
.hk-bar.on{opacity:1;transform:translate(-50%,0)}
.hk-bar *{box-sizing:border-box}
.hk-top{display:flex;align-items:baseline;gap:12px;margin-bottom:7px;white-space:nowrap}
.hk-name{font-size:19px;font-weight:800;letter-spacing:.24em;text-transform:uppercase}
.hk-sub{font:600 10px/1 var(--mono);letter-spacing:.24em;text-transform:uppercase;color:rgba(232,228,216,.55)}
.hk-pct{margin-left:auto;font:700 13px/1 var(--mono);font-variant-numeric:tabular-nums;letter-spacing:.08em}
.hk-track{position:relative;height:8px;background:var(--panel);border:1px solid var(--line);overflow:hidden;
  clip-path:polygon(0 0,100% 0,calc(100% - 6px) 100%,6px 100%)}
.hk-lag,.hk-fill{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:left center;will-change:transform}
.hk-lag{background:rgba(232,228,216,.7)}
.hk-fill{background:linear-gradient(90deg,#5e0b16,var(--blood));box-shadow:0 0 14px rgba(210,50,63,.65)}
.hk-tick{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--bone);opacity:.55}
.hk-bar.rage .hk-name,.hk-bar.rage .hk-sub{color:var(--ember)}
.hk-bar.rage .hk-fill{background:linear-gradient(90deg,var(--blood),var(--ember));animation:hk-pulse .55s ease-in-out infinite alternate}
.hk-bar.dead .hk-name{opacity:.6;text-decoration:line-through;text-decoration-thickness:2px}
@keyframes hk-pulse{from{filter:brightness(1)}to{filter:brightness(1.65)}}
@media (max-height:780px),(max-width:1180px){.hk-bar{top:116px}.hk-name{font-size:16px}}
@media (max-width:700px){.hk-bar{top:84px;left:14px;transform:translateY(-10px);width:calc(100vw - 200px);min-width:170px}
  .hk-bar.on{transform:none}.hk-name{font-size:13px;letter-spacing:.14em}.hk-sub{display:none}}
`;
  const bar = { el: null, fill: null, lag: null, pct: null, sub: null, shown: false, frac: 1, lagFrac: 1, lagHold: 0,
    lastFill: -1, lastLag: -1, lastPct: -1, rage: false, dead: false, hideT: 0 };

  function buildBar() {
    if (typeof document === 'undefined') return false;
    if (!document.getElementById('hk-bar-css')) {
      const st = document.createElement('style'); st.id = 'hk-bar-css'; st.textContent = BAR_CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'hk-bar';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="hk-top"><span class="hk-name"></span><span class="hk-sub"></span><span class="hk-pct">100%</span></div>' +
      '<div class="hk-track"><i class="hk-lag"></i><i class="hk-fill"></i><b class="hk-tick"></b></div>';
    el.querySelector('.hk-name').textContent = BC.name || 'The Hollow King';
    el.querySelector('.hk-tick').style.left = (BC.enrageAt * 100).toFixed(1) + '%';
    bar.el = el; bar.fill = el.querySelector('.hk-fill'); bar.lag = el.querySelector('.hk-lag');
    bar.pct = el.querySelector('.hk-pct'); bar.sub = el.querySelector('.hk-sub');
    return true;
  }
  function ensureBar() {
    if (!bar.el && !buildBar()) return false;
    const host = document.getElementById('hud');
    if (host && bar.el.parentNode !== host) host.appendChild(bar.el);
    return true;
  }
  function setBarClass(name, on) { if (bar.el) bar.el.classList.toggle(name, on); }
  function showBar(z, night) {
    if (!ensureBar()) return;
    bar.frac = 1; bar.lagFrac = 1; bar.lagHold = 0; bar.lastFill = -1; bar.lastLag = -1; bar.lastPct = -1;
    bar.rage = false; bar.dead = false; bar.hideT = 0; bar.shown = true;
    setBarClass('rage', false); setBarClass('dead', false);
    bar.sub.textContent = night > 0 ? 'Night ' + night : 'Abomination';
    setBarClass('on', true);
  }
  function hideBarNow() {
    bar.shown = false; bar.hideT = 0;
    if (bar.el) { setBarClass('on', false); setBarClass('rage', false); setBarClass('dead', false); }
  }
  function updateBar(dt) {
    if (!bar.shown || !bar.el) return;
    const frac = boss ? Math.max(0, Math.min(1, boss.health / boss.maxHealth)) : 0;
    if (frac < bar.frac - 1e-5) bar.lagHold = 0.5;
    bar.frac = frac;
    if (bar.lagFrac > frac) {
      if (bar.lagHold > 0) bar.lagHold -= dt;
      else bar.lagFrac = Math.max(frac, bar.lagFrac - dt * 0.6);
    } else bar.lagFrac = frac;
    if (Math.abs(frac - bar.lastFill) > 0.0005) { bar.lastFill = frac; bar.fill.style.transform = 'scaleX(' + frac.toFixed(4) + ')'; }
    if (Math.abs(bar.lagFrac - bar.lastLag) > 0.0005) { bar.lastLag = bar.lagFrac; bar.lag.style.transform = 'scaleX(' + bar.lagFrac.toFixed(4) + ')'; }
    const pct = frac > 0 ? Math.max(1, Math.ceil(frac * 100)) : 0;
    if (pct !== bar.lastPct) { bar.lastPct = pct; bar.pct.textContent = pct + '%'; }
    const rage = !!(boss && boss.enraged);
    if (rage !== bar.rage) {
      bar.rage = rage; setBarClass('rage', rage);
      bar.sub.textContent = rage ? 'Enraged' : bar.sub.textContent;
    }
    const dead = !boss;
    if (dead !== bar.dead) { bar.dead = dead; setBarClass('dead', dead); }
    if (bar.hideT > 0) { bar.hideT -= dt; if (bar.hideT <= 0) hideBarNow(); }
  }

  // ------------------------------------------------------------ instance matrices
  function writeInstance(z) {
    const sh = z.shape, kY = z.kY, ws = z.ws, o = z.index * 16;
    const pos = z.position;
    const st = z.state;
    const mf = z.moveFrac;
    const swing = Math.sin(z.phase);
    let lean = sh.lean + (z.lungeT > 0 ? 0.3 : 0) - z.flinch * 0.45 + Math.sin(z.phase * 2) * 0.03 * mf;
    let armL = sh.armBase + swing * sh.armSwing * mf;
    let armR = sh.armBase - swing * sh.armSwing * mf;
    let legL = -swing * sh.legSwing * mf, legR = swing * sh.legSwing * mf;
    let splay = sh.splay;
    let headPitch = sh.headPitch + z.flinch * 0.35;
    let headRoll = Math.sin(z.age * 1.7 + z.seed) * 0.13;
    let roll = swing * 0.06 * mf * sh.sway;
    let legSplay = 0;

    if (z.windup > 0) { armL += z.windup * 0.95; armR += z.windup * 0.8; lean -= z.windup * 0.18; }
    if (z.attackAnim > 0) { armL -= z.attackAnim * 0.95; armR -= z.attackAnim * 0.8; lean += z.attackAnim * 0.28; }
    if (z.spitAnim > 0) { headPitch -= z.spitAnim * 0.6; lean += z.spitAnim * 0.2; }
    if (z.pw > 0.001) {
      // boss ability poses (targets are absolute angles, blended in by pw)
      const w = z.pw;
      armL += (z.pArmL - armL) * w; armR += (z.pArmR - armR) * w;
      lean += (z.pLean - lean) * w; headPitch += (z.pHead - headPitch) * w;
      splay += (z.pSplay - splay) * w;
    }

    if (st === 'spawning') {
      const t = Math.min(1, z.stateTime / z.spawnT);
      const reach = 2.75 + Math.sin(z.phase) * 0.25;
      armL = reach + (armL - reach) * t * t;
      armR = reach - 0.3 + (armR - reach + 0.3) * t * t;
      lean = lean * t;
      headPitch += (1 - t) * 0.5;
    } else if (st === 'burning') {
      armL = 2.3 + Math.sin(z.age * 17 + z.seed) * 0.7;
      armR = 2.3 + Math.cos(z.age * 15 + z.seed) * 0.7;
      headPitch += 0.45; lean *= 0.4; splay += 0.25;
      roll += Math.sin(z.age * 11) * 0.12;
    } else if (st === 'dying') {
      const p = Math.min(1, z.stateTime / z.fallT);
      lean *= 1 - p;
      armL += (0.3 - armL) * p; armR += (0.15 - armR) * p;
      splay += p * 0.55; legSplay = p * 0.16;
      legL += (0.18 - legL) * p; legR += (-0.1 - legR) * p;
      headPitch *= 1 - p; headRoll = headRoll * (1 - p) + 0.3 * p; roll *= 1 - p;
    }

    const fall = z.fall;
    const sf = Math.sin(fall), cf = Math.cos(fall);
    const sy = Math.sin(z.yaw), cy = Math.cos(z.yaw);
    const baseY = pos.y + z.rise - z.sink + (fall !== 0 ? Math.abs(sf) * 0.13 * ws * sh.depth : 0);
    _mRoot.set(
      cy, sy * sf, sy * cf, pos.x,
      0, cf, -sf, baseY,
      -sy, cy * sf, cy * cf, pos.z,
      0, 0, 0, 1,
    );

    const legLen = LEG_L * kY;
    const torsoH = TORSO_H * kY;
    const hipY = legLen * (1 - 0.04 * mf) + Math.abs(Math.cos(z.phase)) * 0.035 * mf * kY;
    const hipX = 0.125 * ws;
    const legS = ws * sh.legThick;

    // legs hang from the root
    localTR(_mLocal, -hipX, hipY, 0, legL, -legSplay);
    _mPart.multiplyMatrices(_mRoot, _mLocal);
    writeScaled(_mPart, legS, kY, legS, aLegL, o);
    localTR(_mLocal, hipX, hipY, 0, legR, legSplay);
    _mPart.multiplyMatrices(_mRoot, _mLocal);
    writeScaled(_mPart, legS, kY, legS, aLegR, o);

    // torso
    localTR(_mLocal, 0, hipY, 0, -lean, roll);
    _mTorso.multiplyMatrices(_mRoot, _mLocal);
    writeScaled(_mTorso, ws, kY, ws * sh.depth, aTorso, o);

    // arms
    const armS = ws * sh.armThick;
    const shoulderX = 0.27 * ws + 0.06 * armS + 0.01;
    const shoulderY = torsoH - 0.07 * kY;
    localTR(_mLocal, -shoulderX, shoulderY, 0, armL, -splay);
    _mPart.multiplyMatrices(_mTorso, _mLocal);
    writeScaled(_mPart, armS, kY * sh.armLen, armS, aArmL, o);
    localTR(_mLocal, shoulderX, shoulderY, 0, armR, splay);
    _mPart.multiplyMatrices(_mTorso, _mLocal);
    writeScaled(_mPart, armS, kY * sh.armLen, armS, aArmR, o);

    // head + eyes
    localTR(_mLocal, 0, torsoH, -0.03 * ws, headPitch, headRoll);
    _mPart.multiplyMatrices(_mTorso, _mLocal);
    const e = _mPart.elements;
    const hc = HEAD_H * 0.5 * z.hsY;
    z.hx = e[12] + e[4] * hc; z.hy = e[13] + e[5] * hc; z.hz = e[14] + e[6] * hc;
    if (z.headless) { zeroMatrix(aHead, o); zeroMatrix(aEyes, o); }
    else {
      writeScaled(_mPart, z.hs, z.hsY, z.hs, aHead, o);
      writeScaled(_mPart, z.hs, z.hsY, z.hs, aEyes, o);
    }
    if (z === decoZ) {
      crownGroup.matrix.fromArray(aHead, o); crownGroup.matrixWorldNeedsUpdate = true;
      backGroup.matrix.fromArray(aTorso, o); backGroup.matrixWorldNeedsUpdate = true;
      // right hand (bottom of the arm box) for the rubble it rips up and throws
      const hl = -ARM_L * 0.92;
      z.handX = aArmR[o + 4] * hl + aArmR[o + 12];
      z.handY = aArmR[o + 5] * hl + aArmR[o + 13];
      z.handZ = aArmR[o + 6] * hl + aArmR[o + 14];
    }

    // spitter throat sac
    if (sh.sac) {
      let sc = ws * (1 + Math.sin(z.age * 5 + z.seed) * 0.12);
      if (z.alive && z.spitCd < 0.6 && z.los) sc *= 1 + (0.6 - z.spitCd) * 0.9;
      sc *= 1 - z.spitAnim * 0.45;
      localTR(_mLocal, 0, torsoH * 0.9, -(TORSO_D * 0.5 * ws * sh.depth + 0.05), 0, 0);
      _mPart.multiplyMatrices(_mTorso, _mLocal);
      writeScaled(_mPart, sc, sc, sc, aSac, o);
    } else zeroMatrix(aSac, o);

    // glow: hit flash / dawn burn
    const gi = z.index * 3;
    let gr = 0, gg = 0, gb = 0;
    if (z.burnLevel > 0) {
      const fl = z.burnLevel * (0.65 + 0.35 * Math.sin(z.age * 31 + z.seed) * Math.sin(z.age * 13.7));
      gr = 1.9 * fl; gg = 0.62 * fl; gb = 0.08 * fl;
    } else if (z.igniteT > 0) {
      const lv = z.igniteT > 0.5 ? 1 : z.igniteT * 2;
      const fl = lv * (0.55 + 0.45 * Math.sin(z.age * 29 + z.seed) * Math.sin(z.age * 11.3));
      gr = 1.5 * fl; gg = 0.5 * fl; gb = 0.06 * fl;
    } else if (z.flinch > 0) {
      const f = z.flinch * z.flinch;
      gr = 0.4 * f; gg = 0.07 * f; gb = 0.05 * f;
    }
    if (z.boss && z.alive) {
      // smouldering hide; a pulsing furnace glow once enraged, a pre-attack flare during wind-ups
      const tele = z.ab === 'chargeWind' || z.ab === 'slamWind' || z.ab === 'summonWind' || z.ab === 'throwWind' ? 0.022 + 0.016 * Math.sin(z.age * 22) : 0;
      const rage = z.enraged ? 0.028 + 0.02 * Math.sin(z.age * 7.5) : 0;
      gr += rage + tele; gg += (rage + tele) * 0.1; gb += (rage + tele) * 0.06;
    }
    glowArr[gi] = gr; glowArr[gi + 1] = gg; glowArr[gi + 2] = gb;
    return gr > 0;
  }

  // ------------------------------------------------------------ update
  function update(dt) {
    const player = game.player, world = game.world;
    const pp = player && player.position;
    const px = pp ? pp.x : 0, py = pp ? pp.y : 0, pz = pp ? pp.z : 0;
    const pr = (player && player.radius) || CONFIG.player.radius;
    const playerAlive = !!pp && player.alive !== false;

    // night spawner
    if (spawning && wave && remainingToSpawn > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        if (aliveCount < wave.maxAlive) {
          const z = spawn(pickType(wave.mix), pickSpawnPoint());
          if (z) { remainingToSpawn--; spawnTimer = wave.spawnInterval * (0.75 + Math.random() * 0.5); }
          else spawnTimer = 0.5;
        } else spawnTimer = 0.25;
      }
    }

    // ambient groans
    groanTimer -= dt;
    if (groanTimer <= 0) {
      groanTimer = 1.6 + Math.random() * 2.6;
      if (aliveCount > 0) {
        const start = (Math.random() * list.length) | 0;
        for (let k = 0; k < list.length; k++) {
          const z = list[(start + k) % list.length];
          if (!z.alive) continue;
          const dx = z.position.x - px, dz = z.position.z - pz;
          if (dx * dx + dz * dz < 45 * 45) { game.emit('zombieGroan', { zombie: z }); break; }
        }
      }
    }

    let glowActive = false;
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];
      z.age += dt;
      if (z.flinch > 0) z.flinch = Math.max(0, z.flinch - dt * 4.5);
      if (z.attackAnim > 0) z.attackAnim = Math.max(0, z.attackAnim - dt * 3.5);
      if (z.igniteT > 0) igniteTick(z, dt);
      const st = z.state;
      if (st === 'dying') {
        if (updateDying(z, dt)) { removeAt(i); continue; }
      } else if (st === 'burning') updateBurning(z, dt);
      else if (st === 'spawning') updateSpawning(z, dt);
      else if (z.boss) updateBoss(z, dt, player, world, px, py, pz, pr, playerAlive);
      else updateChase(z, dt, player, world, px, py, pz, pr, playerAlive);
      if (z.pw > 0 && !z.alive) { z.tw = 0; poseTick(z, dt); }
      if (writeInstance(z)) glowActive = true;
    }

    if (summonDue) resolveSummon();
    updateBossSchedule();
    updateSpits(dt, player, world);
    updateShock(dt, player, playerAlive);
    updateRocks(dt, player, world, playerAlive);
    updatePlayerKnock(dt, player, world);
    if (decoZ && !(decoZ.active && decoZ.boss)) decoZ = null;
    crownGroup.visible = !!decoZ && !decoZ.headless;
    backGroup.visible = !!decoZ;
    if (boss && !boss.alive) boss = null;
    updateBar(dt);
    embers.update(dt);
    dust.update(dt);
    bigEmbers.update(dt);
    gridRebuild();

    for (let m = 0; m < allMeshes.length; m++) allMeshes[m].instanceMatrix.needsUpdate = true;
    if (glowActive || glowWasActive) glowAttr.needsUpdate = true;
    glowWasActive = glowActive;
  }

  function reset() {
    clear();
    wave = null; spawning = false; spawnTimer = 0;
    remainingToSpawn = 0; waveTotal = 0;
    healthMult = 1; speedMult = 1;
    groanTimer = 3;
    glowWasActive = true;
    bossNightDone = -1;
    haloMat.color.setRGB(3.2, 0.25, 0.18); haloMat.opacity = 0.85;
    ensureBar(); hideBarNow();
  }

  clear();

  return {
    list,
    get aliveCount() { return aliveCount; },
    get remainingToSpawn() { return remainingToSpawn; },
    get waveTotal() { return waveTotal; },
    get boss() { return boss; },
    startNight, endNight, spawn, clear,
    raycast, damage, inRadius, ignite, spawnBoss,
    update, reset,
  };
}
