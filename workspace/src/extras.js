// HOLLOW DAWN — extra mechanics layered on the core modules:
//   * explosive fuel barrels (shoot them; explosions chain)
//   * ground-slam damage (player.js emits 'slam' when a C-in-the-air dive lands)
//   * kill chains: quick kills build a score multiplier
//   * rooftop caches: a good item waits on every roof that has a climb route
import * as THREE from 'three';
import { CONFIG } from './config.js';

export function init(game) {
  const BC = CONFIG.barrels, CC = CONFIG.combo, SL = CONFIG.player.slam;
  const scene = game.scene;

  // ------------------------------------------------------------ barrels
  const bodyGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14);
  const ringGeo = new THREE.CylinderGeometry(0.445, 0.445, 0.07, 14);
  const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xb3262a, emissive: 0x3a0606 });
  const ringMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
  const signMat = new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x2a2000 });
  const signGeo = new THREE.PlaneGeometry(0.34, 0.26);
  const root = new THREE.Group(); root.name = 'barrels';
  scene.add(root);
  const barrels = [];
  const pending = [];        // { b, t }

  function makeBarrel(p) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.525; body.castShadow = true; body.receiveShadow = true; g.add(body);
    for (const y of [0.2, 0.85]) { const r = new THREE.Mesh(ringGeo, ringMat); r.position.y = y; g.add(r); }
    const cap = new THREE.Mesh(capGeo, ringMat); cap.position.set(0.18, 1.07, 0.1); g.add(cap);
    for (let k = 0; k < 2; k++) {
      const s = new THREE.Mesh(signGeo, signMat);
      const a = k * Math.PI;
      s.position.set(Math.sin(a) * 0.43, 0.55, Math.cos(a) * 0.43); s.rotation.y = a; g.add(s);
    }
    g.position.copy(p); g.rotation.y = Math.random() * 6.28;
    root.add(g);
    const b = { group: g, position: p.clone(), hp: BC.health, alive: true, collider: null, wobble: 0 };
    return b;
  }
  function placeBarrels() {
    const w = game.world;
    for (const b of barrels) {
      if (b.collider && w && w.removeCollider) w.removeCollider(b.collider);
      root.remove(b.group);
    }
    barrels.length = 0; pending.length = 0;
    const spots = (w && w.barrelSpots) || [];
    for (const p of spots) {
      const b = makeBarrel(p);
      if (w && w.addCollider) {
        const box = new THREE.Box3(new THREE.Vector3(p.x - 0.42, p.y - 0.2, p.z - 0.42), new THREE.Vector3(p.x + 0.42, p.y + 1.05, p.z + 0.42));
        b.collider = w.addCollider(box, 'barrel', b);
      }
      barrels.push(b);
    }
  }
  function arm(b, delay) {
    if (!b.alive || pending.some((q) => q.b === b)) return;
    pending.push({ b, t: delay });
  }
  function detonate(b) {
    if (!b.alive) return;
    b.alive = false; b.group.visible = false;
    const w = game.world;
    if (b.collider && w && w.removeCollider) { w.removeCollider(b.collider); b.collider = null; }
    const sk = game.skills;
    if (sk && sk.blast) sk.blast(b.position.x, b.position.y + 0.4, b.position.z,
      { radius: BC.radius, damage: BC.damage, knock: BC.knock, selfRadius: BC.selfRadius, selfDamage: BC.selfDamage, shake: 0.26 });
    game.emit('barrelExploded', { position: b.position });
  }
  game.on('barrelHit', (e) => {
    const b = e && e.collider && e.collider.ref;
    if (!b || !b.alive || game.state !== 'playing') return;
    b.hp -= e.damage || 10; b.wobble = 1;
    if (b.hp <= 0) arm(b, 0.04);
  });
  game.on('explosion', (e) => {
    if (!e) return;
    for (const b of barrels) {
      if (!b.alive) continue;
      const dx = b.position.x - e.x, dz = b.position.z - e.z, dy = b.position.y - e.y;
      if (dx * dx + dz * dz + dy * dy < (e.radius + 0.6) * (e.radius + 0.6)) arm(b, e.dust ? 0.3 : BC.chainDelay);
    }
  });

  // ------------------------------------------------------------ ground slam
  game.on('slam', (e) => {
    if (!e || game.state !== 'playing') return;
    const p = e.position;
    const power = Math.min(1.6, Math.max(0.6, (e.speed || SL.speed) / 18));   // a dive off a roof hits harder
    const sk = game.skills;
    if (sk && sk.blast) sk.blast(p.x, p.y, p.z, { radius: SL.radius * Math.sqrt(power), damage: SL.damage * power, knock: SL.knock, selfRadius: 0, dust: true, shake: 0.1 + 0.06 * power });
    const zs = game.zombies;
    if (zs && zs.inRadius) {
      const near = [];
      zs.inRadius(p, SL.radius * 1.15, near);
      for (const z of near) if (z && z.alive) z.stunT = Math.max(z.stunT || 0, 0.7 * power);
    }
  });

  // ------------------------------------------------------------ kill chains
  const chain = { count: 0, t: 0, mult: 1, best: 0 };
  game.on('zombieKilled', (e) => {
    if (game.state !== 'playing') return;
    chain.count = chain.t > 0 ? chain.count + 1 : 1;
    chain.t = CC.window;
    const m = Math.min(CC.maxMult, 1 + Math.floor(chain.count / CC.step) * CC.multStep);
    if (m > chain.mult) game.emit('toast', `Kill chain x${m.toFixed(1)}`);
    chain.mult = m;
    chain.best = Math.max(chain.best, chain.count);
    if (m > 1) {
      const base = CONFIG.score.kill + (e && e.headshot ? CONFIG.score.headshot : 0);
      game.stats.bonus = (game.stats.bonus || 0) + Math.round(base * (m - 1));
    }
  });

  const hudRoot = document.getElementById('hud');
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;right:28px;top:44%;text-align:right;font-family:var(--display);color:var(--bone);' +
    'text-transform:uppercase;letter-spacing:.12em;opacity:0;transition:opacity .2s;text-shadow:0 2px 8px rgba(0,0,0,.6)';
  el.innerHTML = '<div data-k="m" style="font-size:42px;font-weight:800;line-height:1;color:var(--ember)"></div>' +
    '<div data-k="c" style="font:600 12px/1.6 var(--mono);color:var(--dim)"></div>' +
    '<div style="height:3px;width:120px;margin-left:auto;background:var(--line)"><div data-k="b" style="height:100%;background:var(--ember);width:0"></div></div>';
  if (hudRoot) hudRoot.appendChild(el);
  const elM = el.querySelector('[data-k="m"]'), elC = el.querySelector('[data-k="c"]'), elB = el.querySelector('[data-k="b"]');
  let shown = '';

  // ------------------------------------------------------------ rooftop caches
  // w = weight; `needs` entries only stock a roof while you carry a weapon that fires them
  const CACHE = [
    { w: 1, kind: 'ammo', id: 'heavy', amount: 40 }, { w: 1, kind: 'ammo', id: 'sniper', amount: 10 }, { w: 1, kind: 'med', id: 'medkit', amount: 1 },
    { w: 1, kind: 'armor', id: 'vest', amount: 50 }, { w: 1, kind: 'scrap', id: 'scrap', amount: 8 }, { w: 1, kind: 'weapon', id: 'sniper', amount: 1 },
    { w: 0.45, kind: 'ammo', id: 'fuel', amount: 80, needs: true }, { w: 0.35, kind: 'ammo', id: 'rockets', amount: 3, needs: true },
  ];
  function carries(ammoType) {
    const slots = game.weapons && game.weapons.slots;
    if (!slots) return false;
    for (const s of slots) if (s && s.def && s.def.ammoType === ammoType) return true;
    return false;
  }
  function pickCache() {
    let total = 0;
    for (const c of CACHE) if (!c.needs || carries(c.id)) total += c.w;
    let r = Math.random() * total;
    for (const c of CACHE) {
      if (c.needs && !carries(c.id)) continue;
      r -= c.w;
      if (r <= 0) return c;
    }
    return CACHE[0];
  }
  let caches = [];
  function stockRoofs(chance) {
    const w = game.world, loot = game.loot;
    if (!w || !w.climbRoutes || !loot || !loot.addItem) return;
    const keep = [];
    for (let i = 0; i < w.climbRoutes.length; i++) {
      const r = w.climbRoutes[i];
      const old = caches[i];
      if (old && loot.items.indexOf(old) >= 0) { keep[i] = old; continue; }
      if (!(r.roof.y > 0) || Math.random() > chance) { keep[i] = null; continue; }
      const c = pickCache();
      keep[i] = loot.addItem(c.kind, c.id, c.amount, r.roof);
    }
    caches = keep;
  }
  game.on('phase', (e) => { if (e && e.phase === 'day' && game.night > 0 && game.state === 'playing') { stockRoofs(0.7); placeBarrelsIfSpent(); } });
  function placeBarrelsIfSpent() { if (barrels.some((b) => !b.alive)) placeBarrels(); }

  // start-of-run hint toasts, on simulated time (they respect pause / the perk picker and die with the run)
  const TIPS = [
    [2.5, 'Space again in the air: double jump. Boulders and crates by the houses lead to the roofs'],
    [8, 'Sprint + C: slide. C in the air: ground slam. Red barrels explode'],
  ];
  let tipClock = 0, tipStage = TIPS.length;
  game.on('gameStart', () => { tipClock = 0; tipStage = 0; });
  function updateTips(dt) {
    if (tipStage >= TIPS.length || game.state !== 'playing') return;
    tipClock += dt;
    while (tipStage < TIPS.length && tipClock >= TIPS[tipStage][0]) game.emit('toast', TIPS[tipStage++][1]);
  }

  // ------------------------------------------------------------ loop
  function update(dt) {
    updateTips(dt);
    for (let i = pending.length - 1; i >= 0; i--) {
      const q = pending[i];
      q.t -= dt;
      if (q.t <= 0) { pending.splice(i, 1); detonate(q.b); }
    }
    for (const b of barrels) {
      if (!b.alive || b.wobble <= 0) continue;
      b.wobble = Math.max(0, b.wobble - dt * 3);
      b.group.rotation.z = Math.sin(b.wobble * 30) * 0.05 * b.wobble;
    }
    if (chain.t > 0) { chain.t -= dt; if (chain.t <= 0) { chain.count = 0; chain.mult = 1; } }
    const vis = chain.count >= 2 && game.state === 'playing';
    el.style.opacity = vis ? '1' : '0';
    if (vis) {
      const key = chain.count + '|' + chain.mult;
      if (key !== shown) {
        shown = key;
        elM.textContent = 'x' + chain.mult.toFixed(1);
        const next = CC.step - (chain.count % CC.step);
        elC.textContent = `${chain.count} chain` + (chain.mult < CC.maxMult ? ` · ${next} to next` : ' · max');
      }
      elB.style.width = (Math.max(0, chain.t / CC.window) * 100).toFixed(1) + '%';
    }
  }
  function reset() {
    placeBarrels();
    chain.count = 0; chain.t = 0; chain.mult = 1; chain.best = 0;
    game.stats.bonus = 0;
    caches = [];
    stockRoofs(1);
  }

  placeBarrels();
  return { update, reset, barrels, chain, detonate };
}
