// HOLLOW DAWN — active abilities (game.skills). Sunlight is lethal to the infected.
//   Q SLIPSTREAM   dodge dash with brief invulnerability (2 charges)
//   E SUNFLARE     thrown flare: burning, slowing light zone
//   G FRAG         thrown grenade (2 charges)
//   X DAWNBREAKER  kill-charged pillar of sunlight
// Self-contained: own pooled FX, own DOM widget (right edge of #hud), own tiny synth.
import * as THREE from 'three';

const TAU = Math.PI * 2;

const DEFAULTS = {
  dash:  { code: 'KeyQ', letter: 'Q', name: 'SLIPSTREAM',  charges: 2, cooldown: 5,  distance: 7, duration: 0.18, invuln: 0.45 },
  flare: { code: 'KeyE', letter: 'E', name: 'SUNFLARE',    charges: 1, cooldown: 16, burn: 7, radius: 7, dps: 22, slowMult: 0.45, range: 26, speed: 20 },
  frag:  { code: 'KeyG', letter: 'G', name: 'FRAG',        charges: 2, cooldown: 11, fuse: 1.6, radius: 7, damage: 220, knock: 12, selfRadius: 4, selfDamage: 25, range: 30, speed: 22 },
  dawn:  { code: 'KeyX', letter: 'X', name: 'DAWNBREAKER', charges: 1, cooldown: 0,  kills: 20, delay: 0.7, radius: 12, damage: 600, stun: 2.5, range: 45, fallback: 20 },
};
const ORDER = ['dash', 'flare', 'frag', 'dawn'];

const ICONS = {
  dash: '<path d="M3 9h7M1.5 16h8M3 23h7" opacity=".6"/><path d="M14 7l9 9-9 9"/><path d="M21.5 8.5l6.5 7.5-6.5 7.5" opacity=".5"/>',
  flare: '<circle cx="20" cy="11" r="4"/><path d="M20 2v3M20 17v3M11 11h3M26 11h3M13.7 4.7l2.1 2.1M24.2 15.2l2.1 2.1M26.3 4.7l-2.1 2.1"/><path d="M3 29c2-7 6-11 11-13" stroke-dasharray="2.5 3"/>',
  frag: '<path d="M9.5 15l6.5-3.5 6.5 3.5v8L16 28.5 9.5 23z"/><path d="M13 12V7.5h6V12M19 7.5h5l2 5"/><path d="M9.5 19h13M16 11.5v17" opacity=".45"/>',
  dawn: '<path d="M4 25h24"/><path d="M9 25a7 7 0 0 1 14 0"/><path d="M16 3v12M12.2 5v6M19.8 5v6"/><path d="M5.5 18.5l2 1.8M26.5 18.5l-2 1.8" opacity=".6"/>',
};

const RING_C = 144.5; // circumference of the ult ring (r = 23)

const CSS = `
#hd-skills { position: absolute; right: 18px; bottom: 184px; display: flex; flex-direction: column; gap: 10px;
  font-family: var(--mono); color: var(--bone); }
@media (max-height: 780px) { #hd-skills { zoom: .82; bottom: 150px; } }
#hd-skills.off { display: none; }
.hd-sk { --cut: polygon(11px 0, 100% 0, 100% calc(100% - 11px), calc(100% - 11px) 100%, 0 100%, 0 11px);
  position: relative; width: 58px; height: 58px; filter: drop-shadow(0 2px 5px rgba(0,0,0,.6)); }
.hd-sk-frame { position: absolute; inset: 0; background: rgba(232,228,216,.3); clip-path: var(--cut); transition: background .18s; }
.hd-sk-body { position: absolute; inset: 1.5px; clip-path: var(--cut); overflow: hidden;
  background: linear-gradient(155deg, rgba(24,30,56,.86), rgba(7,10,20,.9)); }
.hd-sk-icon { position: absolute; left: 50%; top: 50%; width: 32px; height: 32px; transform: translate(-50%, -46%);
  fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: square; stroke-linejoin: miter; color: var(--bone); transition: opacity .15s, color .15s; }
.hd-sk-cd { position: absolute; inset: -30%; opacity: 0;
  background: conic-gradient(from 0deg, transparent calc(var(--p, 1) * 1turn), rgba(4,6,14,.8) 0); }
.hd-sk-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--ember); transform-origin: 0 50%; transform: scaleX(0); opacity: 0; }
.hd-sk-key { position: absolute; right: 4px; top: 3px; font: 700 10.5px/1 var(--mono); color: var(--ember); text-shadow: 0 1px 2px #000; }
.hd-sk-num { position: absolute; inset: 0; display: grid; place-items: center; font: 800 25px/1 var(--display); color: var(--bone);
  text-shadow: 0 0 6px #000, 0 1px 2px #000; padding-top: 2px; }
.hd-sk-pips { position: absolute; left: 5px; bottom: 5px; display: flex; gap: 3px; }
.hd-sk-pips i { display: block; width: 9px; height: 4px; background: rgba(232,228,216,.22); transform: skewX(-22deg); transition: background .15s; }
.hd-sk-pips i.on { background: var(--ember); box-shadow: 0 0 5px rgba(255,122,60,.8); }
.hd-sk-meter { position: absolute; left: 4px; bottom: 3px; font: 600 8.5px/1 var(--mono); letter-spacing: .04em; color: var(--dim); text-shadow: 0 1px 2px #000; }
.hd-sk-ring { position: absolute; inset: 0; width: 58px; height: 58px; transform: rotate(-90deg); fill: none; }
.hd-sk-ring .bg { stroke: rgba(232,228,216,.14); stroke-width: 2.5; }
.hd-sk-ring .fg { stroke: var(--ember); stroke-width: 2.5; stroke-dasharray: ${RING_C}; stroke-dashoffset: ${RING_C}; transition: stroke-dashoffset .25s; }
.hd-sk-name { position: absolute; right: 68px; top: 50%; transform: translateY(-50%) translateX(8px); white-space: nowrap; opacity: 0;
  font: 600 10px/1 var(--mono); letter-spacing: .2em; padding: 6px 10px 6px 12px; background: var(--panel); color: var(--bone);
  clip-path: polygon(7px 0, 100% 0, 100% 100%, 0 100%, 0 7px); transition: opacity .25s, transform .25s; }
.hd-sk-name b { color: var(--ember); font-weight: 700; margin-right: 8px; }
.hd-sk.name .hd-sk-name { opacity: 1; transform: translateY(-50%); }
.hd-sk.ult .hd-sk-icon { width: 26px; height: 26px; transform: translate(-50%, -50%); }
.hd-sk.cool .hd-sk-icon { opacity: .3; }
.hd-sk.cool .hd-sk-cd { opacity: 1; }
.hd-sk.cool .hd-sk-key { color: var(--dim); }
.hd-sk.rech .hd-sk-bar { opacity: 1; }
.hd-sk.cast .hd-sk-frame { background: var(--ember); }
.hd-sk.cast { animation: hd-sk-cast .32s ease-out; }
.hd-sk.deny .hd-sk-frame { background: var(--blood); }
.hd-sk.deny .hd-sk-icon { color: var(--blood); opacity: 1; }
.hd-sk.deny { animation: hd-sk-deny .26s linear; }
.hd-sk.ult.ready .hd-sk-frame { background: var(--ember); }
.hd-sk.ult.ready .hd-sk-icon, .hd-sk.ult.ready .hd-sk-meter { color: var(--ember); }
.hd-sk.ult.ready { animation: hd-sk-pulse 1.1s ease-in-out infinite; }
.hd-sk.ult:not(.ready) .hd-sk-icon { opacity: .5; }
@keyframes hd-sk-cast { 0% { transform: scale(1.16); filter: drop-shadow(0 0 12px rgba(255,122,60,.95)); } 100% { transform: scale(1); filter: drop-shadow(0 2px 5px rgba(0,0,0,.6)); } }
@keyframes hd-sk-deny { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
@keyframes hd-sk-pulse { 0%, 100% { filter: drop-shadow(0 0 4px rgba(255,122,60,.55)); } 50% { filter: drop-shadow(0 0 13px rgba(255,150,80,1)); } }
`;

const PARTICLE_VS = `
attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;
void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z); }`;
const PARTICLE_FS = `
varying vec4 vColor;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a * a); }`;
const SMOKE_FS = `
varying vec4 vColor;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = 1.0 - smoothstep(0.25, 1.0, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a); }`;
const BEAM_VS = `
varying vec2 vUv; varying float vFace;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal);
  vFace = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`;
const BEAM_FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec2 vUv; varying float vFace;
void main() { float core = pow(vFace, 1.6); float h = mix(1.0, 0.14, smoothstep(0.0, 1.0, vUv.y));
  float shimmer = 0.86 + 0.14 * sin(vUv.y * 46.0 - uTime * 14.0 + vUv.x * 18.85);
  gl_FragColor = vec4(uColor * (core * h * shimmer * uAlpha), 1.0); }`;

export function init(game) {
  const CONFIG = game.CONFIG || {};
  const scene = game.scene, camera = game.camera;
  const S = {};
  for (const id of ORDER) S[id] = Object.assign({}, DEFAULTS[id], CONFIG.skills && CONFIG.skills[id]);
  const PC = CONFIG.player || {};
  const GRAV = PC.gravity || 20;
  const SEA = (CONFIG.world && CONFIG.world.seaLevel) || 0;
  const rand = Math.random;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // ------------------------------------------------------------------ state
  const abilities = ORDER.map((id) => ({
    id, key: S[id].letter, code: S[id].code, name: S[id].name, cooldown: S[id].cooldown,
    remaining: 0, charges: id === 'dawn' ? 0 : S[id].charges, maxCharges: S[id].charges, ready: id !== 'dawn',
  }));
  const byId = {}; const byCode = {};
  for (const a of abilities) { byId[a.id] = a; byCode[a.code] = a; }

  const api = { update, reset, abilities, ultCharge: 0, cast, invulnerable: false, config: S, blast: (x, y, z, o) => explode(x, y, z, o),
    dashing: false,                                   // true while a SLIPSTREAM dash is moving the player (perks read it)
    addUltKills: (n) => addUltKills(n),               // extra Dawnbreaker charge (perks: NECRO HARVEST)
    refundCharge: (id, n) => refundCharge(id, n) };   // give back charges of Q / E / G (perks: REAPER'S WALTZ)
  // perk modifiers (game.mods is always present in the game; guard stand-alone use)
  const modOf = (k, d) => { const m = game.mods; const v = m && m[k]; return typeof v === 'number' && v > 0 ? v : d; };

  let time = 0, invulnT = 0, ultKills = 0, suppressUlt = false, failed = false, parked = true;
  let shake = 0, sunFlash = 0, nightK = 1;
  const dash = { t: 0, dx: 0, dz: 1, speed: 0, ghostAcc: 0 };
  const flare = { state: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, fly: 0, bounces: 0, tick: 0, wave: 0, age: 0, acc: 0 };
  const strike = { phase: 0, t: 0, x: 0, y: 0, z: 0, acc: 0 };
  const burst = { t: 0, dur: 0, peak: 0 };

  // ------------------------------------------------------------------ temps
  const tO = new THREE.Vector3(), tD = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
  const tQ = new THREE.Quaternion(), tS = new THREE.Vector3(), tM = new THREE.Matrix4(), tC = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);
  const hitPoint = new THREE.Vector3(), hitDir = new THREE.Vector3();
  const hitInfo = { headshot: false, point: hitPoint, dir: hitDir, source: 'skill' };
  const hitEvt = { zombie: null, headshot: false, killed: false, point: hitPoint };
  const zTmp = [];

  // ------------------------------------------------------------------ world helpers
  function rawHeight(x, z) {
    const w = game.world;
    if (!w || !w.heightAt) return 0;
    const h = w.heightAt(x, z);
    return h === h ? h : 0;
  }
  function groundAt(x, z) { const h = rawHeight(x, z); return h < SEA ? SEA : h; }
  function resolve(pos, r, h) { const w = game.world; if (w && w.resolveCircle) w.resolveCircle(pos, r, h); }
  function worldRay(o, d, max) {
    const w = game.world;
    if (!w || !w.raycast) return null;
    const res = w.raycast(o, d, max);
    return res && res.point ? res : null;
  }
  function aimRay(o, d) {
    const p = game.player;
    if (p && p.getAimRay) p.getAimRay(o, d);
    else { camera.getWorldPosition(o); camera.getWorldDirection(d); }
    if (!(d.lengthSq() > 1e-6)) d.set(0, 0, -1);
    d.normalize();
  }
  function queryZombies(pos, r) {
    const zs = game.zombies;
    zTmp.length = 0;
    if (!zs) return zTmp;
    if (zs.inRadius) { const out = zs.inRadius(pos, r, zTmp); return out || zTmp; }
    const list = zs.list; if (!list) return zTmp;
    const r2 = r * r;
    for (let i = 0; i < list.length; i++) {
      const z = list[i]; if (!z || !z.alive || !z.position) continue;
      const dx = z.position.x - pos.x, dz = z.position.z - pos.z;
      if (dx * dx + dz * dz <= r2) zTmp.push(z);
    }
    return zTmp;
  }
  function hurt(z, amount) {
    const zs = game.zombies;
    if (!zs || !zs.damage) return false;
    return !!zs.damage(z, amount, hitInfo);
  }
  function distToPlayer(x, y, z) {
    const p = game.player; if (!p || !p.position) return 0;
    const dx = p.position.x - x, dy = p.position.y + 0.9 - y, dz = p.position.z - z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ------------------------------------------------------------------ scene objects (all pooled, created once)
  const root = new THREE.Group(); root.name = 'skills';
  root.position.y = -5000;   // parked off-screen but visible so shaders compile behind the menu; reset() un-parks
  scene.add(root);
  const pooled = [];
  function own(o) { o.traverse((c) => { c.frustumCulled = false; }); root.add(o); pooled.push(o); return o; }

  // lights: always in the scene at intensity 0 so toggling never recompiles materials
  const flareLight = new THREE.PointLight(0xffb060, 0, 34, 2);
  const burstLight = new THREE.PointLight(0xffd6a0, 0, 48, 2);
  const sunLight = new THREE.DirectionalLight(0xfff0d0, 0);
  const sunAmb = new THREE.AmbientLight(0xffe2bc, 0);
  root.add(flareLight, burstLight, sunLight, sunLight.target, sunAmb);

  // soft glow sprite texture
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.16, 'rgba(255,255,255,.78)');
    grd.addColorStop(0.42, 'rgba(255,255,255,.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  function makeGlow() {
    const m = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    const sp = own(new THREE.Sprite(m)); sp.renderOrder = 6;
    return sp;
  }

  // volumetric-looking beam (open cylinder, brighter where it faces the camera)
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true); beamGeo.translate(0, 0.5, 0);
  function makeBeam(r, g, b) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color().setRGB(r, g, b) }, uAlpha: { value: 0 }, uTime: { value: 0 } },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
    const bm = own(new THREE.Mesh(beamGeo, mat)); bm.renderOrder = 6;
    return bm;
  }

  // ground rings that follow the terrain
  const SEG = 48, LIFT = 0.14;
  const COS = new Float32Array(SEG + 1), SIN = new Float32Array(SEG + 1);
  for (let i = 0; i <= SEG; i++) { COS[i] = Math.cos((i / SEG) * TAU); SIN[i] = Math.sin((i / SEG) * TAU); }
  function makeRing(innerV, outerV) {
    const n = (SEG + 1) * 2;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = i % 2 === 0 ? innerV : outerV; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
    const idx = [];
    for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(pos, 3); attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = own(new THREE.Mesh(geo, mat));
    mesh.renderOrder = 5;
    return { mesh, mat, pos, attr };
  }
  function setRing(R, cx, cz, r0, r1) {
    const p = R.pos; let k = 0;
    if (r0 < 0) r0 = 0;
    if (r1 < r0) r1 = r0;
    const cy = r0 < 0.01 ? groundAt(cx, cz) + LIFT : 0;
    for (let i = 0; i <= SEG; i++) {
      const c = COS[i], s = SIN[i];
      let x = cx + c * r0, z = cz + s * r0;
      p[k++] = x; p[k++] = r0 < 0.01 ? cy : groundAt(x, z) + LIFT; p[k++] = z;
      x = cx + c * r1; z = cz + s * r1;
      p[k++] = x; p[k++] = groundAt(x, z) + LIFT; p[k++] = z;
    }
    R.attr.needsUpdate = true;
  }

  // one-shot expanding shockwaves
  const shocks = [];
  for (let i = 0; i < 4; i++) shocks.push({ ring: makeRing(0, 1), active: false, t: 0, dur: 1, cx: 0, cz: 0, rMax: 1, width: 1 });
  let shockHead = 0;
  function spawnShock(cx, cz, rMax, dur, width, r, g, b) {
    let s = null;
    for (let i = 0; i < shocks.length; i++) if (!shocks[i].active) { s = shocks[i]; break; }
    if (!s) { s = shocks[shockHead]; shockHead = (shockHead + 1) % shocks.length; }
    s.active = true; s.t = 0; s.dur = dur; s.cx = cx; s.cz = cz; s.rMax = rMax; s.width = width;
    s.ring.mat.color.setRGB(r, g, b); s.ring.mat.opacity = 1;
    setRing(s.ring, cx, cz, 0, 0.1);
    s.ring.mesh.visible = true;
  }
  function updateShocks(dt) {
    for (let i = 0; i < shocks.length; i++) {
      const s = shocks[i]; if (!s.active) continue;
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) { s.active = false; s.ring.mesh.visible = false; continue; }
      const inv = 1 - k, e = 1 - inv * inv * inv;
      const r1 = s.rMax * e;
      setRing(s.ring, s.cx, s.cz, r1 - s.width * (0.35 + 0.65 * inv), r1);
      s.ring.mat.opacity = inv * Math.sqrt(inv);
    }
  }

  // particles: additive sparks/embers and soft smoke
  function makeParticles(n, additive) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
    const aPos = new THREE.BufferAttribute(pos, 3), aCol = new THREE.BufferAttribute(col, 4), aSize = new THREE.BufferAttribute(size, 1);
    aPos.setUsage(THREE.DynamicDrawUsage); aCol.setUsage(THREE.DynamicDrawUsage); aSize.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', aPos); geo.setAttribute('aColor', aCol); geo.setAttribute('aSize', aSize);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } }, vertexShader: PARTICLE_VS, fragmentShader: additive ? PARTICLE_FS : SMOKE_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false, toneMapped: false,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 8 : 4;
    root.add(pts);
    return { n, additive, pos, col, size, aPos, aCol, aSize, mat, head: 0, live: 0,
      vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), base: new Float32Array(n * 4), phys: new Float32Array(n * 2) };
  }
  const sparks = makeParticles(720, true);
  const smoke = makeParticles(160, false);
  function emit(ps, x, y, z, vx, vy, vz, life, size, r, g, b, grav, drag) {
    const i = ps.head; ps.head = (i + 1) % ps.n;
    if (ps.life[i] <= 0) ps.live++;
    const i3 = i * 3, i4 = i * 4;
    ps.pos[i3] = x; ps.pos[i3 + 1] = y; ps.pos[i3 + 2] = z;
    ps.vel[i3] = vx; ps.vel[i3 + 1] = vy; ps.vel[i3 + 2] = vz;
    ps.life[i] = life; ps.max[i] = life;
    ps.base[i4] = r; ps.base[i4 + 1] = g; ps.base[i4 + 2] = b; ps.base[i4 + 3] = size;
    ps.phys[i * 2] = grav; ps.phys[i * 2 + 1] = drag;
    ps.col[i4] = r; ps.col[i4 + 1] = g; ps.col[i4 + 2] = b; ps.col[i4 + 3] = ps.additive ? 1 : 0;
    ps.size[i] = size;
  }
  function updateParticles(ps, dt) {
    if (ps.live <= 0) return;
    let live = 0;
    const { pos, vel, life, max, base, phys, col, size, additive } = ps;
    for (let i = 0; i < ps.n; i++) {
      let l = life[i];
      if (l <= 0) continue;
      const i3 = i * 3, i4 = i * 4;
      l -= dt;
      if (l <= 0) { life[i] = 0; size[i] = 0; col[i4 + 3] = 0; continue; }
      life[i] = l; live++;
      let k = 1 - phys[i * 2 + 1] * dt; if (k < 0) k = 0;
      vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k - phys[i * 2] * dt; vel[i3 + 2] *= k;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      const t = l / max[i];
      if (additive) {
        col[i4 + 3] = t > 0.6 ? 1 : t / 0.6;
        size[i] = base[i4 + 3] * (0.35 + 0.65 * t);
      } else {
        const u = 1 - t, cool = u < 0.35 ? u / 0.35 : 1;
        col[i4] = base[i4] + (0.085 - base[i4]) * cool;
        col[i4 + 1] = base[i4 + 1] + (0.08 - base[i4 + 1]) * cool;
        col[i4 + 2] = base[i4 + 2] + (0.085 - base[i4 + 2]) * cool;
        col[i4 + 3] = Math.sin(u * Math.PI) * 0.5;
        size[i] = base[i4 + 3] * (0.55 + 1.7 * u);
      }
    }
    ps.live = live;
    ps.aPos.needsUpdate = true; ps.aCol.needsUpdate = true; ps.aSize.needsUpdate = true;
  }
  function clearParticles(ps) {
    ps.life.fill(0); ps.size.fill(0); ps.col.fill(0); ps.live = 0; ps.head = 0;
    ps.aPos.needsUpdate = true; ps.aCol.needsUpdate = true; ps.aSize.needsUpdate = true;
  }
  // burst of sparks in a sphere / upper hemisphere
  function sparkBurst(x, y, z, n, vMin, vMax, upBias, lifeMin, lifeMax, sMin, sMax, r, g, b, grav, drag) {
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, cy = upBias ? rand() * 0.95 + 0.05 : rand() * 2 - 1, sy = Math.sqrt(1 - cy * cy);
      const v = vMin + rand() * (vMax - vMin), j = 0.6 + rand() * 0.6;
      emit(sparks, x, y, z, Math.cos(a) * sy * v, cy * v, Math.sin(a) * sy * v,
        lifeMin + rand() * (lifeMax - lifeMin), sMin + rand() * (sMax - sMin), r * j, g * j, b * j, grav, drag);
    }
  }

  // dash afterimages (one instanced draw call)
  const GHOSTS = 10;
  const ghostGeo = new THREE.CapsuleGeometry(0.3, 1.0, 3, 8); ghostGeo.translate(0, 0.82, 0);
  const ghostMesh = new THREE.InstancedMesh(ghostGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }), GHOSTS);
  ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ghostMesh.frustumCulled = false; ghostMesh.renderOrder = 6;
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  const ghostData = new Float32Array(GHOSTS * 5); // x, y, z, yaw, life
  let ghostHead = 0, ghostLive = 0;
  const GHOST_LIFE = 0.36;
  for (let i = 0; i < GHOSTS; i++) { ghostMesh.setMatrixAt(i, ZERO_M); ghostMesh.setColorAt(i, tC.setRGB(0, 0, 0)); }
  root.add(ghostMesh);
  function spawnGhost(x, y, z, yaw) {
    const o = ghostHead * 5; ghostHead = (ghostHead + 1) % GHOSTS;
    ghostData[o] = x; ghostData[o + 1] = y; ghostData[o + 2] = z; ghostData[o + 3] = yaw; ghostData[o + 4] = GHOST_LIFE;
    ghostLive = GHOSTS;
  }
  function updateGhosts(dt) {
    if (ghostLive <= 0) return;
    let live = 0;
    for (let i = 0; i < GHOSTS; i++) {
      const o = i * 5; let l = ghostData[o + 4];
      if (l <= 0) continue;
      l -= dt; ghostData[o + 4] = l;
      if (l <= 0) { ghostMesh.setMatrixAt(i, ZERO_M); continue; }
      live++;
      const f = l / GHOST_LIFE;
      tA.set(ghostData[o], ghostData[o + 1], ghostData[o + 2]);
      tQ.setFromAxisAngle(UP, ghostData[o + 3]);
      tS.set(0.55 + 0.45 * f, 1, 1 + (1 - f) * 1.4);
      tM.compose(tA, tQ, tS);
      ghostMesh.setMatrixAt(i, tM);
      const c = f * f * 0.85;
      ghostMesh.setColorAt(i, tC.setRGB(1.5 * c, 0.78 * c, 0.26 * c));
    }
    ghostLive = live;
    ghostMesh.instanceMatrix.needsUpdate = true;
    if (ghostMesh.instanceColor) ghostMesh.instanceColor.needsUpdate = true;
  }

  // flare objects
  const flareStick = own(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.28, 6),
    new THREE.MeshStandardMaterial({ color: 0xb3202a, emissive: 0xff5a1e, emissiveIntensity: 1.6, roughness: 0.7, flatShading: true })));
  const flareGlow = makeGlow();
  const flareBeam = makeBeam(1.0, 0.62, 0.26);
  const flareRim = makeRing(0.12, 1);
  const flareWave = makeRing(0, 1);

  // grenades
  const grenGeo = new THREE.IcosahedronGeometry(0.1, 0);
  const grenMat = new THREE.MeshStandardMaterial({ color: 0x55633c, roughness: 0.75, metalness: 0.25, flatShading: true });
  const capGeo = new THREE.BoxGeometry(0.07, 0.06, 0.07);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.5, flatShading: true });
  const blinkGeo = new THREE.SphereGeometry(0.035, 6, 4);
  const grenades = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(grenGeo, grenMat); body.scale.set(1, 1.2, 1);
    const cap = new THREE.Mesh(capGeo, capMat); cap.position.y = 0.13;
    const blink = new THREE.Mesh(blinkGeo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false, fog: false }));
    blink.position.set(0.06, 0.1, 0);
    g.add(body, cap, blink);
    own(g);
    grenades.push({ active: false, rest: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, phase: 0, bounceCd: 0, acc: 0, mesh: g, blink });
  }
  const fireballs = [];
  for (let i = 0; i < 2; i++) fireballs.push({ sprite: makeGlow(), t: 0, dur: 0, size: 1, active: false });

  // dawnbreaker objects
  const teleRim = makeRing(0.1, 1);
  const teleFill = makeRing(1, 0);
  const teleBeam = makeBeam(1.0, 0.86, 0.6);
  const colOuter = makeBeam(1.0, 0.66, 0.3);
  const colCore = makeBeam(1.0, 0.95, 0.8);
  const dawnGlow = makeGlow();

  // ------------------------------------------------------------------ sound (tiny synth, lazy context)
  const snd = (() => {
    let ctx = null, master = null, noiseBuf = null, voices = 0, loop = null;
    const MAXV = 16;
    function ensure() {
      if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.5;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp); comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; }
    }
    function env(g, t0, vol, attack, dur) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    function tone(type, f0, f1, dur, vol, delay, attack) {
      if (!ctx || voices >= MAXV || !(vol > 0.002)) return;
      try {
        const t0 = ctx.currentTime + (delay || 0);
        const o = ctx.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, t0);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
        const g = ctx.createGain(); env(g, t0, vol, attack || 0.005, dur);
        o.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + dur + 0.05);
        voices++;
        o.onended = () => { voices--; try { g.disconnect(); } catch (e) { /* gone */ } };
      } catch (e) { /* audio is optional */ }
    }
    function noise(ftype, f0, f1, q, dur, vol, delay, attack) {
      if (!ctx || voices >= MAXV || !(vol > 0.002)) return;
      try {
        const t0 = ctx.currentTime + (delay || 0);
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q || 0.7;
        f.frequency.setValueAtTime(f0, t0);
        if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t0 + dur);
        const g = ctx.createGain(); env(g, t0, vol, attack || 0.004, dur);
        src.connect(f); f.connect(g); g.connect(master);
        src.start(t0, Math.random() * 0.8); src.stop(t0 + dur + 0.05);
        voices++;
        src.onended = () => { voices--; try { g.disconnect(); } catch (e) { /* gone */ } };
      } catch (e) { /* audio is optional */ }
    }
    return {
      ensure,
      dash() { noise('bandpass', 500, 2800, 1.2, 0.26, 0.5, 0, 0.03); tone('sine', 520, 140, 0.2, 0.16); },
      throwIt() { noise('bandpass', 900, 400, 1.5, 0.16, 0.22, 0, 0.02); tone('triangle', 1900, 1500, 0.05, 0.1); },
      bounce(v) { tone('triangle', 620, 300, 0.06, 0.16 * v); noise('highpass', 2400, 2400, 0.7, 0.04, 0.12 * v); },
      ignite(v) { noise('highpass', 1800, 5200, 0.7, 0.5, 0.42 * v, 0, 0.02); tone('sawtooth', 190, 760, 0.35, 0.1 * v, 0, 0.05); tone('sine', 880, 1320, 0.5, 0.08 * v, 0.05, 0.05); },
      boom(v) {
        tone('sine', 130, 30, 0.7, 0.95 * v);
        tone('triangle', 70, 38, 0.45, 0.5 * v);
        noise('lowpass', 3600, 180, 0.6, 0.95, 0.85 * v);
        noise('highpass', 2600, 1200, 0.7, 0.09, 0.5 * v);
        noise('bandpass', 420, 160, 0.8, 1.5, 0.22 * v, 0.12, 0.2);
      },
      charge() { tone('sawtooth', 110, 880, 0.7, 0.14, 0, 0.5); tone('sine', 440, 1760, 0.7, 0.12, 0, 0.55); noise('bandpass', 700, 5200, 2, 0.7, 0.2, 0, 0.6); },
      dawn(v) {
        tone('sine', 96, 26, 1.5, 1.0 * v);
        noise('lowpass', 5200, 140, 0.5, 1.9, 0.9 * v);
        noise('highpass', 3200, 1600, 0.7, 0.12, 0.5 * v);
        tone('sine', 523.25, 523.25, 2.4, 0.13 * v, 0.02, 0.04);
        tone('sine', 783.99, 783.99, 2.2, 0.1 * v, 0.02, 0.04);
        tone('sine', 1046.5, 1046.5, 2.0, 0.08 * v, 0.02, 0.04);
        tone('triangle', 1568, 1568, 1.6, 0.04 * v, 0.06, 0.05);
      },
      deny() { tone('square', 150, 110, 0.08, 0.07); },
      ultReady() { tone('sine', 660, 660, 0.3, 0.14); tone('sine', 990, 990, 0.5, 0.14, 0.11); tone('sine', 1320, 1320, 0.7, 0.1, 0.22); },
      loopStart() {
        if (!ctx || loop) return;
        try {
          const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
          const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3400;
          const g = ctx.createGain(); g.gain.value = 0;
          src.connect(f); f.connect(g); g.connect(master); src.start();
          loop = { src, g };
        } catch (e) { loop = null; }
      },
      loopGain(v) { if (loop && ctx) { try { loop.g.gain.setTargetAtTime(v, ctx.currentTime, 0.06); } catch (e) { /* ignore */ } } },
      loopStop() {
        if (!loop || !ctx) { loop = null; return; }
        const l = loop; loop = null;
        try { l.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08); l.src.stop(ctx.currentTime + 0.4); } catch (e) { /* ignore */ }
      },
    };
  })();
  function atten(x, y, z) { return 1 / (1 + distToPlayer(x, y, z) * 0.055); }

  // ------------------------------------------------------------------ DOM widget
  const tiles = [];
  const wrap = document.createElement('div');
  wrap.id = 'hd-skills'; wrap.className = 'off';
  {
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    for (const a of abilities) {
      const isUlt = a.id === 'dawn';
      const el = document.createElement('div');
      el.className = 'hd-sk' + (isUlt ? ' ult' : '');
      let pips = '';
      if (!isUlt && a.maxCharges > 1) { pips = '<div class="hd-sk-pips">'; for (let i = 0; i < a.maxCharges; i++) pips += '<i class="on"></i>'; pips += '</div>'; }
      el.innerHTML =
        `<div class="hd-sk-name"><b>${a.key}</b>${a.name}</div>` +
        '<div class="hd-sk-frame"></div>' +
        `<div class="hd-sk-body"><svg class="hd-sk-icon" viewBox="0 0 32 32">${ICONS[a.id]}</svg><div class="hd-sk-cd"></div><div class="hd-sk-bar"></div></div>` +
        (isUlt ? '<svg class="hd-sk-ring" viewBox="0 0 58 58"><circle class="bg" cx="29" cy="29" r="23"/><circle class="fg" cx="29" cy="29" r="23"/></svg><div class="hd-sk-meter"></div>' : '') +
        '<div class="hd-sk-num"></div>' +
        `<div class="hd-sk-key">${a.key}</div>` + pips;
      wrap.appendChild(el);
      tiles.push({ a, el, isUlt,
        cd: el.querySelector('.hd-sk-cd'), bar: el.querySelector('.hd-sk-bar'), numEl: el.querySelector('.hd-sk-num'),
        pips: el.querySelectorAll('.hd-sk-pips i'), ring: el.querySelector('.hd-sk-ring .fg'), meter: el.querySelector('.hd-sk-meter'),
        cool: null, rech: null, rdy: null, step: -1, num: -1, ch: -1, denyT: 0, castT: 0, nameT: 0 });
    }
    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.appendChild(wrap);
  }
  let wrapOff = true;
  function showWidget(on) { if (wrapOff === !on) return; wrapOff = !on; wrap.classList.toggle('off', !on); }
  function tileOf(id) { for (let i = 0; i < tiles.length; i++) if (tiles[i].a.id === id) return tiles[i]; return null; }
  function restartClass(T, cls) { T.el.classList.remove(cls); void T.el.offsetWidth; T.el.classList.add(cls); }
  function showName(T, secs) { if (T.nameT <= 0) T.el.classList.add('name'); T.nameT = Math.max(T.nameT, secs); }
  function deny(a) {
    const T = tileOf(a.id); if (!T) return;
    restartClass(T, 'deny'); T.denyT = 0.28;
    snd.deny();
  }
  function uiTick(dt, force) {
    for (let i = 0; i < tiles.length; i++) {
      const T = tiles[i], a = T.a;
      const cool = T.isUlt ? strike.phase === 1 : a.charges <= 0;
      if (force || T.cool !== cool) { T.cool = cool; T.el.classList.toggle('cool', cool); }
      if (T.isUlt) {
        const st = Math.round(api.ultCharge * 100);
        if (force || T.step !== st) {
          T.step = st;
          T.ring.style.strokeDashoffset = (RING_C * (1 - api.ultCharge)).toFixed(1);
          T.meter.textContent = api.ultCharge >= 1 ? 'READY' : ultKills + '/' + S.dawn.kills;
        }
        const rdy = api.ultCharge >= 1 && strike.phase !== 1;
        if (force || T.rdy !== rdy) { T.rdy = rdy; T.el.classList.toggle('ready', rdy); }
      } else {
        const p = a.remaining > 0 && a.cooldown > 0 ? 1 - a.remaining / a.cooldown : 1;
        const st = Math.round(clamp01(p) * 80);
        if (force || T.step !== st) {
          T.step = st;
          const v = (st / 80).toFixed(3);
          T.cd.style.setProperty('--p', v);
          T.bar.style.transform = 'scaleX(' + v + ')';
        }
        const rech = !cool && a.remaining > 0;
        if (force || T.rech !== rech) { T.rech = rech; T.el.classList.toggle('rech', rech); }
        const num = cool ? Math.ceil(a.remaining) : 0;
        if (force || T.num !== num) { T.num = num; T.numEl.textContent = num > 0 ? String(num) : ''; }
        if (force || T.ch !== a.charges) {
          T.ch = a.charges;
          for (let k = 0; k < T.pips.length; k++) T.pips[k].classList.toggle('on', k < a.charges);
        }
      }
      if (T.denyT > 0) { T.denyT -= dt; if (T.denyT <= 0) T.el.classList.remove('deny'); }
      if (T.castT > 0) { T.castT -= dt; if (T.castT <= 0) T.el.classList.remove('cast'); }
      if (T.nameT > 0) { T.nameT -= dt; if (T.nameT <= 0) T.el.classList.remove('name'); }
    }
  }

  // ------------------------------------------------------------------ shared gameplay helpers
  // knockback: velocities applied over a short time so shoves read as motion, not teleports
  const PUSH_N = 96, PUSH_T = 0.4;
  const pushZ = new Array(PUSH_N).fill(null);
  const pushV = new Float32Array(PUSH_N * 3); // vx, vz, t
  let pushLive = 0;
  function addPush(z, vx, vz) {
    let slot = -1;
    for (let i = 0; i < PUSH_N; i++) { if (pushZ[i] === z) { slot = i; break; } if (slot < 0 && pushZ[i] === null) slot = i; }
    if (slot < 0) return;
    pushZ[slot] = z; pushV[slot * 3] = vx; pushV[slot * 3 + 1] = vz; pushV[slot * 3 + 2] = PUSH_T;
    pushLive = PUSH_N;
  }
  function updatePushes(dt) {
    if (pushLive <= 0) return;
    let live = 0;
    for (let i = 0; i < PUSH_N; i++) {
      const z = pushZ[i]; if (!z) continue;
      const t = pushV[i * 3 + 2] - dt;
      if (t <= 0 || !z.alive || !z.position) { pushZ[i] = null; continue; }
      pushV[i * 3 + 2] = t; live++;
      const k = (t / PUSH_T) * dt;
      z.position.x += pushV[i * 3] * k; z.position.z += pushV[i * 3 + 1] * k;
      resolve(z.position, z.radius || 0.42, z.height || 1.75);
    }
    pushLive = live;
  }

  // ballistic step with ground + collider bounce. returns 0 none, 1 ground, 2 collider
  function stepProjectile(o, dt, rad, rest, fric) {
    const p = o.pos, v = o.vel;
    v.y -= GRAV * dt;
    const sx = v.x * dt, sy = v.y * dt, sz = v.z * dt;
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (len > 1e-5) {
      tD.set(sx / len, sy / len, sz / len);
      const res = worldRay(p, tD, len + rad);
      if (res && res.collider && res.distance > 0.002 && res.distance <= len + rad) {
        const back = Math.max(0, res.distance - rad);
        p.x += tD.x * back; p.y += tD.y * back; p.z += tD.z * back;
        const n = res.normal;
        let nx = 0, ny = 1, nz = 0;
        if (n && (n.x * n.x + n.y * n.y + n.z * n.z) > 0.5) { nx = n.x; ny = n.y; nz = n.z; }
        const dot = v.x * nx + v.y * ny + v.z * nz;
        if (dot < 0) { const k = (1 + rest) * dot; v.x -= k * nx; v.y -= k * ny; v.z -= k * nz; }
        v.multiplyScalar(fric);
        return 2;
      }
    }
    p.x += sx; p.y += sy; p.z += sz;
    const gy = groundAt(p.x, p.z);
    if (p.y < gy + rad) {
      p.y = gy + rad;
      const e = 0.5;
      let nx = groundAt(p.x - e, p.z) - groundAt(p.x + e, p.z), nz = groundAt(p.x, p.z - e) - groundAt(p.x, p.z + e), ny = 2 * e;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const dot = v.x * nx + v.y * ny + v.z * nz;
      if (dot < 0) { const k = (1 + rest) * dot; v.x -= k * nx; v.y -= k * ny; v.z -= k * nz; }
      v.multiplyScalar(fric);
      return 1;
    }
    return 0;
  }

  // throw from the player's hand so the projectile lands where the crosshair points
  function computeThrow(start, vel, range, speed) {
    const p = game.player;
    aimRay(tO, tD);
    const yaw = p.yaw || 0, s = Math.sin(yaw), c = Math.cos(yaw);
    start.copy(p.position);
    start.y += (p.eyeHeight || PC.standHeight || 1.7) * 0.9;
    start.x += c * 0.2 - s * 0.25; start.z += -s * 0.2 - c * 0.25;
    const res = worldRay(tO, tD, range + 8);
    if (res) {
      tA.copy(res.point).sub(start);
      let dist = tA.length();
      if (dist > range) { tA.multiplyScalar(range / dist); dist = range; }
      let T = dist / speed; if (T < 0.3) T = 0.3; else if (T > 1.25) T = 1.25;
      vel.copy(tA).multiplyScalar(1 / T);
      vel.y += 0.5 * GRAV * T;
    } else {
      vel.copy(tD).multiplyScalar(speed);
      vel.y += 4.5;
    }
  }

  function addShake(x, y, z, amount, reach) {
    const d = distToPlayer(x, y, z);
    if (d < reach) shake = Math.max(shake, amount * (1 - d / reach));
  }
  function setBurst(x, y, z, peak, dur, distance, r, g, b) {
    if (burst.t < burst.dur && peak < burst.peak * 0.5) return; // keep the bigger flash
    burstLight.position.set(x, y, z); burstLight.distance = distance; burstLight.color.setRGB(r, g, b);
    burst.t = 0; burst.dur = dur; burst.peak = peak;
  }

  // ------------------------------------------------------------------ Q  SLIPSTREAM
  function castDash() {
    const p = game.player, D = S.dash;
    const keys = p.input && p.input.keys;
    let f = 0, r = 0;
    if (keys && keys.has) {
      if (keys.has('KeyW')) f += 1; if (keys.has('KeyS')) f -= 1;
      if (keys.has('KeyD')) r += 1; if (keys.has('KeyA')) r -= 1;
    }
    if (f === 0 && r === 0) f = 1;
    const yaw = p.yaw || 0, s = Math.sin(yaw), c = Math.cos(yaw);
    let dx = -s * f + c * r, dz = -c * f - s * r;
    const l = Math.sqrt(dx * dx + dz * dz) || 1; dx /= l; dz /= l;
    dash.t = D.duration; dash.dx = dx; dash.dz = dz; dash.speed = D.distance / D.duration; dash.ghostAcc = 1;
    invulnT = D.invuln; api.invulnerable = true;
    const pos = p.position;
    for (let i = 0; i < 14; i++) {
      emit(sparks, pos.x + (rand() - 0.5) * 0.6, pos.y + 0.3 + rand() * 1.3, pos.z + (rand() - 0.5) * 0.6,
        -dx * (2 + rand() * 5) + (rand() - 0.5) * 2, rand() * 1.5, -dz * (2 + rand() * 5) + (rand() - 0.5) * 2,
        0.25 + rand() * 0.3, 0.14 + rand() * 0.12, 1.8, 0.95, 0.35, 0, 2);
    }
    snd.dash();
    return true;
  }
  function updateDash(dt) {
    if (dash.t <= 0) return;
    const p = game.player;
    if (!p || !p.position || p.alive === false) { dash.t = 0; return; }
    const step = Math.min(dt, dash.t);
    dash.t -= step;
    const pos = p.position, rad = p.radius || PC.radius || 0.4, h = PC.standHeight || 1.7;
    let left = dash.speed * step;
    while (left > 1e-4) {
      const d = left > 0.3 ? 0.3 : left; left -= d;
      const ox = pos.x, oy = pos.y, oz = pos.z;
      pos.x += dash.dx * d; pos.z += dash.dz * d;
      resolve(pos, rad, h);
      const gy = rawHeight(pos.x, pos.z);
      if (gy < SEA + 0.05 || gy - oy > 0.75) { pos.x = ox; pos.y = oy; pos.z = oz; dash.t = 0; break; }
      if (gy > pos.y || (p.isGrounded !== false && pos.y - gy < 0.8)) pos.y = gy;
    }
    dash.ghostAcc += step / 0.028;
    if (dash.ghostAcc >= 1) {
      dash.ghostAcc = 0;
      spawnGhost(pos.x, pos.y, pos.z, Math.atan2(dash.dx, dash.dz));
      emit(sparks, pos.x + (rand() - 0.5) * 0.5, pos.y + 0.2 + rand() * 1.4, pos.z + (rand() - 0.5) * 0.5,
        -dash.dx * 3, 0.4 + rand(), -dash.dz * 3, 0.3 + rand() * 0.25, 0.12 + rand() * 0.1, 1.6, 0.85, 0.3, 0, 2);
    }
  }

  // ------------------------------------------------------------------ E  SUNFLARE
  function flareOff() {
    flare.state = 0;
    flareStick.visible = false; flareGlow.visible = false; flareBeam.visible = false;
    flareRim.mesh.visible = false; flareWave.mesh.visible = false;
    flareLight.intensity = 0;
    snd.loopStop();
  }
  function castFlare() {
    const F = S.flare;
    if (flare.state !== 0) flareOff();
    computeThrow(flare.pos, flare.vel, F.range, F.speed);
    flare.state = 1; flare.fly = 0; flare.bounces = 0; flare.age = 0; flare.acc = 0;
    flareStick.visible = true; flareGlow.visible = true;
    flareStick.position.copy(flare.pos);
    snd.throwIt();
    return true;
  }
  function flareLand() {
    const F = S.flare, x = flare.pos.x, z = flare.pos.z;
    flare.state = 2; flare.t = F.burn; flare.tick = 0; flare.wave = 0; flare.age = 0; flare.acc = 0;
    flare.pos.y = groundAt(x, z) + 0.07;
    flare.vel.set(0, 0, 0);
    flareStick.position.copy(flare.pos); flareStick.rotation.set(0.2, rand() * TAU, 1.35);
    setRing(flareRim, x, z, F.radius - 0.5, F.radius);
    flareRim.mesh.visible = true; flareWave.mesh.visible = true; flareBeam.visible = true;
    flareBeam.position.copy(flare.pos);
    spawnShock(x, z, F.radius, 0.5, 1.5, 1.0, 0.62, 0.24);
    sparkBurst(x, flare.pos.y + 0.15, z, 26, 2, 8, true, 0.3, 0.8, 0.14, 0.3, 2.6, 1.05, 0.3, 9, 1.2);
    const v = atten(x, flare.pos.y, z);
    snd.ignite(v); snd.loopStart();
  }
  function updateFlare(dt) {
    if (flare.state === 0) return;
    const F = S.flare, pos = flare.pos;
    flare.age += dt;
    const flick = 0.82 + 0.12 * Math.sin(time * 37) + 0.06 * Math.sin(time * 91 + 1.3);
    if (flare.state === 1) {
      flare.fly += dt;
      const hit = stepProjectile(flare, dt, 0.06, 0.28, 0.55);
      if (hit === 1) {
        flare.bounces++;
        if (flare.bounces >= 2 || flare.vel.lengthSq() < 9) { flareLand(); return; }
      }
      if (flare.fly > 3.5) { flareLand(); return; }
      flareStick.position.copy(pos);
      flareStick.rotation.x += dt * 14; flareStick.rotation.z += dt * 9;
      flareGlow.position.copy(pos);
      flareGlow.scale.setScalar(1.5 * flick);
      flareGlow.material.color.setRGB(2.2, 1.2, 0.45);
      flareLight.position.set(pos.x, pos.y + 0.3, pos.z);
      flareLight.intensity = 22 * flick * nightK;
      flare.acc += dt * 70;
      while (flare.acc >= 1) {
        flare.acc -= 1;
        emit(sparks, pos.x, pos.y, pos.z, (rand() - 0.5) * 2, rand() * 2, (rand() - 0.5) * 2, 0.25 + rand() * 0.3, 0.12 + rand() * 0.12, 2.4, 1.2, 0.4, 6, 1);
      }
      return;
    }
    // burning
    flare.t -= dt;
    if (flare.t <= 0) {
      for (let i = 0; i < 6; i++) emit(smoke, pos.x, pos.y + 0.2, pos.z, (rand() - 0.5) * 0.8, 0.8 + rand(), (rand() - 0.5) * 0.8, 1.4 + rand(), 0.6 + rand() * 0.5, 0.3, 0.18, 0.1, -0.2, 0.8);
      flareOff();
      return;
    }
    const fade = Math.min(1, flare.age / 0.25) * Math.min(1, flare.t / 0.8);
    const R = F.radius;
    flareGlow.position.set(pos.x, pos.y + 0.22, pos.z);
    flareGlow.scale.setScalar((2.4 + 0.5 * Math.sin(time * 9)) * flick * (0.5 + 0.5 * fade));
    flareGlow.material.color.setRGB(2.8 * fade, 1.5 * fade, 0.55 * fade);
    flareBeam.scale.set(0.34, 8.5, 0.34);
    flareBeam.material.uniforms.uAlpha.value = 0.42 * fade * flick;
    flareBeam.material.uniforms.uTime.value = time;
    flareLight.position.set(pos.x, pos.y + 2.4, pos.z);
    flareLight.intensity = 95 * flick * fade * nightK;
    flareRim.mat.color.setRGB(1.0, 0.56, 0.2);
    flareRim.mat.opacity = (0.55 + 0.25 * Math.sin(time * 5)) * fade;
    flare.wave += dt / 1.25; if (flare.wave >= 1) flare.wave -= 1;
    const wr = R * flare.wave;
    setRing(flareWave, pos.x, pos.z, wr - 1.3, wr);
    flareWave.mat.color.setRGB(1.0, 0.66, 0.3);
    flareWave.mat.opacity = (1 - flare.wave) * 0.55 * fade;
    // fountain at the flare + embers drifting up inside the zone
    flare.acc += dt * 56 * fade;
    while (flare.acc >= 1) {
      flare.acc -= 1;
      if (rand() < 0.72) {
        emit(sparks, pos.x, pos.y + 0.1, pos.z, (rand() - 0.5) * 2.6, 2.5 + rand() * 4, (rand() - 0.5) * 2.6, 0.35 + rand() * 0.5, 0.12 + rand() * 0.16, 2.6, 1.3, 0.4, 8, 0.8);
      } else {
        const a = rand() * TAU, rr = Math.sqrt(rand()) * R, ex = pos.x + Math.cos(a) * rr, ez = pos.z + Math.sin(a) * rr;
        emit(sparks, ex, groundAt(ex, ez) + 0.1, ez, (rand() - 0.5) * 0.4, 0.8 + rand() * 1.2, (rand() - 0.5) * 0.4, 0.9 + rand() * 0.8, 0.1 + rand() * 0.1, 1.6, 0.8, 0.25, -0.4, 0.3);
      }
    }
    snd.loopGain(0.09 * fade * atten(pos.x, pos.y, pos.z));
    // burn + slow, on a 4 Hz tick so flinch / blood FX are not spammed every frame
    flare.tick -= dt;
    if (flare.tick <= 0) {
      const tickLen = 0.25;
      flare.tick += tickLen;
      if (flare.tick < 0) flare.tick = 0;
      const zs = queryZombies(pos, R);
      for (let i = 0; i < zs.length; i++) {
        const z = zs[i];
        if (!z || !z.alive || !z.position) continue;
        if (!(z.slowT > 0) || !(z.slowMult <= F.slowMult)) z.slowMult = F.slowMult;
        z.slowT = Math.max(z.slowT || 0, tickLen + 0.4);
        const zh = z.height || 1.75;
        hitPoint.set(z.position.x, z.position.y + zh * 0.65, z.position.z);
        hitDir.set(0, 1, 0);
        hurt(z, F.dps * tickLen);
        for (let k = 0; k < 3; k++) {
          emit(sparks, hitPoint.x + (rand() - 0.5) * 0.5, z.position.y + rand() * zh, hitPoint.z + (rand() - 0.5) * 0.5,
            (rand() - 0.5), 1.2 + rand() * 2, (rand() - 0.5), 0.35 + rand() * 0.4, 0.12 + rand() * 0.12, 2.4, 1.0, 0.3, -1, 0.5);
        }
      }
    }
  }

  // ------------------------------------------------------------------ G  FRAG
  function castFrag() {
    const G = S.frag;
    let g = null;
    for (let i = 0; i < grenades.length; i++) if (!grenades[i].active) { g = grenades[i]; break; }
    if (!g) return false;
    computeThrow(g.pos, g.vel, G.range, G.speed);
    g.active = true; g.rest = false; g.fuse = G.fuse; g.phase = 0; g.bounceCd = 0; g.acc = 0;
    g.mesh.visible = true; g.mesh.position.copy(g.pos);
    snd.throwIt();
    return true;
  }
  // o (optional) overrides the frag numbers: { radius, damage, knock, selfRadius, selfDamage, dust, shake }
  const explEvt = { x: 0, y: 0, z: 0, radius: 0, dust: false };
  // corpse-bomb / barrel chains can set off dozens of blasts within a few frames: the first boom of a
  // burst plays in full, the next two quieter, the rest silently (visuals and damage are unchanged)
  let boomT = -1, boomN = 0;
  function boomGate() {
    const now = performance.now() * 0.001;            // wall clock: also right in the 'dead' state and after a restart
    if (now - boomT > 0.08) { boomT = now; boomN = 0; }
    boomN++;
    return boomN === 1 ? 1 : boomN <= 3 ? 0.45 : 0;
  }
  // game.mods.blastMult (DEMOLITIONIST) scales the radius and damage of every blast routed through here;
  // callers pass unscaled numbers. o.source labels the zombie damage (default 'blast').
  function explode(x, y, z, o) {
    const G = o || S.frag, bm = modOf('blastMult', 1), R = G.radius * bm;
    hitInfo.source = (o && o.source) || 'blast';
    try { explodeAt(x, y, z, G, R, bm); } finally { hitInfo.source = 'skill'; }
  }
  function explodeAt(x, y, z, G, R, bm) {
    if (G.dust) {
      // ground slam: a ring of dust and a shock ring, no fireball
      for (let i = 0; i < 26; i++) {
        const a = rand() * TAU, v = 3 + rand() * 6;
        emit(smoke, x + Math.cos(a) * 0.6, y + 0.15, z + Math.sin(a) * 0.6, Math.cos(a) * v, 0.6 + rand() * 1.4, Math.sin(a) * v,
          0.7 + rand() * 0.6, 1.1 + rand() * 1.1, 0.5, 0.45, 0.38, -0.2, 2.4);
      }
      spawnShock(x, z, R, 0.32, 1.0, 0.85, 0.75, 0.6);
      addShake(x, y, z, G.shake || 0.12, 14);
      snd.boom(0.55);
    } else {
    sparkBurst(x, y + 0.2, z, 48, 6, 22, true, 0.3, 0.9, 0.2, 0.5, 3.0, 1.15, 0.3, 15, 1.6);
    sparkBurst(x, y + 0.2, z, 18, 3, 11, true, 0.8, 1.5, 0.12, 0.24, 1.5, 0.55, 0.15, 17, 0.4);
    for (let i = 0; i < 18; i++) {
      const a = rand() * TAU, v = 1.5 + rand() * 4.5;
      emit(smoke, x + Math.cos(a) * 0.5, y + 0.3 + rand() * 0.8, z + Math.sin(a) * 0.5, Math.cos(a) * v, 1.2 + rand() * 3, Math.sin(a) * v,
        1.5 + rand() * 1.4, 1.5 + rand() * 1.6, 0.55, 0.3, 0.14, -0.3, 1.8);
    }
    let fb = fireballs[0].active && !fireballs[1].active ? fireballs[1] : fireballs[0];
    fb.active = true; fb.t = 0; fb.dur = 0.34; fb.size = R * 1.5;
    fb.sprite.visible = true; fb.sprite.position.set(x, y + 0.6, z);
    spawnShock(x, z, R, 0.42, 1.7, 1.0, 0.72, 0.4);
    setBurst(x, y + 1.5, z, 520 * nightK, 0.4, 48, 1.0, 0.8, 0.55);
    addShake(x, y, z, G.shake || 0.2, 26);
    snd.boom(atten(x, y, z) * boomGate());
    }
    // --- zombies
    tB.set(x, y, z);
    const zs = queryZombies(tB, R);
    let hits = 0, kills = 0, first = null;
    for (let i = 0; i < zs.length; i++) {
      const zb = zs[i];
      if (!zb || !zb.alive || !zb.position) continue;
      let dx = zb.position.x - x, dz = zb.position.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= R || Math.abs(zb.position.y - y) > (G.dust ? 1.6 : 4)) continue;
      const f = 1 - d / R, dmg = G.damage * bm * f;
      if (dmg < 1) continue;
      if (d > 0.01) { dx /= d; dz /= d; } else { dx = 1; dz = 0; }
      hitPoint.set(zb.position.x, zb.position.y + (zb.height || 1.75) * 0.55, zb.position.z);
      hitDir.set(dx, 0.35, dz).normalize();
      hits++; if (!first) first = zb;
      if (hurt(zb, dmg)) kills++;
      else {
        const sc = zb.def && zb.def.scale ? 1 / (zb.def.scale * zb.def.scale) : 1;
        addPush(zb, dx * G.knock * f * sc, dz * G.knock * f * sc);
      }
    }
    if (hits > 0) { hitEvt.zombie = first; hitEvt.killed = kills > 0; hitPoint.set(x, y + 0.5, z); game.emit('hit', hitEvt); }
    // --- player (slight self damage, dodgeable with SLIPSTREAM)
    const p = game.player;
    if (p && p.position && p.alive !== false && p.damage) {
      const d = distToPlayer(x, y, z);
      if (G.selfRadius > 0 && d < G.selfRadius) { tB.set(x, y, z); p.damage(G.selfDamage * (1 - d / G.selfRadius), tB); }
    }
    explEvt.x = x; explEvt.y = y; explEvt.z = z; explEvt.radius = R; explEvt.dust = !!G.dust;
    game.emit('explosion', explEvt);
  }
  function updateGrenades(dt) {
    const G = S.frag;
    for (let i = 0; i < grenades.length; i++) {
      const g = grenades[i]; if (!g.active) continue;
      g.fuse -= dt; g.bounceCd -= dt;
      if (!g.rest) {
        const hit = stepProjectile(g, dt, 0.1, 0.3, 0.5);
        if (hit) {
          const sp = g.vel.length();
          if (hit === 1 && sp < 1.3) { g.rest = true; g.vel.set(0, 0, 0); }
          if (g.bounceCd <= 0 && sp > 0.8) { g.bounceCd = 0.1; snd.bounce(Math.min(1, sp / 8) * atten(g.pos.x, g.pos.y, g.pos.z)); }
        }
        g.mesh.rotation.x += dt * 11; g.mesh.rotation.z += dt * 7;
        g.acc += dt * 40;
        while (g.acc >= 1) { g.acc -= 1; emit(sparks, g.pos.x, g.pos.y, g.pos.z, 0, 0.3, 0, 0.22, 0.09, 1.3, 0.35, 0.2, 0, 0); }
      }
      g.mesh.position.copy(g.pos);
      g.phase += dt * (3.5 + 13 * (1 - clamp01(g.fuse / G.fuse)));
      const on = (g.phase % 1) < 0.45;
      if (on) g.blink.material.color.setRGB(4, 0.5, 0.25); else g.blink.material.color.setRGB(0.25, 0.03, 0.02);
      if (g.fuse <= 0) {
        g.active = false; g.mesh.visible = false;
        explode(g.pos.x, g.pos.y, g.pos.z);
      }
    }
    for (let i = 0; i < fireballs.length; i++) {
      const fb = fireballs[i]; if (!fb.active) continue;
      fb.t += dt;
      const k = fb.t / fb.dur;
      if (k >= 1) { fb.active = false; fb.sprite.visible = false; continue; }
      const inv = 1 - k, e = 1 - inv * inv;
      fb.sprite.scale.setScalar(fb.size * (0.25 + 0.75 * e));
      const c = inv * inv * 3.2;
      fb.sprite.material.color.setRGB(c, c * 0.62, c * 0.24);
    }
  }

  // ------------------------------------------------------------------ X  DAWNBREAKER
  function strikeOff() {
    strike.phase = 0;
    teleRim.mesh.visible = false; teleFill.mesh.visible = false; teleBeam.visible = false;
    colOuter.visible = false; colCore.visible = false; dawnGlow.visible = false;
  }
  function castDawn() {
    const W = S.dawn, p = game.player;
    aimRay(tO, tD);
    const res = worldRay(tO, tD, W.range);
    let x, z;
    if (res) { x = res.point.x; z = res.point.z; }
    else {
      const yaw = p.yaw || 0;
      x = p.position.x - Math.sin(yaw) * W.fallback; z = p.position.z - Math.cos(yaw) * W.fallback;
    }
    if (!(x === x) || !(z === z)) return false;
    strikeOff();
    strike.phase = 1; strike.t = 0; strike.x = x; strike.z = z; strike.y = groundAt(x, z); strike.acc = 0;
    ultKills = 0; api.ultCharge = 0;
    setRing(teleRim, x, z, W.radius - 0.55, W.radius);
    teleRim.mat.color.setRGB(1.0, 0.7, 0.32); teleRim.mat.opacity = 0;
    teleFill.mat.color.setRGB(1.0, 0.78, 0.45); teleFill.mat.opacity = 0;
    teleRim.mesh.visible = true; teleFill.mesh.visible = true; teleBeam.visible = true;
    teleBeam.position.set(x, strike.y, z);
    teleBeam.material.uniforms.uAlpha.value = 0;
    snd.charge();
    return true;
  }
  function dawnImpact() {
    const W = S.dawn, R = W.radius, x = strike.x, y = strike.y, z = strike.z;
    strike.phase = 2; strike.t = 0; strike.acc = 0;
    teleRim.mesh.visible = false; teleBeam.visible = false;
    // --- visuals
    colOuter.visible = true; colCore.visible = true; dawnGlow.visible = true;
    colOuter.position.set(x, y - 0.5, z); colCore.position.set(x, y - 0.5, z);
    dawnGlow.position.set(x, y + 2.5, z);
    setRing(teleFill, x, z, 0, R);
    teleFill.mat.color.setRGB(1.0, 0.72, 0.36); teleFill.mat.opacity = 1; teleFill.mesh.visible = true;
    spawnShock(x, z, R * 1.6, 0.75, 3.2, 1.0, 0.8, 0.5);
    spawnShock(x, z, R, 0.4, 2.0, 1.0, 0.9, 0.7);
    sparkBurst(x, y + 0.4, z, 90, 5, 24, true, 0.6, 1.6, 0.2, 0.5, 3.0, 1.7, 0.6, 6, 1.1);
    setBurst(x, y + 8, z, 2600 * nightK, 1.5, 130, 1.0, 0.88, 0.66);
    sunLight.position.set(x + 45, y + 130, z + 30); sunLight.target.position.set(x, y, z);
    sunFlash = 1;
    addShake(x, y, z, 0.34, 70);
    snd.dawn(Math.max(0.45, atten(x, y, z)));
    // --- zombies
    tB.set(x, y, z);
    const zs = queryZombies(tB, R);
    let hits = 0, kills = 0, first = null;
    suppressUlt = true;
    try {
      for (let i = 0; i < zs.length; i++) {
        const zb = zs[i];
        if (!zb || !zb.alive || !zb.position) continue;
        let dx = zb.position.x - x, dz = zb.position.z - z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > R) continue;
        if (d > 0.01) { dx /= d; dz /= d; } else { dx = 1; dz = 0; }
        hitPoint.set(zb.position.x, zb.position.y + (zb.height || 1.75) * 0.6, zb.position.z);
        hitDir.set(dx * 0.4, 1, dz * 0.4).normalize();
        hits++; if (!first) first = zb;
        if (hurt(zb, W.damage)) kills++;
        else {
          zb.stunT = Math.max(zb.stunT || 0, W.stun);
          addPush(zb, dx * 5 * (1 - d / R), dz * 5 * (1 - d / R));
        }
      }
    } finally { suppressUlt = false; }
    if (hits > 0) { hitEvt.zombie = first; hitEvt.killed = kills > 0; hitPoint.set(x, y + 1, z); game.emit('hit', hitEvt); }
  }
  function updateStrike(dt) {
    if (strike.phase === 0) return;
    const W = S.dawn, R = W.radius, x = strike.x, y = strike.y, z = strike.z;
    strike.t += dt;
    if (strike.phase === 1) {
      const k = clamp01(strike.t / W.delay);
      teleRim.mat.opacity = 0.35 + 0.65 * k;
      const r1 = R * (1 - k) + 0.3;
      setRing(teleFill, x, z, r1 - 2.4, r1);
      teleFill.mat.opacity = 0.25 + 0.75 * k;
      teleBeam.scale.set(0.25 + 0.6 * k, 120, 0.25 + 0.6 * k);
      teleBeam.material.uniforms.uAlpha.value = 0.25 + 1.1 * k * k;
      teleBeam.material.uniforms.uTime.value = time;
      strike.acc += dt * 60;
      while (strike.acc >= 1) {
        strike.acc -= 1;
        const a = rand() * TAU, ex = x + Math.cos(a) * R, ez = z + Math.sin(a) * R;
        emit(sparks, ex, groundAt(ex, ez) + 0.2, ez, -Math.cos(a) * R * 1.3, 1 + rand() * 2, -Math.sin(a) * R * 1.3, 0.5, 0.16 + rand() * 0.14, 2.2, 1.3, 0.5, -1, 0);
      }
      if (strike.t >= W.delay) dawnImpact();
      return;
    }
    // aftermath: the pillar thins out and fades
    const DUR = 1.9;
    const k = strike.t / DUR;
    if (k >= 1) { strikeOff(); return; }
    const inv = 1 - k, slam = Math.min(1, strike.t / 0.07);
    const flick = 0.9 + 0.1 * Math.sin(time * 43);
    const ro = R * (0.5 + 0.42 * inv * inv) * slam;
    colOuter.scale.set(ro, 130, ro);
    colOuter.material.uniforms.uAlpha.value = 0.72 * inv * inv * flick;
    colOuter.material.uniforms.uTime.value = time;
    const rc = R * (0.05 + 0.3 * inv * inv * inv) * slam;
    colCore.scale.set(rc, 130, rc);
    colCore.material.uniforms.uAlpha.value = 1.6 * inv * flick;
    colCore.material.uniforms.uTime.value = time * 1.7;
    dawnGlow.scale.setScalar(R * (1.6 + 1.6 * inv));
    const c = inv * inv * 2.6;
    dawnGlow.material.color.setRGB(c, c * 0.8, c * 0.5);
    teleFill.mat.opacity = inv * inv * 0.9;
    strike.acc += dt * 110 * inv;
    while (strike.acc >= 1) {
      strike.acc -= 1;
      const a = rand() * TAU, rr = Math.sqrt(rand()) * R * 0.95, ex = x + Math.cos(a) * rr, ez = z + Math.sin(a) * rr;
      emit(sparks, ex, groundAt(ex, ez) + 0.1, ez, (rand() - 0.5) * 0.8, 3 + rand() * 7, (rand() - 0.5) * 0.8, 0.8 + rand() * 1.1, 0.14 + rand() * 0.2, 2.6, 1.5, 0.5, -1.5, 0.4);
    }
  }

  // ------------------------------------------------------------------ cast / cooldowns
  const CASTERS = { dash: castDash, flare: castFlare, frag: castFrag, dawn: castDawn };
  function isReady(a) {
    if (a.id === 'dawn') return api.ultCharge >= 1 && strike.phase !== 1;
    if (a.id === 'dash') return a.charges > 0 && dash.t <= 0;
    return a.charges > 0;
  }
  function cast(id) {
    const a = byId[id];
    if (!a) return false;
    const p = game.player;
    if (game.state !== 'playing' || game.paused || !p || !p.position || p.alive === false) return false;
    if (parked) unpark();
    if (!isReady(a)) { a.ready = false; deny(a); return false; }
    let ok = false;
    try { ok = !!CASTERS[id](); } catch (e) { console.error('[skills.cast ' + id + ']', e); ok = false; }
    if (!ok) { deny(a); return false; }
    if (id !== 'dawn') { a.charges -= 1; if (a.remaining <= 0) a.remaining = a.cooldown; }
    else a.charges = 0;
    a.ready = isReady(a);
    const T = tileOf(id);
    if (T) { restartClass(T, 'cast'); T.castT = 0.34; showName(T, 1.3); }
    game.emit('skill', { id });
    return true;
  }
  function tickCooldowns(dt) {
    // game.mods.cooldownMult scales cooldown duration (0.85 = recharges 15% sooner)
    const cdt = dt / modOf('cooldownMult', 1);
    for (let i = 0; i < abilities.length; i++) {
      const a = abilities[i];
      if (a.id === 'dawn') { a.charges = api.ultCharge >= 1 ? 1 : 0; a.ready = isReady(a); continue; }
      if (a.charges < a.maxCharges) {
        a.remaining -= cdt;
        if (a.remaining <= 0) {
          a.charges += 1;
          a.remaining = a.charges < a.maxCharges ? a.remaining + a.cooldown : 0;
        }
      } else a.remaining = 0;
      a.ready = isReady(a);
    }
  }

  // ------------------------------------------------------------------ events
  game.on('keydown', (code) => { const a = byCode[code]; if (a) cast(a.id); });
  function addUltKills(n) {
    if (suppressUlt || game.state !== 'playing' || !(n > 0)) return;
    const need = S.dawn.kills;
    if (ultKills >= need) return;
    ultKills = Math.min(need, ultKills + n);
    api.ultCharge = clamp01(ultKills / need);
    if (ultKills >= need) {
      snd.ultReady();
      const T = tileOf('dawn'); if (T) showName(T, 3);
      game.emit('toast', 'DAWNBREAKER charged  [X]');
    }
  }
  function refundCharge(id, n) {
    const a = byId[id];
    if (!a || a.id === 'dawn' || a.charges >= a.maxCharges) return false;
    a.charges = Math.min(a.maxCharges, a.charges + (n > 0 ? n : 1));
    if (a.charges >= a.maxCharges) a.remaining = 0;
    a.ready = isReady(a);
    return true;
  }
  game.on('zombieKilled', () => addUltKills(1));
  // the perk picker freezes skills.update: silence the sunflare hiss (updateFlare restores it on the next simulated frame)
  game.on('perkOffered', () => snd.loopGain(0));
  game.on('gameStart', () => {
    snd.ensure();
    showWidget(true);
    for (let i = 0; i < tiles.length; i++) showName(tiles[i], 6 + i * 0.25);
  });
  game.on('gameOver', () => { showWidget(false); flareLight.intensity = 0; burstLight.intensity = 0; sunLight.intensity = 0; sunAmb.intensity = 0; snd.loopStop(); });

  // dash i-frames: wrap player.damage once, original behaviour otherwise untouched
  {
    const p = game.player;
    if (p && typeof p.damage === 'function' && !p.damage.__skillsWrapped) {
      const orig = p.damage;
      const wrapped = function (amount, sourcePos) {
        if (invulnT > 0) return undefined;
        return orig.apply(this, arguments);
      };
      wrapped.__skillsWrapped = true;
      try { p.damage = wrapped; } catch (e) { /* read-only api: no i-frames */ }
    }
  }

  // ------------------------------------------------------------------ update / reset
  function unpark() {
    parked = false;
    root.position.y = 0;
    for (let i = 0; i < pooled.length; i++) pooled[i].visible = false;
  }
  function step(dt) {
    if (parked) unpark();
    time += dt;
    const df = game.dayFactor;
    nightK = 1 - 0.7 * clamp01(df === df ? df : 0);
    tickCooldowns(dt);
    if (invulnT > 0) { invulnT -= dt; if (invulnT <= 0) { invulnT = 0; api.invulnerable = false; } }
    updateDash(dt);
    api.dashing = dash.t > 0;
    updateGhosts(dt);
    updateFlare(dt);
    updateGrenades(dt);
    updatePushes(dt);
    updateStrike(dt);
    updateShocks(dt);
    // shared flash light + brief false daylight
    if (burst.t < burst.dur) {
      burst.t += dt;
      const k = 1 - clamp01(burst.t / burst.dur);
      burstLight.intensity = burst.peak * k * k;
    } else if (burstLight.intensity !== 0) burstLight.intensity = 0;
    if (sunFlash > 0) {
      sunFlash = Math.max(0, sunFlash - dt / 1.9);
      const e = sunFlash * Math.sqrt(sunFlash) * nightK;
      sunLight.intensity = 3.4 * e; sunAmb.intensity = 1.25 * e;
    } else if (sunLight.intensity !== 0) { sunLight.intensity = 0; sunAmb.intensity = 0; }
    // particles
    const canvasH = (game.renderer && game.renderer.domElement && game.renderer.domElement.height) || 800;
    const scale = canvasH / (2 * Math.tan((camera.fov || 70) * Math.PI / 360));
    sparks.mat.uniforms.uScale.value = scale; smoke.mat.uniforms.uScale.value = scale;
    updateParticles(sparks, dt);
    updateParticles(smoke, dt);
    // camera shake (player.js rebuilt the camera earlier this frame)
    if (shake > 0.003) {
      camera.position.x += (rand() - 0.5) * shake; camera.position.y += (rand() - 0.5) * shake; camera.position.z += (rand() - 0.5) * shake;
      shake *= Math.exp(-7 * dt);
    } else shake = 0;
    showWidget(game.state !== 'menu');
    uiTick(dt, false);
  }
  function update(dt) {
    try { step(dt); } catch (e) {
      if (!failed) { failed = true; console.error('[skills.update]', e); }
    }
  }
  function reset() {
    unpark();
    time = 0; invulnT = 0; api.invulnerable = false; ultKills = 0; api.ultCharge = 0; suppressUlt = false; failed = false;
    shake = 0; sunFlash = 0; burst.t = 0; burst.dur = 0; burst.peak = 0;
    dash.t = 0; api.dashing = false;
    for (const a of abilities) {
      a.remaining = 0;
      a.charges = a.id === 'dawn' ? 0 : a.maxCharges;
      a.ready = a.id !== 'dawn';
    }
    flareOff();
    strikeOff();
    for (const g of grenades) { g.active = false; g.rest = false; g.mesh.visible = false; }
    for (const fb of fireballs) { fb.active = false; fb.sprite.visible = false; }
    for (const s of shocks) { s.active = false; s.ring.mesh.visible = false; }
    pushZ.fill(null); pushLive = 0;
    ghostData.fill(0); ghostLive = 0; ghostHead = 0;
    for (let i = 0; i < GHOSTS; i++) ghostMesh.setMatrixAt(i, ZERO_M);
    ghostMesh.instanceMatrix.needsUpdate = true;
    clearParticles(sparks); clearParticles(smoke);
    flareLight.intensity = 0; burstLight.intensity = 0; sunLight.intensity = 0; sunAmb.intensity = 0;
    for (const T of tiles) { T.denyT = 0; T.castT = 0; T.nameT = 0; T.el.classList.remove('deny', 'cast', 'name'); }
    uiTick(0, true);
  }

  uiTick(0, true);
  return api;
}
