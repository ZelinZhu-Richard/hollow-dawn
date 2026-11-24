// HOLLOW DAWN — build.js : scrap construction (spike trap, sun lamp, campfire, auto-turret).
// Self-contained: own meshes, FX pools, DOM widget (left edge) and Web Audio blips.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };

// ------------------------------------------------------------------ tuning
const PIECES = [
  { id: 'trap',     name: 'Spike Trap',  cost: 3,  cap: 12, count: 0, foot: 1.15, range: 0,  health: 900 },
  { id: 'lamp',     name: 'Sun Lamp',    cost: 6,  cap: 6,  count: 0, foot: 0.5,  range: 8,  health: 200 },
  { id: 'campfire', name: 'Campfire',    cost: 5,  cap: 3,  count: 0, foot: 0.8,  range: 4,  health: 120 },
  { id: 'turret',   name: 'Auto-Turret', cost: 12, cap: 3,  count: 0, foot: 0.7,  range: 24, health: 250 },
];
const T = {
  placeDist: 3, popTime: 0.38,
  trapHalf: 1.2, trapDps: 35, trapTick: 0.25, trapSlowT: 0.4, trapSlowM: 0.5,
  lampR: 8, lampDps: 9, lampTick: 0.5, lampSlowT: 0.3, lampSlowM: 0.7,
  fireR: 4, fireHeal: 5, fireLife: 90,
  turretR: 24, turretRate: 6, turretDmg: 16, turretRounds: 240, turretSalvage: 4, salvageDist: 2,
  pivotY: 1.12, muzzle: 0.92,
  zombieDps: 20, zombieReach: 1.2,
};
const ICONS = {
  trap: '<path d="M2 18.5h18M3.5 18.5 6 9l2.5 9.5M8.5 18.5 11 5l2.5 13.5M13.5 18.5 16 9l2.5 9.5"/>',
  lamp: '<path d="M11 20V9M7 20h8M6 3.5h10l-2 5H8zM4.5 12 3 14M17.5 12l1.5 2M11 11.5v2"/>',
  campfire: '<path d="M11 2.5c3 3 4.2 5.2 4.2 7.6a4.2 4.2 0 0 1-8.4 0c0-1.6 1-2.6 1.8-4.4.9.8 1.5 1.5 1.9 2.6.6-1.6.9-3.6.5-5.8zM3.5 19.5l15-3.5M3.5 16l15 3.5"/>',
  turret: '<path d="M4 6.5h9v4.5H4zM13 8h7M13 9.8h5.5M8.5 11v2.5M8.5 13.5 3.5 20M8.5 13.5l5 6.5M8.5 13.5V20"/>',
};

// ------------------------------------------------------------------ geometry baking (vertex-coloured, one draw call per piece body)
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bp = new THREE.Vector3(), _bs = new THREE.Vector3(), _bc = new THREE.Color();
function bake(parts) {
  const gs = []; let n = 0;
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    _bq.setFromEuler(_be.set(p.rx, p.ry, p.rz));
    g.applyMatrix4(_bm.compose(_bp.set(p.x, p.y, p.z), _bq, _bs.set(p.sx, p.sy, p.sz)));
    gs.push(g); n += g.attributes.position.count; p.g.dispose();
  }
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (let i = 0; i < gs.length; i++) {
    const a = gs[i].attributes.position; pos.set(a.array.subarray(0, a.count * 3), o * 3);
    _bc.set(parts[i].c);
    for (let k = 0; k < a.count; k++) { col[(o + k) * 3] = _bc.r; col[(o + k) * 3 + 1] = _bc.g; col[(o + k) * 3 + 2] = _bc.b; }
    o += a.count; gs[i].dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals(); out.computeBoundingSphere();
  return out;
}

function buildGeos() {
  let seed = 90210; const sr = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
  const K = (r, h, s = 4) => new THREE.ConeGeometry(r, h, s);
  const L = [];
  const add = (g, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => L.push({ g, c, x, y, z, rx, ry, rz, sx, sy, sz });
  const flush = () => { const g = bake(L); L.length = 0; return g; };
  const G = {};

  // spike trap: riveted plate, rust frame, 25 scrap spikes
  add(B(2.4, 0.05, 2.4), '#2a2f37', 0, 0.025, 0);
  add(B(2.4, 0.09, 0.12), '#7a4428', 0, 0.05, 1.14); add(B(2.4, 0.09, 0.12), '#7a4428', 0, 0.05, -1.14);
  add(B(0.12, 0.09, 2.4), '#6a3a22', 1.14, 0.05, 0); add(B(0.12, 0.09, 2.4), '#6a3a22', -1.14, 0.05, 0);
  add(B(0.1, 0.07, 3.0), '#4a5059', 0, 0.04, 0, 0, Math.PI / 4, 0); add(B(0.1, 0.07, 3.0), '#4a5059', 0, 0.04, 0, 0, -Math.PI / 4, 0);
  const spikeCols = ['#aab4c4', '#8d99ae', '#b06a3c'];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const h = 0.32 + sr() * 0.24;
    add(K(0.065, h, 4), spikeCols[(i * 2 + j) % 3], -0.9 + i * 0.45 + (sr() - 0.5) * 0.1, 0.04 + h / 2, -0.9 + j * 0.45 + (sr() - 0.5) * 0.1,
      (sr() - 0.5) * 0.5, sr() * 3, (sr() - 0.5) * 0.5);
  }
  G.trap = flush();

  // sun lamp: plate, battery, pole, floodlight head with scrap solar panel
  add(B(0.62, 0.06, 0.62), '#3b424d', 0, 0.03, 0);
  add(B(0.86, 0.04, 0.08), '#2a2f37', 0, 0.07, 0, 0, 0.78, 0); add(B(0.86, 0.04, 0.08), '#2a2f37', 0, 0.07, 0, 0, -0.78, 0);
  add(B(0.3, 0.22, 0.2), '#45523c', 0.16, 0.17, 0.13); add(B(0.31, 0.05, 0.21), '#d9a521', 0.16, 0.2, 0.13);
  add(C(0.045, 0.06, 3.0, 6), '#8d99ae', 0, 1.56, 0);
  add(C(0.075, 0.075, 0.1, 6), '#7a4428', 0, 1.1, 0); add(C(0.07, 0.07, 0.1, 6), '#7a4428', 0, 2.2, 0);
  add(B(0.03, 0.9, 0.03), '#5a3320', -0.13, 0.5, 0, 0, 0, -0.26);
  add(B(0.6, 0.16, 0.38), '#3b424d', 0, 3.1, 0); add(B(0.66, 0.05, 0.44), '#7a4428', 0, 3.2, 0);
  add(B(0.04, 0.16, 0.44), '#2a2f37', 0.32, 3.02, 0); add(B(0.04, 0.16, 0.44), '#2a2f37', -0.32, 3.02, 0);
  add(B(0.5, 0.02, 0.34), '#1d2b4a', 0, 3.32, 0, 0.3, 0, 0);
  G.lamp = flush();
  G.lampLens = B(0.5, 0.03, 0.3);
  G.lampCone = new THREE.CylinderGeometry(0.18, 2.7, 2.9, 16, 1, true);

  // campfire: ash bed, stone ring, crossed + leaning logs
  add(C(0.6, 0.66, 0.04, 10), '#1c1917', 0, 0.02, 0);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + sr() * 0.2, r = 0.13 + sr() * 0.05;
    add(new THREE.DodecahedronGeometry(r, 0), k % 2 ? '#6d727a' : '#585d66', Math.cos(a) * 0.66, r * 0.55, Math.sin(a) * 0.66, sr() * 3, sr() * 3, sr() * 3, 1, 0.78, 1);
  }
  for (let k = 0; k < 3; k++) add(C(0.06, 0.07, 0.95, 5), '#4a3220', 0, 0.09 + k * 0.035, 0, 0, (k / 3) * Math.PI + 0.3, Math.PI / 2);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.5, th = 0.62, len = 0.8, o = Math.sin(th) * len / 2;
    add(C(0.05, 0.065, len, 5), k % 2 ? '#5c3d26' : '#3f2a1c', o * Math.cos(a), Math.cos(th) * len / 2 + 0.04, -o * Math.sin(a), 0, a, th);
  }
  G.fire = flush();
  G.flames = [K(0.3, 0.95, 6), K(0.2, 0.7, 5), K(0.11, 0.42, 4)];
  G.flames[0].translate(0, 0.475, 0); G.flames[1].translate(0, 0.35, 0); G.flames[2].translate(0, 0.21, 0);

  // turret base: tripod, hub, ammo crate with belt
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + Math.PI / 6, th = 0.55, len = 0.98, o = Math.sin(th) * len / 2;
    add(C(0.03, 0.045, len, 5), '#4a5059', o * Math.cos(a), 0.84 - Math.cos(th) * len / 2, -o * Math.sin(a), 0, a, th);
    add(B(0.16, 0.04, 0.16), '#2a2f37', o * 2 * Math.cos(a), 0.02, -o * 2 * Math.sin(a), 0, a, 0);
  }
  add(C(0.11, 0.14, 0.18, 6), '#3b424d', 0, 0.86, 0); add(C(0.05, 0.05, 0.2, 6), '#8d99ae', 0, 1.02, 0);
  add(B(0.34, 0.2, 0.24), '#45523c', 0, 0.1, 0.36); add(B(0.36, 0.04, 0.26), '#d9a521', 0, 0.16, 0.36);
  add(B(0.05, 0.02, 0.74), '#b08a3a', 0, 0.52, 0.27, 0.98, 0, 0);
  G.turretBase = flush();

  // turret head (origin at the pivot, barrels along -Z)
  add(B(0.26, 0.24, 0.5), '#3b424d', 0, 0.02, 0);
  add(B(0.03, 0.32, 0.36), '#7a4428', 0.16, 0.02, -0.1); add(B(0.03, 0.32, 0.36), '#7a4428', -0.16, 0.02, -0.1);
  add(C(0.028, 0.028, 0.66, 6), '#aab4c4', 0.06, 0, -0.55, Math.PI / 2, 0, 0); add(C(0.028, 0.028, 0.66, 6), '#aab4c4', -0.06, 0, -0.55, Math.PI / 2, 0, 0);
  add(B(0.2, 0.08, 0.05), '#2a2f37', 0, 0, -0.5); add(B(0.2, 0.08, 0.05), '#2a2f37', 0, 0, -0.74);
  add(C(0.042, 0.042, 0.09, 6), '#2a2f37', 0.06, 0, -0.87, Math.PI / 2, 0, 0); add(C(0.042, 0.042, 0.09, 6), '#2a2f37', -0.06, 0, -0.87, Math.PI / 2, 0, 0);
  add(B(0.05, 0.06, 0.22), '#8d99ae', 0, 0.17, -0.02);
  add(C(0.12, 0.12, 0.1, 8), '#45523c', 0.2, -0.04, 0.14, 0, 0, Math.PI / 2);
  add(C(0.008, 0.008, 0.42, 4), '#8d99ae', -0.09, 0.34, 0.2);
  G.turretHead = flush();
  G.eye = B(0.12, 0.05, 0.02);
  G.bar = B(0.2, 0.035, 0.02); G.bar.translate(0.1, 0, 0);
  G.flash = K(0.11, 0.46, 5); G.flash.rotateX(-Math.PI / 2); G.flash.translate(0, 0, -0.23);
  return G;
}

// radial glow disc (additive, vertex-colour falloff), conformed to the terrain when placed
function makeDiscGeo(R, radii, intens, color, segs) {
  const rings = radii.length, n = 1 + (rings - 1) * segs;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
  col[0] = color.r * intens[0]; col[1] = color.g * intens[0]; col[2] = color.b * intens[0];
  for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) {
    const i = 1 + (r - 1) * segs + s, a = (s / segs) * TAU;
    pos[i * 3] = Math.cos(a) * radii[r] * R; pos[i * 3 + 2] = Math.sin(a) * radii[r] * R;
    col[i * 3] = color.r * intens[r]; col[i * 3 + 1] = color.g * intens[r]; col[i * 3 + 2] = color.b * intens[r];
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + (s + 1) % segs, 1 + s);
  for (let r = 1; r < rings - 1; r++) for (let s = 0; s < segs; s++) {
    const a = 1 + (r - 1) * segs + s, b = 1 + (r - 1) * segs + (s + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ tiny synth
function makeSfx() {
  let ctx = null, master = null, buf = null, voices = 0;
  const MAXV = 10;
  function start() {
    try {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  function voice(src, g, t, dur, vol) {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(master); voices++;
    src.onended = () => { voices--; try { g.disconnect(); } catch (e) { /* gone */ } };
    src.start(t); src.stop(t + dur + 0.03);
  }
  function tone(type, f0, f1, dur, vol, delay) {
    if (!ctx || voices >= MAXV || !(vol > 0.003)) return;
    try {
      const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      o.connect(g); voice(o, g, t, dur, vol);
    } catch (e) { /* audio is optional */ }
  }
  function noise(ftype, freq, q, dur, vol, delay) {
    if (!ctx || voices >= MAXV || !(vol > 0.003)) return;
    try {
      const t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = buf; s.loop = true; f.type = ftype; f.frequency.value = freq; f.Q.value = q;
      s.connect(f); f.connect(g); voice(s, g, t, dur, vol);
    } catch (e) { /* audio is optional */ }
  }
  return { start, tone, noise };
}

// ================================================================== module
export function init(game) {
  const scene = game.scene, CONFIG = game.CONFIG || {};
  const seaLevel = (CONFIG.world && CONFIG.world.seaLevel) || 0;
  const pal = CONFIG.palette || {};
  const COL_OK = new THREE.Color(pal.toxic || '#9be564'), COL_BAD = new THREE.Color('#e03344');
  const sfx = makeSfx();
  const G = buildGeos();
  for (const p of PIECES) p.count = 0;

  // temps
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _from = new THREE.Vector3(), _to = new THREE.Vector3(), _dir = new THREE.Vector3();
  const _n = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
  const UP = new THREE.Vector3(0, 1, 0), _ip = new THREE.Vector3(), _id = new THREE.Vector3(0, 1, 0);
  const _info = { headshot: false, point: _ip, dir: _id };

  const hAt = (x, z) => { const w = game.world; return w && w.heightAt ? w.heightAt(x, z) : 0; };
  const scrapNow = () => { const l = game.loot, inv = l && l.inventory; return inv ? (inv.scrap | 0) : 0; };
  function groundNormal(x, z, out) {
    const e = 0.6;
    return out.set(hAt(x - e, z) - hAt(x + e, z), 2 * e, hAt(x, z - e) - hAt(x, z + e)).normalize();
  }
  function volAt(pos) {
    const p = game.player; if (!p || !p.position) return 1;
    const dx = pos.x - p.position.x, dz = pos.z - p.position.z;
    return 1 / (1 + (dx * dx + dz * dz) / 110);
  }

  // ---------------------------------------------------------------- materials
  const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
  const matBody = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.2 });
  const matGhost = new THREE.MeshBasicMaterial({ color: COL_OK, transparent: true, opacity: 0.42, depthWrite: false, fog: false });
  const matGhostRing = new THREE.MeshBasicMaterial({ color: COL_OK, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false });
  const matLens = new THREE.MeshBasicMaterial({ color: hdr('#ffd9a0', 3.2) });
  const matCone = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8a'), transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const matFlame = [new THREE.MeshBasicMaterial({ color: hdr('#ff5a1e', 1.7) }), new THREE.MeshBasicMaterial({ color: hdr('#ffb347', 2.1) }), new THREE.MeshBasicMaterial({ color: hdr('#fff1c1', 2.6) })];
  const matEyeOn = new THREE.MeshBasicMaterial({ color: hdr(pal.toxic || '#9be564', 2.4) });
  const matEyeHot = new THREE.MeshBasicMaterial({ color: hdr('#ff7a3c', 3) });
  const matEyeOff = new THREE.MeshBasicMaterial({ color: new THREE.Color('#14161c') });
  const matBar = new THREE.MeshBasicMaterial({ color: hdr(pal.toxic || '#9be564', 1.6) });
  const matFlash = new THREE.MeshBasicMaterial({ color: hdr('#ffd98a', 4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const discMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  // 'EMPTY' tag sprite (generated canvas texture, shared)
  let matTag = null;
  try {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(8,11,22,.86)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 0); g.lineTo(256, 76); g.lineTo(236, 96); g.lineTo(0, 96); g.closePath(); g.fill();
    g.fillStyle = '#ff7a3c'; g.fillRect(0, 0, 6, 96);
    g.textAlign = 'center'; g.fillStyle = '#ff7a3c'; g.font = '800 46px "Avenir Next Condensed","DIN Condensed","Arial Narrow",sans-serif'; g.fillText('EMPTY', 131, 47);
    g.fillStyle = '#e8e4d8'; g.font = '600 18px ui-monospace,Menlo,Consolas,monospace'; g.fillText('[F] SALVAGE +' + T.turretSalvage, 131, 78);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    matTag = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  } catch (e) { matTag = null; }

  // ---------------------------------------------------------------- pools: glow discs
  const WARM = new THREE.Color('#ffc57a'), FIRE = new THREE.Color('#ff8a3c');
  function makeDiscPool(n, R, radii, intens, color, segs) {
    const pool = [];
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(makeDiscGeo(R, radii, intens, color, segs), discMat());
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
      pool.push({ mesh, used: false });
    }
    return pool;
  }
  const lampDiscs = makeDiscPool(PIECES[1].cap, T.lampR, [0, 0.12, 0.3, 0.5, 0.7, 0.88, 0.965, 1], [1, 0.9, 0.6, 0.38, 0.22, 0.13, 0.34, 0], WARM, 28);
  const fireDiscs = makeDiscPool(PIECES[2].cap, T.fireR, [0, 0.3, 0.62, 0.86, 0.95, 1], [0.7, 0.34, 0.14, 0.08, 0.36, 0], FIRE, 24);
  function takeDisc(pool, x, y, z) {
    for (let i = 0; i < pool.length; i++) {
      const d = pool[i]; if (d.used) continue;
      d.used = true;
      const a = d.mesh.geometry.attributes.position;
      for (let k = 0; k < a.count; k++) a.setY(k, hAt(x + a.getX(k), z + a.getZ(k)) - y + 0.14);
      a.needsUpdate = true;
      d.mesh.position.set(x, y, z); d.mesh.material.opacity = 0; d.mesh.visible = true;
      return d;
    }
    return null;
  }

  // ---------------------------------------------------------------- pools: glow particles (additive instanced octahedra)
  const P_N = 192;
  const pMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), P_N);
  pMesh.frustumCulled = false; pMesh.visible = false; pMesh.setColorAt(0, _bc.set(0, 0, 0)); scene.add(pMesh);
  const pArr = pMesh.instanceMatrix.array, pColArr = pMesh.instanceColor.array;
  pArr.fill(0); for (let i = 0; i < P_N; i++) pArr[i * 16 + 15] = 1;
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); pMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const pPos = new Float32Array(P_N * 3), pVel = new Float32Array(P_N * 3), pCol = new Float32Array(P_N * 3);
  const pLife = new Float32Array(P_N), pMax = new Float32Array(P_N), pSize = new Float32Array(P_N), pGrav = new Float32Array(P_N);
  let pNext = 0, pActive = 0;
  function spawnP(x, y, z, vx, vy, vz, life, size, r, g, b, grav) {
    const i = pNext; pNext = (pNext + 1) % P_N;
    if (pLife[i] <= 0) pActive++;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
    pLife[i] = life; pMax[i] = life; pSize[i] = size; pGrav[i] = grav;
  }
  function updateParticles(dt) {
    if (pActive <= 0) { if (pMesh.visible) pMesh.visible = false; return; }
    let act = 0; const drag = 1 - Math.min(0.9, dt * 1.6);
    for (let i = 0; i < P_N; i++) {
      let life = pLife[i]; if (life <= 0) continue;
      const o = i * 16, j = i * 3;
      life -= dt;
      if (life <= 0) { pLife[i] = 0; pArr[o] = pArr[o + 5] = pArr[o + 10] = 0; continue; }
      pLife[i] = life; act++;
      pVel[j + 1] -= pGrav[i] * dt; pVel[j] *= drag; pVel[j + 2] *= drag;
      pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
      const k = life / pMax[i], s = pSize[i] * (0.35 + 0.65 * k);
      pArr[o] = pArr[o + 5] = pArr[o + 10] = s; pArr[o + 12] = pPos[j]; pArr[o + 13] = pPos[j + 1]; pArr[o + 14] = pPos[j + 2];
      pColArr[j] = pCol[j] * k; pColArr[j + 1] = pCol[j + 1] * k; pColArr[j + 2] = pCol[j + 2] * k;
    }
    pActive = act; pMesh.visible = true;
    pMesh.instanceMatrix.needsUpdate = true; pMesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- pools: debris (lit instanced chunks with bounce)
  const D_N = 96;
  const dMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, metalness: 0.15 }), D_N);
  dMesh.frustumCulled = false; dMesh.visible = false; dMesh.setColorAt(0, _bc.set(1, 1, 1)); scene.add(dMesh);
  const dArr = dMesh.instanceMatrix.array, dColArr = dMesh.instanceColor.array;
  dArr.fill(0); for (let i = 0; i < D_N; i++) dArr[i * 16 + 15] = 1;
  dMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dPos = new Float32Array(D_N * 3), dVel = new Float32Array(D_N * 3), dRot = new Float32Array(D_N * 3), dSpin = new Float32Array(D_N * 3), dScl = new Float32Array(D_N * 3);
  const dLife = new Float32Array(D_N), dMax = new Float32Array(D_N);
  let dNext = 0, dActive = 0;
  function spawnD(x, y, z, vx, vy, vz, sx, sy, sz, life, color) {
    const i = dNext, j = i * 3; dNext = (dNext + 1) % D_N;
    if (dLife[i] <= 0) dActive++;
    dPos[j] = x; dPos[j + 1] = y; dPos[j + 2] = z; dVel[j] = vx; dVel[j + 1] = vy; dVel[j + 2] = vz;
    dRot[j] = Math.random() * 6; dRot[j + 1] = Math.random() * 6; dRot[j + 2] = Math.random() * 6;
    dSpin[j] = (Math.random() - 0.5) * 14; dSpin[j + 1] = (Math.random() - 0.5) * 14; dSpin[j + 2] = (Math.random() - 0.5) * 14;
    dScl[j] = sx; dScl[j + 1] = sy; dScl[j + 2] = sz; dLife[i] = life; dMax[i] = life;
    dColArr[j] = color.r; dColArr[j + 1] = color.g; dColArr[j + 2] = color.b; dMesh.instanceColor.needsUpdate = true;
  }
  function updateDebris(dt) {
    if (dActive <= 0) { if (dMesh.visible) dMesh.visible = false; return; }
    let act = 0;
    for (let i = 0; i < D_N; i++) {
      let life = dLife[i]; if (life <= 0) continue;
      const o = i * 16, j = i * 3;
      life -= dt;
      if (life <= 0) { dLife[i] = 0; dArr[o] = dArr[o + 5] = dArr[o + 10] = 0; dArr[o + 1] = dArr[o + 2] = dArr[o + 4] = dArr[o + 6] = dArr[o + 8] = dArr[o + 9] = 0; continue; }
      dLife[i] = life; act++;
      dVel[j + 1] -= 18 * dt;
      dPos[j] += dVel[j] * dt; dPos[j + 1] += dVel[j + 1] * dt; dPos[j + 2] += dVel[j + 2] * dt;
      const gy = hAt(dPos[j], dPos[j + 2]) + dScl[j + 1] * 0.5;
      if (dPos[j + 1] < gy) {
        dPos[j + 1] = gy;
        if (dVel[j + 1] < 0) dVel[j + 1] *= -0.32;
        dVel[j] *= 0.6; dVel[j + 2] *= 0.6; dSpin[j] *= 0.5; dSpin[j + 1] *= 0.5; dSpin[j + 2] *= 0.5;
      }
      dRot[j] += dSpin[j] * dt; dRot[j + 1] += dSpin[j + 1] * dt; dRot[j + 2] += dSpin[j + 2] * dt;
      const k = Math.min(1, life / 0.35);
      _m.compose(_v1.set(dPos[j], dPos[j + 1], dPos[j + 2]), _q1.setFromEuler(_e.set(dRot[j], dRot[j + 1], dRot[j + 2])), _v2.set(dScl[j] * k, dScl[j + 1] * k, dScl[j + 2] * k));
      _m.toArray(dArr, o);
    }
    dActive = act; dMesh.visible = true; dMesh.instanceMatrix.needsUpdate = true;
  }
  const DEBRIS_COLS = {
    trap: ['#8d99ae', '#7a4428', '#2a2f37'].map((c) => new THREE.Color(c)),
    lamp: ['#8d99ae', '#3b424d', '#7a4428', '#1d2b4a'].map((c) => new THREE.Color(c)),
    campfire: ['#3f2a1c', '#6d727a', '#1c1917'].map((c) => new THREE.Color(c)),
    turret: ['#3b424d', '#8d99ae', '#45523c', '#d9a521'].map((c) => new THREE.Color(c)),
  };
  const BRASS = new THREE.Color('#c9a24a');
  function burstDebris(s, n, power) {
    const cols = DEBRIS_COLS[s.type], h = s.type === 'lamp' ? 3 : s.type === 'turret' ? 1.3 : 0.5, f = s.def.foot;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = Math.random() * f * 0.8, sp = (1.5 + Math.random() * 3.5) * power, sz = 0.07 + Math.random() * 0.16;
      spawnD(s.position.x + Math.cos(a) * r, s.position.y + 0.15 + Math.random() * h, s.position.z + Math.sin(a) * r,
        Math.cos(a) * sp, 2.5 + Math.random() * 4.5 * power, Math.sin(a) * sp,
        sz * (0.6 + Math.random()), sz * (0.5 + Math.random() * 0.8), sz * (0.6 + Math.random() * 1.6), 1.4 + Math.random() * 1.4, cols[i % cols.length]);
    }
  }
  function burstSparks(x, y, z, n, r, g, b, speed, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = speed * (0.4 + Math.random() * 0.8);
      spawnP(x, y, z, Math.cos(a) * sp, up * (0.3 + Math.random()), Math.sin(a) * sp, 0.3 + Math.random() * 0.4, 0.06 + Math.random() * 0.07, r, g, b, 6);
    }
  }

  // ---------------------------------------------------------------- pools: fallback tracers (only if weapons.spawnTracer is missing)
  const TR_N = 6, tracers = [];
  let trNext = 0, trActive = 0;
  function ownTracer(from, to) {
    if (!tracers.length) {
      const g = new THREE.BoxGeometry(0.035, 0.035, 1), m = new THREE.MeshBasicMaterial({ color: hdr('#ffd98a', 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      for (let i = 0; i < TR_N; i++) { const mesh = new THREE.Mesh(g, m); mesh.visible = false; mesh.frustumCulled = false; scene.add(mesh); tracers.push({ mesh, life: 0 }); }
    }
    const t = tracers[trNext]; trNext = (trNext + 1) % TR_N;
    if (t.life <= 0) trActive++;
    t.mesh.position.copy(from).add(to).multiplyScalar(0.5); t.mesh.lookAt(to); t.mesh.scale.set(1, 1, Math.max(0.1, from.distanceTo(to)));
    t.mesh.visible = true; t.life = 0.06;
  }
  function updateTracers(dt) {
    if (trActive <= 0) return;
    for (let i = 0; i < tracers.length; i++) { const t = tracers[i]; if (t.life > 0) { t.life -= dt; if (t.life <= 0) { t.mesh.visible = false; trActive--; } } }
  }

  // ---------------------------------------------------------------- pooled lights (constant light count: no shader recompiles)
  const SLOTS = 3, slots = [];
  for (let i = 0; i < SLOTS; i++) {
    const light = new THREE.PointLight(0xffd9a0, 0, 17, 2); light.castShadow = false; scene.add(light);
    slots.push({ light, owner: null, k: 0, I: 0, release: false });
  }
  const flashLight = new THREE.PointLight(0xffc070, 0, 10, 2); flashLight.castShadow = false; scene.add(flashLight);
  let flashI = 0, slotT = 0;
  const LAMP_LIGHT = new THREE.Color('#ffe2b0'), FIRE_LIGHT = new THREE.Color('#ff8a3c');

  // ---------------------------------------------------------------- structures
  const structures = [], traps = [], lamps = [], fires = [], turrets = [], lit = [], targets = [];
  const byType = { trap: traps, lamp: lamps, campfire: fires, turret: turrets };
  const pull = (arr, s) => { const i = arr.indexOf(s); if (i !== -1) arr.splice(i, 1); };

  function bodyMesh(geo) { const m = new THREE.Mesh(geo, matBody); m.castShadow = true; m.receiveShadow = true; return m; }

  function spawnStructure(def, x, y, z, yaw, normal) {
    const group = new THREE.Group();
    const s = {
      type: def.id, def, position: new THREE.Vector3(x, y, z), yaw, health: def.health, maxHealth: def.health, alive: true,
      age: 0, group, collider: null, seed: Math.random() * 100, cos: Math.cos(yaw), sin: Math.sin(yaw),
      tick: Math.random() * 0.2, ticked: false, usedTick: false, jab: 0, pulse: 0, hurtT: 0, fxT: 0,
      slot: null, wantLight: false, lightI: 0, disc: null,
      life: 0, healAcc: 0, emT: 0, flames: null, lens: null,
      rounds: 0, empty: false, target: null, aimYaw: yaw, aimPitch: 0, fireT: 0.4, retargetT: 0, scan: Math.random() * 6, recoil: 0, flashT: 0, barrel: 0,
      head: null, pitchG: null, eye: null, bar: null, flash: null, tag: null,
    };
    group.position.set(x, y, z);
    if (def.id === 'trap') {
      group.add(bodyMesh(G.trap));
      group.quaternion.setFromUnitVectors(UP, normal).multiply(_q2.setFromAxisAngle(UP, yaw));
    } else {
      group.rotation.y = yaw;
    }
    if (def.id === 'lamp') {
      group.add(bodyMesh(G.lamp));
      s.lens = new THREE.Mesh(G.lampLens, matLens); s.lens.position.y = 3.005; group.add(s.lens);
      const cone = new THREE.Mesh(G.lampCone, matCone); cone.position.y = 1.55; cone.renderOrder = 3; group.add(cone);
      s.disc = takeDisc(lampDiscs, x, y, z);
      addCollider(s, 0.2, 3.3);
    } else if (def.id === 'campfire') {
      group.add(bodyMesh(G.fire));
      s.flames = [];
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(G.flames[i], matFlame[i]); f.position.y = 0.12 - i * 0.02; group.add(f); s.flames.push(f); }
      s.life = T.fireLife; s.disc = takeDisc(fireDiscs, x, y, z);
    } else if (def.id === 'turret') {
      group.add(bodyMesh(G.turretBase));
      s.head = new THREE.Group(); s.head.position.y = T.pivotY; group.add(s.head);
      s.pitchG = new THREE.Group(); s.head.add(s.pitchG);
      s.pitchG.add(bodyMesh(G.turretHead));
      s.eye = new THREE.Mesh(G.eye, matEyeOn); s.eye.position.set(0, 0.09, -0.262); s.pitchG.add(s.eye);
      s.bar = new THREE.Mesh(G.bar, matBar); s.bar.position.set(-0.1, 0.1, 0.262); s.pitchG.add(s.bar);
      s.flash = new THREE.Mesh(G.flash, matFlash); s.flash.position.set(0, 0, -T.muzzle); s.flash.visible = false; s.pitchG.add(s.flash);
      if (matTag) { s.tag = new THREE.Sprite(matTag); s.tag.scale.set(1.5, 0.5625, 1); s.tag.position.y = 1.95; s.tag.visible = false; group.add(s.tag); }
      s.rounds = T.turretRounds;
      addCollider(s, 0.4, 0.9);
    }
    group.scale.setScalar(0.001);
    scene.add(group);
    structures.push(s); byType[def.id].push(s); def.count++;
    if (def.id === 'lamp' || def.id === 'campfire') { lit.push(s); slotT = 0; }
    if (def.id !== 'trap') targets.push(s);
    return s;
  }
  function addCollider(s, half, h) {
    const w = game.world; if (!w || !w.addCollider) return;
    const p = s.position;
    const box = new THREE.Box3(new THREE.Vector3(p.x - half, p.y - 0.6, p.z - half), new THREE.Vector3(p.x + half, p.y + h, p.z + half));
    // 'barricade' = breakable obstacle: the flow field keeps routing through it (so a lamp or turret
    // can never seal a doorway and strand the horde) and zombies that run into it stop to tear at it;
    // zombiePass() below is what actually applies their damage.
    s.collider = w.addCollider(box, 'barricade', s) || null;
  }

  function removeStructure(s, mode) {
    if (!s.alive) return;
    s.alive = false; s.target = null;
    const w = game.world;
    if (s.collider && w && w.removeCollider && (!Array.isArray(w.colliders) || w.colliders.indexOf(s.collider) !== -1)) w.removeCollider(s.collider);
    s.collider = null;
    scene.remove(s.group);
    if (s.disc) { s.disc.used = false; s.disc.mesh.visible = false; s.disc = null; }
    pull(structures, s); pull(byType[s.type], s); pull(lit, s); pull(targets, s);
    s.def.count = Math.max(0, s.def.count - 1);
    const p = s.position, v = volAt(p);
    if (mode === 'break') {
      burstDebris(s, s.type === 'trap' ? 14 : 18, 1);
      burstSparks(p.x, p.y + 0.6, p.z, 10, 3, 1.6, 0.5, 4, 4);
      sfx.noise('lowpass', 900, 0.7, 0.32, 0.5 * v); sfx.tone('sine', 110, 38, 0.3, 0.45 * v); sfx.tone('square', 900, 260, 0.08, 0.1 * v);
      if (s.type !== 'trap') game.emit('toast', s.def.name + ' destroyed');
    } else if (mode === 'burnout') {
      burstDebris(s, 8, 0.4);
      for (let i = 0; i < 10; i++) spawnP(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.2, p.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5), 1 + Math.random() * 1.5, (Math.random() - 0.5), 0.8 + Math.random() * 0.6, 0.07, 2.4, 0.8, 0.2, -0.4);
      sfx.noise('highpass', 2400, 0.5, 0.5, 0.16 * v);
      game.emit('toast', 'Campfire burned out');
    } else if (mode === 'salvage') {
      burstDebris(s, 6, 0.5);
      burstSparks(p.x, p.y + 0.8, p.z, 8, COL_OK.r * 2, COL_OK.g * 2, COL_OK.b * 2, 2.5, 3);
      sfx.tone('triangle', 520, 780, 0.07, 0.22); sfx.tone('triangle', 780, 1170, 0.09, 0.22, 0.07); sfx.noise('bandpass', 2600, 2, 0.08, 0.14);
    }
  }

  // ---------------------------------------------------------------- ghosts + build mode
  let sel = -1, ghostReason = 0, gx = 0, gy = 0, gz = 0, gyaw = 0, ghostOk = true;
  const ghosts = [];
  function ghostOf(parts, ringR) {
    const g = new THREE.Group();
    for (const [geo, y] of parts) { const m = new THREE.Mesh(geo, matGhost); m.position.y = y; m.renderOrder = 6; g.add(m); }
    const w = Math.max(0.05, ringR * 0.014);
    const ring = new THREE.Mesh(new THREE.RingGeometry(ringR - w, ringR, 56), matGhostRing);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; ring.renderOrder = 7; g.add(ring);
    g.visible = false; scene.add(g);
    return g;
  }
  ghosts.push(ghostOf([[G.trap, 0]], 1.7));
  ghosts.push(ghostOf([[G.lamp, 0], [G.lampLens, 3.005]], T.lampR));
  ghosts.push(ghostOf([[G.fire, 0], [G.flames[0], 0.12]], T.fireR));
  ghosts.push(ghostOf([[G.turretBase, 0], [G.turretHead, T.pivotY]], T.turretR));

  function setSel(i) {
    if (sel >= 0) ghosts[sel].visible = false;
    sel = i;
    game.buildMode = sel >= 0;
  }
  function exitBuild() { if (sel >= 0) setSel(-1); else game.buildMode = false; }

  // 0 ok | 1 scrap | 2 cap | 3 water | 4 blocked | 5 steep
  function checkPlace(def, x, y, z) {
    if (def.count >= def.cap) return 2;
    if (scrapNow() < def.cost) return 1;
    if (!(y > seaLevel + 0.15)) return 3;
    if (_n.y < 0.8) return 5;
    const w = game.world;
    if (w && w.resolveCircle) {
      _v1.set(x, y, z);
      const pushed = w.resolveCircle(_v1, def.foot, 1.6);
      const dx = _v1.x - x, dz = _v1.z - z;
      if (pushed || dx * dx + dz * dz > 1e-4) return 4;
    }
    for (let i = 0; i < structures.length; i++) {
      const s = structures[i], dx = s.position.x - x, dz = s.position.z - z, r = s.def.foot + def.foot;
      if (dx * dx + dz * dz < r * r) return 4;
    }
    return 0;
  }
  function updateGhost(p) {
    const def = PIECES[sel], g = ghosts[sel];
    gyaw = p.yaw || 0;
    gx = p.position.x - Math.sin(gyaw) * T.placeDist; gz = p.position.z - Math.cos(gyaw) * T.placeDist; gy = hAt(gx, gz);
    groundNormal(gx, gz, _n);
    ghostReason = checkPlace(def, gx, gy, gz);
    const ok = ghostReason === 0;
    if (ok !== ghostOk) { ghostOk = ok; matGhost.color.copy(ok ? COL_OK : COL_BAD); matGhostRing.color.copy(ok ? COL_OK : COL_BAD); }
    matGhost.opacity = 0.36 + 0.1 * Math.sin(time * 6);
    g.position.set(gx, gy + 0.02, gz);
    if (def.id === 'trap') g.quaternion.setFromUnitVectors(UP, _n).multiply(_q2.setFromAxisAngle(UP, gyaw));
    else g.quaternion.setFromAxisAngle(UP, gyaw);
    g.visible = true;
  }
  function tryPlace() {
    const def = PIECES[sel];
    if (ghostReason !== 0) {
      sfx.tone('sawtooth', 150, 105, 0.13, 0.2); sfx.tone('square', 96, 80, 0.13, 0.1);
      game.emit('toast', ghostReason === 1 ? 'Need ' + def.cost + ' scrap' : ghostReason === 2 ? def.name + ' limit reached (' + def.cap + ')' : ghostReason === 3 ? 'No solid ground there' : ghostReason === 5 ? 'Too steep to build' : 'Something is in the way');
      return;
    }
    const inv = game.loot && game.loot.inventory;
    if (inv) inv.scrap = Math.max(0, (inv.scrap | 0) - def.cost);
    spawnStructure(def, gx, gy, gz, gyaw, _n);
    burstSparks(gx, gy + 0.15, gz, 14, COL_OK.r * 1.8, COL_OK.g * 1.8, COL_OK.b * 1.8, 4.5, 2.5);
    sfx.noise('lowpass', 420, 0.8, 0.14, 0.45); sfx.tone('sine', 150, 55, 0.16, 0.4); sfx.tone('square', 1250, 880, 0.05, 0.08, 0.03); sfx.tone('triangle', 620, 930, 0.08, 0.14, 0.08);
    game.emit('built', { type: def.id });
  }

  // ---------------------------------------------------------------- zombies vs structures (single pass)
  let trapSndT = 0, hitSndT = 0;
  function zombiePass(dt) {
    const zs = game.zombies, list = zs && zs.list;
    if (!list || !list.length || !structures.length || !zs.damage) return;
    const dmgTrap = T.trapDps * T.trapTick, dmgLamp = T.lampDps * T.lampTick, th = T.trapHalf, lr2 = T.lampR * T.lampR;
    zloop: for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i]; if (!z || !z.alive || !z.position) continue;
      const zx = z.position.x, zy = z.position.y, zz = z.position.z;
      let sm = 1, st = 0;
      for (let k = 0; k < traps.length; k++) {
        const s = traps[k]; if (!s.alive || s.age < T.popTime) continue;
        const dx = zx - s.position.x, dz = zz - s.position.z;
        if (dx * dx + dz * dz > 3.2) continue;
        const lx = dx * s.cos - dz * s.sin, lz = dx * s.sin + dz * s.cos;
        if (lx > th || lx < -th || lz > th || lz < -th || zy - s.position.y > 2 || s.position.y - zy > 2) continue;
        if (sm > T.trapSlowM) sm = T.trapSlowM; if (st < T.trapSlowT) st = T.trapSlowT;
        if (s.ticked && s.health > 0) {
          _ip.set(zx, zy + 0.3, zz); _id.set(0, 1, 0);
          _info.point = _ip; _info.dir = _id;
          s.health -= dmgTrap; s.jab = 1; s.usedTick = true;
          zs.damage(z, dmgTrap, _info);
          if (!z.alive) continue zloop;
        }
      }
      for (let k = 0; k < lamps.length; k++) {
        const s = lamps[k]; if (!s.alive) continue;
        const dx = zx - s.position.x, dz = zz - s.position.z;
        if (dx * dx + dz * dz > lr2) continue;
        if (sm > T.lampSlowM) sm = T.lampSlowM; if (st < T.lampSlowT) st = T.lampSlowT;
        if (s.ticked) {
          s.pulse = 1;
          spawnP(zx + (Math.random() - 0.5) * 0.4, zy + (z.height || 1.7) * 0.85, zz + (Math.random() - 0.5) * 0.4, 0, 1.1 + Math.random(), 0, 0.55, 0.08, 3, 1.5, 0.4, -0.6);
          _ip.set(zx, zy + (z.height || 1.7) * 0.8, zz); _id.set(0, 1, 0);   // straight-up dir: scorch without shoving
          _info.point = _ip; _info.dir = _id;
          zs.damage(z, dmgLamp, _info);
          if (!z.alive) continue zloop;
        }
      }
      if (st > 0) {
        if (!(z.slowT > st)) { z.slowT = st; z.slowMult = sm; } else if (!(z.slowMult <= sm)) z.slowMult = sm;
      }
      const reach = T.zombieReach + Math.max(0, (z.radius || 0.42) - 0.42), r2 = reach * reach;
      for (let k = 0; k < targets.length; k++) {
        const s = targets[k]; if (!s.alive) continue;
        const dx = zx - s.position.x, dz = zz - s.position.z;
        if (dx * dx + dz * dz > r2) continue;
        s.health -= T.zombieDps * dt; s.hurtT = 0.3;
      }
    }
  }

  // ---------------------------------------------------------------- turrets
  function clearShot(s, from, dir, dist) {
    const w = game.world; if (!w || !w.raycast || dist <= 0.05) return true;
    const h = w.raycast(from, dir, dist);
    if (!h) return true;
    if (h.collider && h.collider.ref === s) return true;
    return h.distance >= dist - 0.3;
  }
  function losTo(s, z) {
    const px = s.position.x, py = s.position.y + T.pivotY, pz = s.position.z;
    _dir.set(z.position.x - px, z.position.y + (z.height || 1.7) * 0.55 - py, z.position.z - pz);
    const d = _dir.length(); if (d < 0.001) return true;
    _dir.multiplyScalar(1 / d);
    _from.set(px + _dir.x * T.muzzle, py + _dir.y * T.muzzle, pz + _dir.z * T.muzzle);
    return clearShot(s, _from, _dir, d - T.muzzle);
  }
  function acquire(s) {
    const zs = game.zombies, list = zs && zs.list; if (!list) return null;
    let minD2 = -1; const R2 = T.turretR * T.turretR;
    for (let attempt = 0; attempt < 3; attempt++) {
      let best = null, bd = R2;
      for (let i = 0; i < list.length; i++) {
        const z = list[i]; if (!z || !z.alive || !z.position || z.burning || z.state === 'burning' || z.state === 'dying' || z.state === 'dead') continue;
        const dx = z.position.x - s.position.x, dz = z.position.z - s.position.z, d2 = dx * dx + dz * dz;
        if (d2 > minD2 && d2 < bd) { bd = d2; best = z; }
      }
      if (!best) return null;
      if (losTo(s, best)) return best;
      minD2 = bd;
    }
    return null;
  }
  let shotSndT = 0;
  function setEmpty(s) {
    s.empty = true; s.target = null; s.rounds = 0;
    s.eye.material = matEyeOff; s.bar.visible = false; s.flash.visible = false;
    if (s.tag) s.tag.visible = true;
    const v = volAt(s.position);
    sfx.tone('sawtooth', 520, 90, 0.45, 0.2 * v); sfx.tone('square', 260, 60, 0.45, 0.08 * v, 0.05);
    game.emit('toast', 'Auto-turret empty: [F] to salvage');
  }
  function updateTurret(s, dt) {
    if (s.flashT > 0) { s.flashT -= dt; if (s.flashT <= 0) s.flash.visible = false; }
    s.recoil = Math.max(0, s.recoil - dt * 9);
    s.pitchG.position.z = s.recoil * 0.07;
    if (s.empty) {
      s.aimPitch += (-0.5 - s.aimPitch) * Math.min(1, dt * 2.5);
      s.pitchG.rotation.x = s.aimPitch;
      if (s.tag) s.tag.position.y = 1.95 + Math.sin(time * 2.4 + s.seed) * 0.05;
      return;
    }
    if (s.age < T.popTime) return;
    let t = s.target;
    if (t && (!t.alive || !t.position)) { t = s.target = null; s.retargetT = 0; }
    s.retargetT -= dt;
    if (s.retargetT <= 0) { s.retargetT = 0.3 + Math.random() * 0.08; t = s.target = acquire(s); }
    const px = s.position.x, py = s.position.y + T.pivotY, pz = s.position.z;
    let dx = 0, dy = 0, dz = 0, wantYaw, wantPitch = 0;
    if (t) {
      dx = t.position.x - px; dy = t.position.y + (t.height || 1.7) * 0.55 - py; dz = t.position.z - pz;
      wantYaw = Math.atan2(-dx, -dz); wantPitch = clamp(Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)), -0.75, 0.75);
    } else {
      s.scan += dt; wantYaw = s.yaw + Math.sin(s.scan * 0.7) * 1.2;
    }
    const err = angDiff(wantYaw, s.aimYaw), step = (t ? 7 : 1.3) * dt;
    s.aimYaw += clamp(err, -step, step);
    s.aimPitch += clamp(wantPitch - s.aimPitch, -4 * dt, 4 * dt);
    s.head.rotation.y = s.aimYaw - s.yaw; s.pitchG.rotation.x = s.aimPitch;
    const hot = !!t; const em = hot ? matEyeHot : matEyeOn;
    if (s.eye.material !== em) s.eye.material = em;

    s.fireT -= dt;
    if (!t || s.fireT > 0 || Math.abs(err) > 0.16) { if (s.fireT < -0.2) s.fireT = 0; return; }
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.001) return;
    _dir.set(dx / d, dy / d, dz / d);
    _from.set(px + _dir.x * T.muzzle, py + _dir.y * T.muzzle, pz + _dir.z * T.muzzle);
    if (!clearShot(s, _from, _dir, d - T.muzzle)) { s.target = null; s.retargetT = 0; s.fireT = 0.1; return; }
    // fire
    s.fireT += 1 / T.turretRate; if (s.fireT < 0) s.fireT = 1 / T.turretRate;
    s.rounds--; s.barrel ^= 1;
    _to.set(px + dx, py + dy, pz + dz);
    const wp = game.weapons;
    if (wp && typeof wp.spawnTracer === 'function') wp.spawnTracer(_from, _to); else ownTracer(_from, _to);
    s.flash.visible = true; s.flashT = 0.045; s.flash.rotation.z = Math.random() * TAU; s.flash.position.x = s.barrel ? 0.06 : -0.06;
    const fs = 0.8 + Math.random() * 0.6; s.flash.scale.set(fs, fs, 0.7 + Math.random() * 0.8);
    s.recoil = 1; flashLight.position.copy(_from); flashI = 24;
    spawnD(px, py + 0.05, pz, (Math.random() - 0.5) * 1.5 + _dir.z * 1.6, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5 - _dir.x * 1.6, 0.03, 0.03, 0.08, 0.7, BRASS);
    if (shotSndT <= 0) {
      shotSndT = 0.07; const v = volAt(s.position);
      sfx.noise('bandpass', 1700 + Math.random() * 500, 1.2, 0.07, 0.34 * v); sfx.tone('square', 240, 80, 0.06, 0.16 * v);
    }
    s.bar.scale.x = Math.max(0.001, s.rounds / T.turretRounds);
    _ip.copy(_to); _id.copy(_dir); _info.point = _ip; _info.dir = _id;
    const zs = game.zombies;
    if (zs && zs.damage) zs.damage(t, T.turretDmg, _info);
    if (!t.alive) { s.target = null; s.retargetT = 0; }
    if (s.rounds <= 0) setEmpty(s);
  }

  // ---------------------------------------------------------------- per-frame structure update
  let crackT = 0, salvageT = null, lootNear = false, healedFrame = false;
  function popK(age) {
    if (age >= T.popTime) return 1;
    const t = age / T.popTime - 1;
    return Math.max(0.001, 1 + 2.70158 * t * t * t + 1.70158 * t * t);
  }
  function updateStructures(dt) {
    const p = game.player, pp = p && p.position;
    const nightK = 1 - 0.6 * clamp(game.dayFactor == null ? 1 : game.dayFactor, 0, 1);
    trapSndT -= dt; hitSndT -= dt; shotSndT -= dt;

    // pre-pass: age, pop-in, tick flags
    for (let i = 0; i < structures.length; i++) {
      const s = structures[i];
      const was = s.age; s.age += dt;
      if (was < T.popTime + 0.2 || s.jab > 0) {
        const k = popK(s.age); s.jab = Math.max(0, s.jab - dt * 7);
        s.group.scale.set(k, k * (1 + s.jab * 0.45), k);
      }
      s.ticked = false; s.usedTick = false;
      const iv = s.type === 'trap' ? T.trapTick : s.type === 'lamp' ? T.lampTick : 0;
      if (iv > 0) { s.tick += dt; if (s.tick >= iv) { s.tick -= iv; s.ticked = true; } }
    }

    zombiePass(dt);

    // traps: bite feedback
    for (let i = 0; i < traps.length; i++) {
      const s = traps[i];
      if (s.usedTick) {
        burstSparks(s.position.x + (Math.random() - 0.5) * 1.4, s.position.y + 0.3, s.position.z + (Math.random() - 0.5) * 1.4, 2, 2.4, 0.35, 0.3, 1.6, 2.2);
        if (trapSndT <= 0) { trapSndT = 0.13; const v = volAt(s.position); sfx.noise('bandpass', 3200, 3, 0.05, 0.22 * v); sfx.tone('square', 190, 120, 0.05, 0.08 * v); }
      }
    }

    // lamps
    if (lamps.length) matCone.opacity = 0.03 + 0.05 * nightK;
    for (let i = 0; i < lamps.length; i++) {
      const s = lamps[i], k = Math.min(1, s.age / T.popTime);
      let fl = 0.94 + 0.06 * Math.sin(time * 23 + s.seed);
      if (s.health < s.maxHealth * 0.4 && Math.sin(time * 31 + s.seed * 9) > 0.55) fl *= 0.35;
      s.pulse = Math.max(0, s.pulse - dt * 3);
      s.lightI = 42 * nightK * fl * k;
      if (s.disc) s.disc.mesh.material.opacity = (0.34 + s.pulse * 0.16) * (0.35 + 0.65 * nightK) * fl * k;
      s.lens.visible = fl > 0.5;
    }

    // campfires
    healedFrame = false; let nearFire = 0;
    for (let i = 0; i < fires.length; i++) {
      const s = fires[i], k = Math.min(1, s.age / T.popTime);
      s.life -= dt;
      const burn = clamp(s.life / 12, 0, 1) * k;
      for (let j = 0; j < 3; j++) {
        const f = s.flames[j], w = time * (7 + j * 2.3) + s.seed + j * 1.7;
        const sy = (1 + 0.22 * Math.sin(w) + 0.1 * Math.sin(w * 2.3)) * burn, sxz = (1 + 0.12 * Math.sin(w * 1.3 + 1)) * (0.35 + 0.65 * burn);
        f.scale.set(sxz, Math.max(0.001, sy), sxz); f.rotation.y += dt * (1.5 + j);
      }
      s.emT -= dt;
      if (s.emT <= 0) {
        s.emT = 0.07 + Math.random() * 0.12 + (1 - burn) * 0.3;
        spawnP(s.position.x + (Math.random() - 0.5) * 0.4, s.position.y + 0.5 + Math.random() * 0.4, s.position.z + (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.9, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.9, 0.9 + Math.random() * 0.8, 0.05 + Math.random() * 0.04, 3, 1.2, 0.3, -0.5);
      }
      s.lightI = 20 * burn * (0.85 + 0.15 * Math.sin(time * 13 + s.seed) + 0.08 * Math.sin(time * 31 + s.seed * 2)) * (0.55 + 0.45 * nightK);
      s.pulse = Math.max(0, s.pulse - dt * 2.5);
      if (pp && p.alive !== false) {
        const dx = pp.x - s.position.x, dz = pp.z - s.position.z, d2 = dx * dx + dz * dz;
        if (d2 < 196 && burn > nearFire) nearFire = burn / (1 + d2 / 40);
        if (d2 < T.fireR * T.fireR && !healedFrame && burn > 0.05 && p.heal && p.health < (p.maxHealth || 100)) {
          healedFrame = true; s.healAcc += T.fireHeal * dt;
          if (s.healAcc >= 1) {
            s.healAcc -= 1; s.pulse = 1; p.heal(1);
            spawnP(pp.x + (Math.random() - 0.5) * 0.7, pp.y + 0.2 + Math.random() * 0.8, pp.z + (Math.random() - 0.5) * 0.7, 0, 1.3, 0, 0.7, 0.07, COL_OK.r * 2.2, COL_OK.g * 2.2, COL_OK.b * 2.2, -0.3);
          }
        }
      }
      if (s.disc) s.disc.mesh.material.opacity = (0.3 + 0.08 * Math.sin(time * 2.2 + s.seed) + s.pulse * 0.3) * burn * (0.4 + 0.6 * nightK);
      if (s.life <= 0) s.health = -1;
    }
    crackT -= dt;
    if (nearFire > 0.02 && crackT <= 0) { crackT = 0.07 + Math.random() * 0.4; sfx.noise('bandpass', 1500 + Math.random() * 3000, 4, 0.03, 0.09 * Math.min(1, nearFire)); }

    // turrets + salvage prompt
    salvageT = null; let bestD = T.salvageDist * T.salvageDist;
    lootNear = !!(game.loot && game.loot.nearest);
    for (let i = 0; i < turrets.length; i++) {
      const s = turrets[i];
      updateTurret(s, dt);
      if (s.empty && pp) { const dx = pp.x - s.position.x, dz = pp.z - s.position.z, d2 = dx * dx + dz * dz; if (d2 < bestD) { bestD = d2; salvageT = s; } }
    }
    if (lootNear) salvageT = null;

    // damage feedback + sweep
    for (let i = structures.length - 1; i >= 0; i--) {
      const s = structures[i];
      if (s.type !== 'trap') {
        if (s.hurtT > 0) {
          s.hurtT -= dt; s.group.rotation.z = s.hurtT > 0 ? Math.sin(time * 55 + s.seed) * 0.035 : 0;
          s.fxT -= dt;
          if (s.fxT <= 0) {
            s.fxT = 0.22;
            burstSparks(s.position.x, s.position.y + (s.type === 'campfire' ? 0.3 : 0.9), s.position.z, 3, 3, 1.5, 0.4, 2.5, 3);
            if (hitSndT <= 0) { hitSndT = 0.2; const v = volAt(s.position); sfx.noise('bandpass', 900, 1.5, 0.08, 0.3 * v); sfx.tone('square', 320, 140, 0.06, 0.1 * v); }
          }
        } else if (s.health < s.maxHealth * 0.4 && s.type !== 'campfire') {
          s.fxT -= dt;
          if (s.fxT <= 0) { s.fxT = 0.5 + Math.random() * 0.9; burstSparks(s.position.x, s.position.y + (s.type === 'lamp' ? 3 : 1.1), s.position.z, 3, 3, 2, 0.6, 1.8, 2.5); }
        }
      }
      if (s.health <= 0) removeStructure(s, s.type === 'campfire' && s.life <= 0 ? 'burnout' : 'break');
    }
  }

  function updateLights(dt) {
    slotT -= dt;
    if (slotT <= 0) {
      slotT = 0.3;
      const p = game.player, pp = p && p.position, cx = pp ? pp.x : 0, cz = pp ? pp.z : 0;
      for (let i = 0; i < lit.length; i++) lit[i].wantLight = false;
      for (let n = 0; n < SLOTS; n++) {
        let best = null, bd = Infinity;
        for (let i = 0; i < lit.length; i++) {
          const s = lit[i]; if (s.wantLight) continue;
          const dx = s.position.x - cx, dz = s.position.z - cz, d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; best = s; }
        }
        if (!best) break;
        best.wantLight = true;
      }
      for (let i = 0; i < SLOTS; i++) { const sl = slots[i]; if (sl.owner) sl.release = !sl.owner.alive || !sl.owner.wantLight; }
      for (let i = 0; i < lit.length; i++) {
        const s = lit[i]; if (!s.wantLight || s.slot) continue;
        for (let k = 0; k < SLOTS; k++) {
          const sl = slots[k]; if (sl.owner) continue;
          sl.owner = s; s.slot = sl; sl.release = false; sl.k = 0;
          sl.light.color.copy(s.type === 'lamp' ? LAMP_LIGHT : FIRE_LIGHT);
          sl.light.distance = s.type === 'lamp' ? 17 : 12;
          break;
        }
      }
    }
    for (let i = 0; i < SLOTS; i++) {
      const sl = slots[i], o = sl.owner; if (!o) continue;
      if (!o.alive) sl.release = true;
      sl.k += ((sl.release ? 0 : 1) - sl.k) * Math.min(1, dt * 7);
      if (!sl.release) { sl.I = o.lightI; sl.light.position.set(o.position.x, o.position.y + (o.type === 'lamp' ? 2.5 : 0.8), o.position.z); }
      sl.light.intensity = sl.I * sl.k;
      if (sl.release && sl.k < 0.03) { sl.light.intensity = 0; o.slot = null; sl.owner = null; }
    }
    if (flashI > 0.01) { flashI *= Math.exp(-dt * 38); flashLight.intensity = flashI; } else if (flashLight.intensity !== 0) { flashI = 0; flashLight.intensity = 0; }
  }

  // ---------------------------------------------------------------- DOM widget (left edge, vertically centred)
  const ui = { root: null, scrap: null, rows: [], counts: [], hint: null, note: null };
  const last = { on: null, open: null, scrap: -1, sel: -2, hint: '', hintBad: null, note: null, aff: [null, null, null, null], cnt: ['', '', '', ''], full: [null, null, null, null] };
  (function buildUI() {
    const hud = document.getElementById('hud'); if (!hud) return;
    const st = document.createElement('style');
    st.textContent = `
#bld{position:absolute;left:18px;top:50%;height:248px;width:222px;transform:translateY(-50%);display:none;font-family:var(--mono);color:var(--bone);filter:drop-shadow(0 2px 8px rgba(0,0,0,.6))}
#bld.on{display:block}
#bld .bh{display:flex;align-items:center;gap:8px;width:max-content;padding:6px 16px 6px 9px;background:linear-gradient(var(--panel),var(--panel)),rgba(7,10,20,.45);border-left:3px solid var(--steel);clip-path:polygon(0 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%);transition:border-color .15s}
#bld.open .bh{border-left-color:var(--ember)}
#bld .bt{font-size:11px;letter-spacing:.26em;color:var(--bone)}
#bld .bk{font:700 11px/1 var(--mono);color:var(--ink);background:var(--bone);padding:3px 5px 2px;clip-path:polygon(0 0,100% 0,100% 70%,78% 100%,0 100%)}
#bld.open .bk{background:var(--ember)}
#bld .bsc{display:flex;align-items:center;gap:5px;margin-left:6px;padding-left:9px;border-left:1px solid var(--line)}
#bld .bsc svg{width:13px;height:13px;stroke:var(--steel);fill:none;stroke-width:1.8}
#bld .bsn{font:700 21px/1 var(--display);letter-spacing:.02em;min-width:1.2em;display:inline-block}
#bld .bsn.bump{animation:bldBump .22s ease-out}
@keyframes bldBump{0%{transform:scale(1.45);color:var(--ember)}100%{transform:scale(1)}}
#bld .brs{margin-top:5px;opacity:0;visibility:hidden;transform:translateX(-16px);transition:opacity .16s,transform .18s cubic-bezier(.2,.9,.3,1.2),visibility 0s .18s}
#bld.open .brs{opacity:1;visibility:visible;transform:none;transition:opacity .16s,transform .18s cubic-bezier(.2,.9,.3,1.2)}
#bld .br{display:grid;grid-template-columns:22px 1fr auto 36px;align-items:center;gap:8px;height:36px;padding:0 9px 0 8px;margin-top:3px;background:linear-gradient(var(--panel),var(--panel)),rgba(7,10,20,.4);border-left:3px solid var(--line);clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,0 100%);transition:transform .14s cubic-bezier(.2,.9,.3,1.3),opacity .14s}
#bld .br svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
#bld .bn{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
#bld .bc{font:700 18px/1 var(--display);color:var(--ember);display:flex;align-items:center;gap:4px}
#bld .bc i{width:6px;height:6px;background:currentColor;transform:rotate(45deg);opacity:.8}
#bld .bq{font:600 14px/1 var(--display);letter-spacing:.04em;color:var(--dim);text-align:right}
#bld .br.off{opacity:.42}
#bld .br.full .bq{color:var(--blood)}
#bld .br.sel{opacity:1;background:var(--ember);color:var(--ink);border-left-color:var(--bone);transform:translateX(9px)}
#bld .br.sel .bc,#bld .br.sel .bq{color:var(--ink)}
#bld .br.sel.off{background:linear-gradient(rgba(7,10,20,.35),rgba(7,10,20,.35)),var(--ember)}
#bld .bhint{margin-top:7px;padding-left:11px;font-size:10px;letter-spacing:.16em;color:var(--toxic);text-shadow:0 1px 3px #000,0 0 8px rgba(0,0,0,.8)}
#bld .bhint.bad{color:#ff6b78}
#bld .bnote{position:absolute;left:0;top:-30px;display:none;padding:5px 12px 5px 9px;font-size:10.5px;letter-spacing:.14em;color:var(--ink);background:var(--ember);clip-path:polygon(0 0,100% 0,100% 60%,calc(100% - 8px) 100%,0 100%);white-space:nowrap}
#bld .bnote.show{display:block}`;
    document.head.appendChild(st);
    const root = document.createElement('div'); root.id = 'bld';
    let rows = '';
    for (const p of PIECES) {
      rows += `<div class="br"><svg viewBox="0 0 22 22">${ICONS[p.id]}</svg><span class="bn">${p.name}</span><span class="bc"><i></i>${p.cost}</span><span class="bq">0/${p.cap}</span></div>`;
    }
    root.innerHTML = `<div class="bnote">[F] SALVAGE TURRET +${T.turretSalvage}</div>
<div class="bh"><span class="bt">BUILD</span><span class="bk">Z</span><span class="bsc"><svg viewBox="0 0 14 14"><path d="M7 1l5.2 3v6L7 13 1.8 10V4z"/><circle cx="7" cy="7" r="1.8"/></svg><b class="bsn">0</b></span></div>
<div class="brs">${rows}<div class="bhint"></div></div>`;
    hud.appendChild(root);
    ui.root = root; ui.scrap = root.querySelector('.bsn'); ui.hint = root.querySelector('.bhint'); ui.note = root.querySelector('.bnote');
    ui.rows = Array.from(root.querySelectorAll('.br')); ui.counts = ui.rows.map((r) => r.querySelector('.bq'));
  })();
  const HINTS = ['LMB PLACE · RMB CANCEL', '', '', 'NO GROUND', 'BLOCKED', 'TOO STEEP'];
  function syncUI() {
    if (!ui.root) return;
    const on = game.state === 'playing';      // hidden behind the menu and under the game-over card
    if (on !== last.on) { last.on = on; ui.root.classList.toggle('on', on); }
    if (!on) return;
    const open = sel >= 0;
    if (open !== last.open) { last.open = open; ui.root.classList.toggle('open', open); }
    const sc = scrapNow();
    if (sc !== last.scrap) {
      const first = last.scrap < 0; last.scrap = sc; ui.scrap.textContent = String(sc);
      if (!first) { ui.scrap.classList.remove('bump'); void ui.scrap.offsetWidth; ui.scrap.classList.add('bump'); }
    }
    if (sel !== last.sel) {
      if (last.sel >= 0) ui.rows[last.sel].classList.remove('sel');
      if (sel >= 0) ui.rows[sel].classList.add('sel');
      last.sel = sel;
    }
    for (let i = 0; i < PIECES.length; i++) {
      const p = PIECES[i], full = p.count >= p.cap, aff = sc >= p.cost && !full;
      if (aff !== last.aff[i]) { last.aff[i] = aff; ui.rows[i].classList.toggle('off', !aff); }
      if (full !== last.full[i]) { last.full[i] = full; ui.rows[i].classList.toggle('full', full); }
      if (p.count !== last.cnt[i]) { last.cnt[i] = p.count; ui.counts[i].textContent = p.count + '/' + p.cap; }
    }
    if (open) {
      const def = PIECES[sel], bad = ghostReason !== 0;
      const txt = ghostReason === 1 ? 'NEED ' + def.cost + ' SCRAP' : ghostReason === 2 ? 'LIMIT ' + def.cap + '/' + def.cap : HINTS[ghostReason];
      if (txt !== last.hint) { last.hint = txt; ui.hint.textContent = txt; }
      if (bad !== last.hintBad) { last.hintBad = bad; ui.hint.classList.toggle('bad', bad); }
    }
    const note = !!salvageT;
    if (note !== last.note) { last.note = note; ui.note.classList.toggle('show', note); }
  }

  // ---------------------------------------------------------------- input + events
  let time = 0, prevFire = false, prevAim = false, lastNow = 0, logged = false;
  function cycle() {
    if (game.state !== 'playing' || game.paused) return;
    const p = game.player; if (p && p.alive === false) return;
    setSel(sel + 1 >= PIECES.length ? -1 : sel + 1);
    ghostReason = 0;
    if (sel >= 0) { sfx.tone('triangle', 540 + sel * 90, 760 + sel * 90, 0.06, 0.16); sfx.noise('highpass', 4000, 1, 0.03, 0.06); } else sfx.tone('triangle', 520, 330, 0.07, 0.13);
  }
  function salvage() {
    if (game.state !== 'playing' || lootNear) return;
    const s = salvageT; if (!s || !s.alive || !s.empty) return;
    const inv = game.loot && game.loot.inventory;
    if (inv) inv.scrap = (inv.scrap | 0) + T.turretSalvage;
    salvageT = null;
    removeStructure(s, 'salvage');
    game.emit('pickup', { kind: 'scrap', id: 'scrap', amount: T.turretSalvage, name: 'Turret salvage' });
  }
  game.on('keydown', (code) => { if (code === 'KeyZ') cycle(); else if (code === 'KeyF') salvage(); });
  const leave = () => { exitBuild(); syncUI(); };
  game.on('weaponSwitch', leave);
  game.on('playerDied', leave);
  game.on('gameOver', leave);
  game.on('gameStart', () => { sfx.start(); syncUI(); });

  function step(dt) {
    time += dt;
    const p = game.player, inp = p && p.input;
    const fire = !!(inp && inp.fire), aim = !!(inp && inp.aim);
    const now = performance.now();
    if (now - lastNow > 300) { prevFire = fire; prevAim = aim; }   // resumed from pause: swallow held buttons
    lastNow = now;
    const fireEdge = fire && !prevFire, aimEdge = aim && !prevAim;
    prevFire = fire; prevAim = aim;

    if (sel >= 0) {
      if (!p || !p.position || p.alive === false || aimEdge) exitBuild();
      else { updateGhost(p); if (fireEdge) tryPlace(); }
    } else if (game.buildMode) game.buildMode = false;

    updateStructures(dt);
    updateLights(dt);
    updateParticles(dt);
    updateDebris(dt);
    updateTracers(dt);
    syncUI();
  }
  function update(dt) {
    try { step(dt); } catch (e) { if (!logged) { logged = true; console.error('[build.update]', e); } }
  }

  function reset() {
    for (let i = structures.length - 1; i >= 0; i--) removeStructure(structures[i], 'silent');
    structures.length = 0; traps.length = 0; lamps.length = 0; fires.length = 0; turrets.length = 0; lit.length = 0; targets.length = 0;
    for (const p of PIECES) p.count = 0;
    for (const d of lampDiscs) { d.used = false; d.mesh.visible = false; }
    for (const d of fireDiscs) { d.used = false; d.mesh.visible = false; }
    for (const sl of slots) { sl.owner = null; sl.k = 0; sl.I = 0; sl.release = false; sl.light.intensity = 0; }
    flashI = 0; flashLight.intensity = 0; slotT = 0;
    pLife.fill(0); pActive = 0; pMesh.visible = false;
    for (let i = 0; i < P_N; i++) { const o = i * 16; pArr[o] = pArr[o + 5] = pArr[o + 10] = 0; }
    pMesh.instanceMatrix.needsUpdate = true;
    dLife.fill(0); dActive = 0; dMesh.visible = false;
    dArr.fill(0); for (let i = 0; i < D_N; i++) dArr[i * 16 + 15] = 1;
    dMesh.instanceMatrix.needsUpdate = true;
    for (const t of tracers) { t.life = 0; t.mesh.visible = false; }
    trActive = 0;
    setSel(-1); game.buildMode = false;
    for (const g of ghosts) g.visible = false;
    ghostReason = 0; salvageT = null; lootNear = false; prevFire = false; prevAim = false; lastNow = 0;
    trapSndT = 0; hitSndT = 0; shotSndT = 0; crackT = 0; logged = false;
    last.scrap = -1;
    syncUI();
  }

  game.buildMode = false;
  const api = {
    update, reset, structures, pieces: PIECES,
    get selected() { return sel < 0 ? null : PIECES[sel].id; },
    select(id) { const i = PIECES.findIndex((p) => p.id === id); setSel(i); },
  };
  return api;
}
