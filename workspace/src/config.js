// HOLLOW DAWN — shared tuning data. Pure data, no three.js imports.

export const CONFIG = {
  world: {
    size: 400,          // metres per side, centred on origin (x,z in [-200, 200])
    cell: 2,            // flow-field grid cell size (200 x 200 cells)
    seaLevel: 0,        // terrain below this is water; playable land is above
    shoreMargin: 22,    // land falls into sea this far from the edge
  },

  phases: {
    firstDay: 70,       // seconds of the opening day
    day: 75,
    night: 105,
    nightGrowth: 8,     // each later night lasts this much longer
    nightMax: 150,
    transition: 10,     // dusk / dawn blend seconds
  },

  player: {
    walk: 5.0, sprint: 8.3, crouch: 2.7, aimMult: 0.6,
    jump: 6.4, gravity: 20,
    jump2: 6.6,               // second (air) jump: total reach about 2.1 m, enough to go crate -> roof
    airControl: 4.5,          // how fast the wish velocity takes over in the air (ground is 13)
    slide: { speed: 11.5, time: 0.75, cooldown: 0.9 },          // Shift + C while sprinting
    slam:  { speed: 26, minHeight: 1.6, radius: 4.8, damage: 90, knock: 9, cooldown: 2.5 }, // C in the air
    radius: 0.4, standHeight: 1.7, crouchHeight: 1.15,
    maxHealth: 100, maxArmor: 100, armorAbsorb: 0.6,
    staminaDrain: 0.13, staminaRegen: 0.2,    // per second, stamina is 0..1
    mouseSens: 0.0022, aimSensMult: 0.6,
    fov: 72, aimFov: 50, sprintFov: 80,
  },

  // Ammo reserve pools.
  ammoTypes: {
    light:  { name: 'Light rounds',  color: '#f2c14e' },
    heavy:  { name: 'Heavy rounds',  color: '#e0703a' },
    shells: { name: 'Shells',        color: '#d94f4f' },
    sniper: { name: 'Long rounds',   color: '#7fb7e6' },
    belt:   { name: 'Belt rounds',   color: '#c9d1d9' },
    fuel:   { name: 'Fuel',          color: '#ff9f43' },
    rockets:{ name: 'Rockets',       color: '#e84a5f' },
  },

  // slot: 'melee' (hotbar 1, fixed), 'gun' (hotbar 2-4), 'heavy' (hotbar 5).
  // spreads are radians (half-angle). recoil is radians per shot. rpm = rounds per minute.
  weapons: {
    bat: {
      id: 'bat', name: 'Fence Post', slot: 'melee', ammoType: null, mag: 0,
      damage: 55, headMult: 1.5, rpm: 85, auto: true, range: 2.6, arc: 1.1,
      moveMult: 1.0, color: '#8a6a45',
    },
    pistol: {
      id: 'pistol', name: 'P9 Sidearm', slot: 'gun', ammoType: 'light', mag: 12,
      damage: 26, headMult: 2.5, rpm: 380, auto: false, range: 120, pellets: 1,
      spreadHip: 0.012, spreadAim: 0.003, spreadMove: 0.012, spreadPerShot: 0.008, spreadMax: 0.05, spreadRecover: 0.12,
      recoilPitch: 0.016, recoilYaw: 0.005, reload: 1.3, moveMult: 1.0, color: '#3d4450',
    },
    smg: {
      id: 'smg', name: 'Vesper SMG', slot: 'gun', ammoType: 'light', mag: 30,
      damage: 19, headMult: 2.0, rpm: 820, auto: true, range: 90, pellets: 1,
      spreadHip: 0.018, spreadAim: 0.007, spreadMove: 0.01, spreadPerShot: 0.004, spreadMax: 0.06, spreadRecover: 0.16,
      recoilPitch: 0.008, recoilYaw: 0.006, reload: 1.8, moveMult: 1.0, color: '#4a5568',
    },
    shotgun: {
      id: 'shotgun', name: 'Brakeman 12', slot: 'gun', ammoType: 'shells', mag: 6,
      damage: 15, headMult: 1.6, rpm: 75, auto: false, range: 40, pellets: 9,
      spreadHip: 0.06, spreadAim: 0.045, spreadMove: 0.01, spreadPerShot: 0.0, spreadMax: 0.08, spreadRecover: 0.2,
      recoilPitch: 0.06, recoilYaw: 0.015, reload: 2.6, moveMult: 0.95, color: '#6b4a32',
    },
    rifle: {
      id: 'rifle', name: 'Kestrel AR', slot: 'gun', ammoType: 'heavy', mag: 30,
      damage: 34, headMult: 2.3, rpm: 620, auto: true, range: 200, pellets: 1,
      spreadHip: 0.02, spreadAim: 0.003, spreadMove: 0.016, spreadPerShot: 0.005, spreadMax: 0.07, spreadRecover: 0.14,
      recoilPitch: 0.012, recoilYaw: 0.007, reload: 2.2, moveMult: 0.95, color: '#2f3640',
    },
    sniper: {
      id: 'sniper', name: 'Longreach .308', slot: 'gun', ammoType: 'sniper', mag: 5,
      damage: 150, headMult: 3.0, rpm: 44, auto: false, range: 400, pellets: 1,
      spreadHip: 0.05, spreadAim: 0.0005, spreadMove: 0.03, spreadPerShot: 0.0, spreadMax: 0.08, spreadRecover: 0.1,
      recoilPitch: 0.07, recoilYaw: 0.01, reload: 3.0, moveMult: 0.9, color: '#45523c',
    },
    gatling: {
      id: 'gatling', name: 'HURRICANE Gatling', slot: 'heavy', ammoType: 'belt', mag: 200,
      damage: 30, headMult: 1.6, rpm: 1500, auto: true, range: 160, pellets: 1,
      spreadHip: 0.03, spreadAim: 0.022, spreadMove: 0.006, spreadPerShot: 0.0006, spreadMax: 0.05, spreadRecover: 0.1,
      recoilPitch: 0.0028, recoilYaw: 0.004, reload: 5.0, moveMult: 0.6,
      spinUp: 0.9, spinDown: 1.4,   // seconds to reach / lose full spin; fires only at spin >= 1
      color: '#8d99ae',
    },
    // Boss-drop specials (hotbar 5, replace whatever heavy weapon you hold).
    flamethrower: {
      id: 'flamethrower', name: 'CINDERMAW Projector', slot: 'heavy', ammoType: 'fuel', mag: 120,
      damage: 7, headMult: 1, rpm: 900, auto: true, range: 9.5, cone: 0.3, pellets: 1,   // damage per tick to every zombie in the cone
      igniteDps: 28, igniteTime: 3.2,                       // the burn it leaves (zombies.ignite)
      spreadHip: 0, spreadAim: 0, spreadMove: 0, spreadPerShot: 0, spreadMax: 0, spreadRecover: 1,
      recoilPitch: 0.0006, recoilYaw: 0.001, reload: 3.4, moveMult: 0.85, color: '#c0392b',
    },
    rocket: {
      id: 'rocket', name: 'SKYFALL Launcher', slot: 'heavy', ammoType: 'rockets', mag: 1,
      damage: 320, headMult: 1, rpm: 55, auto: false, range: 220, pellets: 1,          // damage = blast centre damage
      blastRadius: 6.5, blastKnock: 16, rocketSpeed: 58, selfRadius: 4.5, selfDamage: 40,
      spreadHip: 0.004, spreadAim: 0.001, spreadMove: 0.006, spreadPerShot: 0, spreadMax: 0.01, spreadRecover: 0.2,
      recoilPitch: 0.09, recoilYaw: 0.01, reload: 2.6, moveMult: 0.85, color: '#556b2f',
    },
  },

  startLoadout: { weapons: ['bat', 'pistol'], ammo: { light: 48, heavy: 0, shells: 0, sniper: 0, belt: 0, fuel: 0, rockets: 0 }, bandage: 2, medkit: 0, scrap: 4 },

  // speed m/s, damage per hit, attackRate hits/s, scale = model size multiplier.
  zombies: {
    walker:  { id: 'walker',  health: 100, speed: 2.3, damage: 10, attackRate: 1.0, reach: 1.5, scale: 1.0,  radius: 0.42, height: 1.75, color: '#6f8f5a', eye: '#b7ff5a', score: 10 },
    runner:  { id: 'runner',  health: 60,  speed: 5.6, damage: 8,  attackRate: 1.5, reach: 1.4, scale: 0.92, radius: 0.38, height: 1.6,  color: '#8f7a5a', eye: '#ffd24a', score: 15 },
    brute:   { id: 'brute',   health: 650, speed: 1.9, damage: 28, attackRate: 0.7, reach: 2.1, scale: 1.55, radius: 0.7,  height: 2.6,  color: '#5a6f8f', eye: '#ff5a3c', score: 60 },
    spitter: { id: 'spitter', health: 80,  speed: 2.8, damage: 12, attackRate: 0.5, reach: 1.4, scale: 1.0,  radius: 0.42, height: 1.75, color: '#7a5a8f', eye: '#d06bff', score: 25,
               spitRange: 26, spitSpeed: 16, spitDamage: 12, spitCooldown: 3.2 },
    // THE HOLLOW KING: one per night, never part of the random wave mix (see boss below)
    boss:    { id: 'boss',    health: 5200, speed: 2.5, damage: 38, attackRate: 0.6, reach: 2.9, scale: 2.25, radius: 1.1, height: 3.9, color: '#3d2f4f', eye: '#ff2e2e', score: 500 },
  },
  boss: {
    name: 'The Hollow King',
    firstNight: 1,            // nights from this one on get a boss
    atFraction: 0.4,          // spawns this far into the night
    healthPerNight: 0.35,     // +35% health per night after the first boss night
    charge:  { cooldown: [7, 11], speed: 13, time: 1.1, damage: 45, windup: 0.8 },
    slam:    { cooldown: [9, 13], radius: 7.5, damage: 35, windup: 1.0 },   // shockwave; a jump dodges it
    summon:  { cooldown: [16, 22], count: 5, types: ['runner', 'walker'] },
    enrageAt: 0.35,           // below this health fraction: faster, shorter cooldowns
    rewardWeaponChance: 0.65, // chance the reward chest holds the flamethrower or the rocket launcher (50/50)
  },
  maxZombiesAlive: 80,
  barricadeDps: 30,       // damage per second a zombie deals to a barricade it is stuck on

  // Wave for night n (1-based): total to spawn across the night and the mix.
  wave(n) {
    const total = Math.round(26 + n * 16 + n * n * 1.5);
    return {
      total,
      spawnInterval: Math.max(0.35, 1.5 - n * 0.14),   // seconds between spawns
      maxAlive: Math.min(CONFIG.maxZombiesAlive, 22 + n * 10),
      mix: {
        walker: 1.0,
        runner: n >= 2 ? 0.2 + n * 0.06 : 0.08,
        spitter: n >= 2 ? 0.14 : 0,
        brute: n >= 3 ? 0.05 + n * 0.01 : (n === 2 ? 0.02 : 0),
      },
      healthMult: 1 + (n - 1) * 0.12,
      speedMult: 1 + Math.min(0.3, (n - 1) * 0.05),
    };
  },

  loot: {
    pickupRange: 2.4,
    // weights for a ground loot spot
    table: [
      { w: 12, kind: 'ammo',   id: 'light',  amount: [18, 36] },
      { w: 9,  kind: 'ammo',   id: 'heavy',  amount: [20, 40] },
      { w: 7,  kind: 'ammo',   id: 'shells', amount: [6, 12] },
      { w: 4,  kind: 'ammo',   id: 'sniper', amount: [5, 10] },
      { w: 10, kind: 'med',    id: 'bandage', amount: [1, 2] },
      { w: 4,  kind: 'med',    id: 'medkit', amount: [1, 1] },
      { w: 5,  kind: 'armor',  id: 'vest',   amount: [50, 50] },
      { w: 14, kind: 'scrap',  id: 'scrap',  amount: [2, 5] },
      { w: 6,  kind: 'weapon', id: 'smg',     amount: [1, 1] },
      { w: 5,  kind: 'weapon', id: 'shotgun', amount: [1, 1] },
      { w: 5,  kind: 'weapon', id: 'rifle',   amount: [1, 1] },
      { w: 2,  kind: 'weapon', id: 'sniper',  amount: [1, 1] },
    ],
    airdrop: { fallTime: 14, startHeight: 120, beltRounds: 400 },
    dayRespawnFraction: 0.45,   // share of empty spots refilled each dawn
  },

  meds: {
    bandage: { heal: 22, time: 2.0 },
    medkit:  { heal: 75, time: 4.5 },
  },

  barricade: { cost: 4, health: 240, width: 2.6, height: 1.5, depth: 0.45, placeDist: 2.4, max: 24 },

  score: { kill: 10, headshot: 5, night: 250 },

  // kill chains: each kill within `window` s of the last extends the chain; bonus = kill score * (mult - 1)
  combo: { window: 3.2, step: 5, multStep: 0.5, maxMult: 3 },
  // kill drops: what a dead zombie can leave behind (weights; 'ammo:auto' = ammo for a gun you own)
  drops: {
    chance: { walker: 0.1, runner: 0.12, spitter: 0.2, brute: 0.85 },
    life: 40,                 // seconds a drop stays before fading
    table: [
      { w: 40, kind: 'ammo', id: 'auto', amount: [10, 24] },
      { w: 12, kind: 'med',  id: 'bandage', amount: [1, 1] },
      { w: 3,  kind: 'med',  id: 'medkit', amount: [1, 1] },
      { w: 16, kind: 'scrap', id: 'scrap', amount: [1, 3] },
      { w: 6,  kind: 'armor', id: 'vest', amount: [25, 25] },
      { w: 3,  kind: 'ammo', id: 'fuel', amount: [30, 50] },
      { w: 2,  kind: 'ammo', id: 'rockets', amount: [1, 2] },
    ],
  },
  // perks: every so many kills, pick 1 of 3 (keys 1-3). The boss grants legendary picks.
  perks: { firstAt: 20, growth: 8, choices: 3, bossPicks: 2 },

  // red fuel barrels around the compounds: shoot them
  barrels: { health: 40, radius: 6.5, damage: 260, knock: 14, selfRadius: 5, selfDamage: 45, chainDelay: 0.18 },

  palette: {
    night: '#0b1020', dusk: '#ff7a3c', ember: '#ff7a3c', bone: '#e8e4d8',
    toxic: '#9be564', blood: '#b3202a', steel: '#8d99ae',
  },
};
