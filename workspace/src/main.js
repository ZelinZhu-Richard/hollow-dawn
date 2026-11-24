// HOLLOW DAWN — bootstrap, render loop, day/night phase machine.
// Every other module exports `init(game)` returning its API object (with update(dt) and reset()).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import * as Audio from './audio.js';
import * as World from './world.js';
import * as Player from './player.js';
import * as Weapons from './weapons.js';
import * as Zombies from './zombies.js';
import * as Loot from './loot.js';
import * as Hud from './hud.js';
import * as Skills from './skills.js';
import * as Build from './build.js';
import * as Extras from './extras.js';
import * as Perks from './perks.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// The page can be laid out with a zero-sized viewport for a moment (background tab, embedded pane):
// never hand WebGL a 0x0 framebuffer, and re-fit every frame in case no 'resize' event arrives.
let viewW = Math.max(1, window.innerWidth), viewH = Math.max(1, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(viewW, viewH);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.player.fov, viewW / viewH, 0.08, 900);
camera.position.set(0, 60, 120);
scene.add(camera); // so camera children (first-person weapon, flashlight) render

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(viewW, viewH), 0.55, 0.6, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- game object
const listeners = new Map();
const game = {
  THREE, CONFIG, scene, camera, renderer, canvas, bloom,
  state: 'menu',            // 'menu' | 'playing' | 'dead'
  paused: false,
  phase: 'day',             // 'day' | 'night'
  phaseTime: 0,             // seconds elapsed in the current phase
  phaseDuration: CONFIG.phases.firstDay,
  night: 0,                 // 0 during the first day, then the number of the current / last night
  dayFactor: 1,             // 1 = full daylight, 0 = deep night (smooth)
  time: 0,                  // seconds of play this run
  stats: { kills: 0, headshots: 0, nightsSurvived: 0, score: 0, bonus: 0 },
  debug: { noLock: false, god: false },
  choosing: false,          // true while the perk picker is open: simulation is frozen, HUD and render keep going
  mods: null,               // perk modifiers, see MOD_DEFAULTS; every module reads them, perks.js writes them
  on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, []); listeners.get(evt).push(fn); },
  emit(evt, data) {
    const l = listeners.get(evt); if (!l) return;
    for (let i = 0; i < l.length; i++) { try { l[i](data); } catch (e) { console.error(`[event ${evt}]`, e); } }
  },
};
window.__game = game;

// Perk modifiers. perks.js owns the values; readers treat them as plain numbers (always present).
export const MOD_DEFAULTS = {
  damageMult: 1, headshotMult: 1, fireRateMult: 1, reloadMult: 1, ammoSaveChance: 0, igniteChance: 0,  // weapons.js
  moveMult: 1, extraJumps: 0, damageTakenMult: 1,                                                       // player.js
  cooldownMult: 1, blastMult: 1,                                                                         // skills.js
  dropMult: 1,                                                                                           // loot.js
};
function resetMods() { game.mods = Object.assign({}, MOD_DEFAULTS); }
resetMods();

// Init order matters: later modules may read earlier ones during init.
const order = [['audio', Audio], ['world', World], ['player', Player], ['weapons', Weapons], ['zombies', Zombies], ['loot', Loot], ['hud', Hud], ['skills', Skills], ['build', Build], ['extras', Extras], ['perks', Perks]];
for (const [name, mod] of order) game[name] = mod.init(game) || {};
const updateOrder = ['player', 'weapons', 'zombies', 'loot', 'skills', 'build', 'extras', 'perks', 'world', 'hud', 'audio'];

// ---------------------------------------------------------------- phases
function setPhase(phase) {
  game.phase = phase;
  game.phaseTime = 0;
  if (phase === 'night') {
    game.night += 1;
    game.phaseDuration = Math.min(CONFIG.phases.nightMax, CONFIG.phases.night + (game.night - 1) * CONFIG.phases.nightGrowth);
    game.zombies.startNight(game.night);
  } else {
    game.phaseDuration = CONFIG.phases.day;
    if (game.night > 0) {
      game.stats.nightsSurvived = game.night;
      game.zombies.endNight();
      game.loot.respawnDay();
    }
  }
  recomputeScore();
  game.emit('phase', { phase, night: game.night });
  // after 'phase', so the HUD announces NIGHT n first and the supply drop second
  if (phase === 'night') game.loot.spawnAirdrop();
}

function computeDayFactor() {
  const tr = CONFIG.phases.transition, t = game.phaseTime, d = game.phaseDuration;
  const s = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  if (game.phase === 'day') {
    const rise = game.night === 0 ? 1 : 0.5 + 0.5 * s(t / tr);
    const fall = 0.5 + 0.5 * s((d - t) / tr);
    return Math.min(rise, fall);
  }
  const fall = 0.5 - 0.5 * s(t / tr);
  const rise = 0.5 - 0.5 * s((d - t) / tr);
  return Math.max(fall, rise);
}

function recomputeScore() {
  const s = game.stats, c = CONFIG.score;
  s.score = s.kills * c.kill + s.headshots * c.headshot + s.nightsSurvived * c.night + (s.bonus || 0);
}

game.on('zombieKilled', (e) => {
  if (game.state !== 'playing') return;   // fire / barrel kills behind the game-over card must not change the final stats
  game.stats.kills += 1;
  if (e && e.headshot) game.stats.headshots += 1;
  // the Hollow King is worth its own score on top of the normal kill
  if (e && e.boss) game.stats.bonus = (game.stats.bonus || 0) + ((CONFIG.zombies.boss && CONFIG.zombies.boss.score) || 0);
  recomputeScore();
});
game.on('playerDied', () => {
  if (game.state !== 'playing') return;
  game.state = 'dead';
  recomputeScore();
  if (document.pointerLockElement) document.exitPointerLock();
  game.emit('gameOver', { stats: { ...game.stats }, night: game.night });
});

// ---------------------------------------------------------------- start / restart / pause
const startEl = document.getElementById('start');
const pauseEl = document.getElementById('pause');

game.start = function start() {
  resetMods(); game.choosing = false;
  for (const name of ['world', 'player', 'weapons', 'zombies', 'loot', 'hud', 'audio', 'skills', 'build', 'extras', 'perks']) {
    if (game[name] && game[name].reset) game[name].reset();
  }
  game.stats.kills = 0; game.stats.headshots = 0; game.stats.nightsSurvived = 0; game.stats.score = 0; game.stats.bonus = 0;
  game.time = 0; game.night = 0; game.phase = 'day'; game.phaseTime = 0;
  game.phaseDuration = CONFIG.phases.firstDay; game.dayFactor = 1;
  game.state = 'playing'; game.paused = false;
  startEl.classList.add('hidden'); pauseEl.classList.add('hidden');
  if (game.audio.resume) game.audio.resume();
  if (!game.debug.noLock && game.player.lock) game.player.lock();
  game.emit('gameStart');
  game.emit('phase', { phase: 'day', night: 0 });
};
game.restart = game.start;

function setPaused(on) {
  game.paused = on;
  pauseEl.classList.toggle('hidden', !on);
}
const FREE_LOOK_HINT = 'No mouse capture here: move the mouse to look, Esc pauses';

document.getElementById('start-btn').addEventListener('click', () => game.start());
pauseEl.addEventListener('click', () => {
  if (game.state !== 'playing') return;
  if (game.player.freeLook) setPaused(false);
  else if (game.player.lock) game.player.lock();
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (game.state === 'playing' && !game.debug.noLock && !game.player.freeLook) setPaused(!locked);
});
// A refused lock request (Esc cool-down) pauses instead of leaving the run ticking with dead controls.
game.on('lockFailed', () => {
  if (game.state === 'playing' && !game.debug.noLock && document.pointerLockElement !== canvas) setPaused(true);
});
// Where the mouse can never be captured (embedded viewers) player.js switches to free-look; Esc then
// pauses through the handler below because no pointerlockchange will ever arrive.
game.on('freeLook', () => {
  if (game.state === 'playing') { setPaused(false); game.emit('toast', FREE_LOOK_HINT); }
});
game.on('gameStart', () => { if (game.player.freeLook) game.emit('toast', FREE_LOOK_HINT); });
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || e.repeat) return;
  if (game.state === 'playing' && game.player.freeLook && !game.debug.noLock) setPaused(!game.paused);
});

// ---------------------------------------------------------------- debug hooks (used by automated checks)
Object.assign(game.debug, {
  skipToNight() { if (game.phase === 'day') game.phaseTime = game.phaseDuration; },
  skipToDay() { if (game.phase === 'night') game.phaseTime = game.phaseDuration; },
  spawnWave(n = 20, type = 'walker') {
    for (let i = 0; i < n; i++) game.zombies.spawn(type, game.world.randomSpawnPoint(18, 40));
  },
  giveGatling() { game.weapons.give('gatling'); game.weapons.addAmmo('belt', 400); },
  giveAll() {
    // three gun slots: clear them first so all three land (give() would otherwise replace the held gun)
    for (let i = 1; i <= 3; i++) game.weapons.slots[i] = null;
    for (const id of ['smg', 'rifle', 'shotgun']) game.weapons.give(id);
    for (const t of Object.keys(CONFIG.ammoTypes)) game.weapons.addAmmo(t, 300);
  },
  airdrop() { game.loot.spawnAirdrop(); },
  spawnBoss() { return game.zombies.spawnBoss && game.zombies.spawnBoss(); },
  giveFlamethrower() { game.weapons.give('flamethrower'); game.weapons.addAmmo('fuel', 300); },
  giveRocket() { game.weapons.give('rocket'); game.weapons.addAmmo('rockets', 12); },
  offerPerks(legendary) { return game.perks.offer && game.perks.offer(!!legendary); },
  givePerk(id) { return game.perks.grant && game.perks.grant(id); },
});

// ---------------------------------------------------------------- loop
const failed = new Set();
function safeUpdate(name, dt) {
  const m = game[name];
  if (!m || !m.update) return;
  try { m.update(dt); } catch (e) {
    if (!failed.has(name)) { failed.add(name); console.error(`[${name}.update] failed`, e); }
  }
}

const clock = new THREE.Clock();
let menuAngle = 0;
game.frameMs = 16;

function fitViewport() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  if (w === viewW && h === viewH) return;
  viewW = w; viewH = h;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h);
}

function frame() {
  requestAnimationFrame(frame);
  fitViewport();
  const raw = clock.getDelta();
  const dt = Math.min(0.05, raw);
  game.frameMs += (raw * 1000 - game.frameMs) * 0.05;

  if (game.state === 'playing' && !game.paused && !game.choosing) {
    game.time += dt;
    game.phaseTime += dt;
    if (game.phaseTime >= game.phaseDuration) setPhase(game.phase === 'day' ? 'night' : 'day');
    game.dayFactor = computeDayFactor();
    for (const name of updateOrder) safeUpdate(name, dt);
  } else {
    if (game.state === 'menu') {
      // slow orbit over the island behind the start screen
      menuAngle += dt * 0.05;
      const r = 150;
      camera.position.set(Math.cos(menuAngle) * r, 70, Math.sin(menuAngle) * r);
      camera.lookAt(0, 8, 0);
      game.dayFactor = 0.5 + 0.5 * Math.sin(menuAngle * 2.0);
    }
    // keep lighting, HUD and ambience alive while not simulating
    if (game.state === 'dead') { safeUpdate('zombies', dt); safeUpdate('loot', dt); safeUpdate('extras', dt); }   // the horde keeps moving behind the game-over card
    safeUpdate('world', dt); safeUpdate('hud', dt); safeUpdate('audio', dt);
    if (game.state !== 'playing') game.buildMode = false;
  }
  composer.render();
}

window.addEventListener('resize', fitViewport);

requestAnimationFrame(frame);
