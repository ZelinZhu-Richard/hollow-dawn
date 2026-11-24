// HOLLOW DAWN — world: island terrain, compounds, props, sky, lighting, colliders, flow field.
import * as THREE from 'three';

// ---------------------------------------------------------------- noise / math helpers
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function fbm(x, z, oct) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x, z) * a; n += a; x = x * 2.03 + 17.1; z = z * 2.03 + 9.7; a *= 0.5; }
  return s / n;
}
function sstep(a, b, x) { let t = (x - a) / (b - a); t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- building constants
const WALL_H = 3.1, WALL_T = 0.3, DOOR_H = 2.7, SILL = 1.0, WIN_TOP = 2.15;

export function init(game) {
  const CONFIG = game.CONFIG, WC = CONFIG.world, scene = game.scene;
  const SIZE = WC.size, HALF = SIZE / 2, SEA = WC.seaLevel, CELL = WC.cell;
  const LAND_MIN = SEA + 0.25;
  const rand = mulberry32(90210);
  const rr = (a, b) => a + (b - a) * rand();

  // ============================================================== compound definitions
  // Centres are odd integers and all structural offsets are even, so every wall lies on a
  // flow-cell centre line and every door is exactly one 2 m flow cell wide.
  const COMPOUNDS = [
    {
      name: 'Harrow Farm', x: -95, z: 65, r: 30, wall: 0x8a4b3c, trim: 0xd8ccb0, roof: 0x363b47, floor: 0x6b5843, ground: 0x7c6848, gable: true,
      buildings: [
        { ox: -18, oz: -14, w: 12, d: 8, doors: [['s', 3], ['e', 2]], windows: [['n', 2], ['n', 4], ['w', 2], ['s', 1], ['s', 5]], wall: 0xb9ad92 },
        { ox: 2, oz: -18, w: 10, d: 14, doors: [['w', 3], ['w', 4], ['s', 2]], windows: [['e', 2], ['e', 5], ['n', 2]] },
        { ox: -16, oz: 6, w: 6, d: 6, doors: [['n', 1]], windows: [['s', 2]], wall: 0x6f5a44 },
      ],
      yard: [[-4, -3], [0, 11], [-23, 0], [14, 21]],
    },
    {
      name: 'Cinder Depot', x: 93, z: 79, r: 30, wall: 0x7f8a8c, trim: 0xc8552e, roof: 0x2e3338, floor: 0x55585c, ground: 0x6a665e, gable: false,
      buildings: [
        { ox: -20, oz: -14, w: 8, d: 8, doors: [['e', 2]], windows: [['n', 2], ['s', 2], ['w', 1], ['w', 3]], wall: 0xa9a394 },
        { ox: -6, oz: -20, w: 14, d: 8, doors: [['s', 2], ['s', 3], ['s', 5]], windows: [['n', 2], ['n', 5], ['e', 2]] },
      ],
      yard: [[3, 9], [12, -7], [-8, 0], [9, 19]],
    },
    {
      name: 'Signal Rise', x: 5, z: -7, r: 24, wall: 0x8b8f86, trim: 0x4c5a4a, roof: 0x3b423c, floor: 0x5a5b56, ground: 0x736d5e, gable: false,
      buildings: [
        { ox: -14, oz: -10, w: 10, d: 8, doors: [['s', 2], ['e', 2]], windows: [['n', 1], ['n', 3], ['w', 2]] },
        { ox: 4, oz: -12, w: 6, d: 6, doors: [['w', 1]], windows: [['e', 1], ['s', 2]], wall: 0x6f7a6c },
      ],
      yard: [[0, 3], [13, 2], [-8, 9], [3, 15]],
    },
    {
      name: 'Gullwrack Dock', x: 143, z: -51, r: 26, wall: 0x6f8794, trim: 0xe4dcc8, roof: 0x4a3d38, floor: 0x7a6a55, ground: 0x9a8c6c, gable: true,
      buildings: [
        { ox: -16, oz: -12, w: 10, d: 8, doors: [['e', 2], ['s', 2]], windows: [['n', 2], ['n', 4], ['w', 2]] },
        { ox: 0, oz: 2, w: 6, d: 8, doors: [['n', 1]], windows: [['e', 2], ['w', 2]], wall: 0x8c7a62 },
        { ox: -14, oz: 4, w: 6, d: 6, doors: [['e', 1]], windows: [['s', 1], ['w', 1]], wall: 0x5d7480 },
      ],
      yard: [[3, -7], [-4, 0], [11, 7], [-3, 15]],
    },
    {
      name: 'Marrow School', x: -103, z: -83, r: 30, wall: 0xa9744f, trim: 0xe0d6bf, roof: 0x3f3a44, floor: 0x76684f, ground: 0x7a705c, gable: true,
      buildings: [
        { ox: -20, oz: -14, w: 20, d: 10, doors: [['s', 4], ['s', 5], ['n', 8], ['w', 2]],
          windows: [['n', 2], ['n', 4], ['n', 6], ['s', 1], ['s', 2], ['s', 7], ['s', 8], ['e', 2], ['e', 3]], partition: { k: 3, door: 2 } },   // k must not land inside a door / window span (k: 5 split the south double door)
        { ox: 6, oz: -16, w: 10, d: 12, doors: [['w', 3], ['s', 2]], windows: [['e', 2], ['e', 4], ['n', 2], ['n', 3]], wall: 0x9a8a72 },
      ],
      yard: [[3, 4], [12, 17], [-16, 3], [3, -10]],
    },
    {
      name: 'Lowfield Yard', x: 15, z: 125, r: 30, wall: 0x6d7682, trim: 0xd0a23a, roof: 0x30343c, floor: 0x5c5a58, ground: 0x6c6a66, gable: false,
      buildings: [
        { ox: -22, oz: -14, w: 18, d: 12, doors: [['s', 3], ['s', 4], ['e', 3], ['n', 7]], windows: [['n', 2], ['n', 4], ['w', 2], ['w', 4], ['s', 7]] },
        { ox: 4, oz: -16, w: 8, d: 6, doors: [['s', 2]], windows: [['n', 1], ['n', 3], ['e', 1]], wall: 0xb8b2a0 },
        { ox: 6, oz: 0, w: 10, d: 8, doors: [['w', 2], ['n', 3]], windows: [['s', 2], ['e', 2]], wall: 0x7a5a48 },
      ],
      yard: [[0, 3], [-8, 15], [1, -7], [19, 13]],
    },
  ];
  const ROADS = [[0, 2], [2, 1], [2, 4], [2, 3], [5, 0], [5, 1], [1, 3], [4, 0]];

  // ============================================================== height field
  const TS = 2, TN = Math.round(SIZE / TS), TV = TN + 1, INV_TS = 1 / TS, TN_EPS = TN - 1e-4;
  const hgrid = new Float32Array(TV * TV);

  function edgeDist(x, z) { const x2 = x * x, z2 = z * z; return HALF - Math.sqrt(Math.sqrt(x2 * x2 + z2 * z2)); }
  function landBase(x, z, ed) {
    const coast = sstep(8, 60, ed);
    const n1 = fbm(x * 0.0065 + 11.3, z * 0.0065 + 4.1, 4);
    const hills = Math.pow(sstep(0.32, 0.8, n1), 1.3) * 11.5 * coast;
    const bx = x - 5, bz = z + 7;
    const bump = 4.5 * Math.exp(-(bx * bx + bz * bz) / 5000) * coast;
    const detail = fbm(x * 0.035 + 40, z * 0.035 + 17, 2) - 0.5;
    return 1.7 + hills + bump + detail * (0.5 + hills * 0.12);
  }
  for (const c of COMPOUNDS) {
    c.gy = Math.min(11, Math.max(2.0, landBase(c.x, c.z, edgeDist(c.x, c.z))));
  }
  function padWeight(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    return 1 - sstep(c.r, c.r + 16, Math.sqrt(dx * dx + dz * dz));
  }
  function heightFn(x, z) {
    const ed = edgeDist(x, z);
    let land = landBase(x, z, ed);
    for (let i = 0; i < COMPOUNDS.length; i++) {
      const c = COMPOUNDS[i];
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz > (c.r + 16) * (c.r + 16)) continue;
      const w = padWeight(c, x, z);
      land += (c.gy - land) * w;
    }
    const m = sstep(2, WC.shoreMargin + 2, ed + (fbm(x * 0.02 + 70, z * 0.02 + 31, 2) - 0.5) * 12);
    return -5 + (land + 5) * m;
  }
  let MAX_H = 1;
  for (let iz = 0; iz < TV; iz++) {
    for (let ix = 0; ix < TV; ix++) {
      const h = heightFn(-HALF + ix * TS, -HALF + iz * TS);
      hgrid[iz * TV + ix] = h;
      if (h > MAX_H) MAX_H = h;
    }
  }
  MAX_H += 0.5;

  function heightAt(x, z) {
    let fx = (x + HALF) * INV_TS, fz = (z + HALF) * INV_TS;
    if (fx !== fx || fz !== fz) return 0;
    if (fx < 0) fx = 0; else if (fx > TN_EPS) fx = TN_EPS;
    if (fz < 0) fz = 0; else if (fz > TN_EPS) fz = TN_EPS;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
    const i = iz * TV + ix;
    const a = hgrid[i], b = hgrid[i + 1], c = hgrid[i + TV], d = hgrid[i + TV + 1];
    return (tx + tz <= 1) ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }
  function groundAt(x, z) { const h = heightAt(x, z); return h > SEA ? h : SEA; }

  function roadDist(x, z) {
    let best = 1e9;
    for (let i = 0; i < ROADS.length; i++) {
      const a = COMPOUNDS[ROADS[i][0]], b = COMPOUNDS[ROADS[i][1]];
      const abx = b.x - a.x, abz = b.z - a.z;
      let t = ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz);
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const dx = x - (a.x + abx * t), dz = z - (a.z + abz * t);
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
  function inCompound(x, z, margin) {
    for (let i = 0; i < COMPOUNDS.length; i++) {
      const c = COMPOUNDS[i], dx = x - c.x, dz = z - c.z, r = c.r + margin;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // ============================================================== terrain mesh
  {
    const pos = new Float32Array(TV * TV * 3), col = new Float32Array(TV * TV * 3);
    const cGrassA = new THREE.Color(0x4a7537), cGrassB = new THREE.Color(0x688c42), cDry = new THREE.Color(0x8b8c4a);
    const cRoad = new THREE.Color(0x8a7453), cSand = new THREE.Color(0xcbb887), cWet = new THREE.Color(0x8f8463);
    const cBed = new THREE.Color(0x2f4c4f), cRock = new THREE.Color(0x77797a), cPad = new THREE.Color();
    const c = new THREE.Color();
    for (let iz = 0; iz < TV; iz++) {
      for (let ix = 0; ix < TV; ix++) {
        const i = iz * TV + ix, x = -HALF + ix * TS, z = -HALF + iz * TS, h = hgrid[i];
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
        const hx = hgrid[iz * TV + Math.min(TN, ix + 1)] - hgrid[iz * TV + Math.max(0, ix - 1)];
        const hz = hgrid[Math.min(TN, iz + 1) * TV + ix] - hgrid[Math.max(0, iz - 1) * TV + ix];
        const slope = Math.sqrt(hx * hx + hz * hz) / (2 * TS);
        c.copy(cGrassA).lerp(cGrassB, fbm(x * 0.045 + 3, z * 0.045 + 8, 2));
        c.lerp(cDry, sstep(0.55, 0.75, fbm(x * 0.013 + 90, z * 0.013 + 60, 3)) * 0.7);
        c.lerp(cRock, sstep(0.42, 0.8, slope) * 0.9 + sstep(11, 15, h) * 0.4);
        for (let k = 0; k < COMPOUNDS.length; k++) {
          const cp = COMPOUNDS[k], dx = x - cp.x, dz = z - cp.z;
          if (dx * dx + dz * dz > (cp.r + 8) * (cp.r + 8)) continue;
          const w = 1 - sstep(cp.r - 6, cp.r + 6, Math.sqrt(dx * dx + dz * dz) + (vnoise(x * 0.2, z * 0.2) - 0.5) * 6);
          c.lerp(cPad.setHex(cp.ground), w * 0.9);
        }
        const rd = roadDist(x, z) + (vnoise(x * 0.15 + 5, z * 0.15) - 0.5) * 1.6;
        c.lerp(cRoad, sstep(3.6, 1.6, rd) * 0.92);
        c.lerp(cSand, sstep(1.55, 0.95, h));
        c.lerp(cWet, sstep(0.45, 0.05, h));
        c.lerp(cBed, sstep(-0.2, -2.5, h));
        const j = 0.93 + hash2(ix * 7 + 1, iz * 13 + 5) * 0.14;
        col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
      }
    }
    const idx = new Uint32Array(TN * TN * 6);
    let p = 0;
    for (let iz = 0; iz < TN; iz++) {
      for (let ix = 0; ix < TN; ix++) {
        const a = iz * TV + ix, b = a + 1, cc = a + TV, d = cc + 1;
        idx[p++] = a; idx[p++] = cc; idx[p++] = b; idx[p++] = b; idx[p++] = cc; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    scene.add(mesh);
  }

  // ============================================================== water
  const timeU = { value: 0 };
  {
    const geo = new THREE.PlaneGeometry(1700, 1700, 130, 130);
    const mat = new THREE.MeshPhongMaterial({ color: 0x2b6f88, specular: 0x55687a, shininess: 70, flatShading: true, transparent: true, opacity: 0.9 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeU;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed.z += sin(position.x * 0.11 + uTime * 0.9) * 0.13 + cos(position.y * 0.13 + uTime * 0.7) * 0.13;');
    };
    const water = new THREE.Mesh(geo, mat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = SEA - 0.14;
    water.receiveShadow = false;
    water.name = 'water';
    scene.add(water);
  }

  // ============================================================== colliders + spatial hash
  const HC = 8, HN = Math.ceil(SIZE / HC);
  const hash = new Array(HN * HN);
  for (let i = 0; i < hash.length; i++) hash[i] = [];
  const colliders = [];

  // flow grid (declared here because addCollider marks it)
  const FN = Math.round(SIZE / CELL), FCOUNT = FN * FN, UNR = 0xFFFF, FM = 0.1;
  const cnt = new Uint8Array(FCOUNT);              // >0 = blocked (sea = 200)
  let dist = new Uint16Array(FCOUNT).fill(UNR), work = new Uint16Array(FCOUNT);
  const queue = new Int32Array(FCOUNT + 16);
  let qHead = 0, qTail = 0, bfsRunning = false, flowReady = false, flowTimer = 0, flowDirty = false;
  const NDX = [1, -1, 0, 0, 1, 1, -1, -1], NDZ = [0, 0, 1, -1, 1, -1, 1, -1];

  function hashRange(v) { let i = Math.floor((v + HALF) / HC); return i < 0 ? 0 : (i >= HN ? HN - 1 : i); }
  function cellOf(v) { let i = Math.floor((v + HALF) / CELL); return i < 0 ? 0 : (i >= FN ? FN - 1 : i); }
  function cellCentre(i) { return -HALF + (i + 0.5) * CELL; }

  function markFlow(c, delta) {
    const b = c.box;
    const i0 = cellOf(b.min.x), i1 = cellOf(b.max.x), j0 = cellOf(b.min.z), j1 = cellOf(b.max.z);
    for (let j = j0; j <= j1; j++) {
      const zc0 = -HALF + j * CELL + FM, zc1 = -HALF + (j + 1) * CELL - FM;
      if (zc0 >= b.max.z || zc1 <= b.min.z) continue;
      for (let i = i0; i <= i1; i++) {
        const xc0 = -HALF + i * CELL + FM, xc1 = -HALF + (i + 1) * CELL - FM;
        if (xc0 >= b.max.x || xc1 <= b.min.x) continue;
        const k = j * FN + i;
        if (delta > 0) { if (cnt[k] < 250) cnt[k]++; } else if (cnt[k] > 0) cnt[k]--;
      }
    }
    flowDirty = true;
  }
  function addCol(box, type, ref, dynamic) {
    const c = { box, type, ref: ref === undefined ? null : ref, _s: 0, _flow: false, _dyn: !!dynamic };
    colliders.push(c);
    const i0 = hashRange(box.min.x), i1 = hashRange(box.max.x), j0 = hashRange(box.min.z), j1 = hashRange(box.max.z);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) hash[j * HN + i].push(c);
    if (type !== 'barricade') {
      const gy = heightAt((box.min.x + box.max.x) * 0.5, (box.min.z + box.max.z) * 0.5);
      if (box.min.y <= gy + 1.0 && box.max.y > gy + 0.3) { c._flow = true; markFlow(c, 1); }
    }
    return c;
  }
  function addCollider(box, type, ref) { return addCol(box, type || 'wall', ref, true); }
  function removeCollider(c) {
    if (!c || !c.box) return;
    const k = colliders.indexOf(c);
    if (k < 0) return;
    colliders.splice(k, 1);
    const box = c.box;
    const i0 = hashRange(box.min.x), i1 = hashRange(box.max.x), j0 = hashRange(box.min.z), j1 = hashRange(box.max.z);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cell = hash[j * HN + i], q = cell.indexOf(c);
        if (q >= 0) { cell[q] = cell[cell.length - 1]; cell.pop(); }
      }
    }
    if (c._flow) { c._flow = false; markFlow(c, -1); }
  }

  // ============================================================== instance batches
  const boxes = [], cyls = [], prisms = [], lanterns = [];
  // item: [x, y(centre), z, sx, sy, sz, ry, hex, jitter]
  function addBox(x, y, z, sx, sy, sz, hex, ry, jit) { boxes.push([x, y, z, sx, sy, sz, ry || 0, hex, 1 + (rand() - 0.5) * 2 * (jit === undefined ? 0.05 : jit)]); }
  function vis(x0, y0, z0, x1, y1, z1, hex, jit) { addBox((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, hex, 0, jit); }
  function solid(x0, y0, z0, x1, y1, z1, hex, type, jit) {
    vis(x0, y0, z0, x1, y1, z1, hex, jit);
    return addCol(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)), type || 'wall', null, false);
  }
  function cyl(x, y0, z, dia, h, hex, type) {
    cyls.push([x, y0 + h / 2, z, dia, h, dia, 0, hex, 1 + (rand() - 0.5) * 0.08]);
    if (type) {
      const r = dia * 0.44;
      addCol(new THREE.Box3(new THREE.Vector3(x - r, y0, z - r), new THREE.Vector3(x + r, y0 + h, z + r)), type, null, false);
    }
  }
  function crate(x, z, gy, s, hex, stack) {
    const h = s * (stack ? 1.9 : 1);
    addBox(x, gy + s / 2 - 0.04, z, s, s, s, hex, 0, 0.1);
    if (stack) addBox(x + 0.06, gy + s + s * 0.42 - 0.04, z - 0.05, s * 0.84, s * 0.84, s * 0.84, hex, 0, 0.12);
    addCol(new THREE.Box3(new THREE.Vector3(x - s / 2, gy - 0.3, z - s / 2), new THREE.Vector3(x + s / 2, gy + h, z + s / 2)), 'crate', null, false);
  }
  function seg(axis, c, s, e, y0, y1, hex, t, type) {
    t = t || WALL_T;
    if (axis === 'x') return solid(s, y0, c - t / 2, e, y1, c + t / 2, hex, type);
    return solid(c - t / 2, y0, s, c + t / 2, y1, e, hex, type);
  }
  function visSeg(axis, c, s, e, y0, y1, hex, t) {
    if (axis === 'x') vis(s, y0, c - t / 2, e, y1, c + t / 2, hex); else vis(c - t / 2, y0, s, c + t / 2, y1, e, hex);
  }
  function wallRun(axis, c, a, b, gy, ops, hex, ext) {
    let cur = a - ext;
    const end = b + ext;
    for (const o of ops) {
      const s = o.at - 1, e = o.at + 1;
      if (s > cur) seg(axis, c, cur, s, gy - 0.4, gy + WALL_H, hex);
      if (o.type === 'door') {
        seg(axis, c, s, e, gy + DOOR_H, gy + WALL_H, hex);
      } else {
        seg(axis, c, s, e, gy - 0.4, gy + SILL, hex);
        seg(axis, c, s, e, gy + WIN_TOP, gy + WALL_H, hex);
        visSeg(axis, c, s, e, gy + SILL - 0.02, gy + SILL + 0.06, 0x4a3d30, WALL_T + 0.16);       // sill board
        if (rand() < 0.6) visSeg(axis, c, s - 0.1, e + 0.1, gy + 1.42, gy + 1.6, 0x6a5238, WALL_T + 0.1); // boarded up
      }
      cur = e;
    }
    if (end > cur) seg(axis, c, cur, end, gy - 0.4, gy + WALL_H, hex);
  }
  function fence(axis, c, a, b, gy, hex, gaps, h) {
    const H = h || 1.1, T = 0.14;
    const pts = gaps ? gaps.slice().sort((p, q) => p - q) : [];
    const runs = [];
    let cur = a;
    for (const g of pts) { if (g - 1 > cur) runs.push([cur, g - 1]); cur = g + 1; }
    if (b > cur) runs.push([cur, b]);
    for (const [s, e] of runs) {
      const box = axis === 'x'
        ? new THREE.Box3(new THREE.Vector3(s, gy - 0.3, c - T / 2), new THREE.Vector3(e, gy + H, c + T / 2))
        : new THREE.Box3(new THREE.Vector3(c - T / 2, gy - 0.3, s), new THREE.Vector3(c + T / 2, gy + H, e));
      addCol(box, 'wall', null, false);
      visSeg(axis, c, s, e, gy + H * 0.36, gy + H * 0.36 + 0.1, hex, 0.07);
      visSeg(axis, c, s, e, gy + H * 0.8, gy + H * 0.8 + 0.1, hex, 0.07);
      for (let p = s; p <= e + 0.01; p += 2) {
        if (axis === 'x') vis(p - 0.08, gy - 0.3, c - 0.08, p + 0.08, gy + H + 0.08, c + 0.08, hex);
        else vis(c - 0.08, gy - 0.3, p - 0.08, c + 0.08, gy + H + 0.08, p + 0.08, hex);
      }
      if ((e - s) % 2 > 0.01) {
        if (axis === 'x') vis(e - 0.08, gy - 0.3, c - 0.08, e + 0.08, gy + H + 0.08, c + 0.08, hex);
        else vis(c - 0.08, gy - 0.3, e - 0.08, c + 0.08, gy + H + 0.08, e + 0.08, hex);
      }
    }
  }

  const compounds = [];
  const buildingRecs = [];
  function makeBuilding(c, d, spots) {
    const gy = c.gy, x0 = c.x + d.ox, z0 = c.z + d.oz, x1 = x0 + d.w, z1 = z0 + d.d;
    const wallHex = d.wall || c.wall;
    const ops = { n: [], s: [], w: [], e: [] };
    const at = (side, k) => ((side === 'n' || side === 's') ? x0 : z0) + 2 * k;
    for (const [side, k] of d.doors) ops[side].push({ at: at(side, k), type: 'door' });
    for (const [side, k] of (d.windows || [])) ops[side].push({ at: at(side, k), type: 'window' });
    for (const k in ops) ops[k].sort((p, q) => p.at - q.at);
    wallRun('x', z0, x0, x1, gy, ops.n, wallHex, WALL_T / 2);
    wallRun('x', z1, x0, x1, gy, ops.s, wallHex, WALL_T / 2);
    wallRun('z', x0, z0, z1, gy, ops.w, wallHex, -WALL_T / 2);
    wallRun('z', x1, z0, z1, gy, ops.e, wallHex, -WALL_T / 2);
    if (d.partition) wallRun('z', x0 + 2 * d.partition.k, z0, z1, gy, [{ at: z0 + 2 * d.partition.door, type: 'door' }], c.trim, -WALL_T / 2);
    // corner trims, floor, roof
    for (const px of [x0, x1]) for (const pz of [z0, z1]) vis(px - 0.21, gy - 0.3, pz - 0.21, px + 0.21, gy + WALL_H + 0.02, pz + 0.21, c.trim, 0.02);
    addBox((x0 + x1) / 2, gy - 0.18, (z0 + z1) / 2, d.w + 0.6, 0.44, d.d + 0.6, c.floor, 0, 0.02);
    const roof = solid(x0 - 0.6, gy + WALL_H, z0 - 0.6, x1 + 0.6, gy + WALL_H + 0.24, z1 + 0.6, c.roof, 'wall', 0.03);
    roof.roof = true;
    buildingRecs.push({ x0, z0, x1, z1, gy, doors: d.doors });
    if (c.gable) {
      const ridge = 1.3 + Math.min(d.w, d.d) * 0.12;
      // walkable pitched surface: height rises from the eaves to the ridge across the short span
      roof.gable = d.d >= d.w ? { x: true, c: (x0 + x1) / 2, half: (d.w + 1.3) / 2, ridge }
                              : { x: false, c: (z0 + z1) / 2, half: (d.d + 1.3) / 2, ridge };
      if (d.d >= d.w) prisms.push([(x0 + x1) / 2, gy + WALL_H + 0.24, (z0 + z1) / 2, d.w + 1.3, ridge, d.d + 1.3, 0, c.roof, 1]);
      else prisms.push([(x0 + x1) / 2, gy + WALL_H + 0.24, (z0 + z1) / 2, d.d + 1.3, ridge, d.w + 1.3, Math.PI / 2, c.roof, 1]);
    } else {
      // parapet lip + a roof vent
      vis(x0 - 0.6, gy + WALL_H + 0.24, z0 - 0.6, x1 + 0.6, gy + WALL_H + 0.5, z0 - 0.4, c.trim, 0.03);
      vis(x0 - 0.6, gy + WALL_H + 0.24, z1 + 0.4, x1 + 0.6, gy + WALL_H + 0.5, z1 + 0.6, c.trim, 0.03);
      vis(x0 + 1.2, gy + WALL_H + 0.24, z0 + 1.2, x0 + 2.4, gy + WALL_H + 0.9, z0 + 2.2, 0x4a4f55);
    }
    // lantern over the first door
    {
      const [side, k] = d.doors[0], p = at(side, k), y = gy + WALL_H - 0.12;
      if (side === 'n') lanterns.push([p, y, z0 - 0.3]); else if (side === 's') lanterns.push([p, y, z1 + 0.3]);
      else if (side === 'w') lanterns.push([x0 - 0.3, y, p]); else lanterns.push([x1 + 0.3, y, p]);
    }
    // interior crates hug the corners (kept inside the wall cell so they never seal a door)
    const area = d.w * d.d;
    crate(x0 + 0.6, z1 - 0.6, gy, 0.86, 0x7a6244, area > 60 && rand() < 0.6);
    if (area > 60) crate(x1 - 0.6, z0 + 0.6, gy, 0.86, 0x5f6a55, rand() < 0.4);
    if (area > 110) { crate(x1 - 0.6, z1 - 0.6, gy, 0.86, 0x7a6244, true); addBox(x0 + 0.75, gy + 0.45, z0 + 1.6, 1.0, 0.9, 2.2, 0x4f463c, 0, 0.05); }
    // loot spots
    const n = area <= 40 ? 2 : (area <= 100 ? 3 : 4);
    const cx = (x0 + x1) / 2 + (d.partition ? 3 : 0), cz = (z0 + z1) / 2;
    const cand = [[cx, cz], [x0 + 2.2, z0 + 2.2], [x1 - 2.2, z1 - 2.2], [x1 - 2.2, z0 + 2.2], [x0 + 2.2, z1 - 2.2]];
    for (let i = 0; i < n; i++) spots.push(cand[i]);
  }

  // ---- per-compound set dressing
  const EXTRAS = [
    // Harrow Farm
    (c, gy) => {
      const X = (o) => c.x + o, Z = (o) => c.z + o;
      fence('x', Z(2), X(4), X(20), gy, 0x8a7a62, [X(10)]);
      fence('x', Z(16), X(4), X(20), gy, 0x8a7a62);
      fence('z', X(4), Z(2), Z(16), gy, 0x8a7a62);
      fence('z', X(20), Z(2), Z(16), gy, 0x8a7a62, [Z(8)]);
      crate(X(8), Z(8.6), gy, 1.2, 0xc9a84e, true); crate(X(9.4), Z(8.4), gy, 1.2, 0xc2a046); crate(X(16), Z(12.5), gy, 1.2, 0xc9a84e);
      cyl(X(17), gy - 0.4, Z(-11), 4.4, 8.4, 0xb9b4a6, 'wall'); cyl(X(17), gy + 8.0, Z(-11), 4.8, 0.5, 0x5a2f28); cyl(X(17), gy + 8.5, Z(-11), 2.6, 0.5, 0x5a2f28);
      solid(X(-8.2), gy - 0.2, Z(7), X(-5.6), gy + 0.8, Z(8.2), 0x5b4a3a, 'crate');       // trough
      solid(X(-25), gy + 0.35, Z(-9), X(-22.6), gy + 1.3, Z(-5.4), 0x6b5a3e, 'crate');    // cart bed
      for (const dz of [-8.4, -6]) for (const dx of [-25.1, -22.5]) cyl(X(dx), gy - 0.1, Z(dz), 0.9, 0.9, 0x2a2622);
      cyl(X(-1), gy - 0.3, Z(12), 1.5, 1.0, 0x6f6a62, 'crate'); vis(X(-1.8), gy + 1.0, Z(11.9), X(-0.2), gy + 2.3, Z(12.1), 0x5b4a3a); // well
    },
    // Cinder Depot
    (c, gy) => {
      const X = (o) => c.x + o, Z = (o) => c.z + o;
      for (const px of [-2, 8]) for (const pz of [0, 6]) solid(X(px) - 0.18, gy - 0.3, Z(pz) - 0.18, X(px) + 0.18, gy + 3.5, Z(pz) + 0.18, 0xb8b8b0);
      solid(X(-3), gy + 3.5, Z(-1), X(9), gy + 3.85, Z(7), 0xc8552e, 'wall', 0.02).roof = true;
      vis(X(-3.05), gy + 3.55, Z(-1.05), X(9.05), gy + 3.7, Z(7.05), 0xe8e4d8, 0.01);
      crate(X(1), Z(3), gy, 0.8, 0xb3312c, true); crate(X(5), Z(3), gy, 0.8, 0xb3312c, true);
      vis(X(-0.2), gy - 0.2, Z(2.2), X(6.2), gy + 0.14, Z(3.8), 0x8a8a84);
      for (const tz of [-2, 6, 14]) { cyl(X(18), gy - 0.4, Z(tz), 5, 6, 0xd8d2c0, 'wall'); cyl(X(18), gy + 3.4, Z(tz), 5.08, 0.5, 0xc8552e); cyl(X(18), gy + 5.6, Z(tz), 3.2, 0.4, 0x9a9588); }
      vis(X(17.8), gy + 4.2, Z(-2), X(18.2), gy + 4.5, Z(14), 0x8d99ae);
      cyl(X(-12), gy - 0.2, Z(4), 0.7, 1.2, 0x3f6a8a, 'crate'); cyl(X(-11.1), gy - 0.2, Z(4.6), 0.7, 1.2, 0xb3312c, 'crate'); cyl(X(-12.2), gy - 0.2, Z(5.2), 0.7, 1.2, 0x3f6a8a, 'crate');
      cyl(X(10.5), gy - 0.2, Z(-10.6), 0.7, 1.2, 0xd0a23a, 'crate');
      // tanker truck
      solid(X(-15.2), gy + 0.55, Z(9), X(-12.8), gy + 2.7, Z(11.2), 0xc8552e, 'wall');
      solid(X(-15.3), gy + 0.75, Z(11.3), X(-12.7), gy + 3.0, Z(17.5), 0xb9b4a6, 'wall');
      vis(X(-15.25), gy + 1.7, Z(8.96), X(-12.75), gy + 2.5, Z(9.6), 0x1b222c, 0.01);
      for (const wz of [9.8, 13.5, 16.3]) vis(X(-15.35), gy - 0.1, Z(wz) - 0.5, X(-12.65), gy + 0.9, Z(wz) + 0.5, 0x1e1c1a, 0.02);
      fence('x', Z(22), X(-20), X(12), gy, 0x7d8388, [X(-4)]);
    },
    // Signal Rise
    (c, gy) => {
      const X = (o) => c.x + o, Z = (o) => c.z + o;
      const tx = X(8), tz = Z(9), TH = 22;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          const y0 = gy - 0.4 + k * (TH / 5), y1 = y0 + TH / 5 + (k === 0 ? 0.4 : 0);
          vis(tx + sx * 1.0 - 0.09, y0, tz + sz * 1.0 - 0.09, tx + sx * 1.0 + 0.09, y1, tz + sz * 1.0 + 0.09, k % 2 ? 0xe8e4d8 : 0xb3312c, 0.02);
        }
        addCol(new THREE.Box3(new THREE.Vector3(tx + sx - 0.14, gy - 0.4, tz + sz - 0.14), new THREE.Vector3(tx + sx + 0.14, gy + TH, tz + sz + 0.14)), 'wall', null, false);
      }
      for (let y = 2.6; y < TH; y += 3.2) {
        vis(tx - 1.05, gy + y, tz - 1.05, tx + 1.05, gy + y + 0.1, tz - 0.95, 0x8d99ae); vis(tx - 1.05, gy + y, tz + 0.95, tx + 1.05, gy + y + 0.1, tz + 1.05, 0x8d99ae);
        vis(tx - 1.05, gy + y, tz - 1.05, tx - 0.95, gy + y + 0.1, tz + 1.05, 0x8d99ae); vis(tx + 0.95, gy + y, tz - 1.05, tx + 1.05, gy + y + 0.1, tz + 1.05, 0x8d99ae);
      }
      vis(tx - 0.08, gy + TH, tz - 0.08, tx + 0.08, gy + TH + 3.4, tz + 0.08, 0xd8d8d8);
      vis(tx + 1.0, gy + 15, tz - 0.7, tx + 1.3, gy + 16.4, tz + 0.7, 0xe8e4d8); vis(tx - 0.7, gy + 18, tz - 1.3, tx + 0.7, gy + 19.2, tz - 1.0, 0xe8e4d8);
      beaconPos.set(tx, gy + TH + 3.5, tz);
      // sandbag lines (vaultable)
      seg('x', Z(16), X(-10), X(-2), gy - 0.3, gy + 1.0, 0xb3a279, 0.7); seg('z', X(-18), Z(-4), Z(6), gy - 0.3, gy + 1.0, 0xb3a279, 0.7);
      seg('x', Z(-16), X(-2), X(6), gy - 0.3, gy + 1.0, 0xb3a279, 0.7); seg('z', X(16), Z(-6), Z(2), gy - 0.3, gy + 1.0, 0xb3a279, 0.7);
      crate(X(-2), Z(5), gy, 1.1, 0x4c5a4a, true); crate(X(-0.6), Z(5.6), gy, 1.0, 0x5f6a55); crate(X(13), Z(-2), gy, 1.1, 0x4c5a4a);
      cyl(X(11.5), gy - 0.2, Z(-13.4), 0.7, 1.2, 0x4c5a4a, 'crate');
      // dish on the bunker roof
      vis(X(-10), gy + WALL_H + 0.24, Z(-7), X(-9.7), gy + WALL_H + 1.6, Z(-6.7), 0x8d99ae); addBox(X(-9.85), gy + WALL_H + 1.9, Z(-6.85), 1.7, 1.2, 0.14, 0xdedad0, 0.6, 0.02);
    },
    // Gullwrack Dock
    (c, gy) => {
      const X = (o) => c.x + o, Z = (o) => c.z + o;
      const boat = (bx, bz, ry, hex) => {
        addBox(bx, gy + 0.32, bz, 1.5, 0.6, 4.0, hex, ry, 0.03); addBox(bx, gy + 0.66, bz, 1.7, 0.12, 4.2, 0xe4dcc8, ry, 0.03);
        addBox(bx, gy + 0.5, bz, 1.1, 0.16, 0.3, 0x6a5238, ry, 0.03);
        addCol(new THREE.Box3(new THREE.Vector3(bx - 1.3, gy - 0.3, bz - 1.9), new THREE.Vector3(bx + 1.3, gy + 0.75, bz + 1.9)), 'crate', null, false);
      };
      boat(X(13), Z(-8), 0.35, 0x9a4a3a); boat(X(17), Z(1), -0.25, 0x3f6a8a);
      fence('x', Z(-18), X(-2), X(8), gy, 0x7a6a55, null, 1.6);
      for (let k = 0; k < 5; k++) vis(X(-1 + k * 2) - 0.3, gy + 0.7, Z(-18) - 0.04, X(-1 + k * 2) + 0.3, gy + 1.5, Z(-18) + 0.04, k % 2 ? 0x8a9a8a : 0xa9a394);
      cyl(X(8), gy - 0.2, Z(-2), 0.7, 1.1, 0xd9702e, 'crate'); cyl(X(8.8), gy - 0.2, Z(-1.4), 0.7, 1.1, 0x3f6a8a, 'crate'); cyl(X(-4), gy - 0.2, Z(12), 0.7, 1.1, 0xd9702e, 'crate');
      crate(X(9), Z(12), gy, 1.1, 0x7a6a55, true); crate(X(-18), Z(0), gy, 1.0, 0x6f8794);
      // broken pier reaching into the sea
      let sx = c.x + 20; const pz = c.z + 4;
      while (sx < HALF - 6 && heightAt(sx, pz) > SEA) sx += 1;
      const p0 = Math.min(sx + 2.5, HALF - 22), p1 = p0 + 18;
      for (let x = p0; x < p1; x += 1.0) { if (hash2(x | 0, 77) < 0.14) continue; vis(x, 0.72, pz - 1.3, x + 0.9, 0.86, pz + 1.3, 0x7a6a55, 0.12); }
      for (let x = p0 + 0.4; x <= p1; x += 4.4) { cyl(x, -4, pz - 1.25, 0.3, 5.6, 0x4f4438); cyl(x, -4, pz + 1.25, 0.3, 5.6, 0x4f4438); }
      for (let x = sx - 3.5; x < sx; x += 1.0) vis(x, heightAt(x, pz) + 0.3, pz - 1.3, x + 0.9, heightAt(x, pz) + 0.44, pz + 1.3, 0x7a6a55, 0.12);
    },
    // Marrow School
    (c, gy) => {
      const X = (o) => c.x + o, Z = (o) => c.z + o;
      // stranded bus
      solid(X(-12), gy + 0.45, Z(11), X(-3), gy + 3.0, Z(13.5), 0xc9a227, 'wall', 0.02);
      vis(X(-11.4), gy + 1.75, Z(10.97), X(-4.4), gy + 2.55, Z(13.53), 0x1b222c, 0.01);
      vis(X(-12.03), gy + 1.75, Z(11.3), X(-11.9), gy + 2.55, Z(13.2), 0x1b222c, 0.01);
      vis(X(-12.02), gy + 1.1, Z(10.98), X(-2.98), gy + 1.3, Z(13.52), 0x2a2622, 0.01);
      for (const wx of [-10.4, -5]) vis(X(wx) - 0.5, gy - 0.1, Z(10.9), X(wx) + 0.5, gy + 0.9, Z(13.6), 0x1e1c1a, 0.02);
      // swing frame + climbing frame
      const sxp = X(11), szp = Z(10);
      vis(sxp - 2.2, gy + 2.4, szp - 0.06, sxp + 2.2, gy + 2.52, szp + 0.06, 0x3f6a8a);
      for (const e of [-2.2, 2.2]) { vis(sxp + e - 0.06, gy - 0.2, szp - 0.8, sxp + e + 0.06, gy + 2.5, szp - 0.68, 0x3f6a8a); vis(sxp + e - 0.06, gy - 0.2, szp + 0.68, sxp + e + 0.06, gy + 2.5, szp + 0.8, 0x3f6a8a); }
      for (const e of [-1, 0.9]) { vis(sxp + e - 0.02, gy + 0.6, szp - 0.02, sxp + e + 0.02, gy + 2.4, szp + 0.02, 0x2a2622); vis(sxp + e - 0.25, gy + 0.52, szp - 0.12, sxp + e + 0.25, gy + 0.6, szp + 0.12, 0xb3312c); }
      solid(X(-18), gy - 0.2, Z(13), X(-16), gy + 0.9, Z(15), 0xb3312c, 'crate'); vis(X(-18), gy + 0.9, Z(13), X(-17.86), gy + 2.0, Z(15), 0xd0a23a);
      // flagpole
      cyl(X(-1), gy - 0.3, Z(3), 0.16, 7.5, 0xd8d8d8, 'wall'); vis(X(-0.9), gy + 6.2, Z(2.97), X(0.5), gy + 7.0, Z(3.03), 0xb3312c);
      fence('x', Z(22), X(-20), X(16), gy, 0x9a8f7c, [X(-4)]);
      fence('z', X(-24), Z(-10), Z(22), gy, 0x9a8f7c, [Z(4)]);
      crate(X(2), Z(-12), gy, 1.0, 0x7a6244); crate(X(18), Z(4), gy, 1.1, 0x7a6244, true);
    },
    // Lowfield Yard
    (c, gy) => {
      const X = (o) => c.x + o, Z = (o) => c.z + o;
      const cont = (x0, z0, x1, z1, y, hex) => {
        solid(x0, gy + y - (y ? 0 : 0.2), z0, x1, gy + y + 2.6, z1, hex, 'wall', 0.03);
        vis(x0 - 0.03, gy + y + 1.2, z0 - 0.03, x1 + 0.03, gy + y + 1.34, z1 + 0.03, 0x2a2622, 0.01);
      };
      cont(X(-18), Z(5.6), X(-12), Z(8), 0, 0x9a4a3a); cont(X(-18), Z(8.6), X(-12), Z(11), 0, 0x2f6f73); cont(X(-17.4), Z(7), X(-11.4), Z(9.4), 2.6, 0xc9a227);
      cont(X(20.6), Z(-8), X(23), Z(-2), 0, 0x4a6a8a); cont(X(-10), Z(15.6), X(-4), Z(18), 0, 0x8a8f96);
      crate(X(-6), Z(4), gy, 1.2, 0x8a7350, true); crate(X(-4.6), Z(4.4), gy, 1.1, 0x8a7350); crate(X(1), Z(15), gy, 1.2, 0x8a7350, true);
      crate(X(2.4), Z(15.4), gy, 1.0, 0x6d7682); crate(X(19), Z(9), gy, 1.1, 0x8a7350);
      for (let k = 0; k < 3; k++) vis(X(8 + k * 2.2), gy - 0.2, Z(12), X(9.6 + k * 2.2), gy + 0.18, Z(13.4), 0x8a7350, 0.1);   // pallets
      // forklift
      solid(X(-2), gy + 0.25, Z(8), X(-0.4), gy + 1.5, Z(10.6), 0xd0a23a, 'crate'); vis(X(-1.9), gy + 1.5, Z(8.1), X(-0.5), gy + 2.5, Z(8.2), 0x2a2622);
      vis(X(-1.8), gy + 0.1, Z(10.6), X(-1.6), gy + 0.2, Z(12), 0x8d99ae); vis(X(-0.8), gy + 0.1, Z(10.6), X(-0.6), gy + 0.2, Z(12), 0x8d99ae);
      fence('x', Z(22), X(-24), X(20), gy, 0x8d99ae, [X(-2), X(0)]);
      fence('z', X(-26), Z(-14), Z(22), gy, 0x8d99ae, [Z(2)]);
    },
  ];

  const beaconPos = new THREE.Vector3(0, 30, 0);
  const pendingSpots = [];
  for (let ci = 0; ci < COMPOUNDS.length; ci++) {
    const c = COMPOUNDS[ci], spots = [];
    for (const b of c.buildings) makeBuilding(c, b, spots);
    EXTRAS[ci](c, c.gy);
    for (const y of c.yard) spots.push([c.x + y[0], c.z + y[1]]);
    pendingSpots.push(spots);
  }

  // ============================================================== rooftop climb routes + barrel spots
  // Is a circle at (x, z) clear of every solid between heights y0 and y1?
  function clearAt(x, z, r, y0, y1) {
    const i0 = hashRange(x - r), i1 = hashRange(x + r), j0 = hashRange(z - r), j1 = hashRange(z + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = hash[j * HN + i];
      for (let k = 0; k < cell.length; k++) {
        const b = cell[k].box;
        if (b.min.y >= y1 || b.max.y <= y0) continue;
        if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return false;
      }
    }
    return true;
  }
  const climbRoutes = [];
  const rockItems = [];
  for (const B of buildingRecs) {
    // a boulder to hop on, then a crate stack just outside the eaves, then the roof
    const sides = ['n', 's', 'w', 'e'].sort((a, b) => B.doors.filter((d) => d[0] === a).length - B.doors.filter((d) => d[0] === b).length);
    let done = false;
    for (const side of sides) {
      if (done) break;
      const alongX = side === 'n' || side === 's';
      const len = alongX ? B.x1 - B.x0 : B.z1 - B.z0;
      for (const f of [0.3, 0.7, 0.5]) {
        const a = (alongX ? B.x0 : B.z0) + len * f;
        // keep clear of doors on this side (doors sit at x0 + 2k)
        if (B.doors.some((d) => d[0] === side && Math.abs((alongX ? B.x0 : B.z0) + 2 * d[1] - a) < 2.6)) continue;
        const out = side === 'n' || side === 'w' ? -1 : 1;
        const wallC = side === 'n' ? B.z0 : side === 's' ? B.z1 : side === 'w' ? B.x0 : B.x1;
        const cr = wallC + out * (WALL_T / 2 + 1.25), rk = wallC + out * (WALL_T / 2 + 3.6);
        const cx = alongX ? a : cr, cz = alongX ? cr : a, rx = alongX ? a + 0.6 : rk, rz = alongX ? rk : a + 0.6;
        const gc = heightAt(cx, cz), gr = heightAt(rx, rz);
        if (Math.abs(gc - B.gy) > 0.6 || Math.abs(gr - B.gy) > 0.8) continue;
        if (!clearAt(cx, cz, 0.85, gc - 0.2, gc + 2.5) || !clearAt(rx, rz, 1.3, gr - 0.2, gr + 2)) continue;
        crate(cx, cz, gc, 1.2, 0x7a5a3a, true);                          // top about 2.28 m
        const sx = 1.25, sy = 0.95, szz = 1.1;                           // boulder, top about 1.1 m
        rockItems.push([rx, gr + sy * 0.25, rz, sx, sy, szz, rand() * 6.28, 0.95]);
        const r = (sx + szz) * 0.5 * 0.7;
        addCol(new THREE.Box3(new THREE.Vector3(rx - r, gr - 1, rz - r), new THREE.Vector3(rx + r, gr + sy * 1.12, rz + r)), 'rock', null, false);
        const rcx = (B.x0 + B.x1) / 2, rcz = (B.z0 + B.z1) / 2;
        // where the horde gathers to climb after a player on this roof: between the crates and the boulder
        const gax = alongX ? a - 0.9 : wallC + out * (WALL_T / 2 + 2.4), gaz = alongX ? wallC + out * (WALL_T / 2 + 2.4) : a - 0.9;
        climbRoutes.push({ step: new THREE.Vector3(cx, gc, cz), roof: new THREE.Vector3(rcx, 0, rcz), gather: new THREE.Vector3(gax, heightAt(gax, gaz), gaz), building: B });
        done = true; break;
      }
    }
  }
  const barrelSpots = [];
  for (const c of COMPOUNDS) {
    let n = 0;
    for (let t = 0; t < 60 && n < 3; t++) {
      const a = rand() * Math.PI * 2, d = c.r * rr(0.35, 0.85);
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, gy = heightAt(x, z);
      if (gy < 0.8 || !clearAt(x, z, 1.4, gy - 0.2, gy + 3.5)) continue;
      if (barrelSpots.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 36)) continue;
      barrelSpots.push(new THREE.Vector3(x, gy, z)); n++;
    }
  }

  // ============================================================== vegetation + rocks
  const treeItems = [[], []];   // pine, broadleaf
  {
    const occ = new Int16Array(100 * 100), obX = [], obZ = [];
    const occIdx = (x, z) => (((z + HALF) / 4) | 0) * 100 + (((x + HALF) / 4) | 0);
    const crowded = (x, z, minD) => {      // any placed obstacle closer than minD?
      const ci = ((x + HALF) / 4) | 0, cj = ((z + HALF) / 4) | 0;
      for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
        if (i < 0 || j < 0 || i >= 100 || j >= 100) continue;
        const k = occ[j * 100 + i];
        if (k && (obX[k - 1] - x) * (obX[k - 1] - x) + (obZ[k - 1] - z) * (obZ[k - 1] - z) < minD * minD) return true;
      }
      return false;
    };
    let tries = 0, placed = 0;
    while (placed < 520 && tries++ < 14000) {
      const x = rr(-186, 186), z = rr(-186, 186), h = heightAt(x, z);
      if (h < 1.5 || inCompound(x, z, 5) || roadDist(x, z) < 5) continue;
      const forest = fbm(x * 0.012 + 5, z * 0.012 + 9, 3);
      if (rand() > (forest > 0.52 ? 0.95 : 0.1)) continue;
      const oi = occIdx(x, z);
      if (occ[oi] || crowded(x, z, 4.3)) continue;
      obX.push(x); obZ.push(z); occ[oi] = obX.length;
      const pine = h > 6 ? rand() < 0.85 : (vnoise(x * 0.02 + 30, z * 0.02) > 0.5 ? rand() < 0.8 : rand() < 0.2);
      const s = pine ? rr(0.85, 1.6) : rr(0.8, 1.35);
      const v = rr(0.82, 1.12);
      treeItems[pine ? 0 : 1].push([x, h - 0.15, z, s, s * rr(0.9, 1.15), s, rand() * 6.28, v]);
      const r = 0.26 * s;
      addCol(new THREE.Box3(new THREE.Vector3(x - r, h - 0.5, z - r), new THREE.Vector3(x + r, h + 3.2 * s, z + r)), 'tree', null, false);
      placed++;
    }
    tries = 0; placed = 0;
    while (placed < 170 && tries++ < 4000) {
      const x = rr(-190, 190), z = rr(-190, 190), h = heightAt(x, z);
      if (h < 0.5 || inCompound(x, z, 4) || roadDist(x, z) < 5) continue;
      const big = placed < 48;
      const oi = occIdx(x, z);
      const sx = big ? rr(1.2, 2.6) : rr(0.3, 0.75), sz = sx * rr(0.7, 1.3), sy = sx * rr(0.55, 0.95);
      if (big && (occ[oi] || crowded(x, z, (sx + sz) * 0.35 + 3.2))) continue;
      rockItems.push([x, h + sy * 0.25, z, sx, sy, sz, rand() * 6.28, rr(0.8, 1.1)]);
      if (big) {
        obX.push(x); obZ.push(z); occ[oi] = obX.length;
        const r = (sx + sz) * 0.5 * 0.7;
        addCol(new THREE.Box3(new THREE.Vector3(x - r, h - 1, z - r), new THREE.Vector3(x + r, h + sy * 1.12, z + r)), 'rock', null, false);   // top matches the visible crown, so it can be stood on
      }
      placed++;
    }
  }

  // ============================================================== build instanced meshes
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

  function buildBatch(geo, mat, items, cast, receive) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    mesh.count = items.length;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _p.set(it[0], it[1], it[2]); _q.setFromAxisAngle(_up, it[6]); _s.set(it[3], it[4], it[5]);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      _c.setHex(it[7]).multiplyScalar(it[8]);
      mesh.setColorAt(i, _c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  }
  // merge coloured parts into one non-indexed geometry (position / normal / color)
  function mergeParts(parts) {
    const pos = [], nor = [], col = [];
    for (const [g0, hex] of parts) {
      const g = g0.index ? g0.toNonIndexed() : g0;
      g.computeVertexNormals();
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      _c.setHex(hex);
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(_c.r, _c.g, _c.b); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }

  const structMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  buildBatch(new THREE.BoxGeometry(1, 1, 1), structMat, boxes, true, true).name = 'structures';
  buildBatch(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), cyls, true, true).name = 'cylinders';
  {
    const P = [-0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
      0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0.5, 0, -0.5, 0, 1, 0.5, 0.5, 0, 0.5,
      -0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.computeVertexNormals();
    buildBatch(g, structMat, prisms, true, true).name = 'roofs';
  }
  // trees
  {
    const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const pine = mergeParts([
      [new THREE.CylinderGeometry(0.14, 0.24, 2.0, 6).translate(0, 1.0, 0), 0x5a4632],
      [new THREE.ConeGeometry(1.55, 2.4, 7).translate(0, 2.5, 0), 0x2c5a41],
      [new THREE.ConeGeometry(1.2, 2.1, 7).translate(0, 3.8, 0), 0x336647],
      [new THREE.ConeGeometry(0.78, 1.9, 7).translate(0, 5.0, 0), 0x3b744f],
    ]);
    const leaf = mergeParts([
      [new THREE.CylinderGeometry(0.16, 0.28, 2.5, 6).translate(0, 1.25, 0), 0x5e4a36],
      [new THREE.IcosahedronGeometry(1.55, 0).scale(1, 0.85, 1).translate(0, 3.5, 0), 0x5a873b],
      [new THREE.IcosahedronGeometry(1.05, 0).translate(0.95, 2.9, 0.3), 0x6a9843],
      [new THREE.IcosahedronGeometry(0.95, 0).translate(-0.75, 3.0, -0.55), 0x4e7b37],
    ]);
    const geos = [pine, leaf];
    for (let t = 0; t < 2; t++) {
      const items = treeItems[t].map((it) => [it[0], it[1], it[2], it[3], it[4], it[5], it[6], 0xffffff, it[7]]);
      buildBatch(geos[t], treeMat, items, true, true).name = t ? 'broadleaf' : 'pines';
    }
    const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const items = rockItems.map((it) => [it[0], it[1], it[2], it[3], it[4], it[5], it[6], 0x7f8182, it[7]]);
    buildBatch(new THREE.DodecahedronGeometry(1, 0), rockMat, items, true, true).name = 'rocks';
  }
  // grass tufts
  {
    const pos = [], col = [], nor = [];
    const base = new THREE.Color(0x3d6b2f), tip = new THREE.Color(0x9cc45e);
    for (let b = 0; b < 4; b++) {
      const a = b * 1.7 + 0.3, ox = Math.cos(a) * 0.1, oz = Math.sin(a) * 0.1;
      const wx = Math.cos(a + 1.57) * 0.07, wz = Math.sin(a + 1.57) * 0.07;
      const hgt = 0.36 + 0.1 * b, lx = Math.cos(a) * 0.18, lz = Math.sin(a) * 0.18;
      pos.push(ox - wx, 0, oz - wz, ox + wx, 0, oz + wz, ox + lx, hgt, oz + lz);
      col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeU;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n#ifdef USE_INSTANCING\n  float gw = sin(uTime * 1.7 + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27);\n  transformed.x += gw * 0.16 * position.y; transformed.z += gw * 0.09 * position.y;\n#endif');
    };
    const items = [];
    let tries = 0;
    while (items.length < 15000 && tries++ < 90000) {
      const x = rr(-188, 188), z = rr(-188, 188), h = heightAt(x, z);
      if (h < 1.6 || h > 12) continue;
      if (fbm(x * 0.03 + 21, z * 0.03 + 4, 2) < 0.44) continue;
      if (inCompound(x, z, -3) || roadDist(x, z) < 3.2) continue;
      if (Math.abs(heightAt(x + 1, z) - heightAt(x - 1, z)) + Math.abs(heightAt(x, z + 1) - heightAt(x, z - 1)) > 1.3) continue;
      const s = rr(0.8, 1.7);
      items.push([x, h - 0.03, z, s, s * rr(0.8, 1.3), s, rand() * 6.28, 0xffffff, rr(0.8, 1.15)]);
    }
    buildBatch(g, mat, items, false, true).name = 'grass';
  }
  // lanterns + tower beacon (emissive; brightness driven in update)
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  {
    const items = lanterns.map((l) => [l[0], l[1], l[2], 0.22, 0.26, 0.22, 0, 0xffffff, 1]);
    buildBatch(new THREE.BoxGeometry(1, 1, 1), lanternMat, items, false, false).name = 'lanterns';
  }
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), beaconMat);
  beacon.position.copy(beaconPos);
  scene.add(beacon);

  // ============================================================== flow grid static blocks (sea)
  for (let j = 0; j < FN; j++) {
    for (let i = 0; i < FN; i++) {
      if (heightAt(cellCentre(i), cellCentre(j)) < SEA + 0.3) cnt[j * FN + i] = 200;
    }
  }
  function cellFree(x, z) {
    if (x < -HALF + 2 || x > HALF - 2 || z < -HALF + 2 || z > HALF - 2) return false;
    return cnt[cellOf(z) * FN + cellOf(x)] === 0;
  }
  function fixSpot(x, z) {
    if (cellFree(x, z)) return [x, z];
    for (let r = 2; r <= 6; r += 2) for (let k = 0; k < 8; k++) { const nx = x + NDX[k] * r, nz = z + NDZ[k] * r; if (cellFree(nx, nz)) return [nx, nz]; }
    return [x, z];
  }
  for (let ci = 0; ci < COMPOUNDS.length; ci++) {
    const c = COMPOUNDS[ci];
    const lootSpots = pendingSpots[ci].slice(0, 14).map((s) => { const f = fixSpot(s[0], s[1]); return new THREE.Vector3(f[0], heightAt(f[0], f[1]), f[1]); });
    compounds.push({ name: c.name, center: new THREE.Vector3(c.x, c.gy, c.z), radius: c.r, lootSpots });
  }
  const spawnXZ = fixSpot(COMPOUNDS[0].x - 4, COMPOUNDS[0].z + 2);
  const playerSpawn = new THREE.Vector3(spawnXZ[0], heightAt(spawnXZ[0], spawnXZ[1]), spawnXZ[1]);

  // ============================================================== collision queries
  const api = {};

  function resolveCircle(pos, radius, height) {
    let pushed = false, last = null, barr = null;
    const yLo = pos.y + 0.3, yHi = pos.y + height, r2 = radius * radius;
    for (let pass = 0; pass < 2; pass++) {
      let any = false;
      const i0 = hashRange(pos.x - radius), i1 = hashRange(pos.x + radius), j0 = hashRange(pos.z - radius), j1 = hashRange(pos.z + radius);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cell = hash[j * HN + i];
          for (let k = 0; k < cell.length; k++) {
            const c = cell[k], b = c.box, mn = b.min, mx = b.max;
            if (mn.y >= yHi || mx.y <= yLo) continue;
            const px = pos.x, pz = pos.z;
            const qx = px < mn.x ? mn.x : (px > mx.x ? mx.x : px);
            const qz = pz < mn.z ? mn.z : (pz > mx.z ? mx.z : pz);
            const dx = px - qx, dz = pz - qz, d2 = dx * dx + dz * dz;
            if (d2 >= r2) continue;
            if (d2 > 1e-10) {
              const d = Math.sqrt(d2), f = (radius - d) / d;
              pos.x += dx * f; pos.z += dz * f;
            } else {
              const l = px - mn.x, r = mx.x - px, n = pz - mn.z, f = mx.z - pz;
              const m = Math.min(l, r, n, f);
              if (m === l) pos.x = mn.x - radius; else if (m === r) pos.x = mx.x + radius;
              else if (m === n) pos.z = mn.z - radius; else pos.z = mx.z + radius;
            }
            any = true; pushed = true; last = c;
            if (c.type === 'barricade') barr = c;
          }
        }
      }
      if (!any) break;
    }
    // land bounds: project back onto the shoreline contour
    const lim = HALF - 3;
    if (pos.x > lim) { pos.x = lim; pushed = true; } else if (pos.x < -lim) { pos.x = -lim; pushed = true; }
    if (pos.z > lim) { pos.z = lim; pushed = true; } else if (pos.z < -lim) { pos.z = -lim; pushed = true; }
    let h = heightAt(pos.x, pos.z);
    if (h < LAND_MIN) {
      for (let k = 0; k < 40 && h < LAND_MIN; k++) {
        let gx = heightAt(pos.x + 1, pos.z) - heightAt(pos.x - 1, pos.z);
        let gz = heightAt(pos.x, pos.z + 1) - heightAt(pos.x, pos.z - 1);
        let l = Math.sqrt(gx * gx + gz * gz);
        if (l < 1e-4) { gx = -pos.x; gz = -pos.z; l = Math.sqrt(gx * gx + gz * gz) || 1; gx /= l; gz /= l; l = 0.2; } else { gx /= l; gz /= l; }
        let step = (LAND_MIN - h) / Math.max(0.08, l * 0.5) + 0.01;
        if (step > 1) step = 1;
        pos.x += gx * step; pos.z += gz * step;
        h = heightAt(pos.x, pos.z);
      }
      pushed = true;
    }
    api.lastHitCollider = barr || last;
    return pushed;
  }

  // ---- standing on things
  // Highest walkable top under a circle at (x, z) that is no higher than maxY (feet + step), or -Infinity.
  // Pitched roofs report their slope; trees are not walkable.
  function supportAt(x, z, radius, maxY) {
    let best = -Infinity;
    const r2 = radius * radius;
    const i0 = hashRange(x - radius), i1 = hashRange(x + radius), j0 = hashRange(z - radius), j1 = hashRange(z + radius);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = hash[j * HN + i];
      for (let k = 0; k < cell.length; k++) {
        const c = cell[k];
        if (c.type === 'tree') continue;
        const b = c.box, mn = b.min, mx = b.max;
        const qx = x < mn.x ? mn.x : (x > mx.x ? mx.x : x), qz = z < mn.z ? mn.z : (z > mx.z ? mx.z : z);
        if ((x - qx) * (x - qx) + (z - qz) * (z - qz) >= r2) continue;
        let top = mx.y;
        if (c.gable) {
          if (maxY < mx.y - 0.05) continue;
          const g = c.gable, off = Math.abs((g.x ? x : z) - g.c);
          top = mx.y + g.ridge * Math.max(0, 1 - off / g.half);
        } else if (top > maxY) continue;
        if (top > best) best = top;
      }
    }
    return best;
  }
  // Lowest underside above fromY over a circle at (x, z), or Infinity (for head bumps).
  function ceilingAt(x, z, radius, fromY) {
    let best = Infinity;
    const r2 = radius * radius;
    const i0 = hashRange(x - radius), i1 = hashRange(x + radius), j0 = hashRange(z - radius), j1 = hashRange(z + radius);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = hash[j * HN + i];
      for (let k = 0; k < cell.length; k++) {
        const b = cell[k].box, mn = b.min, mx = b.max;
        if (mn.y < fromY || mn.y >= best) continue;
        const qx = x < mn.x ? mn.x : (x > mx.x ? mx.x : x), qz = z < mn.z ? mn.z : (z > mx.z ? mx.z : z);
        if ((x - qx) * (x - qx) + (z - qz) * (z - qz) >= r2) continue;
        best = mn.y;
      }
    }
    return best;
  }
  // Ground or the top of whatever you stand on.
  function floorAt(x, z, radius, footY, step) {
    const t = heightAt(x, z), s = supportAt(x, z, radius, footY + (step === undefined ? 0.45 : step));
    return s > t ? s : t;
  }

  // ---- raycast
  const rayResult = { point: new THREE.Vector3(), normal: new THREE.Vector3(), distance: 0, collider: null };
  let rbAxis = 0, rbSign = 0, stamp = 1;
  function rayBox(ox, oy, oz, dx, dy, dz, b) {
    const mn = b.min, mx = b.max;
    let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0, t1, t2, inv, s;
    if (dx > 1e-9 || dx < -1e-9) {
      inv = 1 / dx; t1 = (mn.x - ox) * inv; t2 = (mx.x - ox) * inv;
      if (t1 > t2) { s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) { tmin = t1; axis = 0; sign = dx > 0 ? -1 : 1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    } else if (ox < mn.x || ox > mx.x) return -1;
    if (dy > 1e-9 || dy < -1e-9) {
      inv = 1 / dy; t1 = (mn.y - oy) * inv; t2 = (mx.y - oy) * inv;
      if (t1 > t2) { s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) { tmin = t1; axis = 1; sign = dy > 0 ? -1 : 1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    } else if (oy < mn.y || oy > mx.y) return -1;
    if (dz > 1e-9 || dz < -1e-9) {
      inv = 1 / dz; t1 = (mn.z - oz) * inv; t2 = (mx.z - oz) * inv;
      if (t1 > t2) { s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) { tmin = t1; axis = 2; sign = dz > 0 ? -1 : 1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    } else if (oz < mn.z || oz > mx.z) return -1;
    if (tmin < 0 || axis < 0) return -1;   // origin inside (ignored) or box behind
    rbAxis = axis; rbSign = sign;
    return tmin;
  }
  function rayTerrain(ox, oy, oz, dx, dy, dz, maxDist) {
    if (oy > MAX_H && dy >= 0) return -1;
    let t0 = 0;
    if (oy > MAX_H) { t0 = (oy - MAX_H) / -dy; if (t0 >= maxDist) return -1; }
    if (oy + dy * t0 < groundAt(ox + dx * t0, oz + dz * t0)) return -1;   // started under ground
    let t = t0;
    while (t < maxDist) {
      const run = t - t0;
      let t2 = t + (run < 24 ? 0.6 : (run < 80 ? 1.2 : 2.4));
      if (t2 > maxDist) t2 = maxDist;
      const y = oy + dy * t2;
      if (y > MAX_H && dy > 0) return -1;
      const x = ox + dx * t2, z = oz + dz * t2;
      if (y < groundAt(x, z)) {
        let lo = t, hi = t2;
        for (let i = 0; i < 7; i++) {
          const m = (lo + hi) * 0.5;
          if (oy + dy * m < groundAt(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
        }
        return hi;
      }
      if (x > 700 || x < -700 || z > 700 || z < -700) return -1;
      t = t2;
    }
    return -1;
  }
  function raycast(origin, dir, maxDist) {
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
    if (!(maxDist > 0) || ox !== ox || dx !== dx) return null;
    let best = maxDist, hitCol = null, hAxis = -1, hSign = 0, terrain = false;
    const tt = rayTerrain(ox, oy, oz, dx, dy, dz, maxDist);
    if (tt >= 0) { best = tt; terrain = true; }
    stamp++;
    let ix = Math.floor((ox + HALF) / HC), iz = Math.floor((oz + HALF) / HC);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(HC / dx) : Infinity, tDZ = dz !== 0 ? Math.abs(HC / dz) : Infinity;
    let tMX = dx !== 0 ? (((dx > 0 ? ix + 1 : ix) * HC - HALF) - ox) / dx : Infinity;
    let tMZ = dz !== 0 ? (((dz > 0 ? iz + 1 : iz) * HC - HALF) - oz) / dz : Infinity;
    let t = 0, guard = 0;
    while (t <= best && guard++ < 200) {
      if (ix >= 0 && ix < HN && iz >= 0 && iz < HN) {
        const cell = hash[iz * HN + ix];
        for (let k = 0; k < cell.length; k++) {
          const c = cell[k];
          if (c._s === stamp) continue;
          c._s = stamp;
          const tb = rayBox(ox, oy, oz, dx, dy, dz, c.box);
          if (tb >= 0 && tb < best) { best = tb; hitCol = c; hAxis = rbAxis; hSign = rbSign; terrain = false; }
        }
      } else if ((ix < 0 && stepX < 0) || (ix >= HN && stepX > 0) || (iz < 0 && stepZ < 0) || (iz >= HN && stepZ > 0)) break;
      if (tMX < tMZ) { t = tMX; tMX += tDX; ix += stepX; } else { t = tMZ; tMZ += tDZ; iz += stepZ; }
    }
    if (!terrain && !hitCol) return null;
    const r = rayResult;
    r.distance = best; r.collider = hitCol;
    r.point.set(ox + dx * best, oy + dy * best, oz + dz * best);
    if (hitCol) {
      r.normal.set(hAxis === 0 ? hSign : 0, hAxis === 1 ? hSign : 0, hAxis === 2 ? hSign : 0);
    } else {
      const px = r.point.x, pz = r.point.z;
      if (heightAt(px, pz) <= SEA) r.normal.set(0, 1, 0);
      else r.normal.set(heightAt(px - 0.5, pz) - heightAt(px + 0.5, pz), 1, heightAt(px, pz - 0.5) - heightAt(px, pz + 0.5)).normalize();
    }
    return r;
  }

  // ============================================================== flow field
  let lastPX = playerSpawn.x, lastPZ = playerSpawn.z;
  function bfsStart(px, pz) {
    work.fill(UNR); qHead = 0; qTail = 0;
    const ci = cellOf(px), cj = cellOf(pz), idx = cj * FN + ci;
    if (cnt[idx] === 0) { work[idx] = 0; queue[qTail++] = idx; }
    else {
      // The player is hugging an obstacle inside a blocked cell. Seed only the free cell on the
      // player's own side of it, so nobody is steered at them through the wall.
      const sx = px >= cellCentre(ci) ? 1 : -1, sz = pz >= cellCentre(cj) ? 1 : -1;
      const blockedAt = (i, j) => i < 0 || j < 0 || i >= FN || j >= FN || cnt[j * FN + i] !== 0;
      const tryCell = (i, j) => {
        if (i < 0 || j < 0 || i >= FN || j >= FN) return;
        const k = j * FN + i;
        if (cnt[k] === 0 && work[k] === UNR) { work[k] = 0; queue[qTail++] = k; }
      };
      const alongX = blockedAt(ci - 1, cj) || blockedAt(ci + 1, cj), alongZ = blockedAt(ci, cj - 1) || blockedAt(ci, cj + 1);
      if (alongX && alongZ) tryCell(ci + sx, cj + sz);
      else if (alongX) tryCell(ci, cj + sz);
      else if (alongZ) tryCell(ci + sx, cj);
      if (qTail === 0) {                      // isolated obstacle (or the preferred side is blocked): nearest free side cell
        const dxs = Math.abs(px - cellCentre(ci + sx)), dzs = Math.abs(pz - cellCentre(cj + sz));
        if (dxs < dzs) { tryCell(ci + sx, cj); if (qTail === 0) tryCell(ci, cj + sz); }
        else { tryCell(ci, cj + sz); if (qTail === 0) tryCell(ci + sx, cj); }
        if (qTail === 0) tryCell(ci + sx, cj + sz);
      }
      if (qTail === 0) for (let k = 0; k < 8; k++) tryCell(ci + NDX[k], cj + NDZ[k]);
      for (let r = 2; r <= 5 && qTail === 0; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) tryCell(ci + i, cj + j);
    }
    bfsRunning = true;
  }
  function bfsStep(budget) {
    while (qHead < qTail && budget-- > 0) {
      const idx = queue[qHead++], d = work[idx] + 1, i = idx % FN, j = (idx / FN) | 0;
      for (let k = 0; k < 8; k++) {
        const ni = i + NDX[k], nj = j + NDZ[k];
        if (ni < 0 || nj < 0 || ni >= FN || nj >= FN) continue;
        const n = nj * FN + ni;
        if (work[n] !== UNR || cnt[n] !== 0) continue;
        if (k >= 4 && (cnt[j * FN + ni] !== 0 || cnt[nj * FN + i] !== 0)) continue;   // no corner cutting
        work[n] = d; queue[qTail++] = n;
      }
    }
    if (qHead >= qTail) { const tmp = dist; dist = work; work = tmp; bfsRunning = false; flowReady = true; }
  }
  // Is every flow cell under the segment free? (grid walk, no allocation; false when longer than ~60 cells)
  function lineFree(x0, z0, x1, z1) {
    let i = cellOf(x0), j = cellOf(z0);
    const dx = x1 - x0, dz = z1 - z0;
    const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tmx = dx !== 0 ? ((-HALF + (dx > 0 ? i + 1 : i) * CELL) - x0) / dx : Infinity;
    let tmz = dz !== 0 ? ((-HALF + (dz > 0 ? j + 1 : j) * CELL) - z0) / dz : Infinity;
    for (let guard = 0; guard < 64; guard++) {
      if (cnt[j * FN + i] !== 0) return false;
      if (tmx > 1 && tmz > 1) return true;          // the segment ends inside this cell
      if (tmx < tmz) { tmx += tdx; i += si; } else { tmz += tdz; j += sj; }
      if (i < 0 || j < 0 || i >= FN || j >= FN) return false;
    }
    return false;
  }
  const LOS_MAX2 = 42 * 42, LOS_HALF = 0.45;
  // Where the horde heads: the player, or (while the player is up on something high) the foot of the
  // nearest climb route, so zombies gather outside and leap up instead of crowding the room below.
  const flowT = { x: 0, z: 0, high: false };
  function flowTarget() {
    const pl = game.player, pp = pl && pl.position;
    if (!pp || pp.x !== pp.x) { flowT.x = lastPX; flowT.z = lastPZ; flowT.high = false; return flowT; }
    flowT.x = pp.x; flowT.z = pp.z; flowT.high = false;
    if (pp.y - heightAt(pp.x, pp.z) > 1.6) {
      let best = 30 * 30;
      for (const r of climbRoutes) {
        const dx = r.gather.x - pp.x, dz = r.gather.z - pp.z, d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; flowT.x = r.gather.x; flowT.z = r.gather.z; flowT.high = true; }
      }
    }
    return flowT;
  }
  function flowDir(x, z, out) {
    if (!flowReady || x !== x || z !== z) return false;
    if (x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
    const ft = flowTarget();
    const tx = ft.x, tz = ft.z;
    const ci = cellOf(x), cj = cellOf(z), idx = cj * FN + ci;
    let bi = -1, bj = -1;
    if (cnt[idx] === 0) {
      const pd = dist[idx];
      if (pd === UNR) return false;
      const ex = tx - x, ez = tz - z, e2 = ex * ex + ez * ez;
      if (pd === 0) {
        if (e2 < 1e-8) return false;
        const l = Math.sqrt(e2);
        out.set(ex / l, 0, ez / l);
        return true;
      }
      // Open ground between us and the player: head straight in. The 8-way field alone makes a
      // horde approach along 45-degree staircases; two offset lines stand in for the body width.
      if (e2 < LOS_MAX2 && cnt[cellOf(tz) * FN + cellOf(tx)] === 0) {
        const l = Math.sqrt(e2), ox = -ez / l * LOS_HALF, oz = ex / l * LOS_HALF;
        if (lineFree(x + ox, z + oz, tx + ox, tz + oz) && lineFree(x - ox, z - oz, tx - ox, tz - oz)) {
          out.set(ex / l, 0, ez / l);
          return true;
        }
      }
      // tie-break between equally good neighbours by the heading from the CELL CENTRE to the
      // player (constant inside a cell, so agents never dither on a tie line)
      let ddx = tx - cellCentre(ci), ddz = tz - cellCentre(cj);
      const dl = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
      ddx /= dl; ddz /= dl;
      let bestD = pd, bestDot = -9;
      for (let k = 0; k < 8; k++) {
        const ni = ci + NDX[k], nj = cj + NDZ[k];
        if (ni < 0 || nj < 0 || ni >= FN || nj >= FN) continue;
        const n = nj * FN + ni, nd = dist[n];
        if (cnt[n] !== 0 || nd >= pd) continue;
        if (k >= 4 && (cnt[cj * FN + ni] !== 0 || cnt[nj * FN + ci] !== 0)) continue;
        const dot = (NDX[k] * ddx + NDZ[k] * ddz) * (k >= 4 ? 0.7071 : 1);
        if (nd < bestD || (nd === bestD && dot > bestDot + 1e-6)) { bestD = nd; bestDot = dot; bi = ni; bj = nj; }
      }
    } else {
      // standing in a blocked cell (e.g. hugging a wall): leave on our own side of it
      const sx = x >= cellCentre(ci) ? 1 : -1, sz = z >= cellCentre(cj) ? 1 : -1;
      let bestD = UNR;
      for (let k = 0; k < 3; k++) {
        const ni = ci + (k === 1 ? 0 : sx), nj = cj + (k === 0 ? 0 : sz);
        if (ni < 0 || nj < 0 || ni >= FN || nj >= FN) continue;
        const n = nj * FN + ni;
        if (cnt[n] === 0 && dist[n] < bestD) { bestD = dist[n]; bi = ni; bj = nj; }
      }
      if (bi < 0) {
        for (let k = 0; k < 8; k++) {
          const ni = ci + NDX[k], nj = cj + NDZ[k];
          if (ni < 0 || nj < 0 || ni >= FN || nj >= FN) continue;
          const n = nj * FN + ni;
          if (cnt[n] === 0 && dist[n] < bestD) { bestD = dist[n]; bi = ni; bj = nj; }
        }
      }
    }
    if (bi < 0) return false;
    const dx = cellCentre(bi) - x, dz = cellCentre(bj) - z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 1e-4) return false;
    out.set(dx / l, 0, dz / l);
    return true;
  }

  // ============================================================== random points
  function playerXZ(out) {
    const pl = game.player, pp = pl && pl.position;
    if (pp && pp.x === pp.x) { out.x = pp.x; out.z = pp.z; } else { out.x = playerSpawn.x; out.z = playerSpawn.z; }
    return out;
  }
  const _pxz = { x: 0, z: 0 };
  function randomSpawnPoint(minDist, maxDist) {
    const p = playerXZ(_pxz);
    minDist = minDist === undefined ? 28 : minDist; maxDist = maxDist === undefined ? 60 : Math.max(maxDist, minDist + 1);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, d = minDist + Math.random() * (maxDist - minDist) * (1 + pass * 0.6);
        const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        if (!cellFree(x, z)) continue;
        const k = cellOf(z) * FN + cellOf(x);
        if (pass < 2 && flowReady && dist[k] === UNR) continue;       // prefer cells that can reach the player
        if (pass === 0 && heightAt(x, z) < LAND_MIN + 0.2) continue;
        return new THREE.Vector3(x, heightAt(x, z), z);
      }
    }
    for (let i = 0; i < 200; i++) {
      const x = (Math.random() * 2 - 1) * (HALF - 30), z = (Math.random() * 2 - 1) * (HALF - 30);
      if (cellFree(x, z)) return new THREE.Vector3(x, heightAt(x, z), z);
    }
    return playerSpawn.clone();
  }
  function openAt(x, z) {
    if (!cellFree(x, z) || heightAt(x, z) < 1.4 || inCompound(x, z, 10)) return false;
    const ci = cellOf(x), cj = cellOf(z);
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const ni = ci + i, nj = cj + j;
      if (ni < 0 || nj < 0 || ni >= FN || nj >= FN || cnt[nj * FN + ni] !== 0) return false;
    }
    return Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)) + Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2)) < 1.6;
  }
  function randomOpenPoint() {
    const p = playerXZ(_pxz);
    for (let i = 0; i < 60; i++) {      // first try a ring around the player so drops are reachable
      const a = Math.random() * Math.PI * 2, d = 45 + Math.random() * 60;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (Math.abs(x) < 165 && Math.abs(z) < 165 && openAt(x, z)) return new THREE.Vector3(x, heightAt(x, z), z);
    }
    for (let i = 0; i < 300; i++) {
      const x = (Math.random() * 2 - 1) * 160, z = (Math.random() * 2 - 1) * 160;
      if (openAt(x, z)) return new THREE.Vector3(x, heightAt(x, z), z);
    }
    return randomSpawnPoint(40, 110);
  }

  // ============================================================== sky, stars, lights, fog
  const C = (h) => new THREE.Color(h);
  const KEY = {   // [night, dusk/dawn, day]
    top: [C(0x070c22), C(0x2b2a5e), C(0x3a7bd5)],
    hor: [C(0x1a2850), C(0xd07649), C(0xb5d3ea)],
    hemiS: [C(0x4666c0), C(0xdc9f80), C(0xcfe2ff)],
    hemiG: [C(0x1a2444), C(0x4a3830), C(0x7b6a4e)],
  };
  // Night keeps its deep-blue mood but lifts shadowed faces just off black, so a zombie seen from
  // behind (no eye glow) still reads against the ground without the flashlight.
  const FOG_D = [0.019, 0.0075, 0.0032], HEMI_I = [1.55, 0.95, 1.45];
  const SUN_I = 3.3, MOON_I = 1.6;
  const sunDusk = C(0xff8a4a), sunDay = C(0xfff1d6), moonCol = C(0x9db8ff);
  function mix3(out, arr, f) { return f < 0.5 ? out.copy(arr[0]).lerp(arr[1], f * 2) : out.copy(arr[1]).lerp(arr[2], (f - 0.5) * 2); }
  function mix3s(arr, f) { return f < 0.5 ? arr[0] + (arr[1] - arr[0]) * f * 2 : arr[1] + (arr[2] - arr[1]) * (f - 0.5) * 2; }

  scene.fog = new THREE.FogExp2(0xb5d3ea, FOG_D[2]);
  scene.background = null;

  const skyU = {
    uTop: { value: C(0x3a7bd5) }, uHorizon: { value: C(0xb5d3ea) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uSunCol: { value: C(0xfff1d6) }, uMoonCol: { value: C(0xdfe8ff) },
    uSunVis: { value: 1 }, uMoonVis: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(820, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir;\nvoid main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform vec3 uSunCol; uniform vec3 uMoonCol;',
        'uniform float uSunVis; uniform float uMoonVis; varying vec3 vDir;',
        'void main(){',
        '  vec3 d = normalize(vDir);',
        '  float h = max(d.y, 0.0);',
        '  vec3 col = mix(uHorizon, uTop, pow(h, 0.5));',
        '  float above = smoothstep(-0.03, 0.02, d.y);',
        '  float sd = max(dot(d, uSunDir), 0.0);',
        '  float disc = smoothstep(0.99925, 0.9996, sd);',
        '  col += uSunCol * (disc * 3.0 + pow(sd, 380.0) * 0.7 + pow(sd, 18.0) * 0.28) * uSunVis * above;',
        '  float md = max(dot(d, uMoonDir), 0.0);',
        '  float mdisc = smoothstep(0.99885, 0.9991, md);',
        '  vec3 mo = normalize(uMoonDir + vec3(0.018, 0.012, 0.0));',
        '  float bite = smoothstep(0.9990, 0.9993, max(dot(d, mo), 0.0));',
        '  col += uMoonCol * (mdisc * (1.0 - bite * 0.82) * 1.5 + pow(md, 260.0) * 0.22 + pow(md, 30.0) * 0.06) * uMoonVis * above;',
        '  gl_FragColor = vec4(col, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
    }));
  sky.frustumCulled = false; sky.renderOrder = -10; sky.name = 'sky';
  scene.add(sky);

  const starMat = new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = (() => {
    const n = 1300, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rand() * Math.PI * 2, y = 0.04 + 0.96 * rand(), r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(th) * r * 760; pos[i * 3 + 1] = y * 760; pos[i * 3 + 2] = Math.sin(th) * r * 760;
      const b = 0.35 + rand() * rand() * 1.4, w = rand();
      col[i * 3] = b * (0.8 + w * 0.2); col[i * 3 + 1] = b * 0.88; col[i * 3 + 2] = b * (1.0 - w * 0.15);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, starMat);
    pts.frustumCulled = false; pts.name = 'stars'; pts.visible = false;
    scene.add(pts);
    return pts;
  })();

  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x7b6a4e, HEMI_I[2]);
  scene.add(hemi);
  // One shadow-casting key light: it is the sun by day and the moon by night (it fades through
  // zero at the horizon, so the hand-over is invisible and the light count never changes).
  const key = new THREE.DirectionalLight(0xfff1d6, SUN_I);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const SH = 40;
  key.shadow.camera.left = -SH; key.shadow.camera.right = SH; key.shadow.camera.top = SH; key.shadow.camera.bottom = -SH;
  key.shadow.camera.near = 1; key.shadow.camera.far = 240;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.05;
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight(0xcfe2ff, 0.3);
  scene.add(fill); scene.add(fill.target);

  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), keyDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  const _fogC = new THREE.Color(), _tgt = new THREE.Vector3(), _right = new THREE.Vector3(), _upv = new THREE.Vector3();
  function setDir(out, az, el) { const ce = Math.cos(el); return out.set(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce); }
  let time = 0;

  function updateEnv(dt) {
    const df = game.dayFactor;
    const f = clamp01(df === undefined || df !== df ? 1 : df);
    const night = 1 - f;
    mix3(skyU.uTop.value, KEY.top, f);
    mix3(_fogC, KEY.hor, f);
    scene.fog.color.copy(_fogC); skyU.uHorizon.value.copy(_fogC);
    scene.fog.density = mix3s(FOG_D, f);
    mix3(hemi.color, KEY.hemiS, f); mix3(hemi.groundColor, KEY.hemiG, f);
    hemi.intensity = mix3s(HEMI_I, f);

    const playing = game.state !== 'menu';
    const p = playing ? clamp01(game.phaseTime / (game.phaseDuration || 1)) : 0.5 + 0.4 * Math.sin(time * 0.05);
    const s = clamp01((f - 0.5) * 2), m = clamp01((0.5 - f) * 2);
    // p restarts at 0 on every phase change. The body that is below the horizon must wait where it
    // set (first half of the other phase) / where it will rise (second half); otherwise its horizon
    // glow, still faintly visible around the hand-over, teleports across the sky at dusk and dawn.
    const isNight = playing && game.phase === 'night', isDay = playing && !isNight;
    const sunP = isNight ? (p < 0.5 ? 1 : 0) : p, moonP = isDay ? (p < 0.5 ? 1 : 0) : p;
    const sunAz = -1.15 + sunP * 2.3, sunEl = (-5 + 63 * s) * DEG;
    const moonAz = 2.3 + moonP * 1.7, moonEl = (-5 + 55 * m) * DEG;
    setDir(sunDir, sunAz, sunEl); setDir(moonDir, moonAz, moonEl);
    skyU.uSunDir.value.copy(sunDir); skyU.uMoonDir.value.copy(moonDir);
    skyU.uSunCol.value.copy(sunDusk).lerp(sunDay, s);
    skyU.uSunVis.value = sstep(0.46, 0.6, f); skyU.uMoonVis.value = sstep(0.54, 0.4, f);
    if (f >= 0.5) {
      setDir(keyDir, sunAz, Math.max(sunEl, 17 * DEG));
      key.color.copy(sunDusk).lerp(sunDay, sstep(0.1, 0.8, s));
      key.intensity = SUN_I * sstep(0, 0.55, s);
    } else {
      setDir(keyDir, moonAz, Math.max(moonEl, 24 * DEG));
      key.color.copy(moonCol);
      key.intensity = MOON_I * sstep(0, 0.55, m);
    }
    fill.color.copy(hemi.color);
    fill.intensity = 0.24 + 0.2 * f;

    // shadow box follows the player (camera target in the menu), snapped to shadow texels
    const pl = game.player;
    if (playing && pl && pl.position) _tgt.copy(pl.position); else _tgt.set(0, 8, 0);
    _right.crossVectors(_up, keyDir).normalize(); _upv.crossVectors(keyDir, _right);
    const texel = (SH * 2) / 2048;
    const rx = _tgt.dot(_right), uy = _tgt.dot(_upv);
    _tgt.addScaledVector(_right, Math.round(rx / texel) * texel - rx).addScaledVector(_upv, Math.round(uy / texel) * texel - uy);
    key.target.position.copy(_tgt);
    key.position.copy(_tgt).addScaledVector(keyDir, 110);
    fill.target.position.copy(_tgt);
    fill.position.set(_tgt.x - keyDir.x * 60, _tgt.y + 40, _tgt.z - keyDir.z * 60);

    const cam = game.camera;
    sky.position.copy(cam.position); stars.position.copy(cam.position);
    stars.rotation.y += dt * 0.004;
    const so = sstep(0.5, 0.15, f);
    starMat.opacity = so; stars.visible = so > 0.01;

    if (game.bloom) game.bloom.strength = 0.24 + 0.56 * night;
    const lk = sstep(0.75, 0.3, f) * (1.5 + 0.12 * Math.sin(time * 9.0) + 0.08 * Math.sin(time * 23.0));
    lanternMat.color.setRGB(1.0 * lk, 0.62 * lk, 0.26 * lk);
    const bl = (time % 1.6) < 0.22 ? 2.6 : 0.12;
    beaconMat.color.setRGB(bl, bl * 0.12, bl * 0.08);
  }

  // ============================================================== update / reset
  function update(dt) {
    time += dt;
    timeU.value = time;
    updateEnv(dt);
    if (game.state === 'playing' && !game.paused) {
      flowTimer += dt;
      if (bfsRunning) bfsStep(7000);
      else if (flowTimer >= 0.5 || flowDirty) {
        const ft = flowTarget();
        lastPX = ft.x; lastPZ = ft.z;
        flowTimer = 0; flowDirty = false;
        bfsStart(lastPX, lastPZ);
        bfsStep(7000);
      }
    }
  }
  function fullFlow(x, z) { lastPX = x; lastPZ = z; bfsStart(x, z); bfsStep(Infinity); flowTimer = 0; flowDirty = false; }
  function reset() {
    for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i]._dyn) removeCollider(colliders[i]);   // drop last run's barricades / crates
    api.lastHitCollider = null;
    fullFlow(playerSpawn.x, playerSpawn.z);
  }
  fullFlow(playerSpawn.x, playerSpawn.z);
  updateEnv(0);

  for (const r of climbRoutes) r.roof.y = supportAt(r.roof.x, r.roof.z, 0.2, 99);
  Object.assign(api, {
    size: SIZE, heightAt, colliders, addCollider, removeCollider, resolveCircle, lastHitCollider: null,
    raycast, flowDir, compounds, randomSpawnPoint, randomOpenPoint, playerSpawn, update, reset,
    // extras (not required by the contract)
    isWalkable: cellFree, sunLight: key, hemiLight: hemi,
    supportAt, ceilingAt, floorAt, climbRoutes, barrelSpots,
  });
  return api;
}
