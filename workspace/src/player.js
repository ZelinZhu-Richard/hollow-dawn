// HOLLOW DAWN — player: input, movement, camera (third / first person), survivor model, weapon mount.
import * as THREE from 'three';

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

// model proportions (metres)
const HIP_STAND = 0.9, HIP_CROUCH = 0.47, LEG = 0.45, ARM_U = 0.3, ARM_F = 0.3;
const SHOULDER_X = 0.25, SHOULDER_Y = 0.5;
// camera tuning
const TP_DIST = 3.4, TP_DIST_AIM = 1.75, TP_SIDE = 0.62, TP_SIDE_AIM = 0.46, TP_UP = 0.2, TP_UP_AIM = 0.1;
const CAM_MARGIN = 0.35;
const CAM_HW = 0.2, CAM_HH = 0.13;   // half extents of the box swept along the boom (covers the near plane with room to spare)
const CAM_CLEAR = 0.2;               // the eye point keeps at least this far from every collider
const RECOIL_RECOVER = 0.6;      // share of every kick that springs back

const GAME_KEYS = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Quote', 'Slash', 'Backspace', 'AltLeft', 'AltRight']);

// per-stance weapon mount placement (third person, aim frame relative to the chest) and left hand grip (mount local)
const STANCES = {
  rifle:  { hip: new THREE.Vector3(0.15, -0.14, -0.30), aim: new THREE.Vector3(0.10, 0.03, -0.30), grip: new THREE.Vector3(-0.02, 0.0, -0.24), twist: -0.35, free: false },
  pistol: { hip: new THREE.Vector3(0.12, -0.06, -0.42), aim: new THREE.Vector3(0.06, 0.06, -0.46), grip: new THREE.Vector3(-0.05, -0.05, 0.02), twist: -0.1, free: false },
  heavy:  { hip: new THREE.Vector3(0.22, -0.34, -0.20), aim: new THREE.Vector3(0.20, -0.32, -0.22), grip: new THREE.Vector3(-0.10, 0.10, -0.14), twist: -0.3, free: false },
  melee:  { hip: new THREE.Vector3(0.27, -0.30, -0.18), aim: new THREE.Vector3(0.27, -0.30, -0.18), grip: new THREE.Vector3(0, 0, 0), twist: 0, free: true },
};
const SPRINT_MOUNT = new THREE.Vector3(0.12, -0.24, -0.2);
const FP_HIP = new THREE.Vector3(0.28, -0.26, -0.55);
const FP_ADS = new THREE.Vector3(0.0, -0.17, -0.42);
const FP_HEAVY = new THREE.Vector3(0.24, -0.3, -0.5);
const FP_HEAVY_ADS = new THREE.Vector3(0.18, -0.27, -0.46);

export function init(game) {
  const CONFIG = game.CONFIG;
  const P = CONFIG.player;
  const camera = game.camera, canvas = game.canvas, scene = game.scene;
  const EYE_STAND = P.standHeight - 0.1, EYE_CROUCH = P.crouchHeight - 0.1;

  // ------------------------------------------------------------------ temps (never allocate per frame)
  const fwd = new THREE.Vector3(0, 0, -1), right = new THREE.Vector3(1, 0, 0);
  const camPos = new THREE.Vector3(), camDir = new THREE.Vector3(0, 0, -1);
  const _pivot = new THREE.Vector3(), _off = new THREE.Vector3(), _dir = new THREE.Vector3();
  const _shoulder = new THREE.Vector3(), _back = new THREE.Vector3();
  const _camUp = new THREE.Vector3(), _boomTo = new THREE.Vector3(), _boomDir = new THREE.Vector3();
  const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _E = new THREE.Vector3();
  const _d = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Vector3();
  const _fp = new THREE.Vector3(), _fa = new THREE.Vector3();
  const _zNear = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const POLE_R = new THREE.Vector3(0.55, -1, 0.25), POLE_L = new THREE.Vector3(-0.55, -1, 0.25);
  const stepEvt = { sprint: false };
  const hitEvt = { amount: 0, sourcePos: null };

  // ------------------------------------------------------------------ state
  const input = { fire: false, aim: false, locked: false, keys: new Set() };
  const pos = new THREE.Vector3(), vel = new THREE.Vector3();

  let grounded = true, coyote = 0, jumpBuffer = 0, exhausted = false, regenDelay = 0;
  // parkour: one air jump, Shift+C slide, C in the air = ground slam
  let airJumps = 1, crouchPress = 0, slideT = 0, slideCd = 0, slamCd = 0, slamming = false, wasSprinting = false;
  const slideDir = new THREE.Vector3(), slamEvt = { position: new THREE.Vector3(), speed: 0 };
  let crouchBlend = 0, aimBlend = 0, sprintBlend = 0, moveBlend = 0, airBlend = 0;
  let legPhase = 0, legYaw = 0, stepAcc = 0, twistCur = 0, hipYCur = HIP_STAND;
  let dip = 0, dipVel = 0;
  let kickP = 0, kickY = 0, recP = 0, recY = 0, mountKick = 0;
  let shake = 0, punchP = 0;
  let camRatio = 1, sideK = 1, camDist = TP_DIST, aimFovCur = P.aimFov;
  let mdx = 0, mdy = 0, swayX = 0, swayY = 0, strafeTilt = 0;
  let time = 0, lastWheel = 0, lightI = 0, sensScale = 1;
  // pointer-lock bookkeeping + the free-look fallback used where the browser refuses to capture the mouse
  let everLocked = false, lockFails = 0, legacyLock = false, edgeX = 0, edgeY = 0;
  // Button latches: a press + release that both land between two frames (trackpad taps do this) must
  // still read as "down" for one whole frame, or the shot / build click is silently lost.
  let fireSeen = true, fireRelease = false, aimSeen = true, aimRelease = false;
  let stance = STANCES.melee, stanceId = 'melee';
  const mountOff = new THREE.Vector3().copy(STANCES.melee.hip);
  const gripCur = new THREE.Vector3();
  const fpOff = new THREE.Vector3().copy(FP_HIP);

  // ------------------------------------------------------------------ survivor model
  const root = new THREE.Group(); root.name = 'player';
  const body = new THREE.Group(); root.add(body);
  const mount = new THREE.Object3D(); mount.name = 'weaponMount'; mount.rotation.order = 'YXZ';
  root.add(mount);
  scene.add(root);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const limbGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  const mk = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const mJacket = mk('#b8572e'), mJacketDark = mk('#8f4324'), mPants = mk('#2a3145'), mBoots = mk('#17191f');
  const mSkin = mk('#d9a47a'), mPack = mk('#56634a'), mBone = mk('#e8e4d8'), mCap = mk('#232a3b');
  const mLamp = new THREE.MeshLambertMaterial({ color: '#2a2a2a', emissive: '#ffe9b8', emissiveIntensity: 0 });

  function box(parent, m, sx, sy, sz, x, y, z) {
    const me = new THREE.Mesh(boxGeo, m);
    me.scale.set(sx, sy, sz); me.position.set(x, y, z); me.castShadow = true;
    parent.add(me); return me;
  }
  function limb(parent, m, r, len) {
    const me = new THREE.Mesh(limbGeo, m);
    me.scale.set(r, len, r); me.castShadow = true;
    parent.add(me); return me;
  }

  // upper body (pivot at the hips)
  const upper = new THREE.Group(); upper.position.y = HIP_STAND; body.add(upper);
  box(upper, mPants, 0.34, 0.16, 0.2, 0, 0.05, 0);                // pelvis
  box(upper, mJacket, 0.4, 0.46, 0.23, 0, 0.36, 0);               // torso
  box(upper, mJacketDark, 0.42, 0.08, 0.25, 0, 0.16, 0);          // jacket hem
  box(upper, mBone, 0.3, 0.09, 0.27, 0, 0.6, 0.0);                // scarf
  box(upper, mPack, 0.3, 0.36, 0.14, 0, 0.36, 0.18);              // backpack
  const bedroll = limb(upper, mBone, 0.07, 0.34); bedroll.rotation.z = PI / 2; bedroll.position.set(0, 0.6, 0.2);
  box(upper, mBoots, 0.05, 0.3, 0.02, 0.12, 0.42, -0.12);         // strap
  box(upper, mLamp, 0.07, 0.07, 0.04, -0.1, 0.46, -0.125);        // chest lamp
  const headPivot = new THREE.Group(); headPivot.position.set(0, 0.62, 0); upper.add(headPivot);
  box(headPivot, mSkin, 0.22, 0.24, 0.22, 0, 0.12, 0);
  box(headPivot, mCap, 0.24, 0.08, 0.25, 0, 0.25, 0.005);         // cap
  box(headPivot, mCap, 0.2, 0.025, 0.12, 0, 0.215, -0.16);        // brim
  box(headPivot, mCap, 0.24, 0.1, 0.04, 0, 0.16, 0.115);          // hair / cap back

  // legs (pivot at the hips, yawed toward the travel direction)
  const legs = new THREE.Group(); legs.position.y = HIP_STAND; body.add(legs);
  function makeLeg(x) {
    const hip = new THREE.Group(); hip.position.set(x, 0, 0); legs.add(hip);
    box(hip, mPants, 0.15, LEG, 0.17, 0, -LEG / 2, 0);
    const knee = new THREE.Group(); knee.position.set(0, -LEG, 0); hip.add(knee);
    box(knee, mPants, 0.13, LEG - 0.06, 0.15, 0, -(LEG - 0.06) / 2, 0);
    box(knee, mBoots, 0.145, 0.12, 0.27, 0, -LEG + 0.06, -0.045);
    return { hip, knee };
  }
  const legR = makeLeg(0.1), legL = makeLeg(-0.1);

  // arms: segments posed by a two-bone solver in body space
  const armRU = limb(body, mJacket, 0.062, ARM_U), armRF = limb(body, mJacketDark, 0.052, ARM_F);
  const armLU = limb(body, mJacket, 0.062, ARM_U), armLF = limb(body, mJacketDark, 0.052, ARM_F);
  const handR = box(body, mSkin, 0.08, 0.09, 0.09, 0, 0, 0), handL = box(body, mSkin, 0.08, 0.09, 0.09, 0, 0, 0);

  function placeSeg(mesh, a, b) {
    mesh.position.addVectors(a, b).multiplyScalar(0.5);
    _m.subVectors(b, a);
    const l = _m.length();
    if (l > 1e-5) mesh.quaternion.setFromUnitVectors(UP, _m.divideScalar(l));
  }
  function solveArm(S, T, pole, upperMesh, foreMesh, handMesh) {
    _d.subVectors(T, S);
    let d = _d.length();
    const maxR = ARM_U + ARM_F - 0.004;
    if (d < 0.1) { _d.set(0, -0.1, 0); d = 0.1; }
    if (d > maxR) { _d.multiplyScalar(maxR / d); d = maxR; }
    _n.copy(_d).divideScalar(d);
    const a = (ARM_U * ARM_U - ARM_F * ARM_F + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, ARM_U * ARM_U - a * a));
    _p.copy(pole).addScaledVector(_n, -pole.dot(_n));
    if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1);
    _p.normalize();
    _E.copy(S).addScaledVector(_n, a).addScaledVector(_p, h);
    _d.add(S);                       // clamped hand position
    placeSeg(upperMesh, S, _E);
    placeSeg(foreMesh, _E, _d);
    handMesh.position.copy(_d);
    handMesh.quaternion.copy(foreMesh.quaternion);
  }

  // ------------------------------------------------------------------ flashlight
  const flash = new THREE.SpotLight('#fff0d2', 0, 60, 0.5, 0.5, 1.3);
  flash.castShadow = false;
  scene.add(flash); scene.add(flash.target);

  // ------------------------------------------------------------------ helpers
  function groundAt(x, z) {
    const w = game.world;
    if (w && w.heightAt) { const h = w.heightAt(x, z); return h === h ? h : 0; }
    return 0;
  }
  function camRay(origin, dir, maxDist) {
    const w = game.world;
    if (!w || !w.raycast) return -1;
    let hit = null;
    try { hit = w.raycast(origin, dir, maxDist); } catch (e) { hit = null; }
    return hit && hit.distance >= 0 && hit.distance <= maxDist ? hit.distance : -1;
  }
  function inputActive() { return input.locked || !!game.debug.noLock || api.freeLook; }
  // perk modifiers (perks.js writes game.mods; main.js resets it every run)
  function mod(k, d) { const m = game.mods; const v = m && m[k]; return typeof v === 'number' && v === v ? v : d; }
  function maxAirJumps() { return 1 + Math.max(0, Math.floor(mod('extraJumps', 0))); }
  function live() { return game.state === 'playing' && !game.paused; }
  function clearInput() {
    input.keys.clear(); input.fire = false; input.aim = false; edgeX = 0; edgeY = 0;
    fireSeen = aimSeen = true; fireRelease = aimRelease = false;
  }

  // Some hosts can never grant pointer lock (embedded previews answer WrongDocumentError). Rather than
  // leave the run ticking with dead controls, fall back to free-look: the unlocked mouse still reports
  // movementX/Y, and the view keeps turning while the cursor rests near a screen edge.
  function enableFreeLook() {
    if (api.freeLook) return;
    api.freeLook = true;
    game.emit('freeLook');
  }
  function lockFailed(err) {
    if (everLocked || api.freeLook || document.pointerLockElement === canvas) return;
    lockFails++;
    const name = err && err.name;
    if (name === 'WrongDocumentError' || name === 'NotSupportedError' || lockFails >= 3) enableFreeLook();
    else game.emit('lockFailed');      // e.g. the cool-down after Esc: main.js shows the pause card
  }
  function lock() {
    if (api.freeLook) return;
    if (typeof canvas.requestPointerLock !== 'function') { enableFreeLook(); return; }
    try {
      const p = canvas.requestPointerLock();
      if (p && p.then) p.then(null, lockFailed);
      else legacyLock = true;          // old API: failure only arrives as a 'pointerlockerror' event
    } catch (e) { lockFailed(e); }
  }

  function setFirstPerson(fp) {
    api.firstPerson = !!fp;
    if (api.firstPerson) { camera.add(mount); body.visible = false; }
    else { root.add(mount); body.visible = true; camRatio = Math.min(camRatio, 0.4); }
  }

  function currentStance() {
    const w = game.weapons, cur = w && w.current, def = cur && cur.def;
    let id = 'melee';
    if (def) id = def.slot === 'melee' ? 'melee' : def.slot === 'heavy' ? 'heavy' : def.id === 'pistol' ? 'pistol' : 'rifle';
    if (id !== stanceId) { stanceId = id; stance = STANCES[id]; }
    return def;
  }

  // ------------------------------------------------------------------ DOM input
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    legacyLock = false;
    if (input.locked) { everLocked = true; lockFails = 0; }
    else if (!game.debug.noLock && !api.freeLook) clearInput();
  });
  document.addEventListener('pointerlockerror', () => { if (legacyLock) { legacyLock = false; lockFailed(null); } });
  window.addEventListener('blur', clearInput);
  document.documentElement.addEventListener('mouseleave', () => { edgeX = 0; edgeY = 0; });

  document.addEventListener('mousemove', (e) => {
    if (!live() || !api.alive || game.choosing) return;   // the perk picker owns the mouse while it is open
    if (!input.locked) {
      if (!api.freeLook || game.debug.noLock) return;    // automation (noLock) steers yaw / pitch itself
      const nx = e.clientX / (window.innerWidth || 1) * 2 - 1, ny = e.clientY / (window.innerHeight || 1) * 2 - 1;
      edgeX = nx > 0.8 ? (nx - 0.8) / 0.2 : nx < -0.8 ? (nx + 0.8) / 0.2 : 0;
      edgeY = ny > 0.86 ? (ny - 0.86) / 0.14 : ny < -0.86 ? (ny + 0.86) / 0.14 : 0;
    }
    const mx = clamp(e.movementX || 0, -300, 300), my = clamp(e.movementY || 0, -300, 300);
    const s = P.mouseSens * sensScale;
    api.yaw -= mx * s;
    const lim = api.firstPerson ? 1.45 : 1.25;
    api.pitch = clamp(api.pitch - my * s, api.firstPerson ? -1.45 : -1.15, lim);
    mdx += mx; mdy += my;
  });

  document.addEventListener('mousedown', (e) => {
    if (game.state !== 'playing') return;
    if (!input.locked && !game.debug.noLock && !api.freeLook) { if (e.target === canvas) lock(); return; }
    if (game.paused || game.choosing) return;
    if (e.button === 0) { input.fire = true; fireSeen = false; fireRelease = false; }
    else if (e.button === 2) { input.aim = true; aimSeen = false; aimRelease = false; }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) { if (fireSeen) input.fire = false; else fireRelease = true; }
    else if (e.button === 2) { if (aimSeen) input.aim = false; else aimRelease = true; }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => { if (game.state === 'playing') e.preventDefault(); });

  window.addEventListener('wheel', (e) => {
    if (game.state !== 'playing') return;
    e.preventDefault();
    if (game.paused || game.choosing || !e.deltaY) return;   // no weapon cycling behind the perk picker
    const now = performance.now();
    if (now - lastWheel < 60) return;
    lastWheel = now;
    game.emit('wheel', e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (game.state !== 'playing') return;
    if (GAME_KEYS.has(e.code) || (e.ctrlKey && !e.metaKey && input.locked)) e.preventDefault();
    if (game.paused || game.choosing) return;   // perk picker open: 1 / 2 / 3 pick a card, not a weapon
    input.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') jumpBuffer = 0.14;
    else if (e.code === 'KeyC' || e.code === 'ControlLeft') { crouchPress = 0.12; }
    else if (e.code === 'KeyV') setFirstPerson(!api.firstPerson);
    else if (e.code === 'KeyT') api.flashlightOn = !api.flashlightOn;
    game.emit('keydown', e.code);
  });
  window.addEventListener('keyup', (e) => { input.keys.delete(e.code); });

  // the lamp comes on by itself at dusk and goes off at dawn (still toggled with T)
  game.on('phase', (e) => { if (e && game.state === 'playing' && game.night > 0) api.flashlightOn = e.phase === 'night'; });

  // ------------------------------------------------------------------ combat API
  function addRecoil(pitchKick, yawKick) {
    kickP += pitchKick || 0; kickY += yawKick || 0;
    mountKick = Math.min(0.09, mountKick + Math.abs(pitchKick || 0) * 1.1 + 0.004);
  }
  function addShake(amount) { shake = Math.min(0.08, shake + (amount || 0)); }

  function damage(amount, sourcePos) {
    if (!api.alive || game.state !== 'playing' || !(amount > 0)) return;
    if (game.debug.god) return;
    const perks = game.perks;
    if (perks && perks.shieldT > 0) return;           // PHOENIX revive grace
    amount *= Math.max(0, mod('damageTakenMult', 1));  // IRON HIDE / JUGGERNAUT, before armor
    if (!(amount > 0)) return;
    let dmg = amount;
    if (api.armor > 0) {
      const absorbed = Math.min(api.armor, dmg * P.armorAbsorb);
      api.armor -= absorbed; dmg -= absorbed;
      if (api.armor < 0.01) api.armor = 0;
    }
    api.health = Math.max(0, api.health - dmg);
    // PHOENIX: a lethal hit may be cancelled; onLethal() restores health itself and returns true
    if (api.health <= 0 && perks && typeof perks.onLethal === 'function') {
      let saved = false;
      try { saved = perks.onLethal(amount, sourcePos) === true; } catch (e) { saved = false; }
      if (!saved || !(api.health > 0)) api.health = 0;
    }
    shake = Math.min(0.08, shake + 0.012 + amount * 0.0016);
    punchP += Math.min(0.06, amount * 0.0022);
    hitEvt.amount = amount; hitEvt.sourcePos = sourcePos || null;
    game.emit('playerHit', hitEvt);
    if (api.health <= 0 && api.alive) {
      api.alive = false;
      clearInput();
      api.isSprinting = api.isAiming = api.isMoving = false;
      deathPose();
      game.emit('playerDied');
    }
  }
  function heal(amount) { if (api.alive) api.health = Math.min(api.maxHealth, api.health + (amount || 0)); }
  function addArmor(amount) { api.armor = clamp(api.armor + (amount || 0), 0, P.maxArmor); }

  function getAimRay(outOrigin, outDir) {
    outDir.copy(camDir);
    outOrigin.copy(camPos);
    if (!api.firstPerson) {
      // start no further back than the head plane so nothing behind the survivor is hit
      const t = (pos.x - camPos.x) * camDir.x + (pos.y + api.eyeHeight - camPos.y) * camDir.y + (pos.z - camPos.z) * camDir.z;
      if (t > 0) outOrigin.addScaledVector(camDir, t);
    }
    return outOrigin;
  }

  function deathPose() {
    body.visible = true; mount.visible = false;
    body.rotation.x = -PI / 2 * 0.96; body.position.y = 0.16;
    root.position.copy(pos); root.rotation.y = api.yaw;
    const sy = Math.sin(api.yaw), cy = Math.cos(api.yaw);
    _pivot.set(pos.x, pos.y + 1.0, pos.z);
    _dir.set(sy * 0.72 + cy * 0.15, 0.62, cy * 0.72 - sy * 0.15).normalize();
    let d = 4.2;
    const hit = camRay(_pivot, _dir, d + CAM_MARGIN);
    if (hit >= 0) d = Math.max(0.6, hit - CAM_MARGIN);
    camera.position.copy(_pivot).addScaledVector(_dir, d);
    _T.set(pos.x - sy * 0.6, pos.y + 0.3, pos.z - cy * 0.6);
    camera.lookAt(_T);
    camPos.copy(camera.position);
    camDir.subVectors(_T, camPos).normalize();
    flash.intensity = 0; mLamp.emissiveIntensity = 0;
  }

  // ------------------------------------------------------------------ movement
  function updateMovement(dt) {
    const keys = input.keys, active = inputActive();
    let mf = 0, mr = 0;
    if (active) {
      if (keys.has('KeyW')) mf += 1;
      if (keys.has('KeyS')) mf -= 1;
      if (keys.has('KeyD')) mr += 1;
      if (keys.has('KeyA')) mr -= 1;
    }
    const def = currentStance();
    if (crouchPress > 0) crouchPress -= dt;
    if (slideCd > 0) slideCd -= dt;
    if (slamCd > 0) slamCd -= dt;
    // slide: tap crouch while sprinting
    if (crouchPress > 0 && active && grounded && wasSprinting && slideT <= 0 && slideCd <= 0) {
      slideT = P.slide.time; slideCd = P.slide.cooldown + P.slide.time; crouchPress = 0;
      slideDir.set(vel.x, 0, vel.z);
      if (slideDir.lengthSq() < 0.5) slideDir.set(-Math.sin(api.yaw), 0, -Math.cos(api.yaw));
      slideDir.normalize();
      game.emit('slide');
    }
    if (slideT > 0 && (!grounded || !active)) slideT = 0;
    const sliding = slideT > 0;
    if (sliding) slideT -= dt;
    api.isSliding = sliding;
    const crouch = active && (sliding || keys.has('KeyC') || keys.has('ControlLeft'));
    const aiming = active && input.aim && stanceId !== 'melee';
    api.isCrouching = crouch;
    api.isAiming = aiming;

    // sprint + stamina
    if (api.stamina <= 0) exhausted = true;
    else if (exhausted && api.stamina > 0.25) exhausted = false;
    const sprint = active && keys.has('ShiftLeft') && mf > 0 && !crouch && !aiming && !input.fire && !exhausted && grounded;
    api.isSprinting = sprint;
    wasSprinting = sprint;
    if (sprint) { api.stamina = Math.max(0, api.stamina - P.staminaDrain * dt); regenDelay = 0.7; }
    else if (regenDelay > 0) regenDelay -= dt;
    else api.stamina = Math.min(1, api.stamina + P.staminaRegen * dt);

    // wish velocity
    let speed = crouch ? P.crouch : sprint ? P.sprint : P.walk;
    if (aiming) speed = Math.min(speed, P.walk * P.aimMult);
    if (mf < 0) speed *= 0.85;
    const w = game.weapons;
    const mult = w && typeof w.moveMult === 'number' && w.moveMult > 0 ? w.moveMult : 1;
    speed *= mult * Math.max(0.2, mod('moveMult', 1));   // perks: ADRENALINE
    const sy = Math.sin(api.yaw), cy = Math.cos(api.yaw);
    let wx = -sy * mf + cy * mr, wz = -cy * mf - sy * mr;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx = wx / wl * speed; wz = wz / wl * speed; }
    if (sliding) {
      // momentum carries the slide, steering only a little
      const f = clamp(slideT / P.slide.time, 0, 1), sp = lerp(P.crouch, P.slide.speed, Math.sqrt(f));
      if (wl > 0) { slideDir.x += (wx / speed - slideDir.x) * damp(1.6, dt); slideDir.z += (wz / speed - slideDir.z) * damp(1.6, dt); slideDir.normalize(); }
      vel.x = slideDir.x * sp; vel.z = slideDir.z * sp;
    } else {
      const k = damp(grounded ? (wl > 0 ? 13 : 11) : (slamming ? 0.5 : P.airControl), dt);
      // in the air, never brake below the speed you jumped with in the direction you are pushing
      const hs0 = Math.hypot(vel.x, vel.z);
      vel.x += (wx - vel.x) * k; vel.z += (wz - vel.z) * k;
      if (!grounded && wl > 0) {
        const hs1 = Math.hypot(vel.x, vel.z), keep = Math.min(hs0, P.sprint * 1.15);
        if (hs1 < keep && hs1 > 1e-4) { vel.x *= keep / hs1; vel.z *= keep / hs1; }
      }
    }

    // jump
    if (jumpBuffer > 0) jumpBuffer -= dt;
    if (grounded) coyote = 0.1; else if (coyote > 0) coyote -= dt;
    if (grounded) airJumps = maxAirJumps();      // 1, plus perks: SPRING LEGS
    if (jumpBuffer > 0 && coyote > 0 && active) {
      vel.y = P.jump; grounded = false; coyote = 0; jumpBuffer = 0;
      if (sliding) { slideT = 0; vel.x *= 1.05; vel.z *= 1.05; }     // slide-jump keeps the speed
      game.emit('jump', { double: false });
    } else if (jumpBuffer > 0 && !grounded && coyote <= 0 && airJumps > 0 && active && !slamming) {
      airJumps -= 1; jumpBuffer = 0;
      vel.y = P.jump2;
      if (wl > 0) {   // redirect toward where you are pushing, keeping your speed
        const hs = Math.max(Math.hypot(vel.x, vel.z), speed);
        vel.x = wx / speed * hs; vel.z = wz / speed * hs;
      }
      dipVel += 0.6;
      game.emit('jump', { double: true });
    }
    // ground slam: crouch in the air with some height under you
    if (crouchPress > 0 && !grounded && active && !slamming && slamCd <= 0) {
      const wld = game.world;
      const under = wld && wld.floorAt ? wld.floorAt(pos.x, pos.z, api.radius * 0.75, pos.y) : groundAt(pos.x, pos.z);
      if (pos.y - under > P.slam.minHeight) {
        slamming = true; crouchPress = 0;
        vel.y = -P.slam.speed; vel.x *= 0.35; vel.z *= 0.35;
        game.emit('slamStart');
      }
    }

    // horizontal move + collision
    const px = pos.x, pz = pos.z;
    const hPrev = groundAt(px, pz);
    pos.x += vel.x * dt; pos.z += vel.z * dt;
    const world = game.world;
    api.height = lerp(P.standHeight, P.crouchHeight, crouchBlend);
    let pushed = false;
    // a hair under full height: the jump apex (about 1.02 m) must not clip the 2.7 m door lintels
    if (world && world.resolveCircle) pushed = !!world.resolveCircle(pos, api.radius, api.height - 0.08);
    // the horde has mass: living zombies shove the player back (not during a Slipstream dash)
    const zs = game.zombies;
    if (zs && zs.inRadius && !(game.skills && game.skills.invulnerable)) {
      zs.inRadius(pos, api.radius + 0.4, _zNear);
      let shoved = false;
      const plough = mod('knockImmune', 0) > 0;       // perks: JUGGERNAUT shoves the horde aside instead
      for (let i = 0; plough && i < _zNear.length; i++) {
        const z = _zNear[i];
        if (!z || !z.alive || !z.position || z.type === 'boss') continue;
        const dyz = pos.y - z.position.y;
        if (dyz > 0.9 || dyz < -1.6) continue;
        const dx = z.position.x - pos.x, dz = z.position.z - pos.z;
        const d = Math.sqrt(dx * dx + dz * dz), min = api.radius + (z.radius || 0.4) * 0.95;
        if (d >= min || d < 1e-4) continue;
        const k = (min - d) / d;
        z.position.x += dx * k; z.position.z += dz * k;
        if (world && world.resolveCircle) world.resolveCircle(z.position, z.radius || 0.42, z.height || 1.75);
        _zNear[i] = null;                              // handled: the survivor holds their ground
      }
      for (let i = 0; i < _zNear.length; i++) {
        const z = _zNear[i];
        if (!z || !z.alive || !z.position) continue;
        const dyz = pos.y - z.position.y;
        if (dyz > 0.9 || dyz < -1.6) continue;
        const dx = pos.x - z.position.x, dz = pos.z - z.position.z;
        const d = Math.sqrt(dx * dx + dz * dz), min = api.radius + (z.radius || 0.4) * 0.95;
        if (d >= min || d < 1e-4) continue;
        const k = ((min - d) / d) * (z.type === 'brute' ? 1 : 0.85);
        pos.x += dx * k; pos.z += dz * k; shoved = true;
      }
      if (shoved && world && world.resolveCircle) world.resolveCircle(pos, api.radius, api.height - 0.08);
    }
    // never wade into the sea
    const shore = CONFIG.world.seaLevel + 0.12;
    let h = groundAt(pos.x, pos.z);
    if (h < shore && hPrev >= shore) {
      if (groundAt(pos.x, pz) >= shore) { pos.z = pz; vel.z = 0; }
      else if (groundAt(px, pos.z) >= shore) { pos.x = px; vel.x = 0; }
      else { pos.x = px; pos.z = pz; vel.x = 0; vel.z = 0; }
      h = groundAt(pos.x, pos.z);
    }
    if (pushed && dt > 1e-5) {
      // keep only the velocity that actually moved us, so we slide along walls instead of sticking
      const ax = (pos.x - px) / dt, az = (pos.z - pz) / dt;
      const al = Math.hypot(ax, az), vl = Math.hypot(vel.x, vel.z);
      if (al < vl) { vel.x = ax; vel.z = az; }
    }

    // vertical: stand on whatever is under you (rocks, crates, roofs), bump your head on what is above
    if (world && world.floorAt) h = Math.max(h, world.floorAt(pos.x, pos.z, api.radius * 0.75, pos.y));
    if (grounded) {
      if (pos.y - h > 0.45) { grounded = false; vel.y = 0; }
      else { pos.y = h; vel.y = 0; }
    }
    if (!grounded) {
      const y0 = pos.y;
      vel.y -= P.gravity * dt;
      pos.y += vel.y * dt;
      if (vel.y > 0 && world && world.ceilingAt) {
        const ceil = world.ceilingAt(pos.x, pos.z, api.radius * 0.9, y0 + api.height - 0.05);
        if (pos.y + api.height > ceil) { pos.y = Math.max(y0, ceil - api.height); vel.y = 0; }
      }
      if (pos.y <= h && vel.y <= 0) {
        const fall = -vel.y;
        pos.y = h; vel.y = 0; grounded = true; airJumps = maxAirJumps();
        if (slamming) {
          slamming = false; slamCd = P.slam.cooldown;
          slamEvt.position.copy(pos); slamEvt.speed = fall;
          shake = Math.min(0.08, shake + 0.05);
          game.emit('slam', slamEvt);
        }
        if (fall > 2.5) {
          dipVel -= Math.min(fall, 16) * 0.35;
          game.emit('land');
        }
      } else if (pos.y < h) pos.y = h;   // still rising but the slope ahead is higher: ride it, never dip under the terrain
    }
    if (!(pos.x === pos.x && pos.y === pos.y && pos.z === pos.z)) {   // NaN guard
      const sp = world && world.playerSpawn;
      if (sp) pos.copy(sp); else pos.set(0, 0, 0);
      pos.y = groundAt(pos.x, pos.z); vel.set(0, 0, 0);
    }
    api.isGrounded = grounded;

    // derived motion values
    const hs = Math.hypot(vel.x, vel.z);
    api.isMoving = hs > 0.4;
    const lf = -sy * vel.x - cy * vel.z, lr = cy * vel.x - sy * vel.z;
    const back = lf < -0.2;
    if (grounded && hs > 0.3) {
      const stride = sprint ? 2.2 : crouch ? 1.2 : 1.6;
      legPhase += hs * dt * PI / stride * (back ? -1 : 1);
      stepAcc += hs * dt;
      if (stepAcc >= stride) { stepAcc -= stride; stepEvt.sprint = sprint; game.emit('step', stepEvt); }
      const ty = clamp(-Math.atan2(back ? -lr : lr, back ? -lf : lf), -1.1, 1.1);
      legYaw += (ty - legYaw) * damp(10, dt);
    } else {
      legYaw += (0 - legYaw) * damp(6, dt);
      if (hs <= 0.3) stepAcc = Math.min(stepAcc, 0.8);
    }
    strafeTilt += (clamp(lr / P.walk, -1, 1) - strafeTilt) * damp(8, dt);

    // blends
    crouchBlend += ((crouch ? 1 : 0) - crouchBlend) * damp(11, dt);
    aimBlend += ((aiming ? 1 : 0) - aimBlend) * damp(13, dt);
    sprintBlend += ((sprint && hs > P.walk ? 1 : 0) - sprintBlend) * damp(8, dt);
    moveBlend += (clamp(hs / P.walk, 0, 1.2) - moveBlend) * damp(10, dt);
    airBlend += ((grounded ? 0 : 1) - airBlend) * damp(10, dt);
    api.eyeHeight = lerp(EYE_STAND, EYE_CROUCH, crouchBlend);

    // landing dip spring
    dipVel += (-190 * dip - 23 * dipVel) * dt;
    dip += dipVel * dt;
    dip = clamp(dip, -0.3, 0.1);

    // aim fov / sensitivity for the held weapon
    let af = P.aimFov;
    if (def) af = def.aimFov ? def.aimFov : def.id === 'sniper' ? P.aimFov * 0.45 : P.aimFov;
    aimFovCur += (af - aimFovCur) * damp(12, dt);
    sensScale = aiming ? P.aimSensMult * clamp(aimFovCur / P.aimFov, 0.4, 1) : 1;
  }

  // ------------------------------------------------------------------ recoil / shake
  function updateRecoil(dt) {
    const f = damp(45, dt);
    const ap = kickP * f, ay = kickY * f;
    kickP -= ap; kickY -= ay;
    // same limits as the mouse handler, so climbing recoil at the top of the view cannot snap back on the next mouse move
    api.pitch = clamp(api.pitch + ap * (1 - RECOIL_RECOVER), api.firstPerson ? -1.45 : -1.15, api.firstPerson ? 1.45 : 1.25);
    api.yaw += ay * (1 - RECOIL_RECOVER);
    recP += ap * RECOIL_RECOVER; recY += ay * RECOIL_RECOVER;
    const r = Math.exp(-7 * dt);
    recP *= r; recY *= r;
    mountKick *= Math.exp(-14 * dt);
    shake *= Math.exp(-6 * dt);
    punchP *= Math.exp(-9 * dt);
    if (api.yaw > PI * 64 || api.yaw < -PI * 64) api.yaw %= PI * 2;
  }

  // ------------------------------------------------------------------ camera
  function updateCamera(dt, snap) {
    const sh = shake;
    const vy = api.yaw + recY + Math.sin(time * 53.1) * sh * 0.6;
    const lim = api.firstPerson ? 1.48 : 1.3;
    const vp = clamp(api.pitch + recP + punchP + Math.sin(time * 61.7 + 1.3) * sh, api.firstPerson ? -1.48 : -1.2, lim);
    const sy = Math.sin(vy), cy = Math.cos(vy), sp = Math.sin(vp), cp = Math.cos(vp);
    fwd.set(-sy * cp, sp, -cy * cp);
    right.set(cy, 0, -sy);
    let roll = Math.sin(time * 47.3 + 0.7) * sh * 0.7;

    if (api.firstPerson) {
      const bob = Math.sin(legPhase * 2) * 0.018 * Math.min(1, moveBlend) * (1 - airBlend) * (1 - aimBlend * 0.7);
      camPos.set(pos.x, pos.y + api.eyeHeight + dip + bob, pos.z);
      roll -= strafeTilt * 0.014;
      camDist = 0;
    } else {
      _pivot.set(pos.x, pos.y + api.eyeHeight + 0.14 + dip * 0.6, pos.z);
      const side = lerp(TP_SIDE, TP_SIDE_AIM, aimBlend);
      const up = lerp(TP_UP, TP_UP_AIM, aimBlend);
      const dist = lerp(TP_DIST, TP_DIST_AIM, aimBlend) + sprintBlend * 0.35;
      // pivot -> shoulder
      _off.copy(right).multiplyScalar(side); _off.y += up;
      const l1 = _off.length();
      _dir.copy(_off).divideScalar(l1);
      const d1 = camRay(_pivot, _dir, l1 + 0.3);
      const k = d1 >= 0 ? clamp((d1 - 0.3) / l1, 0, 1) : 1;
      sideK = snap || k < sideK ? k : sideK + (k - sideK) * damp(8, dt);
      _shoulder.copy(_pivot).addScaledVector(_dir, l1 * sideK);
      // shoulder -> boom
      // Sweep a small rectangle (centre + 4 corners), not a single ray: a lone centre ray slips past
      // roof edges and walls met at a shallow angle and leaves the near plane poking through them.
      _back.copy(fwd).negate();
      _camUp.set(sy * sp, cp, cy * sp);
      let r = 1;
      for (let i = 0; i < 5; i++) {
        _boomTo.copy(_shoulder).addScaledVector(_back, dist);
        if (i) _boomTo.addScaledVector(right, i < 3 ? -CAM_HW : CAM_HW).addScaledVector(_camUp, (i & 1) ? -CAM_HH : CAM_HH);
        _boomDir.subVectors(_boomTo, _shoulder);
        const len = _boomDir.length();
        _boomDir.divideScalar(len);
        const d2 = camRay(_shoulder, _boomDir, len + CAM_MARGIN);
        if (d2 >= 0) { const kr = (d2 - CAM_MARGIN) / len; if (kr < r) r = kr; }
      }
      // down to zero: with a hit closer than the margin the camera must stay AT the shoulder, a minimum
      // boom length would carry it into the surface it just detected
      r = clamp(r, 0, 1);
      camRatio = snap || r < camRatio ? r : camRatio + (r - camRatio) * damp(6, dt);
      camDist = dist * camRatio;
      camPos.copy(_shoulder).addScaledVector(_back, camDist);
      // Last line of defence: when the boom collapses next to a post, a wall end or a roof edge the
      // rays (which all start at one point) say nothing about sideways clearance, so nudge the eye
      // point out of anything it grazes. The near plane then never cuts into solid geometry.
      const wd = game.world, cols = wd && wd.colliders;
      if (cols) {
        const reach = CAM_CLEAR * 2;     // earlier pushes can move the point by up to CAM_CLEAR
        const cx = camPos.x, cyy = camPos.y, cz = camPos.z;
        let buried = false;
        for (let i = 0, n = cols.length; i < n; i++) {
          const b = cols[i].box, mn = b.min, mx = b.max;
          if (cx < mn.x - reach || cx > mx.x + reach || cz < mn.z - reach || cz > mx.z + reach ||
              cyy < mn.y - reach || cyy > mx.y + reach) continue;
          const ex = camPos.x - clamp(camPos.x, mn.x, mx.x), ey = camPos.y - clamp(camPos.y, mn.y, mx.y), ez = camPos.z - clamp(camPos.z, mn.z, mx.z);
          const e2 = ex * ex + ey * ey + ez * ez;
          if (e2 >= CAM_CLEAR * CAM_CLEAR) continue;
          if (e2 < 1e-10) { buried = true; break; }
          const e = Math.sqrt(e2), push = (CAM_CLEAR - e) / e;
          camPos.x += ex * push; camPos.y += ey * push; camPos.z += ez * push;
        }
        if (buried) { camPos.set(pos.x, pos.y + api.eyeHeight, pos.z); camDist = 0; }   // inside something solid: fall back to the eyes, which never are
      }
      const gy = groundAt(camPos.x, camPos.z) + 0.25;
      if (camPos.y < gy) camPos.y = gy;
    }
    camDir.copy(fwd);
    camera.position.copy(camPos);
    camera.rotation.set(vp, vy, roll, 'YXZ');

    const fov = lerp(P.fov, aimFovCur, aimBlend) + (P.sprintFov - P.fov) * sprintBlend * (1 - aimBlend);
    if (Math.abs(fov - camera.fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); }
    return vp;
  }

  // ------------------------------------------------------------------ model + weapon mount
  function poseLeg(leg, a, swing, bend) {
    leg.hip.rotation.x = a + swing;
    leg.knee.rotation.x = -2 * a - bend;
  }

  function updateModel(dt, vp, snap) {
    const vy = camera.rotation.y;
    root.position.copy(pos);
    root.rotation.y = vy;
    const showBody = !api.firstPerson && camDist > 0.8;
    body.visible = showBody;
    const kS = snap ? 1 : damp(12, dt);

    const s = Math.sin(legPhase), c = Math.cos(legPhase);
    const ground = 1 - airBlend, mv = Math.min(1, moveBlend);
    const hipY = clamp(lerp(HIP_STAND, HIP_CROUCH, crouchBlend) + dip * 1.6 - Math.abs(s) * 0.03 * mv * ground - airBlend * 0.05, 0.3, HIP_STAND);
    hipYCur = hipY;
    const sprintPose = sprintBlend * (1 - aimBlend);

    // ---- weapon mount
    if (api.firstPerson) {
      const heavy = stanceId === 'heavy';
      _fp.copy(heavy ? FP_HEAVY : FP_HIP);
      _fa.copy(heavy ? FP_HEAVY_ADS : stanceId === 'melee' ? FP_HIP : FP_ADS);
      _fp.lerp(_fa, aimBlend);
      fpOff.lerp(_fp, kS);
      const tx = clamp(-mdx * 0.0007, -0.03, 0.03), ty = clamp(mdy * 0.0007, -0.03, 0.03);
      swayX += (tx - swayX) * damp(9, dt); swayY += (ty - swayY) * damp(9, dt);
      const bobK = mv * ground * (1 - aimBlend * 0.85);
      const breath = Math.sin(time * 1.7) * 0.0035 * (1 - aimBlend * 0.6);
      mount.position.set(
        fpOff.x + Math.sin(legPhase) * 0.013 * bobK + swayX - 0.07 * sprintPose,
        fpOff.y - Math.abs(s) * 0.015 * bobK + swayY + breath + dip * 0.5 - clamp(vel.y * 0.004, -0.03, 0.03) - 0.1 * sprintPose,
        fpOff.z + mountKick * 0.9 + 0.04 * sprintPose,
      );
      mount.rotation.set(
        mountKick * 1.3 - 0.32 * sprintPose - swayY * 1.5 + Math.sin(time * 1.3) * 0.004,
        0.55 * sprintPose + swayX * 2.2,
        -strafeTilt * 0.03 * (1 - aimBlend) - swayX * 1.6,
      );
    } else {
      _fp.copy(stance.hip).lerp(stance.aim, aimBlend).lerp(SPRINT_MOUNT, sprintPose * (stance.free ? 0 : 1));
      mountOff.lerp(_fp, kS);
      const mp = vp * (1 - 0.6 * sprintPose);
      const sm = Math.sin(mp), cm = Math.cos(mp);
      const oy = mountOff.y, oz = mountOff.z;
      mount.position.set(
        mountOff.x,
        hipY + 0.42 + oy * cm - oz * sm - Math.abs(c) * 0.012 * mv * ground,
        oy * sm + oz * cm + mountKick * 0.7 - crouchBlend * 0.14,
      );
      mount.rotation.set(mp - 0.4 * sprintPose + mountKick * 0.9, 0.6 * sprintPose * (stance.free ? 0 : 1), 0);
    }
    mdx = 0; mdy = 0;

    if (!showBody) return;

    // ---- torso / head
    twistCur += (stance.twist * (1 - sprintPose * 0.6) - twistCur) * kS;
    const lean = -(0.5 * crouchBlend + 0.2 * sprintBlend + 0.06 * mv) + vp * 0.22 * (1 - sprintPose);
    upper.position.y = hipY;
    upper.rotation.set(lean, twistCur, 0);
    headPivot.rotation.set(-lean * 0.75 + vp * 0.5, -twistCur, 0);

    // ---- legs
    legs.position.y = hipY;
    legs.rotation.y = legYaw;
    const a = Math.acos(clamp(hipY / (2 * LEG), 0.3, 1));
    const amp = (api.isSprinting ? 0.85 : lerp(0.55, 0.42, crouchBlend)) * mv * ground;
    poseLeg(legR, a, s * amp + airBlend * 0.45, Math.max(0, c) * amp * 1.3 + airBlend * 0.6);
    poseLeg(legL, a, -s * amp - airBlend * 0.15, Math.max(0, -c) * amp * 1.3 + airBlend * 0.9);

    // ---- arms (two-bone reach to the weapon)
    upper.updateMatrix();
    mount.updateMatrix();
    _S.set(SHOULDER_X, SHOULDER_Y, 0).applyMatrix4(upper.matrix);
    _T.set(0, -0.04, 0.03).applyMatrix4(mount.matrix);
    solveArm(_S, _T, POLE_R, armRU, armRF, handR);
    _S.set(-SHOULDER_X, SHOULDER_Y, 0).applyMatrix4(upper.matrix);
    if (stance.free) {
      _T.set(_S.x - 0.06, _S.y - 0.5 + Math.abs(s) * 0.06 * mv, _S.z + 0.02 - s * 0.24 * mv * ground - airBlend * 0.15);
    } else {
      gripCur.lerp(stance.grip, kS);
      _T.copy(gripCur).applyMatrix4(mount.matrix);
    }
    solveArm(_S, _T, POLE_L, armLU, armLF, handL);
  }

  function updateFlashlight(dt, snap) {
    const df = clamp(game.dayFactor === undefined ? 1 : game.dayFactor, 0, 1);
    const target = api.flashlightOn ? lerp(34, 10, df) : 0;
    lightI = snap ? target : lightI + (target - lightI) * damp(18, dt);
    flash.intensity = lightI < 0.02 ? 0 : lightI;
    mLamp.emissiveIntensity = api.flashlightOn ? 2.2 : 0;
    if (api.firstPerson) {
      // In first person the lamp rides on the muzzle: a light behind the view model would blow the
      // gun out to pure white. Without a muzzle (melee) it sits ahead of the hands instead.
      const w = game.weapons;
      let onGun = false;
      if (w && w.getMuzzleWorld) { try { onGun = !!w.getMuzzleWorld(flash.position); } catch (e) { onGun = false; } }
      if (onGun && flash.position.distanceToSquared(camPos) < 16) flash.position.addScaledVector(fwd, 0.05);
      else { flash.position.copy(camPos).addScaledVector(fwd, 1.0); flash.position.y -= 0.2; }
    } else {
      flash.position.set(pos.x, pos.y + hipYCur + 0.46, pos.z).addScaledVector(fwd, 0.3).addScaledVector(right, -0.1);
    }
    flash.target.position.copy(flash.position).addScaledVector(fwd, 12);
  }

  // ------------------------------------------------------------------ frame
  function refresh(dt, snap) {
    const vp = updateCamera(dt, snap);
    updateModel(dt, vp, snap);
    updateFlashlight(dt, snap);
    root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
  }

  function update(dt) {
    // release buttons whose press has now been visible to every module for one full frame
    if (!fireSeen) fireSeen = true; else if (fireRelease) { fireRelease = false; input.fire = false; }
    if (!aimSeen) aimSeen = true; else if (aimRelease) { aimRelease = false; input.aim = false; }
    if (!api.alive) return;
    time += dt;
    if (api.freeLook && !input.locked && !game.debug.noLock && (edgeX !== 0 || edgeY !== 0)) {
      // free-look: keep turning while the cursor sits in the edge band
      api.yaw -= edgeX * 2.6 * sensScale * dt;
      const lim = api.firstPerson ? 1.45 : 1.25;
      api.pitch = clamp(api.pitch - edgeY * 1.5 * sensScale * dt, api.firstPerson ? -1.45 : -1.15, lim);
    }
    updateMovement(dt);
    updateRecoil(dt);
    refresh(dt, false);
  }

  function reset() {
    const world = game.world;
    const sp = world && world.playerSpawn;
    if (sp) pos.copy(sp); else pos.set(0, 0, 0);
    pos.y = groundAt(pos.x, pos.z);
    vel.set(0, 0, 0);
    // face the middle of the island
    api.yaw = Math.hypot(pos.x, pos.z) > 1 ? Math.atan2(pos.x, pos.z) : 0;
    api.pitch = -0.05;
    api.health = api.maxHealth = P.maxHealth;
    api.armor = 0; api.stamina = 1; api.alive = true;
    api.isSprinting = api.isCrouching = api.isAiming = api.isMoving = false;
    api.isGrounded = true; api.flashlightOn = false;
    api.eyeHeight = EYE_STAND; api.height = P.standHeight;
    clearInput();
    input.locked = document.pointerLockElement === canvas;
    grounded = true; coyote = 0; jumpBuffer = 0; exhausted = false; regenDelay = 0;
    airJumps = maxAirJumps(); crouchPress = 0; slideT = 0; slideCd = 0; slamCd = 0; slamming = false; wasSprinting = false;
    api.isSliding = false;
    crouchBlend = aimBlend = sprintBlend = moveBlend = airBlend = 0;
    legPhase = 0; legYaw = 0; stepAcc = 0; dip = 0; dipVel = 0;
    kickP = kickY = recP = recY = mountKick = 0; shake = 0; punchP = 0;
    camRatio = 1; sideK = 1; mdx = mdy = 0; swayX = swayY = 0; strafeTilt = 0; sensScale = 1;
    aimFovCur = P.aimFov; lightI = 0;
    body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
    mount.visible = true; root.visible = true;
    setFirstPerson(api.firstPerson);
    currentStance();
    mountOff.copy(stance.hip); gripCur.copy(stance.grip); fpOff.copy(FP_HIP);
    camera.fov = P.fov; camera.updateProjectionMatrix();
    refresh(0.016, true);
  }

  // ------------------------------------------------------------------ api
  const api = {
    position: pos, velocity: vel,
    yaw: 0, pitch: 0,
    radius: P.radius, height: P.standHeight, eyeHeight: EYE_STAND,
    health: P.maxHealth, maxHealth: P.maxHealth, armor: 0, stamina: 1, alive: true,
    isSprinting: false, isCrouching: false, isAiming: false, isGrounded: true, isMoving: false,
    firstPerson: false, flashlightOn: false,
    freeLook: false,          // true once pointer lock proved unavailable (see enableFreeLook)
    input, weaponMount: mount, model: root,
    lock, getAimRay, addRecoil, addShake, damage, heal, addArmor, setFirstPerson,
    update, reset,
  };

  // park the survivor at the spawn so the menu fly-over shows them; the camera stays with main.js until start
  try {
    const sp = game.world && game.world.playerSpawn;
    if (sp) pos.copy(sp);
    pos.y = groundAt(pos.x, pos.z);
    root.position.copy(pos);
    updateModelIdle();
  } catch (e) { /* world not ready: reset() places everything */ }

  function updateModelIdle() {
    camDist = TP_DIST;
    const a = 0;
    poseLeg(legR, a, 0, 0); poseLeg(legL, a, 0, 0);
    mount.position.set(STANCES.melee.hip.x, HIP_STAND + 0.42 + STANCES.melee.hip.y, STANCES.melee.hip.z);
    upper.updateMatrix(); mount.updateMatrix();
    _S.set(SHOULDER_X, SHOULDER_Y, 0).applyMatrix4(upper.matrix);
    _T.set(0, -0.04, 0.03).applyMatrix4(mount.matrix);
    solveArm(_S, _T, POLE_R, armRU, armRF, handR);
    _S.set(-SHOULDER_X, SHOULDER_Y, 0).applyMatrix4(upper.matrix);
    _T.set(_S.x - 0.06, _S.y - 0.5, _S.z + 0.02);
    solveArm(_S, _T, POLE_L, armLU, armLF, handL);
  }

  return api;
}
