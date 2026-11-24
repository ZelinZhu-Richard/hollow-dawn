// HOLLOW DAWN — audio. Everything is synthesised with the Web Audio API (no files).
// The AudioContext is created lazily in resume(); before that every call is a no-op.

const GUNS = {
  pistol:  { crackF: 2600, crackD: 0.028, crack: 0.9,  bodyType: 'bandpass', bodyF: 1300, bodyF1: 420, bodyD: 0.10,  body: 0.8,  thumpF: 190, thumpF1: 58, thumpD: 0.08, thump: 0.7,  tailF: 1900, tailD: 0.28, tail: 0.16 },
  smg:     { crackF: 3200, crackD: 0.018, crack: 0.75, bodyType: 'bandpass', bodyF: 1700, bodyF1: 650, bodyD: 0.065, body: 0.6,  thumpF: 230, thumpF1: 85, thumpD: 0.05, thump: 0.5,  tailF: 2200, tailD: 0.16, tail: 0.09 },
  shotgun: { crackF: 1500, crackD: 0.045, crack: 1.0,  bodyType: 'lowpass',  bodyF: 2600, bodyF1: 260, bodyD: 0.30,  body: 1.1,  thumpF: 125, thumpF1: 36, thumpD: 0.24, thump: 1.1,  tailF: 1300, tailD: 0.8,  tail: 0.32 },
  rifle:   { crackF: 2300, crackD: 0.024, crack: 1.0,  bodyType: 'bandpass', bodyF: 950,  bodyF1: 330, bodyD: 0.12,  body: 0.9,  thumpF: 160, thumpF1: 50, thumpD: 0.10, thump: 0.85, tailF: 1700, tailD: 0.42, tail: 0.2 },
  sniper:  { crackF: 1800, crackD: 0.04,  crack: 1.1,  bodyType: 'lowpass',  bodyF: 3200, bodyF1: 220, bodyD: 0.36,  body: 1.1,  thumpF: 115, thumpF1: 30, thumpD: 0.32, thump: 1.2,  tailF: 1500, tailD: 1.5,  tail: 0.4 },
};

const MAX_VOICES = 30;
const REF_DIST = 11;      // metres at which a positional sound is at half power
const MAX_DIST = 85;
const EMPTY = Object.freeze({});
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rnd = (a, b) => a + Math.random() * (b - a);

export function init(game) {
  const CONFIG = game.CONFIG;
  let ctx = null, broken = false;
  let master = null, comp = null, deadLP = null, sfxBus = null, gunIn = null, ambBus = null;
  let noiseBuf = null, brownBuf = null;
  let masterVol = 0.85;

  const voices = [];
  const last = Object.create(null);     // rate-limit timestamps
  const sp = { vol: 1, pan: 0, lp: 0 };
  const SOUNDS = Object.create(null);

  // continuous layers
  let wind = null, drone = null, whine = null, gat = null, flame = null;
  let gatUntil = 0, gatOn = false;
  let flameUntil = 0, flameOn = false;
  let ambT = 0, birdT = 2, hbT = 0, clock = 0;
  let lastSpin = -1, wasDead = false, stepFlip = 1;
  const crickets = [{ t: 0.4, f: 4400, pan: -0.6 }, { t: 0.9, f: 4780, pan: 0.2 }, { t: 1.3, f: 4150, pan: 0.7 }];

  // ---------------------------------------------------------------- node helpers
  function mkGain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function bq(type, f, q) {
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q == null ? 0.7 : q; return fl;
  }
  function mkOsc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
  function loopSrc(buf, rate) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1; s.start(); return s;
  }
  function envAD(param, t, peak, a, d) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  // Filtered noise burst with an attack/decay envelope.
  function noise(out, t, dur, gain, type, f, f1, q, a) {
    a = a || 0.001;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const g = ctx.createGain(); envAD(g.gain, t, gain, a, dur);
    if (type) {
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q || 0.7;
      fl.frequency.setValueAtTime(f, t);
      if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
      src.connect(fl); fl.connect(g);
    } else src.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + a + dur + 0.03);
  }
  // Oscillator with an optional pitch sweep and an attack/decay envelope.
  function tone(out, t, dur, gain, type, f, f1, a, sweep) {
    a = a || 0.002;
    const o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (sweep || (a + dur)));
    const g = ctx.createGain(); envAD(g.gain, t, gain, a, dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + a + dur + 0.03);
  }
  function limit(key, sec) {
    const now = ctx.currentTime;
    if (now - (last[key] || -99) < sec) return false;
    last[key] = now; return true;
  }
  function ready() { return !!ctx && ctx.state === 'running'; }

  // ---------------------------------------------------------------- graph construction
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio API not available');
    ctx = new AC({ latencyHint: 'interactive' });
    const sr = ctx.sampleRate;

    master = mkGain(masterVol);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 7; comp.attack.value = 0.003; comp.release.value = 0.2;
    deadLP = bq('lowpass', 20000, 0.4);
    deadLP.connect(comp); comp.connect(master); master.connect(ctx.destination);

    // white noise
    noiseBuf = ctx.createBuffer(1, Math.floor(sr * 2), sr);
    let d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // brown noise (wind), drift removed so the loop point is seamless
    brownBuf = ctx.createBuffer(1, Math.floor(sr * 4), sr);
    d = brownBuf.getChannelData(0);
    let acc = 0;
    for (let i = 0; i < d.length; i++) { acc = (acc + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = acc * 3.5; }
    const drift = d[d.length - 1] - d[0];
    for (let i = 0; i < d.length; i++) d[i] -= drift * (i / d.length);

    // short outdoor tail (generated impulse response)
    const irLen = Math.floor(sr * 1.7);
    const ir = ctx.createBuffer(2, irLen, sr);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen;
        lp += ((Math.random() * 2 - 1) - lp) * (0.5 - 0.42 * t);
        x[i] = lp * Math.pow(1 - t, 3.2) * (i < 300 ? i / 300 : 1);
      }
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const revOut = mkGain(0.55); conv.connect(revOut); revOut.connect(deadLP);

    sfxBus = mkGain(0.8); sfxBus.connect(deadLP);
    const sfxRev = mkGain(0.16); sfxBus.connect(sfxRev); sfxRev.connect(conv);

    // gun bus: soft saturation for punch
    gunIn = mkGain(0.75);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024), drive = 2.2, norm = Math.tanh(drive);
    for (let i = 0; i < 1024; i++) curve[i] = Math.tanh((i / 511.5 - 1) * drive) / norm;
    shaper.curve = curve; shaper.oversample = '2x';
    const gunOut = mkGain(0.62);
    gunIn.connect(shaper); shaper.connect(gunOut); gunOut.connect(deadLP);
    const gunRev = mkGain(0.3); gunOut.connect(gunRev); gunRev.connect(conv);

    ambBus = mkGain(1); ambBus.connect(deadLP);

    buildAmbience();
    buildWhine();
    buildGatling(sr);
    buildFlame(sr);
  }

  // Flamethrower roar: always-running loops behind one gain that is eased up/down (no clicks).
  // Hiss (white noise, wobbling low-pass) + low rumble (brown noise) + sparse crackle.
  function buildFlame(sr) {
    const fg = mkGain(0);
    const lp = bq('lowpass', 1500, 0.9), hg = mkGain(0.75);
    loopSrc(noiseBuf, 0.85).connect(lp); lp.connect(hg); hg.connect(fg);
    const wob = mkOsc('sine', 4.3), wobG = mkGain(420); wob.connect(wobG); wobG.connect(lp.frequency);
    const wob2 = mkOsc('triangle', 1.7), wob2G = mkGain(180); wob2.connect(wob2G); wob2G.connect(lp.frequency);
    const rl = bq('lowpass', 240, 0.8), rg = mkGain(1.6);
    loopSrc(brownBuf, 1.7).connect(rl); rl.connect(rg); rg.connect(fg);
    const len = Math.floor(sr * 1.5), cb = ctx.createBuffer(1, len, sr), d = cb.getChannelData(0);
    let env = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.0011) env = 0.4 + Math.random() * 0.6;
      env *= 0.985;
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const cbp = bq('bandpass', 2600, 0.8), cg = mkGain(0.5);
    loopSrc(cb, 1).connect(cbp); cbp.connect(cg); cg.connect(fg);
    fg.connect(sfxBus);
    flame = { g: fg };
  }

  function buildAmbience() {
    // wind: brown noise through a slowly moving low-pass + a faint whistle band
    const lp = bq('lowpass', 420, 0.6), g = mkGain(0);
    loopSrc(brownBuf, 1).connect(lp); lp.connect(g); g.connect(ambBus);
    const bp = bq('bandpass', 850, 2.2), g2 = mkGain(0);
    loopSrc(noiseBuf, 0.7).connect(bp); bp.connect(g2); g2.connect(ambBus);
    wind = { lp, g, bp, g2 };

    // night: low beating drone + a cold, barely-there pad
    const dlp = bq('lowpass', 240, 0.7), dg = mkGain(0);
    dlp.connect(dg); dg.connect(ambBus);
    const parts = [['sine', 55, 0.5], ['sine', 55.7, 0.45], ['triangle', 82.6, 0.22], ['sawtooth', 27.5, 0.12]];
    for (let i = 0; i < parts.length; i++) {
      const og = mkGain(parts[i][2]); mkOsc(parts[i][0], parts[i][1]).connect(og); og.connect(dlp);
    }
    const pg = mkGain(0);
    mkOsc('sine', 261.6).connect(pg); mkOsc('sine', 263.2).connect(pg); mkOsc('sine', 392.4).connect(pg);
    pg.connect(ambBus);
    drone = { g: dg, pad: pg };
  }

  function buildWhine() {
    const o1 = mkOsc('sawtooth', 70), o2 = mkOsc('square', 105), o3 = mkOsc('sawtooth', 10);
    const bp = bq('bandpass', 300, 1.4), lp = bq('lowpass', 260, 0.7), g = mkGain(0), g3 = mkGain(0), o2g = mkGain(0.35);
    o1.connect(bp); o2.connect(o2g); o2g.connect(bp); bp.connect(g); g.connect(sfxBus);
    o3.connect(lp); lp.connect(g3); g3.connect(sfxBus);
    whine = { o1, o2, o3, bp, g, g3 };
  }

  // One looped buffer holding eight synthesised rounds at the gatling's fire rate:
  // constant cost no matter how many 'shot' events arrive per second.
  function buildGatling(sr) {
    const rate = ((CONFIG.weapons.gatling && CONFIG.weapons.gatling.rpm) || 1500) / 60;
    const per = Math.max(64, Math.round(sr / rate)), n = 8;
    const buf = ctx.createBuffer(1, per * n, sr), d = buf.getChannelData(0);
    for (let s = 0; s < n; s++) {
      const amp = 0.85 + Math.random() * 0.3, f0 = 150 + Math.random() * 45;
      let lp = 0, lp2 = 0, ph = 0;
      for (let i = 0; i < per; i++) {
        const t = i / sr, w = Math.random() * 2 - 1;
        lp += (w - lp) * 0.35; lp2 += (w - lp2) * 0.06;
        ph += 6.2832 * (f0 * Math.exp(-t * 22) + 48) / sr;
        const v = (w - lp) * Math.exp(-t / 0.004) * 0.9 + lp * Math.exp(-t / 0.014) + lp2 * Math.exp(-t / 0.03) * 1.6 + Math.sin(ph) * Math.exp(-t / 0.022) * 0.9;
        d[s * per + i] = Math.tanh(v * amp * 1.4) * 0.8;
      }
    }
    const hs = bq('highshelf', 3500, 0.7); hs.gain.value = 3;
    const g = mkGain(0);
    loopSrc(buf, 1).connect(hs); hs.connect(g); g.connect(gunIn);
    gat = { g };
  }

  // ---------------------------------------------------------------- voices
  function spatial(pos) {
    const p = game.player;
    sp.vol = 1; sp.pan = 0; sp.lp = 0;
    if (!pos || !p || !p.position) return true;
    const dx = pos.x - p.position.x, dz = pos.z - p.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > MAX_DIST) return false;
    const k = dist / REF_DIST;
    sp.vol = 1 / (1 + k * k);
    if (dist > 0.05) {
      const yaw = p.yaw || 0;
      // right vector for yaw is (cos yaw, 0, -sin yaw)
      sp.pan = ((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist) * Math.min(1, dist / 2.5) * 0.85;
    }
    if (dist > 6) sp.lp = Math.max(900, 16000 / (1 + (dist - 6) / 14));
    return true;
  }

  function openVoice(bus, vol, pan, lp, prio) {
    if (voices.length >= MAX_VOICES) {
      if (!prio) return null;
      let oi = 0;
      for (let i = 1; i < voices.length; i++) if (voices[i].end < voices[oi].end) oi = i;
      try { voices[oi].node.disconnect(); } catch (e) { /* ignore */ }
      voices[oi] = voices[voices.length - 1]; voices.pop();
    }
    const g = ctx.createGain(); g.gain.value = vol;
    let tail = g;
    if (lp) { const f = bq('lowpass', lp, 0.5); tail.connect(f); tail = f; }
    if (pan && ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner(); pn.pan.value = pan < -1 ? -1 : pan > 1 ? 1 : pan; tail.connect(pn); tail = pn;
    }
    tail.connect(bus);
    const v = { node: tail, end: ctx.currentTime + 1 };
    voices.push(v);
    return { out: g, v };
  }

  function play(name, opts) {
    if (!ready()) return;
    opts = opts || EMPTY;
    if (name === 'shot') {
      const id = opts.weaponId;
      if (id === 'bat') return;
      if (id === 'gatling') { gatlingShot(); return; }
      if (id === 'flamethrower') { flameShot(); return; }
      name = SOUNDS['shot_' + id] ? 'shot_' + id : 'shot_rifle';
    } else if (name === 'phase') name = opts.phase === 'night' ? 'dusk' : 'dawn';
    else if (name === 'melee') name = opts.hit ? 'melee_hit' : 'melee_swing';
    const def = SOUNDS[name];
    if (!def) return;
    let vol = opts.volume == null ? 1 : opts.volume, pan = opts.pan || 0, lp = 0;
    if (opts.position) {
      if (!spatial(opts.position)) return;
      vol *= def.far ? Math.min(1, Math.max(0.22, sp.vol * 4)) : sp.vol;
      pan = sp.pan; lp = def.far ? 0 : sp.lp;
      if (vol < 0.004) return;
    }
    try {
      const h = openVoice(def.gun ? gunIn : sfxBus, vol, pan, lp, def.prio);
      if (!h) return;
      const dur = def.fn(h.out, ctx.currentTime, opts) || 0.5;
      h.v.end = ctx.currentTime + dur + 0.15;
    } catch (e) { /* never let a sound break the game */ }
  }

  function def(name, fn, flags) {
    SOUNDS[name] = { fn, gun: !!(flags && flags.gun), prio: !!(flags && flags.prio), far: !!(flags && flags.far) };
  }

  // ---------------------------------------------------------------- sound designs
  function gunShot(out, t, p) {
    const v = 0.95 + Math.random() * 0.1;
    noise(out, t, p.crackD, p.crack, 'highpass', p.crackF * v, 0, 0.7);                 // crack
    noise(out, t, p.bodyD, p.body, p.bodyType, p.bodyF * v, p.bodyF1, 0.9);              // body
    tone(out, t, p.thumpD, p.thump, 'sine', p.thumpF * v, p.thumpF1, 0.001);             // chest thump
    noise(out, t + 0.012, p.tailD, p.tail, 'lowpass', p.tailF, p.tailF * 0.3, 0.5, 0.012); // tail
    return p.tailD + 0.06;
  }
  const GUN = { gun: true, prio: true };
  def('shot_pistol', (o, t) => gunShot(o, t, GUNS.pistol), GUN);
  def('shot_smg', (o, t) => gunShot(o, t, GUNS.smg), GUN);
  def('shot_rifle', (o, t) => gunShot(o, t, GUNS.rifle), GUN);
  def('shot_shotgun', (o, t) => {
    gunShot(o, t, GUNS.shotgun);
    noise(o, t + 0.34, 0.03, 0.28, 'bandpass', 1400, 0, 2.5);     // pump back
    noise(o, t + 0.48, 0.035, 0.34, 'bandpass', 1000, 0, 2.5);    // pump forward
    tone(o, t + 0.48, 0.03, 0.14, 'square', 180, 120);
    return 0.9;
  }, GUN);
  def('shot_sniper', (o, t) => {
    gunShot(o, t, GUNS.sniper);
    noise(o, t + 0.24, 0.55, 0.2, 'lowpass', 700, 240, 0.5, 0.03);  // far slapback
    noise(o, t + 0.6, 0.03, 0.22, 'bandpass', 1500, 0, 2.5);         // bolt up
    noise(o, t + 0.82, 0.035, 0.28, 'bandpass', 1100, 0, 2.5);       // bolt home
    return 1.6;
  }, GUN);
  def('shot_gatling', (o, t) => {
    const v = rnd(0.9, 1.1);
    noise(o, t, 0.014, 0.5, 'highpass', 2600 * v, 0, 0.7);
    noise(o, t, 0.04, 0.4, 'bandpass', 1000 * v, 500, 0.9);
    return 0.08;
  }, { gun: true });
  def('gatling_tail', (o, t) => {
    noise(o, t, 0.7, 0.5, 'lowpass', 1600, 300, 0.5, 0.005);
    tone(o, t, 0.25, 0.4, 'sine', 90, 40, 0.002);
    return 0.75;
  }, GUN);

  // ---- flamethrower one-shots (the roar itself is the loop in buildFlame)
  def('flame_ignite', (o, t) => {
    noise(o, t, 0.012, 0.5, 'highpass', 3800, 0, 0.7);                       // igniter tick
    noise(o, t + 0.01, 0.28, 0.9, 'bandpass', 320, 2600, 0.9, 0.04);         // whoosh
    tone(o, t + 0.01, 0.22, 0.7, 'sine', 150, 55, 0.01);                     // gulp of fuel catching
    noise(o, t + 0.02, 0.35, 0.45, 'lowpass', 900, 250, 0.6, 0.02);
    return 0.45;
  }, { prio: true });
  def('flame_tail', (o, t) => {
    noise(o, t, 0.4, 0.42, 'lowpass', 1300, 180, 0.6, 0.004);
    tone(o, t, 0.12, 0.3, 'sine', 110, 50, 0.004);                           // valve shuts
    noise(o, t + 0.05, 0.02, 0.2, 'bandpass', 1800, 0, 2);
    return 0.5;
  });
  // ---- rocket launcher
  def('shot_rocket', (o, t) => {
    tone(o, t, 0.55, 1.3, 'sine', 95, 28, 0.002);                            // chest thump
    noise(o, t, 0.08, 1.0, 'highpass', 1800, 0, 0.7);                        // crack
    noise(o, t, 0.9, 1.0, 'lowpass', 2600, 180, 0.6, 0.004);                 // back-blast
    noise(o, t + 0.03, 0.85, 0.55, 'bandpass', 520, 2800, 1.1, 0.06);        // motor whoosh away
    noise(o, t + 0.18, 1.3, 0.3, 'lowpass', 900, 220, 0.5, 0.05);            // tail
    return 1.6;
  }, GUN);

  def('melee_swing', (o, t) => {
    noise(o, t, 0.2, 0.4, 'bandpass', 420, 1700, 1.6, 0.05);
    return 0.28;
  });
  def('melee_hit', (o, t) => {
    noise(o, t, 0.16, 0.3, 'bandpass', 420, 1700, 1.6, 0.03);
    tone(o, t + 0.05, 0.12, 0.9, 'sine', 120, 48, 0.002);
    noise(o, t + 0.05, 0.09, 0.7, 'lowpass', 900, 250, 0.7);
    noise(o, t + 0.05, 0.03, 0.3, 'bandpass', 2200, 0, 1.5);
    return 0.3;
  }, { prio: true });
  def('dryFire', (o, t) => {
    noise(o, t, 0.008, 0.5, 'highpass', 3500, 0, 0.7);
    tone(o, t, 0.012, 0.14, 'square', 1400, 900);
    tone(o, t, 0.02, 0.2, 'sine', 320, 0);
    return 0.06;
  });
  def('reloadStart', (o, t, e) => {
    const m = e.weaponId === 'gatling' ? 0.6 : e.weaponId === 'shotgun' ? 0.8 : 1;
    noise(o, t, 0.02, 0.5, 'bandpass', 1800 * m, 0, 2);
    tone(o, t, 0.015, 0.18, 'square', 220 * m, 0);
    noise(o, t + 0.12, 0.09, 0.2, 'bandpass', 900 * m, 500 * m, 1.2, 0.01);
    return 0.26;
  });
  def('reloadEnd', (o, t, e) => {
    const m = e.weaponId === 'gatling' ? 0.6 : e.weaponId === 'shotgun' ? 0.8 : 1;
    noise(o, t, 0.025, 0.6, 'bandpass', 1200 * m, 0, 2);
    tone(o, t, 0.04, 0.4, 'sine', 160 * m, 90 * m);
    noise(o, t + 0.14, 0.018, 0.5, 'highpass', 2200 * m, 0, 0.7);
    noise(o, t + 0.22, 0.022, 0.6, 'bandpass', 1500 * m, 0, 2);
    tone(o, t + 0.22, 0.03, 0.3, 'triangle', 240 * m, 150 * m);
    return 0.32;
  });
  def('weaponSwitch', (o, t) => {
    noise(o, t, 0.1, 0.14, 'bandpass', 600, 1500, 1.2, 0.02);
    noise(o, t + 0.07, 0.012, 0.3, 'highpass', 2000, 0, 0.7);
    return 0.16;
  });
  def('hit', (o, t, e) => {
    noise(o, t, 0.012, 0.45, 'highpass', 3000, 0, 0.7);
    tone(o, t, 0.035, 0.35, 'triangle', 900, 480, 0.001);
    if (e.killed) tone(o, t + 0.02, 0.12, 0.25, 'triangle', 660, 420, 0.002);
    return 0.16;
  });
  def('headshot', (o, t) => {
    noise(o, t, 0.012, 0.4, 'highpass', 3500, 0, 0.7);
    tone(o, t, 0.2, 0.34, 'sine', 1560, 0, 0.001);
    tone(o, t, 0.13, 0.16, 'sine', 2345, 0, 0.001);
    tone(o, t, 0.05, 0.3, 'triangle', 780, 520, 0.001);
    return 0.24;
  }, { prio: true });

  // ---- zombies
  function zMult(e) {
    const type = (e.zombie && e.zombie.type) || e.type || 'walker';
    return type === 'brute' ? 0.56 : type === 'runner' ? 1.5 : type === 'spitter' ? 1.2 : 1;
  }
  def('zombieGroan', (out, t, e) => {
    const m = zMult(e), rm = Math.sqrt(m);
    const dur = rnd(0.8, 1.6) * (m > 1.4 ? 0.6 : 1);
    const f0 = rnd(70, 100) * m, f1 = f0 * rnd(1.15, 1.4), peakT = t + dur * rnd(0.25, 0.45), end = t + dur;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(f0, t); o1.frequency.linearRampToValueAtTime(f1, peakT); o1.frequency.linearRampToValueAtTime(f0 * 0.78, end);
    o2.frequency.setValueAtTime(f0 * 1.013, t); o2.frequency.linearRampToValueAtTime(f1 * 1.013, peakT); o2.frequency.linearRampToValueAtTime(f0 * 0.79, end);
    lfo.frequency.value = m === 1.2 ? 17 : rnd(5, 10);
    const lg = mkGain(f0 * 0.07); lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const b1 = bq('bandpass', 430 * rm, 4), b2 = bq('bandpass', 1150 * rm, 6), b2g = mkGain(0.5);
    b1.frequency.setValueAtTime(430 * rm, t); b1.frequency.linearRampToValueAtTime(720 * rm, peakT); b1.frequency.linearRampToValueAtTime(380 * rm, end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.5, t + 0.1);
    g.gain.linearRampToValueAtTime(1.0, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, end);
    o1.connect(b1); o2.connect(b1); o1.connect(b2); b1.connect(g); b2.connect(b2g); b2g.connect(g); g.connect(out);
    o1.start(t); o2.start(t); lfo.start(t); o1.stop(end + 0.05); o2.stop(end + 0.05); lfo.stop(end + 0.05);
    noise(out, t, dur * 0.8, 0.14, 'bandpass', 900 * m, 500 * m, 1.5, 0.1);   // breath
    return dur;
  });
  def('zombieAttack', (out, t, e) => {
    const m = zMult(e);
    const o1 = ctx.createOscillator(), lfo = ctx.createOscillator();
    o1.type = 'sawtooth'; o1.frequency.setValueAtTime(170 * m, t); o1.frequency.exponentialRampToValueAtTime(85 * m, t + 0.26);
    lfo.type = 'square'; lfo.frequency.value = 31;
    const am = mkGain(0.6), lg = mkGain(0.4); lfo.connect(lg); lg.connect(am.gain);
    const bp = bq('bandpass', 950 * Math.sqrt(m), 3), g = ctx.createGain();
    envAD(g.gain, t, 1.3, 0.02, 0.26);
    o1.connect(bp); bp.connect(am); am.connect(g); g.connect(out);
    o1.start(t); lfo.start(t); o1.stop(t + 0.34); lfo.stop(t + 0.34);
    noise(out, t, 0.12, 0.35, 'bandpass', 1200, 3000, 1.4, 0.02);            // swipe
    return 0.36;
  });
  def('zombieKilled', (out, t, e) => {
    const m = zMult(e);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(125 * m, t); o1.frequency.exponentialRampToValueAtTime(46 * m, t + 0.42);
    const bp = bq('bandpass', 620, 2.5), g = ctx.createGain();
    bp.frequency.setValueAtTime(620, t); bp.frequency.exponentialRampToValueAtTime(240, t + 0.42);
    envAD(g.gain, t, 1.2, 0.015, 0.42);
    o1.connect(bp); bp.connect(g); g.connect(out); o1.start(t); o1.stop(t + 0.5);
    noise(out, t, 0.12, 0.55, 'lowpass', 950, 300, 0.8);                      // wet burst
    tone(out, t + 0.3, 0.14, 0.5, 'sine', 80, 40, 0.003);                     // body drops
    return 0.5;
  });

  // ---- player
  def('playerHit', (o, t) => {
    tone(o, t, 0.16, 0.9, 'sine', 110, 48, 0.002);
    noise(o, t, 0.12, 0.6, 'lowpass', 700, 200, 0.7);
    noise(o, t, 0.05, 0.22, 'bandpass', 1800, 0, 1.2);
    return 0.22;
  }, { prio: true });
  def('playerDied', (out, t) => {
    const lp = bq('lowpass', 1200, 0.7), g = ctx.createGain();
    lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(180, t + 2.4);
    envAD(g.gain, t, 0.4, 0.05, 2.6);
    const fs = [196, 147.5, 98.4];
    for (let i = 0; i < fs.length; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(fs[i], t); o.frequency.exponentialRampToValueAtTime(fs[i] * 0.27, t + 2.4);
      o.connect(lp); o.start(t); o.stop(t + 2.8);
    }
    lp.connect(g); g.connect(out);
    tone(out, t, 1.2, 0.95, 'sine', 70, 28, 0.004);
    noise(out, t, 0.5, 0.4, 'lowpass', 500, 120, 0.6);
    return 2.8;
  }, { prio: true });
  def('heartbeat', (o, t) => {
    tone(o, t, 0.11, 0.95, 'sine', 62, 40, 0.004);
    tone(o, t + 0.19, 0.13, 0.7, 'sine', 54, 36, 0.004);
    return 0.36;
  });
  def('step', (o, t, e) => {
    const s = e.sprint ? 1.35 : 1;
    noise(o, t, 0.07, 0.34 * s, 'lowpass', rnd(300, 430), 120, 0.8);
    noise(o, t, 0.04, 0.06 * s, 'bandpass', rnd(2000, 2800), 0, 0.7);
    return 0.1;
  });
  def('jump', (o, t) => { noise(o, t, 0.12, 0.18, 'bandpass', 500, 1400, 1.2, 0.02); return 0.16; });
  def('land', (o, t) => {
    tone(o, t, 0.12, 0.6, 'sine', 95, 45, 0.002);
    noise(o, t, 0.09, 0.45, 'lowpass', 500, 160, 0.7);
    return 0.16;
  });
  def('pickup', (o, t, e) => {
    const k = e.kind;
    if (k === 'weapon') {
      noise(o, t, 0.015, 0.4, 'highpass', 2500, 0, 0.7);
      noise(o, t + 0.07, 0.02, 0.45, 'bandpass', 1300, 0, 2);
      tone(o, t + 0.07, 0.16, 0.22, 'triangle', 520, 0); tone(o, t + 0.15, 0.2, 0.2, 'triangle', 780, 0);
    } else if (k === 'ammo') {
      noise(o, t, 0.012, 0.35, 'highpass', 3000, 0, 0.7); noise(o, t + 0.05, 0.012, 0.3, 'highpass', 3400, 0, 0.7);
      tone(o, t + 0.05, 0.12, 0.2, 'triangle', 880, 0);
    } else if (k === 'med') {
      tone(o, t, 0.14, 0.2, 'sine', 587, 0); tone(o, t + 0.09, 0.22, 0.2, 'sine', 880, 0);
    } else if (k === 'armor') {
      noise(o, t, 0.15, 0.22, 'bandpass', 800, 2400, 1.4, 0.02); tone(o, t + 0.1, 0.16, 0.18, 'triangle', 440, 0);
    } else if (k === 'scrap') {
      tone(o, t, 0.1, 0.16, 'sine', 700, 0, 0.001); tone(o, t, 0.07, 0.12, 'sine', 1130, 0, 0.001); tone(o, t, 0.05, 0.08, 'sine', 1870, 0, 0.001);
      noise(o, t, 0.02, 0.25, 'bandpass', 2600, 0, 2);
    } else {
      tone(o, t, 0.1, 0.2, 'triangle', 660, 990);
    }
    return 0.4;
  });
  def('healStart', (o, t, e) => {
    noise(o, t, 0.25, 0.18, 'bandpass', 1500, 3000, 1.2, 0.03);
    noise(o, t + 0.32, 0.14, 0.14, 'bandpass', 1900, 3400, 1.2, 0.02);
    if (e.id === 'medkit') { noise(o, t + 0.5, 0.015, 0.3, 'highpass', 2600, 0, 0.7); noise(o, t + 0.58, 0.015, 0.25, 'highpass', 3000, 0, 0.7); }
    return 0.65;
  });
  def('healEnd', (o, t, e) => {
    if (e.completed === false) { tone(o, t, 0.12, 0.16, 'triangle', 300, 200); return 0.16; }
    tone(o, t, 0.35, 0.2, 'sine', 660, 0, 0.005); tone(o, t + 0.09, 0.4, 0.18, 'sine', 990, 0, 0.005);
    return 0.55;
  });

  // ---- world
  def('dusk', (out, t) => {
    const dur = 4.4;
    const lp = bq('lowpass', 180, 1), g = ctx.createGain();
    lp.frequency.setValueAtTime(180, t); lp.frequency.linearRampToValueAtTime(950, t + 1.3); lp.frequency.linearRampToValueAtTime(260, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.55);
    g.gain.linearRampToValueAtTime(0.42, t + 2.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const parts = [[55, 0.5], [55.4, 0.4], [82.4, 0.3], [110.3, 0.22], [164.8, 0.08]];
    for (let i = 0; i < parts.length; i++) {
      const o = ctx.createOscillator(), og = mkGain(parts[i][1]); o.type = 'sawtooth';
      o.frequency.setValueAtTime(parts[i][0] * 0.94, t); o.frequency.exponentialRampToValueAtTime(parts[i][0], t + 0.5);
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
    lp.connect(g); g.connect(out);
    noise(out, t, 3.2, 0.25, 'lowpass', 140, 70, 0.6, 0.6);
    return dur;
  }, { prio: true });
  def('dawn', (out, t) => {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (let i = 0; i < notes.length; i++) {
      const tt = t + i * 0.16, f = notes[i];
      tone(out, tt, 1.6, 0.2, 'sine', f, 0, 0.004);
      tone(out, tt, 0.8, 0.06, 'sine', f * 2, 0, 0.004);
      tone(out, tt, 0.4, 0.025, 'sine', f * 3.01, 0, 0.004);
    }
    tone(out, t, 2.2, 0.07, 'triangle', 261.6, 0, 0.9); tone(out, t, 2.2, 0.05, 'triangle', 392, 0, 0.9);
    return 3.3;
  }, { prio: true });
  def('airdropIncoming', (out, t) => {
    const dur = 9;
    const lp = bq('lowpass', 520, 0.8), am = mkGain(0.7), g = ctx.createGain();
    const lfo = ctx.createOscillator(), lg = mkGain(0.3);
    lfo.type = 'sawtooth'; lfo.frequency.value = 21; lfo.connect(lg); lg.connect(am.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.42, t + 3.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const fs = [92, 93.2, 138.6];
    for (let i = 0; i < fs.length; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(fs[i] * 1.12, t); o.frequency.linearRampToValueAtTime(fs[i] * 1.08, t + 3.2); o.frequency.linearRampToValueAtTime(fs[i] * 0.86, t + dur);
      o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
    lp.connect(am); am.connect(g);
    let tail = g;
    if (ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner(); pn.pan.setValueAtTime(-0.75, t); pn.pan.linearRampToValueAtTime(0.75, t + dur); g.connect(pn); tail = pn;
    }
    tail.connect(out);
    lfo.start(t); lfo.stop(t + dur + 0.05);
    // radio blip so the player notices
    tone(out, t, 0.09, 0.16, 'square', 1100, 0); tone(out, t + 0.14, 0.09, 0.16, 'square', 1100, 0); tone(out, t + 0.28, 0.2, 0.16, 'square', 1480, 0);
    return dur;
  }, { prio: true });
  def('airdropLanded', (o, t) => {
    tone(o, t, 0.4, 1.0, 'sine', 85, 30, 0.003);
    noise(o, t, 0.35, 0.8, 'lowpass', 700, 150, 0.7);
    tone(o, t, 0.6, 0.2, 'sine', 320, 0, 0.001); tone(o, t, 0.45, 0.14, 'sine', 517, 0, 0.001); tone(o, t, 0.3, 0.1, 'sine', 811, 0, 0.001);
    return 0.8;
  }, { prio: true, far: true });
  def('barricadePlaced', (o, t) => {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.13, f = 380 + i * 40;
      noise(o, tt, 0.05, 0.8, 'bandpass', f, 0, 4);
      tone(o, tt, 0.06, 0.45, 'sine', f * 0.5, f * 0.3, 0.001);
    }
    return 0.5;
  });
  def('barricadeHit', (o, t) => {
    noise(o, t, 0.07, 0.75, 'bandpass', rnd(260, 340), 0, 3);
    tone(o, t, 0.09, 0.55, 'sine', 140, 70, 0.001);
    noise(o, t, 0.02, 0.15, 'highpass', 2000, 0, 0.7);
    return 0.14;
  });
  def('barricadeBroken', (o, t) => {
    for (let i = 0; i < 5; i++) noise(o, t + Math.random() * 0.26, 0.03, 0.6, 'bandpass', rnd(900, 2300), 0, 2);
    tone(o, t, 0.25, 0.8, 'sine', 100, 40, 0.002);
    noise(o, t, 0.3, 0.5, 'lowpass', 600, 180, 0.7);
    return 0.5;
  }, { prio: true });

  // ---- ambience one-shots
  def('bird', (out, t) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const n = 2 + ((Math.random() * 4) | 0), base = rnd(2700, 4600), lvl = rnd(0.035, 0.07);
    g.gain.setValueAtTime(0, t);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = rnd(0.05, 0.11), up = Math.random() < 0.6;
      const fa = base * rnd(0.9, 1.1), fb = fa * (up ? rnd(1.15, 1.45) : rnd(0.7, 0.88));
      o.frequency.setValueAtTime(fa, tt); o.frequency.exponentialRampToValueAtTime(fb, tt + d);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(lvl, tt + 0.012); g.gain.linearRampToValueAtTime(0, tt + d);
      tt += d + rnd(0.04, 0.1);
    }
    o.connect(g); g.connect(out); o.start(t); o.stop(tt + 0.05);
    return tt - t;
  });
  def('cricket', (out, t, e) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = e.f || 4400;
    g.gain.setValueAtTime(0, t);
    const n = 3 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.038;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.05, tt + 0.004); g.gain.linearRampToValueAtTime(0, tt + 0.016);
    }
    o.connect(g); g.connect(out); o.start(t); o.stop(t + n * 0.038 + 0.03);
    return n * 0.038;
  });

  // ---------------------------------------------------------------- gatling fire loop
  function gatlingShot() {
    if (!ready() || !gat) return;
    const now = ctx.currentTime;
    gatUntil = now + 0.1;
    if (!gatOn) {
      gatOn = true;
      gat.g.gain.cancelScheduledValues(now);
      gat.g.gain.setTargetAtTime(0.95, now, 0.008);
    }
    if (limit('gatCrack', 0.085)) play('shot_gatling', { volume: rnd(0.35, 0.6) });
  }
  // ---------------------------------------------------------------- flamethrower roar loop
  function flameShot() {
    if (!ready() || !flame) return;
    const now = ctx.currentTime;
    flameUntil = now + 0.16;
    if (!flameOn) {
      flameOn = true;
      flame.g.gain.cancelScheduledValues(now);
      flame.g.gain.setTargetAtTime(1.0, now, 0.035);
      play('flame_ignite', { volume: 0.85 });
    }
  }
  function stopFlame(withTail) {
    if (!flameOn || !ctx || !flame) { flameOn = false; return; }
    flameOn = false;
    const now = ctx.currentTime;
    flame.g.gain.cancelScheduledValues(now);
    flame.g.gain.setTargetAtTime(0, now, 0.07);
    if (withTail) play('flame_tail', { volume: 0.8 });
  }

  function stopGatling(withTail) {
    if (!gatOn || !ctx || !gat) { gatOn = false; return; }
    gatOn = false;
    const now = ctx.currentTime;
    gat.g.gain.cancelScheduledValues(now);
    gat.g.gain.setTargetAtTime(0, now, 0.022);
    if (withTail) play('gatling_tail');
  }

  // ---------------------------------------------------------------- event wiring
  game.on('shot', (e) => { play('shot', e); });
  game.on('melee', (e) => { play('melee', e); });
  game.on('dryFire', () => { play('dryFire'); });
  game.on('reloadStart', (e) => { play('reloadStart', e); });
  game.on('reloadEnd', (e) => { play('reloadEnd', e); });
  game.on('weaponSwitch', () => { if (ready() && limit('switch', 0.06)) play('weaponSwitch'); stopGatling(false); stopFlame(false); });
  game.on('hit', (e) => {
    if (!ready() || !e) return;
    // Under sustained gatling fire (25 hits/s) thin the confirm ticks out: the fire loop already
    // carries the rhythm and every tick is half a dozen fresh nodes.
    const busy = gatOn || flameOn;
    if (e.headshot) { if (limit('headshot', busy ? 0.12 : 0.05)) play('headshot', { volume: 0.8 }); }
    else if (limit('hit', busy ? 0.09 : 0.04)) play('hit', { volume: busy ? 0.55 : 0.7, killed: e.killed });
  });
  game.on('zombieKilled', (e) => {
    if (!ready() || !limit('zkill', 0.04)) return;
    play('zombieKilled', { zombie: e && e.zombie, position: e && e.zombie && e.zombie.position, volume: 0.9 });
  });
  game.on('zombieAttack', (e) => {
    if (!ready() || !limit('zatk', 0.07)) return;
    play('zombieAttack', { zombie: e && e.zombie, position: e && e.zombie && e.zombie.position, volume: 0.9 });
  });
  game.on('zombieGroan', (e) => {
    if (!ready() || !limit('zgroan', 0.12)) return;
    play('zombieGroan', { zombie: e && e.zombie, position: e && e.zombie && e.zombie.position, volume: 1.1 });
  });
  game.on('playerHit', (e) => {
    if (!ready() || !limit('phit', 0.08)) return;
    play('playerHit', { volume: Math.min(1.2, 0.6 + ((e && e.amount) || 10) / 40), position: null });
  });
  game.on('playerDied', () => { stopGatling(false); stopFlame(false); play('playerDied'); });
  game.on('pickup', (e) => { play('pickup', { kind: e && e.kind, volume: 0.8 }); });
  game.on('step', (e) => { stepFlip = -stepFlip; play('step', { sprint: !!(e && e.sprint), pan: stepFlip * 0.08, volume: 0.7 }); });
  game.on('jump', () => { play('jump'); });
  game.on('land', () => { play('land'); });
  game.on('phase', (e) => {
    if (!e) return;
    if (e.phase === 'night') play('dusk');
    else if (e.night > 0) play('dawn');
  });
  game.on('airdropIncoming', () => { play('airdropIncoming'); });
  game.on('airdropLanded', (e) => { play('airdropLanded', { position: e && e.position }); });
  game.on('barricadePlaced', () => { play('barricadePlaced', { volume: 0.8 }); });
  game.on('barricadeHit', () => { if (ready() && limit('bhit', 0.09)) play('barricadeHit', { volume: 0.6 }); });
  game.on('barricadeBroken', () => { play('barricadeBroken'); });
  game.on('healStart', (e) => { play('healStart', e); });
  game.on('healEnd', (e) => { play('healEnd', e); });

  // ---------------------------------------------------------------- API
  function resume() {
    if (broken) return;
    if (!ctx) {
      try { build(); } catch (e) {
        console.warn('[audio] disabled:', e);
        broken = true;
        try { if (ctx && ctx.close) ctx.close(); } catch (e2) { /* ignore */ }
        ctx = null;
        return;
      }
    }
    if (ctx.state !== 'running' && ctx.resume) { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
  }

  // If the browser suspends an existing context (tab switch, Safari interruption), wake it on the next gesture.
  const kick = () => { if (ctx && ctx.state !== 'running') resume(); };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
  // A hidden tab stops requestAnimationFrame, so update() can no longer release the gatling loop,
  // the barrel whine or the heartbeat: freeze the whole graph until the tab is back.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      stopGatling(false);
      stopFlame(false);
      lastSpin = -1;                      // re-sync the whine on the first frame back
      if (ctx.state === 'running' && ctx.suspend) { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); }
    } else resume();
  });

  function setMaster(v) {
    masterVol = clamp01(+v || 0);
    if (ctx && master) master.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.03);
  }

  function update(dt) {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].end < now) {
        try { voices[i].node.disconnect(); } catch (e) { /* ignore */ }
        voices[i] = voices[voices.length - 1]; voices.pop();
      }
    }
    if (ctx.state !== 'running') return;
    clock += dt;

    const playing = game.state === 'playing' && !game.paused;
    const p = game.player, w = game.weapons;
    const day = clamp01(game.dayFactor == null ? 1 : game.dayFactor);

    // weapon loops are silenced while the perk picker freezes the run (game.choosing)
    const firing = playing && !game.choosing;
    // gatling fire loop release
    if (gatOn && (now > gatUntil || !firing)) stopGatling(firing);
    // flamethrower roar release (also when the perk picker freezes the game: shots simply stop arriving)
    if (flameOn && (now > flameUntil || !firing)) stopFlame(firing);

    // gatling barrel whine follows weapons.spin (silent while the perk picker is open)
    const spin = firing && w ? clamp01(w.spin || 0) : 0;
    if (Math.abs(spin - lastSpin) > 0.004 || (spin === 0 && lastSpin !== 0)) {
      lastSpin = spin;
      const f = 70 + spin * spin * 560;
      whine.o1.frequency.setTargetAtTime(f, now, 0.04);
      whine.o2.frequency.setTargetAtTime(f * 1.507, now, 0.04);
      whine.o3.frequency.setTargetAtTime(10 + spin * 40, now, 0.04);
      whine.bp.frequency.setTargetAtTime(300 + spin * 1500, now, 0.04);
      whine.g.gain.setTargetAtTime(spin > 0.01 ? 0.012 + spin * 0.05 : 0, now, 0.05);
      whine.g3.gain.setTargetAtTime(spin * 0.11, now, 0.05);
    }

    // ambience beds (10 Hz is plenty)
    ambT -= dt;
    if (ambT <= 0) {
      ambT = 0.1;
      const gust = 0.5 + 0.5 * Math.sin(clock * 0.13) * Math.sin(clock * 0.31 + 1.3);
      wind.lp.frequency.setTargetAtTime(240 + gust * 520 + day * 160, now, 0.3);
      wind.g.gain.setTargetAtTime((0.1 + gust * 0.11) * (0.55 + 0.45 * day), now, 0.3);
      wind.bp.frequency.setTargetAtTime(650 + gust * 500, now, 0.4);
      wind.g2.gain.setTargetAtTime(gust * gust * 0.012 * (0.5 + 0.5 * (1 - day)), now, 0.4);
      const nk = 1 - day;
      drone.g.gain.setTargetAtTime(Math.pow(nk, 1.5) * 0.12, now, 0.5);
      drone.pad.gain.setTargetAtTime(nk * nk * 0.006 * (0.6 + 0.4 * Math.sin(clock * 0.21)), now, 0.5);
    }

    // birds by day
    birdT -= dt;
    if (birdT <= 0) {
      birdT = rnd(1.2, 4.5) / Math.max(0.3, day);
      if (day > 0.55 && game.state !== 'dead') play('bird', { pan: rnd(-0.8, 0.8), volume: (day - 0.4) * 1.5 });
    }
    // crickets by night
    if (day < 0.5) {
      const lvl = (0.5 - day) * 2;
      for (let i = 0; i < crickets.length; i++) {
        const c = crickets[i];
        c.t -= dt;
        if (c.t <= 0) { c.t = rnd(0.22, 0.6) + (Math.random() < 0.12 ? rnd(1, 2.5) : 0); play('cricket', { f: c.f, pan: c.pan, volume: lvl * 0.7 }); }
      }
    }

    // heartbeat under 30 health
    if (playing && p && p.alive !== false && p.health != null && p.health < 30 && p.health > 0) {
      hbT -= dt;
      if (hbT <= 0) {
        const k = clamp01(p.health / 30);
        hbT = 0.52 + k * 0.42;
        play('heartbeat', { volume: 0.55 + (1 - k) * 0.45 });
      }
    } else hbT = 0;

    // everything goes underwater when you die
    const dead = game.state === 'dead';
    if (dead !== wasDead) {
      wasDead = dead;
      deadLP.frequency.cancelScheduledValues(now);
      deadLP.frequency.setTargetAtTime(dead ? 650 : 20000, now, dead ? 0.5 : 0.08);
    }
  }

  function reset() {
    hbT = 0; birdT = 2; ambT = 0; lastSpin = -1; gatUntil = 0; flameUntil = 0;
    for (const k in last) delete last[k];
    if (!ctx) return;
    stopGatling(false);
    stopFlame(false);
    wasDead = false;
    const now = ctx.currentTime;
    deadLP.frequency.cancelScheduledValues(now);
    deadLP.frequency.setTargetAtTime(20000, now, 0.05);
  }

  return {
    resume, play, update, reset, setMaster,
    // extras (not required by the contract): lets other modules synthesise into the same graph
    // (master volume, compressor, death low-pass, hidden-tab suspend) instead of opening their own context
    get context() { return ctx; },
    get output() { return sfxBus; },
  };
}
