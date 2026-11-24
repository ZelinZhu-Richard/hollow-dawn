// HOLLOW DAWN — perks (game.perks).
// Every so many kills the run freezes (game.choosing) and offers CONFIG.perks.choices perk cards (keys 1-3,
// or click). Killing the boss queues CONFIG.perks.bossPicks LEGENDARY picks. Perks write game.mods (read by
// weapons / player / skills / loot); everything else is implemented here through events and existing APIs:
// corpse bombs, chain lightning, frost aura, lightning strikes, the phoenix revive, dash damage.
// Own pooled FX (glow points, sparks, lightning ribbons, one flash light), own DOM (picker + HUD strip), own synth.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const ARM_MS = 900;            // the picker ignores input this long after opening (no accidental picks mid-fight)
const MAX_BOMBS = 25;          // simultaneous pending corpse bombs
const BOSS_DELAY = 1.5;        // seconds between the boss death and its legendary picks

// ------------------------------------------------------------------ glyphs (24x24 stroke icons)
const ICONS = {
  corpse_bomb: '<circle cx="10.5" cy="14" r="6.5"/><path d="M15 9.5l3-3"/><path d="M19.5 2.5v2M22 5h-2M21.3 3.2l-1.3 1.3"/><path d="M8 12.5a2.5 2.5 0 0 1 2.5-2.5"/>',
  vampire: '<path d="M12 3c3.2 4.8 6 8 6 11.5a6 6 0 0 1-12 0C6 11 8.8 7.8 12 3z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  adrenaline: '<path d="M13.5 2L5 13.5h6L10 22l9-12.5h-6.2z"/>',
  thick_skin: '<path d="M12 20.5S4 16 4 9.8A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 8 2.4c0 6.2-8 10.7-8 10.7z"/><path d="M12 10.5v5M9.5 13h5"/>',
  quick_hands: '<path d="M19.5 12.5A7.5 7.5 0 1 1 17 6.6"/><path d="M17.8 2.8v4.4h-4.4"/><path d="M12 9v3.5l2.5 1.5"/>',
  hollow_points: '<path d="M9 21.5V10.5c0-3.2 1.4-6.2 3-7.5 1.6 1.3 3 4.3 3 7.5v11z"/><path d="M9 16.5h6"/>',
  marksman: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.2"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  trigger: '<path d="M3 6l6 6-6 6M10 6l6 6-6 6"/><path d="M19 5v14"/>',
  scavenger: '<path d="M3.5 8L12 4l8.5 4v8.5L12 20.5l-8.5-4z"/><path d="M3.5 8L12 12l8.5-4M12 12v8.5"/>',
  conductor: '<circle cx="4.5" cy="18.5" r="2"/><circle cx="19.5" cy="5.5" r="2"/><path d="M6.3 17l3.7-6.5 3.5 3 4.6-7.2"/>',
  frost_aura: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.2 3.8L12 6l2.8-2.2M9.2 20.2L12 18l2.8 2.2"/>',
  lucky_mag: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><circle cx="8.6" cy="8.6" r=".9"/><circle cx="15.4" cy="15.4" r=".9"/><circle cx="15.4" cy="8.6" r=".9"/><circle cx="8.6" cy="15.4" r=".9"/><circle cx="12" cy="12" r=".9"/>',
  incendiary: '<path d="M12 21.5a6 6 0 0 0 6-6c0-4-3-6.2-4.2-10.5-2 2.2-3 4.2-3 6.3-1-.8-1.8-1.8-2.1-3C6.6 10.4 6 12.6 6 15.5a6 6 0 0 0 6 6z"/>',
  spring_legs: '<path d="M8 6.5l4-4 4 4M12 2.5v8"/><path d="M6.5 13.5h11l-11 3.5h11l-11 3.5h11"/>',
  iron_hide: '<path d="M12 2.8l7.5 3v5.5c0 5-3.2 8.3-7.5 10-4.3-1.7-7.5-5-7.5-10V5.8z"/><path d="M12 6v12"/>',
  overclock: '<circle cx="12" cy="13" r="8"/><path d="M12 13l4.2-4.2"/><path d="M10 2.5h4M12 2.5V5"/>',
  demolition: '<path d="M12 2l2.1 5.6 5.7-1.8-3.2 5 4.9 3.1-5.9.8.8 5.9-4.4-4-4.4 4 .8-5.9-5.9-.8 4.9-3.1-3.2-5 5.7 1.8z"/>',
  rations: '<path d="M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z"/>',
  phoenix: '<path d="M12 21c-1.2-3.6-1.2-7.2 0-10.5 1.2 3.3 1.2 6.9 0 10.5z"/><path d="M12 11C9.5 6 5.5 4.6 2 5.6c2.2 3.4 5.4 5.4 10 5.4zM12 11c2.5-5 6.5-6.4 10-5.4-2.2 3.4-5.4 5.4-10 5.4z"/><path d="M12 7V3"/>',
  dawnfire: '<path d="M2.5 18.5h19M6.5 18.5a5.5 5.5 0 0 1 11 0"/><path d="M12 4v4M4.6 8.6l2.2 2.2M19.4 8.6l-2.2 2.2"/><path d="M9.5 22h5"/>',
  thunderhead: '<path d="M7 14.5a4.2 4.2 0 0 1-.3-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1 .3 7z"/><path d="M12.5 13l-2.5 4.3h3.5L11 22"/>',
  necro: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5h-2.2v3.5H8.2v-3.5z"/><circle cx="9.5" cy="11.8" r="1.4"/><circle cx="14.5" cy="11.8" r="1.4"/><path d="M11 20v-2.5M13 20v-2.5"/>',
  juggernaut: '<path d="M5 20.5V10a7 7 0 0 1 14 0v10.5z"/><path d="M5 12.5h14M10 12.5v8M14 12.5v8"/>',
  bullet_storm: '<path d="M4 21v-8.5c0-2.2.9-4.3 2-5.5 1.1 1.2 2 3.3 2 5.5V21zM10 21v-8.5c0-2.2.9-4.3 2-5.5 1.1 1.2 2 3.3 2 5.5V21zM16 21v-8.5c0-2.2.9-4.3 2-5.5 1.1 1.2 2 3.3 2 5.5V21z"/><path d="M6 3v1.5M12 2v2M18 3v1.5"/>',
  cascade: '<circle cx="7.5" cy="16" r="4.3"/><circle cx="16.5" cy="16" r="4.3"/><circle cx="12" cy="8" r="4.3"/><path d="M15 4.5l2-2M19 2v1.4"/>',
  reaper: '<path d="M6 22L17.5 4"/><path d="M14.6 8.6C11.4 4.2 7 3 2.5 4c3.3 1 6.3 3.2 7.6 7.4"/>',
};

const pct = (x) => Math.round(x * 100);
const bombRadius = (n) => 3.5 + 0.75 * (n - 1);
const bombDamage = (n) => 150 + 40 * (n - 1);
const BOMB_GEN_DECAY = 0.7, BOMB_GEN_SHRINK = 0.9;   // per chain link: damage x0.7, radius x0.9
const CASCADE_MAX_GEN = 6, CASCADE_DMG = 1.4;
const THUNDER_CD = 0.9;          // minimum seconds between Thunderhead strikes (fast weapons cannot strobe it)
const REAPER_CD = 1.2;           // minimum seconds between Reaper's Waltz dash refunds
const ARC_FRACTION = 0.6, ARC_CD = 0.2;
const frostRadius = (n) => 5 + 1.5 * (n - 1);
const frostSlow = (n) => (n >= 2 ? 0.5 : 0.65);

// tag: offense | defense | utility (colour coding on the card). desc(n) = text for rank n (after taking it).
const CATALOG = [
  { id: 'corpse_bomb', name: 'Corpse Bomb', tag: 'offense', max: 3, desc: (n) => `Your kills explode 2 s later: ${bombRadius(n)} m, ${bombDamage(n)} damage. Chains up to 2 links.` },
  { id: 'vampire', name: 'Vampire', tag: 'defense', max: 3, desc: (n) => `Each kill heals ${2 * n} HP. Headshot kills heal ${4 * n}.` },
  { id: 'adrenaline', name: 'Adrenaline', tag: 'utility', max: 3, desc: (n) => `Kills give +${20 * n}% move speed for 2.5 s.` },
  { id: 'thick_skin', name: 'Thick Skin', tag: 'defense', max: 3, desc: () => '+20 max health, and heal 20 now.' },
  { id: 'quick_hands', name: 'Quick Hands', tag: 'offense', max: 3, desc: (n) => `Reload speed +${pct(Math.pow(1.2, n) - 1)}%.` },
  { id: 'hollow_points', name: 'Hollow Points', tag: 'offense', max: 3, desc: (n) => `+${15 * n}% weapon damage.` },
  { id: 'marksman', name: 'Marksman', tag: 'offense', max: 3, desc: (n) => `+${30 * n}% headshot damage.` },
  { id: 'trigger', name: 'Trigger Discipline', tag: 'offense', max: 3, desc: (n) => `+${12 * n}% fire rate.` },
  { id: 'scavenger', name: 'Scavenger', tag: 'utility', max: 2, desc: (n) => `Zombies drop loot ${50 * n}% more often.` },
  { id: 'conductor', name: 'Conductor', tag: 'offense', max: 3, desc: (n) => `${20 * n}% of bullet hits arc lightning through ${1 + n} more zombies for ${pct(ARC_FRACTION)}% of the hit.` },
  { id: 'frost_aura', name: 'Frost Aura', tag: 'defense', max: 2, desc: (n) => `Zombies within ${frostRadius(n)} m of you move ${pct(1 - frostSlow(n))}% slower.` },
  { id: 'lucky_mag', name: 'Lucky Mag', tag: 'utility', max: 3, desc: (n) => `${pct(1 - Math.pow(0.88, n))}% chance a shot costs no ammo.` },
  { id: 'incendiary', name: 'Incendiary Rounds', tag: 'offense', max: 3, desc: (n) => `${10 * n}% chance a bullet sets its target on fire.` },
  { id: 'spring_legs', name: 'Spring Legs', tag: 'utility', max: 2, desc: (n) => `+1 jump in mid-air (${n + 2} jumps in a row).` },
  { id: 'iron_hide', name: 'Iron Hide', tag: 'defense', max: 3, desc: (n) => `Take ${pct(1 - Math.pow(0.9, n))}% less damage.` },
  { id: 'overclock', name: 'Overclocked Kit', tag: 'utility', max: 3, desc: (n) => `Q, E and G recharge ${pct(1 / Math.pow(0.85, n) - 1)}% faster.` },
  { id: 'demolition', name: 'Demolitionist', tag: 'offense', max: 3, desc: (n) => `Explosions +${15 * n}% radius and damage.` },

  { id: 'phoenix', name: 'Phoenix', tag: 'defense', max: 1, legendary: true, desc: () => 'Once per night, a lethal hit revives you at 50% HP in a firestorm.' },
  { id: 'dawnfire', name: 'Dawnfire', tag: 'offense', max: 1, legendary: true, desc: () => 'Every bullet sets zombies on fire. All fire damage +50%.' },
  { id: 'thunderhead', name: 'Thunderhead', tag: 'offense', max: 1, legendary: true, desc: () => 'Every 8th shot calls lightning on your target: 200 damage, stuns.' },
  { id: 'necro', name: 'Necro Harvest', tag: 'defense', max: 1, legendary: true, desc: () => 'Each kill: +3 HP, +2 armor and double Dawnbreaker charge.' },
  { id: 'juggernaut', name: 'Juggernaut', tag: 'defense', max: 1, legendary: true, desc: () => '+60 max health, 30% less damage. The horde cannot shove you.' },
  { id: 'bullet_storm', name: 'Bullet Storm', tag: 'offense', max: 1, legendary: true, desc: () => '+40% fire rate. 35% of shots cost no ammo.' },
  { id: 'cascade', name: 'Corpse Cascade', tag: 'offense', max: 1, legendary: true, desc: () => 'Corpse bombs get huge and a 1.2 s fuse. Bomb kills chain up to 6 links.' },
  { id: 'reaper', name: "Reaper's Waltz", tag: 'utility', max: 1, legendary: true, desc: () => 'Kills recharge your Q dash. Dashing through zombies deals 150.' },
];
// fallback card, only offered when nothing else is left
const RATIONS = { id: 'rations', name: 'Field Rations', tag: 'defense', max: Infinity, desc: () => '+30 health and +30 armor, right now.' };

const CSS = `
#pk-hud{position:absolute;left:22px;bottom:104px;display:grid;gap:7px;font-family:var(--mono);color:var(--bone);pointer-events:none;
  filter:drop-shadow(0 2px 4px rgba(0,0,0,.65))}
#pk-hud.off{display:none}
.pk-next{display:grid;gap:5px;width:196px}
.pk-next-l{font:600 9.5px/1 var(--mono);letter-spacing:.2em;color:var(--dim);text-transform:uppercase;white-space:nowrap}
.pk-next-l b{color:var(--bone);font-weight:700}
.pk-next-bar{height:3px;background:rgba(232,228,216,.16);overflow:hidden}
.pk-next-bar i{display:block;height:100%;background:var(--ember);transform-origin:0 50%;transform:scaleX(0);transition:transform .25s}
#pk-hud.ready .pk-next-l,#pk-hud.ready .pk-next-l b{color:var(--ember)}
#pk-hud.ready .pk-next-bar i{animation:pk-blink .5s steps(2,jump-none) infinite}
.pk-chips{display:flex;flex-wrap:wrap;gap:5px;max-width:306px}
.pk-chips:empty{display:none}
.pk-chip{position:relative;width:26px;height:26px;display:grid;place-items:center;color:var(--bone);background:rgba(8,11,22,.74);
  box-shadow:inset 0 0 0 1px rgba(232,228,216,.24)}
.pk-chip svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pk-chip b{position:absolute;right:-4px;bottom:-5px;min-width:12px;text-align:center;font:700 8.5px/1 var(--mono);background:var(--ember);color:var(--ink);padding:2px 2px 1px}
.pk-chip.offense{color:#ffb08c}.pk-chip.defense{color:#a9d3f5}.pk-chip.utility{color:#bfee9a}
.pk-chip.leg{color:#ffd25e;box-shadow:inset 0 0 0 1px #ffd25e,0 0 9px rgba(255,200,80,.5)}
.pk-chip.leg b{background:#ffd25e}
.pk-chip.spent{opacity:.32;box-shadow:inset 0 0 0 1px rgba(232,228,216,.2)}
.pk-chip.new{animation:pk-pop .6s cubic-bezier(.2,.9,.3,1.4)}
@media (max-height:780px),(max-width:1180px){#pk-hud{zoom:.82}}
@media (max-width:700px){#pk-hud{left:14px;zoom:.68}}

#pk-pick{position:fixed;inset:0;z-index:18;display:grid;place-items:center;pointer-events:auto;font-family:var(--display);color:var(--bone);
  user-select:none;-webkit-user-select:none}
#pk-pick.off{display:none}
#pk-pick.lock{cursor:none}
.pk-back{position:absolute;inset:0;background:radial-gradient(80% 70% at 50% 46%,rgba(9,13,27,.8),rgba(7,10,20,.94));animation:pk-fade .25s ease-out}
#pk-pick.leg .pk-back{background:radial-gradient(70% 62% at 50% 46%,rgba(60,42,12,.84),rgba(7,10,20,.95) 72%)}
.pk-wrap{position:relative;display:grid;justify-items:center;gap:clamp(14px,3vh,26px);padding:16px}
.pk-head{display:grid;justify-items:center;gap:10px;text-align:center;animation:pk-drop .35s ease-out}
.pk-eyebrow{font:600 12px/1 var(--mono);letter-spacing:.34em;color:var(--ember);text-transform:uppercase;padding-left:.34em}
.pk-title{font-size:clamp(32px,4.6vw,54px);font-weight:800;letter-spacing:.06em;text-transform:uppercase;line-height:.9;text-shadow:0 2px 14px rgba(0,0,0,.6)}
#pk-pick.leg .pk-eyebrow{color:#ffd25e}
#pk-pick.leg .pk-title{color:#ffe7a0;text-shadow:0 0 26px rgba(255,196,70,.55),0 2px 10px rgba(0,0,0,.6)}
.pk-cards{display:flex;gap:18px;align-items:flex-start}
.pk-slot{position:relative;filter:drop-shadow(0 10px 22px rgba(0,0,0,.55));animation:pk-card .46s cubic-bezier(.2,.9,.3,1.15) backwards}
.pk-slot:nth-child(2){animation-delay:.07s}.pk-slot:nth-child(3){animation-delay:.14s}.pk-slot:nth-child(4){animation-delay:.21s}
.pk-slot.leg{filter:drop-shadow(0 0 14px rgba(255,196,70,.6)) drop-shadow(0 10px 22px rgba(0,0,0,.5))}
.pk-card{--cut:polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px);position:relative;display:block;
  width:min(232px,28vw);height:318px;clip-path:var(--cut);background:rgba(232,228,216,.26);cursor:pointer;
  transition:transform .16s cubic-bezier(.2,.9,.3,1.3),background .16s}
#pk-pick.lock .pk-card{cursor:none}
.pk-in{position:absolute;inset:2px;clip-path:var(--cut);display:flex;flex-direction:column;align-items:center;text-align:center;
  padding:24px 16px 16px;gap:12px;background:linear-gradient(165deg,rgba(30,37,66,.97),rgba(9,12,24,.97) 62%)}
.pk-txt{display:flex;flex-direction:column;align-items:center;gap:9px}
.pk-slot.sel .pk-card{transform:translateY(-10px);background:var(--ember)}
.pk-slot.leg .pk-card{background:linear-gradient(140deg,#fff1b8,#ffcf4a 30%,#9c6610 58%,#ffe08a);background-size:220% 220%;animation:pk-sheen 2.4s linear infinite}
.pk-slot.leg .pk-in{background:linear-gradient(165deg,rgba(60,45,16,.97),rgba(16,12,6,.97) 64%)}
.pk-slot.leg.sel .pk-card{background:linear-gradient(140deg,#fffbe8,#ffe07a 40%,#ffd25e);background-size:100% 100%}
.pk-key{position:absolute;left:11px;top:11px;font:700 12px/1 var(--mono);color:var(--ink);background:var(--bone);padding:4px 6px 3px}
.pk-slot.sel .pk-key{background:var(--ember)}
.pk-slot.leg .pk-key{background:#ffd25e}
.pk-glyph{flex:none;width:68px;height:68px;margin-top:4px;display:grid;place-items:center;color:var(--ember);
  clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:radial-gradient(circle,rgba(255,122,60,.28),rgba(255,122,60,.05) 70%)}
.pk-glyph.defense{color:#a9d3f5;background:radial-gradient(circle,rgba(127,183,230,.3),rgba(127,183,230,.05) 70%)}
.pk-glyph.utility{color:#bfee9a;background:radial-gradient(circle,rgba(155,229,100,.26),rgba(155,229,100,.05) 70%)}
.pk-glyph svg{width:32px;height:32px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.pk-slot.leg .pk-glyph{color:#ffd25e;background:radial-gradient(circle,rgba(255,210,94,.42),rgba(255,210,94,.06) 70%);animation:pk-glow 1.6s ease-in-out infinite}
.pk-rar{font:600 10px/1 var(--mono);letter-spacing:.24em;text-transform:uppercase;color:#ff9c74}
.pk-rar.defense{color:#a9d3f5}.pk-rar.utility{color:#bfee9a}
.pk-slot.leg .pk-rar{color:#ffd25e;letter-spacing:.36em;font-weight:700}
.pk-name{font-size:25px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;line-height:.95}
.pk-slot.leg .pk-name{color:#fff0c4}
.pk-desc{font-size:16px;line-height:1.32;color:rgba(232,228,216,.84);max-width:22ch}
.pk-stack{margin-top:auto;display:flex;flex-direction:column;align-items:center;gap:7px;font:600 9.5px/1 var(--mono);letter-spacing:.2em;color:var(--dim);text-transform:uppercase}
.pk-pips{display:flex;gap:4px}
.pk-pips i{display:block;width:15px;height:5px;background:rgba(232,228,216,.2);transform:skewX(-22deg)}
.pk-pips i.on{background:var(--bone)}
.pk-pips i.nx{background:var(--ember);box-shadow:0 0 6px rgba(255,122,60,.85)}
.pk-slot.leg .pk-pips i.nx{background:#ffd25e;box-shadow:0 0 7px rgba(255,210,94,.9)}
.pk-foot{font:600 11px/1.6 var(--mono);letter-spacing:.2em;color:var(--dim);text-transform:uppercase;text-align:center}
.pk-foot b{color:var(--bone);background:rgba(232,228,216,.13);padding:2px 6px;margin:0 2px;font-weight:700}
.pk-foot em{font-style:normal;color:var(--ember)}
@keyframes pk-card{0%{opacity:0;transform:translateY(26px) scale(.94)}100%{opacity:1;transform:none}}
@keyframes pk-drop{0%{opacity:0;transform:translateY(-12px)}100%{opacity:1;transform:none}}
@keyframes pk-fade{0%{opacity:0}100%{opacity:1}}
@keyframes pk-sheen{0%{background-position:0% 50%}100%{background-position:220% 50%}}
@keyframes pk-glow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.45)}}
@keyframes pk-pop{0%{transform:scale(1.7);filter:brightness(2)}100%{transform:scale(1);filter:none}}
@keyframes pk-blink{0%{opacity:1}100%{opacity:.35}}
@media (max-height:700px){.pk-card{height:282px}.pk-in{padding-top:18px;gap:9px}.pk-glyph{width:56px;height:56px}.pk-desc{font-size:15px}}
@media (max-width:760px){
  .pk-cards{flex-direction:column;gap:8px;align-items:stretch}
  .pk-card{width:min(440px,92vw);height:auto}
  .pk-slot.sel .pk-card{transform:translateX(8px)}
  .pk-in{position:relative;inset:auto;margin:2px;flex-direction:row;align-items:center;text-align:left;padding:12px 14px 12px 42px;gap:12px}
  .pk-txt{align-items:flex-start;gap:6px;flex:1}
  .pk-glyph{width:48px;height:48px;margin:0}
  .pk-glyph svg{width:24px;height:24px}
  .pk-name{font-size:20px}.pk-desc{font-size:14px;max-width:none}
  .pk-stack{margin:0}
  .pk-key{top:50%;transform:translateY(-50%)}
}
`;

const PVS = `
attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;
void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z); }`;
const PFS = `
varying vec4 vColor;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a * a); }`;

export function init(game) {
  const CONFIG = game.CONFIG || {};
  const PC = Object.assign({ firstAt: 20, growth: 8, choices: 3, bossPicks: 2 }, CONFIG.perks);
  const scene = game.scene, camera = game.camera;
  const rand = Math.random;
  const byId = {};
  for (const d of CATALOG) byId[d.id] = d;
  byId.rations = RATIONS;
  const NORMAL = CATALOG.filter((d) => !d.legendary), LEGEND = CATALOG.filter((d) => d.legendary);

  // ------------------------------------------------------------------ state
  const owned = new Map();         // id -> stacks (insertion order = order taken)
  const queue = [];                // pending picks: true = legendary
  const bossTimers = [];           // seconds until a boss reward batch opens
  let kills = 0, picksEarned = 0, prevAt = 0, nextAt = PC.firstAt;
  let current = null;              // open offer: { legendary, choices: [def], sel }
  let openedAt = 0, mouseAcc = 0;
  let baseMods = Object.assign({}, game.mods || {});
  let moveBase = 1, adrenT = 0, adrenOn = false, fireMult = 1, conductorChance = 0;
  let phoenixReady = true, phoenixBlast = false;
  let thunderCount = 0, thunderPending = false, thunderCd = 0;
  let arcCd = 0, arcing = false, zapCd = 0;
  let frostTick = 0, frostFx = 0;
  let reaperCd = 0, dashWas = false;
  let bombGen = 0;                 // generation of the corpse bomb currently exploding (0 = none)
  let lastBoss = null, lastBossT = -10;
  let time = 0, failed = false;
  const stacks = (id) => owned.get(id) || 0;

  const api = {
    update, reset, offer, grant, owned, catalog: CATALOG.slice(),
    has: (id) => stacks(id) > 0, stacks,
    get pending() { return queue.length + bossTimers.length * PC.bossPicks; },
    get killsToNext() { return Math.max(0, nextAt - kills); },
    get kills() { return kills; },
    get choosing() { return !!current; },
    shieldT: 0,                    // player.damage ignores hits while > 0 (PHOENIX revive grace)
    onLethal,                      // player.damage calls this on a lethal hit; true = survived
  };

  // ------------------------------------------------------------------ temps
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3();
  const _near = [], _visited = [];
  const perkInfo = { source: 'perk', headshot: false, point: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1) };
  const hitEvt = { zombie: null, headshot: false, killed: false, point: new THREE.Vector3() };

  function groundAt(x, z) {
    const w = game.world;
    const h = w && w.heightAt ? w.heightAt(x, z) : 0;
    return h === h ? h : 0;
  }
  const nightK = () => { const df = game.dayFactor; return 1 - 0.7 * Math.min(1, Math.max(0, df === df ? df : 0)); };

  // ------------------------------------------------------------------ FX: point sprites (glows + sparks)
  function makePoints(n, order) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
    const aPos = new THREE.BufferAttribute(pos, 3), aCol = new THREE.BufferAttribute(col, 4), aSize = new THREE.BufferAttribute(size, 1);
    aPos.setUsage(THREE.DynamicDrawUsage); aCol.setUsage(THREE.DynamicDrawUsage); aSize.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', aPos); geo.setAttribute('aColor', aCol); geo.setAttribute('aSize', aSize);
    const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, vertexShader: PVS, fragmentShader: PFS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = order;
    scene.add(pts);
    return { n, pos, col, size, aPos, aCol, aSize, mat, pts };
  }
  function flushPoints(P) { P.aPos.needsUpdate = true; P.aCol.needsUpdate = true; P.aSize.needsUpdate = true; }

  // glows: slots [0, MAX_BOMBS) follow corpse bombs, the rest are short flashes
  const GLOWS = MAX_BOMBS + 14;
  const glow = makePoints(GLOWS, 7);
  const glowLife = new Float32Array(GLOWS), glowMax = new Float32Array(GLOWS), glowBase = new Float32Array(GLOWS * 4);
  let glowHead = MAX_BOMBS, glowDirty = true, glowLive = 0;
  function flashGlow(x, y, z, size, life, r, g, b) {
    const i = glowHead; glowHead = glowHead + 1 >= GLOWS ? MAX_BOMBS : glowHead + 1;
    glow.pos[i * 3] = x; glow.pos[i * 3 + 1] = y; glow.pos[i * 3 + 2] = z;
    glowLife[i] = life; glowMax[i] = life;
    glowBase[i * 4] = r; glowBase[i * 4 + 1] = g; glowBase[i * 4 + 2] = b; glowBase[i * 4 + 3] = size;
    glowLive++; glowDirty = true;
  }

  const SPARKS = 700;
  const spark = makePoints(SPARKS, 8);
  const sVel = new Float32Array(SPARKS * 3), sLife = new Float32Array(SPARKS), sMax = new Float32Array(SPARKS);
  const sBase = new Float32Array(SPARKS * 4), sPhys = new Float32Array(SPARKS * 2);
  let sHead = 0, sLive = 0;
  function emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav, drag) {
    const i = sHead; sHead = (i + 1) % SPARKS;
    if (sLife[i] <= 0) sLive++;
    const i3 = i * 3, i4 = i * 4;
    spark.pos[i3] = x; spark.pos[i3 + 1] = y; spark.pos[i3 + 2] = z;
    sVel[i3] = vx; sVel[i3 + 1] = vy; sVel[i3 + 2] = vz;
    sLife[i] = life; sMax[i] = life;
    sBase[i4] = r; sBase[i4 + 1] = g; sBase[i4 + 2] = b; sBase[i4 + 3] = size;
    sPhys[i * 2] = grav; sPhys[i * 2 + 1] = drag;
    spark.col[i4] = r; spark.col[i4 + 1] = g; spark.col[i4 + 2] = b; spark.col[i4 + 3] = 1;
    spark.size[i] = size;
  }
  function burst(x, y, z, n, vMin, vMax, up, life, size, r, g, b, grav, drag) {
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, cy = up ? 0.15 + rand() * 0.85 : rand() * 2 - 1, sy = Math.sqrt(1 - cy * cy);
      const v = vMin + rand() * (vMax - vMin), j = 0.65 + rand() * 0.5;
      emit(x, y, z, Math.cos(a) * sy * v, cy * v, Math.sin(a) * sy * v, life * (0.6 + rand() * 0.8), size * (0.6 + rand() * 0.8), r * j, g * j, b * j, grav, drag);
    }
  }
  function updateSparks(dt) {
    if (sLive <= 0) return;
    let live = 0;
    const pos = spark.pos, col = spark.col, size = spark.size;
    for (let i = 0; i < SPARKS; i++) {
      let l = sLife[i];
      if (l <= 0) continue;
      const i3 = i * 3, i4 = i * 4;
      l -= dt;
      if (l <= 0) { sLife[i] = 0; size[i] = 0; col[i4 + 3] = 0; continue; }
      sLife[i] = l; live++;
      let k = 1 - sPhys[i * 2 + 1] * dt; if (k < 0) k = 0;
      sVel[i3] *= k; sVel[i3 + 1] = sVel[i3 + 1] * k - sPhys[i * 2] * dt; sVel[i3 + 2] *= k;
      pos[i3] += sVel[i3] * dt; pos[i3 + 1] += sVel[i3 + 1] * dt; pos[i3 + 2] += sVel[i3 + 2] * dt;
      const t = l / sMax[i];
      col[i4 + 3] = t > 0.6 ? 1 : t / 0.6;
      size[i] = sBase[i4 + 3] * (0.35 + 0.65 * t);
    }
    sLive = live;
    flushPoints(spark);
  }

  // ------------------------------------------------------------------ FX: lightning ribbons (one draw call)
  const MAXB = 20, BS = 10, BP = BS + 1, BV = BP * 2;
  const bPts = new Float32Array(MAXB * BP * 3);
  const bLife = new Float32Array(MAXB), bMax = new Float32Array(MAXB), bW = new Float32Array(MAXB), bCol = new Float32Array(MAXB * 3);
  const bvPos = new Float32Array(MAXB * BV * 3), bvCol = new Float32Array(MAXB * BV * 3);
  const bIdx = new Uint16Array(MAXB * BS * 6);
  for (let b = 0, k = 0; b < MAXB; b++) {
    for (let s = 0; s < BS; s++) {
      const v = b * BV + s * 2;
      bIdx[k++] = v; bIdx[k++] = v + 1; bIdx[k++] = v + 2; bIdx[k++] = v + 1; bIdx[k++] = v + 3; bIdx[k++] = v + 2;
    }
  }
  const boltGeo = new THREE.BufferGeometry();
  const bvPosAttr = new THREE.BufferAttribute(bvPos, 3), bvColAttr = new THREE.BufferAttribute(bvCol, 3);
  bvPosAttr.setUsage(THREE.DynamicDrawUsage); bvColAttr.setUsage(THREE.DynamicDrawUsage);
  boltGeo.setAttribute('position', bvPosAttr); boltGeo.setAttribute('color', bvColAttr);
  boltGeo.setIndex(new THREE.BufferAttribute(bIdx, 1));
  const boltMesh = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  boltMesh.frustumCulled = false; boltMesh.renderOrder = 9;
  scene.add(boltMesh);
  let bHead = 0, bAny = false;
  function spawnBolt(ax, ay, az, bx, by, bz, width, life, r, g, b, jag) {
    const i = bHead; bHead = (bHead + 1) % MAXB;
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= len; dy /= len; dz /= len;
    let ux, uy, uz;
    if (Math.abs(dy) < 0.9) { ux = -dz; uy = 0; uz = dx; } else { ux = 0; uy = dz; uz = -dy; }
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const o = i * BP * 3;
    for (let s = 0; s <= BS; s++) {
      const t = s / BS;
      const env = s === 0 || s === BS ? 0 : Math.sin(Math.PI * t) * (0.55 + 0.45 * rand());
      const ou = (rand() * 2 - 1) * jag * env, ov = (rand() * 2 - 1) * jag * env;
      bPts[o + s * 3] = ax + dx * len * t + ux * ou + vx * ov;
      bPts[o + s * 3 + 1] = ay + dy * len * t + uy * ou + vy * ov;
      bPts[o + s * 3 + 2] = az + dz * len * t + uz * ou + vz * ov;
    }
    bLife[i] = life; bMax[i] = life; bW[i] = width;
    bCol[i * 3] = r; bCol[i * 3 + 1] = g; bCol[i * 3 + 2] = b;
    bAny = true;
  }
  function updateBolts(dt) {
    if (!bAny) return;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    let any = false;
    for (let i = 0; i < MAXB; i++) {
      if (bLife[i] <= 0) continue;
      bLife[i] -= dt;
      const base = i * BV * 3;
      if (bLife[i] <= 0) { bLife[i] = 0; bvPos.fill(0, base, base + BV * 3); bvCol.fill(0, base, base + BV * 3); continue; }
      any = true;
      const f = bLife[i] / bMax[i], a = f * Math.sqrt(f) * (0.7 + 0.3 * rand());
      const w = bW[i] * (0.55 + 0.45 * f);
      const pb = i * BP * 3, r = bCol[i * 3] * a, g = bCol[i * 3 + 1] * a, b = bCol[i * 3 + 2] * a;
      for (let s = 0; s < BP; s++) {
        const s0 = s > 0 ? s - 1 : 0, s1 = s < BS ? s + 1 : BS;
        const tx = bPts[pb + s1 * 3] - bPts[pb + s0 * 3], ty = bPts[pb + s1 * 3 + 1] - bPts[pb + s0 * 3 + 1], tz = bPts[pb + s1 * 3 + 2] - bPts[pb + s0 * 3 + 2];
        const px = bPts[pb + s * 3], py = bPts[pb + s * 3 + 1], pz = bPts[pb + s * 3 + 2];
        const vx = cx - px, vy = cy - py, vz = cz - pz;
        let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
        const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
        const hw = w * 0.5 * (s === 0 || s === BS ? 0.35 : 1) / sl;
        sx *= hw; sy *= hw; sz *= hw;
        const o = base + s * 6;
        bvPos[o] = px + sx; bvPos[o + 1] = py + sy; bvPos[o + 2] = pz + sz;
        bvPos[o + 3] = px - sx; bvPos[o + 4] = py - sy; bvPos[o + 5] = pz - sz;
        bvCol[o] = r; bvCol[o + 1] = g; bvCol[o + 2] = b; bvCol[o + 3] = r; bvCol[o + 4] = g; bvCol[o + 5] = b;
      }
    }
    bvPosAttr.needsUpdate = true; bvColAttr.needsUpdate = true;
    bAny = any;
  }

  // one shared flash light (lightning / phoenix), always in the scene so it never forces a shader recompile
  const flashLight = new THREE.PointLight(0xcfe2ff, 0, 60, 2);
  scene.add(flashLight);
  let flashT = 0, flashDur = 0, flashPeak = 0;
  function lightFlash(x, y, z, peak, dur, dist, r, g, b) {
    flashLight.position.set(x, y, z); flashLight.distance = dist; flashLight.color.setRGB(r, g, b);
    flashT = dur; flashDur = dur; flashPeak = peak;
  }

  // ------------------------------------------------------------------ sound (into the shared audio graph)
  let noiseBuf = null, voices = 0;
  function actx() {
    const a = game.audio, ctx = a && a.context, out = a && a.output;
    if (!ctx || !out || ctx.state !== 'running') return null;
    if (!noiseBuf) {
      try {
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { return null; }
    }
    return ctx;
  }
  function env(g, t0, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function tone(type, f0, f1, dur, vol, delay, attack) {
    const ctx = actx(); if (!ctx || voices >= 14 || !(vol > 0.002)) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      const g = ctx.createGain(); env(g, t0, vol, attack || 0.005, dur);
      o.connect(g); g.connect(game.audio.output);
      o.start(t0); o.stop(t0 + dur + 0.05);
      voices++;
      o.onended = () => { voices--; try { g.disconnect(); } catch (e) { /* gone */ } };
    } catch (e) { /* audio is optional */ }
  }
  function noise(ftype, f0, f1, q, dur, vol, delay, attack) {
    const ctx = actx(); if (!ctx || voices >= 14 || !(vol > 0.002)) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q || 0.7;
      f.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t0 + dur);
      const g = ctx.createGain(); env(g, t0, vol, attack || 0.004, dur);
      src.connect(f); f.connect(g); g.connect(game.audio.output);
      src.start(t0, Math.random() * 0.8); src.stop(t0 + dur + 0.05);
      voices++;
      src.onended = () => { voices--; try { g.disconnect(); } catch (e) { /* gone */ } };
    } catch (e) { /* audio is optional */ }
  }
  const sfx = {
    open(leg) {
      if (leg) {
        tone('sine', 392, 392, 1.4, 0.12, 0, 0.03); tone('sine', 493.9, 493.9, 1.3, 0.1, 0.08, 0.03);
        tone('sine', 587.3, 587.3, 1.2, 0.09, 0.16, 0.03); tone('sine', 784, 784, 1.1, 0.08, 0.24, 0.03);
        tone('triangle', 1568, 1568, 0.9, 0.035, 0.3, 0.02); noise('highpass', 5000, 9000, 0.7, 0.9, 0.05, 0.05, 0.3);
      } else {
        tone('sine', 660, 660, 0.35, 0.12, 0, 0.01); tone('sine', 990, 990, 0.5, 0.1, 0.09, 0.01);
        noise('bandpass', 2400, 5200, 2, 0.25, 0.05, 0, 0.05);
      }
    },
    pick(leg) {
      tone('triangle', 180, 90, 0.18, 0.22); noise('lowpass', 1800, 300, 0.7, 0.16, 0.18);
      tone('sine', leg ? 1046.5 : 880, leg ? 1046.5 : 880, 0.5, 0.1, 0.04, 0.01);
      if (leg) tone('sine', 1568, 1568, 0.7, 0.07, 0.1, 0.01);
    },
    move() { tone('triangle', 1400, 1300, 0.04, 0.05); },
    zap(v) { noise('highpass', 3000, 6000, 0.7, 0.09, 0.16 * v); tone('sawtooth', 1900, 600, 0.08, 0.05 * v); },
    thunder(v) {
      noise('highpass', 2600, 1400, 0.7, 0.12, 0.6 * v);
      tone('square', 90, 40, 0.25, 0.18 * v, 0.01);
      noise('lowpass', 2400, 120, 0.6, 1.7, 0.75 * v, 0.03, 0.02);
      noise('lowpass', 500, 80, 0.8, 2.4, 0.4 * v, 0.25, 0.3);
    },
    phoenix() {
      noise('bandpass', 300, 2400, 1.1, 1.0, 0.5, 0, 0.25); tone('sawtooth', 110, 440, 0.9, 0.12, 0, 0.3);
      tone('sine', 523.25, 523.25, 1.6, 0.11, 0.6, 0.05); tone('sine', 784, 784, 1.5, 0.09, 0.66, 0.05);
    },
  };

  // ------------------------------------------------------------------ modifiers
  function recompute() {
    const m = game.mods;
    if (!m) return;
    Object.assign(m, baseMods);
    const s = stacks;
    m.damageMult *= 1 + 0.15 * s('hollow_points');
    m.headshotMult *= 1 + 0.3 * s('marksman');
    m.fireRateMult *= (1 + 0.12 * s('trigger')) * (s('bullet_storm') ? 1.4 : 1);
    m.reloadMult *= Math.pow(1.2, s('quick_hands'));                       // weapons.js: reload time / reloadMult
    m.ammoSaveChance = 1 - (1 - m.ammoSaveChance) * Math.pow(0.88, s('lucky_mag')) * (s('bullet_storm') ? 0.65 : 1);
    m.igniteChance = s('dawnfire') ? 1 : Math.min(1, m.igniteChance + 0.1 * s('incendiary'));
    m.extraJumps += s('spring_legs');
    m.damageTakenMult *= Math.pow(0.9, s('iron_hide')) * (s('juggernaut') ? 0.7 : 1);
    m.cooldownMult *= Math.pow(0.85, s('overclock'));                      // skills.js: cooldown time * cooldownMult
    m.blastMult *= 1 + 0.15 * s('demolition');
    m.dropMult *= 1 + 0.5 * s('scavenger');
    m.knockImmune = s('juggernaut') ? 1 : 0;                               // player.js: the horde cannot shove you
    moveBase = m.moveMult;
    adrenOn = adrenT > 0 && s('adrenaline') > 0;
    m.moveMult = moveBase * (adrenOn ? 1 + 0.2 * s('adrenaline') : 1);
    fireMult = s('dawnfire') ? 1.5 : 1;
    conductorChance = 0.2 * s('conductor');
  }

  // hooks into the zombie API: fire damage scaling (DAWNFIRE) and bullet-hit chain lightning (CONDUCTOR)
  let origDamage = null;
  function rawDamage(z, amount, info) {
    const zs = game.zombies;
    if (origDamage) return origDamage.call(zs, z, amount, info);
    return zs && zs.damage ? zs.damage(z, amount, info) : false;
  }
  function wrapZombies() {
    const zs = game.zombies;
    if (!zs) return;
    if (typeof zs.damage === 'function' && !zs.damage.__perks) {
      const orig = zs.damage;
      origDamage = orig;
      const wrapped = function (z, amount, info) {
        const src = info && info.source;
        if (src === 'fire' && fireMult !== 1) amount *= fireMult;
        const killed = orig.call(zs, z, amount, info);
        if (src === 'bullet' && conductorChance > 0 && !arcing && arcCd <= 0 && rand() < conductorChance) {
          try { arcFrom(z, info, amount); } catch (e) { arcing = false; }
        }
        return killed;
      };
      wrapped.__perks = true;
      zs.damage = wrapped;
    }
    if (typeof zs.ignite === 'function' && !zs.ignite.__perks) {
      const orig = zs.ignite;
      const wrapped = function (z, dps, seconds) { return orig.call(zs, z, (dps || 0) * fireMult, seconds); };
      wrapped.__perks = true;
      zs.ignite = wrapped;
    }
  }

  // ------------------------------------------------------------------ CONDUCTOR
  function arcFrom(z0, info, amount) {
    const zs = game.zombies;
    if (!zs || !zs.inRadius || !z0 || !z0.position) return;
    arcing = true; arcCd = ARC_CD;
    const arcDmg = Math.max(1, (amount || 0) * ARC_FRACTION);
    const hops = 1 + stacks('conductor');
    let cx, cy, cz;
    if (info && info.point) { cx = info.point.x; cy = info.point.y; cz = info.point.z; }
    else { cx = z0.position.x; cy = z0.position.y + (z0.height || 1.7) * 0.6; cz = z0.position.z; }
    let fy = z0.position.y;
    _visited.length = 0; _visited.push(z0);
    let n = 0;
    try {
      for (let h = 0; h < hops; h++) {
        _c.set(cx, fy, cz);
        zs.inRadius(_c, 7, _near);
        let best = null, bd = Infinity;
        for (let i = 0; i < _near.length; i++) {
          const z = _near[i];
          if (!z || !z.alive || _visited.indexOf(z) >= 0) continue;
          const dx = z.position.x - cx, dz = z.position.z - cz, d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = z; }
        }
        _near.length = 0;
        if (!best) break;
        const tx = best.position.x, ty = best.position.y + (best.height || 1.7) * 0.6, tz = best.position.z;
        spawnBolt(cx, cy, cz, tx, ty, tz, 0.13, 0.17, 1.3, 2.0, 3.4, 0.45);
        spawnBolt(cx, cy, cz, tx, ty, tz, 0.05, 0.12, 2.2, 2.6, 3.2, 0.7);
        flashGlow(tx, ty, tz, 1.6, 0.16, 0.9, 1.4, 2.6);
        perkInfo.point.set(tx, ty, tz);
        perkInfo.dir.set(tx - cx, 0, tz - cz);
        if (perkInfo.dir.lengthSq() < 1e-6) perkInfo.dir.set(0, 0, 1);
        perkInfo.dir.normalize();
        rawDamage(best, arcDmg, perkInfo);
        if (h === 0) best.stunT = Math.max(best.stunT || 0, 0.25);
        _visited.push(best); n++;
        cx = tx; cy = ty; cz = tz; fy = best.position.y;
      }
    } finally { arcing = false; _visited.length = 0; }
    if (n > 0) {
      for (let i = 0; i < 6; i++) emit(cx, cy, cz, (rand() - 0.5) * 6, rand() * 4, (rand() - 0.5) * 6, 0.25, 0.12, 1.2, 1.8, 3, 8, 1.5);
      if (zapCd <= 0) { zapCd = 0.07; sfx.zap(atten(cx, cy, cz)); }
    }
  }
  function atten(x, y, z) {
    const p = game.player && game.player.position;
    if (!p) return 1;
    const dx = p.x - x, dy = p.y - y, dz = p.z - z;
    return 1 / (1 + Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.05);
  }

  // ------------------------------------------------------------------ THUNDERHEAD
  function lightningStrike() {
    const pl = game.player, zs = game.zombies, w = game.world;
    if (!pl || !pl.getAimRay) return;
    pl.getAimRay(_o, _d);
    if (!(_d.lengthSq() > 1e-6)) return;
    _d.normalize();
    let dist = Infinity, found = false;
    const zh = zs && zs.raycast ? zs.raycast(_o, _d, 160) : null;
    if (zh && zh.zombie) { _p.copy(zh.zombie.position); dist = zh.distance; found = true; }
    const wh = w && w.raycast ? w.raycast(_o, _d, 160) : null;
    if (wh && wh.point && wh.distance < dist) { _p.copy(wh.point); found = true; }
    if (!found) { _p.copy(_o).addScaledVector(_d, 45); _p.y = groundAt(_p.x, _p.z); }
    const x = _p.x, y = _p.y, z = _p.z;
    // the bolt: sky -> target, two thinner branches
    const sx = x + (rand() - 0.5) * 8, sz = z + (rand() - 0.5) * 8, sy = y + 46;
    spawnBolt(sx, sy, sz, x, y + 0.05, z, 0.7, 0.34, 2.0, 2.4, 3.4, 2.6);
    spawnBolt(sx, sy, sz, x, y + 0.05, z, 0.22, 0.26, 3.0, 3.0, 3.2, 3.4);
    for (let k = 0; k < 2; k++) {
      const t = 0.35 + rand() * 0.35;
      const bx = sx + (x - sx) * t, by = sy + (y - sy) * t, bz = sz + (z - sz) * t;
      spawnBolt(bx, by, bz, bx + (rand() - 0.5) * 10, by - 6 - rand() * 8, bz + (rand() - 0.5) * 10, 0.16, 0.2, 1.4, 1.9, 3.0, 1.6);
    }
    flashGlow(x, y + 0.6, z, 9, 0.35, 1.6, 2.0, 3.0);
    flashGlow(x, y + 0.3, z, 4, 0.5, 2.2, 2.4, 3.0);
    burst(x, y + 0.2, z, 46, 4, 16, true, 0.55, 0.2, 1.4, 1.9, 3.0, 14, 1.2);
    lightFlash(x, y + 5, z, 1300 * nightK(), 0.3, 70, 0.8, 0.88, 1.0);
    if (pl.addShake) pl.addShake(0.035);
    sfx.thunder(Math.max(0.4, atten(x, y, z)));
    // damage
    if (zs && zs.inRadius) {
      const R = 3.6;
      _c.set(x, y, z);
      zs.inRadius(_c, R, _near);
      let hits = 0, killed = false, first = null;
      for (let i = 0; i < _near.length; i++) {
        const zb = _near[i];
        if (!zb || !zb.alive) continue;
        const dx = zb.position.x - x, dz = zb.position.z - z, d = Math.sqrt(dx * dx + dz * dz);
        perkInfo.point.set(zb.position.x, zb.position.y + (zb.height || 1.7) * 0.6, zb.position.z);
        perkInfo.dir.set(d > 0.01 ? dx / d : 1, 0, d > 0.01 ? dz / d : 0);
        if (rawDamage(zb, 200 * (1 - 0.5 * Math.min(1, d / R)), perkInfo)) killed = true;
        else if (zb.type !== 'boss') zb.stunT = Math.max(zb.stunT || 0, 1.1);   // never ability-lock the boss
        hits++; if (!first) first = zb;
      }
      _near.length = 0;
      if (hits) { hitEvt.zombie = first; hitEvt.headshot = false; hitEvt.killed = killed; hitEvt.point.set(x, y + 1, z); game.emit('hit', hitEvt); }
    }
  }

  // ------------------------------------------------------------------ CORPSE BOMB
  const bombs = [];
  for (let i = 0; i < MAX_BOMBS; i++) bombs.push({ active: false, x: 0, y: 0, z: 0, t: 0, fuse: 2, radius: 3.5, damage: 70, gen: 0, phase: 0, big: false, acc: 0 });
  let bombsLive = 0;
  function armBomb(p, gen) {
    const n = stacks('corpse_bomb');
    if (!n || !p) return;
    const cascade = stacks('cascade') > 0;
    if (gen > (cascade ? CASCADE_MAX_GEN : 2)) return; // plain bombs fizzle after 2 links, cascade after 6
    let b = null;
    for (let i = 0; i < MAX_BOMBS; i++) if (!bombs[i].active) { b = bombs[i]; break; }
    if (!b) return;                                    // cap: at most MAX_BOMBS pending
    b.active = true; b.x = p.x; b.y = p.y; b.z = p.z; b.gen = gen; b.phase = rand() * TAU; b.acc = 0;
    b.big = cascade;
    b.radius = bombRadius(n) * (cascade ? 1.6 : 1) * Math.pow(BOMB_GEN_SHRINK, gen);
    b.damage = bombDamage(n) * (cascade ? CASCADE_DMG : 1) * Math.pow(BOMB_GEN_DECAY, gen);
    b.fuse = (cascade ? 1.2 : 2.0) + (gen > 0 ? rand() * 0.3 : rand() * 0.08);
    b.t = b.fuse;
    bombsLive++;
  }
  function updateBombs(dt) {
    if (bombsLive <= 0) { return; }
    let live = 0;
    const sk = game.skills;
    for (let i = 0; i < MAX_BOMBS; i++) {
      const b = bombs[i];
      if (!b.active) continue;
      b.t -= dt;
      if (b.t <= 0) {
        b.active = false;
        glow.size[i] = 0; glow.col[i * 4 + 3] = 0;
        if (sk && sk.blast) {
          bombGen = b.gen + 1;
          try {
            sk.blast(b.x, b.y + 0.45, b.z, { radius: b.radius, damage: b.damage, knock: b.big ? 13 : 9, selfRadius: 0, selfDamage: 0,
              shake: b.big ? 0.16 : 0.1, source: 'perk' });
          } finally { bombGen = 0; }
        }
        continue;
      }
      live++;
      const k = 1 - b.t / b.fuse;                       // 0 -> 1 as the fuse burns
      b.phase += dt * (5 + 26 * k * k);
      const pulse = 0.5 + 0.5 * Math.sin(b.phase);
      const hot = k * k;
      const sz = (b.big ? 1.5 : 1) * (0.7 + 0.9 * k) * (0.75 + 0.5 * pulse);
      const a = 0.55 + 0.45 * pulse;
      glow.pos[i * 3] = b.x; glow.pos[i * 3 + 1] = b.y + 0.38; glow.pos[i * 3 + 2] = b.z;
      glow.size[i] = sz;
      glow.col[i * 4] = (1.6 + 1.2 * hot) * a; glow.col[i * 4 + 1] = (0.35 + 1.4 * hot) * a; glow.col[i * 4 + 2] = (0.08 + 0.9 * hot) * a;
      glow.col[i * 4 + 3] = 1;
      b.acc += dt * (3 + 10 * k);
      while (b.acc >= 1) {
        b.acc -= 1;
        emit(b.x + (rand() - 0.5) * 0.5, b.y + 0.25, b.z + (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.8, 1 + rand() * 2.2, (rand() - 0.5) * 0.8,
          0.4 + rand() * 0.3, 0.1 + rand() * 0.08, 2.2, 0.8, 0.2, 2, 0.6);
      }
    }
    // recount: a blast inside this loop can re-arm a slot the loop already passed (armBomb's bombsLive++ must not be lost)
    let n = 0;
    for (let i = 0; i < MAX_BOMBS; i++) if (bombs[i].active) n++;
    bombsLive = n;
    glowDirty = true;
  }
  function updateGlows(dt) {
    if (glowLive > 0) {
      let live = 0;
      for (let i = MAX_BOMBS; i < GLOWS; i++) {
        let l = glowLife[i];
        if (l <= 0) continue;
        l -= dt;
        if (l <= 0) { glowLife[i] = 0; glow.size[i] = 0; glow.col[i * 4 + 3] = 0; continue; }
        glowLife[i] = l; live++;
        const f = l / glowMax[i], e = f * f;
        glow.size[i] = glowBase[i * 4 + 3] * (0.6 + 0.4 * f);
        glow.col[i * 4] = glowBase[i * 4] * e; glow.col[i * 4 + 1] = glowBase[i * 4 + 1] * e; glow.col[i * 4 + 2] = glowBase[i * 4 + 2] * e;
        glow.col[i * 4 + 3] = 1;
      }
      glowLive = live;
      glowDirty = true;
    }
    if (glowDirty) { flushPoints(glow); glowDirty = false; }
  }

  // ------------------------------------------------------------------ PHOENIX
  function onLethal() {
    if (!stacks('phoenix') || !phoenixReady || game.state !== 'playing') return false;
    const pl = game.player;
    if (!pl) return false;
    phoenixReady = false;
    pl.health = Math.max(1, Math.round(pl.maxHealth * 0.5));
    api.shieldT = 2.0;
    phoenixBlast = true;                     // the firestorm goes off in update(), outside the damage call stack
    game.emit('toast', 'PHOENIX: you rise from the ashes');
    refreshChips();
    return true;
  }
  function phoenixStorm() {
    const pl = game.player, sk = game.skills;
    if (!pl || !pl.position) return;
    const p = pl.position;
    if (sk && sk.blast) sk.blast(p.x, p.y + 0.6, p.z, { radius: 9, damage: 420, knock: 22, selfRadius: 0, selfDamage: 0, shake: 0.35, source: 'perk' });
    const zs = game.zombies;
    if (zs && zs.inRadius) {
      zs.inRadius(p, 13, _near);
      for (let i = 0; i < _near.length; i++) { const z = _near[i]; if (z && z.alive) z.stunT = Math.max(z.stunT || 0, 1.6); }
      _near.length = 0;
    }
    for (let i = 0; i < 70; i++) {
      const a = rand() * TAU, r = rand() * 1.4;
      emit(p.x + Math.cos(a) * r, p.y + 0.2 + rand() * 0.6, p.z + Math.sin(a) * r, Math.cos(a) * (1 + rand() * 5), 5 + rand() * 11, Math.sin(a) * (1 + rand() * 5),
        0.9 + rand() * 0.9, 0.18 + rand() * 0.22, 2.8, 1.1 + rand() * 0.5, 0.25, 4, 0.9);
    }
    flashGlow(p.x, p.y + 1.2, p.z, 10, 0.7, 2.8, 1.4, 0.4);
    lightFlash(p.x, p.y + 3, p.z, 900 * nightK(), 0.8, 50, 1.0, 0.6, 0.25);
    sfx.phoenix();
  }

  // ------------------------------------------------------------------ REAPER'S WALTZ (dash damage)
  const reaperHit = [];
  const dashPrev = new THREE.Vector3();
  function updateReaper() {
    const sk = game.skills, pl = game.player, zs = game.zombies;
    const dashing = !!(sk && sk.dashing);
    if (stacks('reaper') && (dashing || dashWas) && pl && pl.position && zs && zs.inRadius) {
      const p = pl.position;
      const ax = dashPrev.x, az = dashPrev.z, bx = p.x, bz = p.z;
      const sx = bx - ax, sz = bz - az, sl2 = sx * sx + sz * sz;
      _c.set((ax + bx) * 0.5, p.y, (az + bz) * 0.5);
      zs.inRadius(_c, Math.sqrt(sl2) * 0.5 + 1.3, _near);
      for (let i = 0; i < _near.length; i++) {
        const z = _near[i];
        if (!z || !z.alive || reaperHit.indexOf(z) >= 0) continue;
        const qx = z.position.x - ax, qz = z.position.z - az;
        let t = sl2 > 1e-6 ? (qx * sx + qz * sz) / sl2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = qx - sx * t, ez = qz - sz * t;
        const rr = 1.1 + (z.radius || 0.4);
        if (ex * ex + ez * ez > rr * rr) continue;
        reaperHit.push(z);
        const hy = z.position.y + (z.height || 1.7) * 0.6;
        perkInfo.point.set(z.position.x, hy, z.position.z);
        perkInfo.dir.set(sx, 0, sz); if (perkInfo.dir.lengthSq() < 1e-6) perkInfo.dir.set(0, 0, 1); perkInfo.dir.normalize();
        rawDamage(z, 150, perkInfo);
        burst(z.position.x, hy, z.position.z, 12, 2, 7, false, 0.35, 0.14, 1.6, 0.5, 2.4, 3, 1.5);
        flashGlow(z.position.x, hy, z.position.z, 1.8, 0.2, 1.6, 0.5, 2.4);
      }
      _near.length = 0;
    }
    if (pl && pl.position) dashPrev.copy(pl.position);
    dashWas = dashing;
  }

  // ------------------------------------------------------------------ FROST AURA
  function updateFrost(dt) {
    const n = stacks('frost_aura'), pl = game.player, zs = game.zombies;
    if (!n || !pl || !pl.position || pl.alive === false || !zs || !zs.inRadius) return;
    frostTick -= dt;
    if (frostTick > 0) return;
    frostTick = 0.2;
    const R = frostRadius(n), mult = frostSlow(n), p = pl.position;
    zs.inRadius(p, R, _near);
    for (let i = 0; i < _near.length; i++) {
      const z = _near[i];
      if (!z || !z.alive) continue;
      const m = z.type === 'boss' ? Math.sqrt(mult) : mult;
      if (!(z.slowT > 0) || !(z.slowMult <= m)) z.slowMult = m;
      z.slowT = Math.max(z.slowT || 0, 0.35);
      if (rand() < 0.45) emit(z.position.x + (rand() - 0.5) * 0.6, z.position.y + 0.2 + rand() * (z.height || 1.7) * 0.8, z.position.z + (rand() - 0.5) * 0.6,
        (rand() - 0.5) * 0.4, 0.3 + rand() * 0.5, (rand() - 0.5) * 0.4, 0.8, 0.12, 0.55, 0.95, 1.6, -0.2, 0.5);
    }
    _near.length = 0;
    // a faint ring of frost mist marks the edge of the aura
    frostFx = (frostFx + 1) % 2;
    for (let k = 0; k < 4 + frostFx; k++) {
      const a = rand() * TAU, r = R * (0.88 + rand() * 0.12), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      emit(x, groundAt(x, z) + 0.15, z, -Math.sin(a) * 0.5, 0.25 + rand() * 0.3, Math.cos(a) * 0.5, 1.1, 0.16 + rand() * 0.1, 0.32, 0.6, 1.1, -0.1, 0.4);
    }
  }

  // ------------------------------------------------------------------ progression
  function refreshNext() {
    const span = Math.max(1, nextAt - prevAt);
    const k = Math.min(1, Math.max(0, (kills - prevAt) / span));
    const ready = queue.length > 0 || bossTimers.length > 0 || !!current;
    const txt = ready ? 'PERK READY' : String(Math.max(0, nextAt - kills));
    if (txt !== hudCache.txt) {
      hudCache.txt = txt;
      nextLbl.innerHTML = ready ? '<b>Perk ready</b>' : `Perk in <b>${txt}</b>`;
    }
    const kk = Math.round(k * 100);
    if (kk !== hudCache.k) { hudCache.k = kk; nextBar.style.transform = `scaleX(${(kk / 100).toFixed(2)})`; }
    if (ready !== hudCache.ready) { hudCache.ready = ready; hudEl.classList.toggle('ready', ready); }
  }

  function bossReward(z) {
    // 'bossKilled' and 'zombieKilled' {boss:true} both arrive for one death: reward it once
    if (time - lastBossT < 2 && (!z || !lastBoss || z === lastBoss)) return;
    lastBoss = z || null; lastBossT = time;
    bossTimers.push(BOSS_DELAY);
    refreshNext();
  }

  game.on('zombieKilled', (e) => {
    if (game.state !== 'playing' || !e) return;
    const z = e.zombie;
    const p = e.position || (z && z.position);
    kills++;
    while (kills >= nextAt) {
      queue.push(false);
      picksEarned++;
      prevAt = nextAt;
      nextAt += PC.firstAt + PC.growth * picksEarned;     // 20, 48, 84, 128, ...
    }
    refreshNext();
    const pl = game.player;
    if (pl && pl.alive !== false) {
      const vamp = stacks('vampire');
      if (vamp && pl.heal) pl.heal((e.headshot ? 4 : 2) * vamp);
      if (stacks('necro')) {
        if (pl.heal) pl.heal(3);
        if (pl.addArmor) pl.addArmor(2);
        const sk = game.skills; if (sk && sk.addUltKills) sk.addUltKills(1);
      }
      if (stacks('reaper') && reaperCd <= 0 && !(z && reaperHit.indexOf(z) >= 0)) {   // a dash's own kill never pays for the next dash
        const sk = game.skills;
        if (sk && sk.refundCharge && sk.refundCharge('dash', 1)) reaperCd = REAPER_CD;
      }
      if (stacks('adrenaline')) {
        adrenT = 2.5;
        if (!adrenOn) { adrenOn = true; if (game.mods) game.mods.moveMult = moveBase * (1 + 0.2 * stacks('adrenaline')); }
      }
    }
    if (p && stacks('corpse_bomb')) armBomb(p, bombGen);
    if (e.boss || (z && z.type === 'boss')) bossReward(z);
  });
  game.on('bossKilled', (e) => { if (game.state === 'playing') bossReward(e && e.zombie); });

  game.on('shot', (e) => {
    if (game.state !== 'playing' || !stacks('thunderhead')) return;
    if (e && e.weaponId === 'flamethrower') return;
    if (thunderPending) return;                       // a strike is already waiting on THUNDER_CD
    thunderCount++;
    if (thunderCount >= 8) { thunderCount = 0; thunderPending = true; }
    setThunderBadge();
  });
  game.on('skill', (e) => {
    if (e && e.id === 'dash') { reaperHit.length = 0; const pl = game.player; if (pl && pl.position) dashPrev.copy(pl.position); }
  });
  game.on('phase', (e) => {
    if (!e || game.state !== 'playing') return;
    if (e.phase === 'night' && stacks('phoenix') && !phoenixReady) {
      phoenixReady = true; refreshChips();
      game.emit('toast', 'PHOENIX ready again');
    }
  });
  game.on('gameStart', () => { showHud(true); });
  game.on('gameOver', () => { closePicker(); showHud(false); clearFx(); });
  game.on('playerDied', () => { clearFx(); });

  // ------------------------------------------------------------------ offers
  function pickRandom(pool, out, n) {
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    for (let i = 0; i < pool.length && out.length < n; i++) if (out.indexOf(pool[i]) < 0) out.push(pool[i]);
  }
  function rollChoices(legendary) {
    const n = Math.max(1, Math.min(9, PC.choices | 0 || 3));
    const out = [];
    const normals = NORMAL.filter((d) => stacks(d.id) < d.max);
    if (legendary) pickRandom(LEGEND.filter((d) => !stacks(d.id)), out, n);   // CORPSE CASCADE grants a corpse bomb itself
    if (out.length < n) pickRandom(normals, out, n);
    if (out.length < n) out.push(RATIONS);
    return out;
  }
  function canOpen() {
    const pl = game.player;
    if (game.state !== 'playing' || game.paused || !pl || pl.alive === false) return false;
    const st = document.getElementById('start');
    return !(st && !st.classList.contains('hidden'));
  }
  function tryOpen() {
    if (current || !queue.length || !canOpen()) return null;
    // legendary picks first: they are the boss reward the player just earned
    let qi = queue.indexOf(true);
    if (qi < 0) qi = 0;
    const leg = queue.splice(qi, 1)[0];
    return openPicker(leg);
  }
  function offer(legendary) {
    queue.push(!!legendary);
    refreshNext();
    const c = tryOpen();
    return c ? c.choices.map((d) => d.id) : true;
  }

  // ------------------------------------------------------------------ granting
  function grant(id) {
    const def = byId[id];
    if (!def) return false;
    const cur = stacks(id);
    if (def !== RATIONS && cur >= def.max) return false;
    const pl = game.player;
    if (def !== RATIONS) owned.set(id, cur + 1);
    switch (id) {
      case 'thick_skin': if (pl) { pl.maxHealth += 20; pl.health = Math.min(pl.maxHealth, pl.health + 20); } break;
      case 'juggernaut': if (pl) { pl.maxHealth += 60; pl.health = Math.min(pl.maxHealth, pl.health + 60); } break;
      case 'cascade': if (!stacks('corpse_bomb')) owned.set('corpse_bomb', 1); break;
      case 'phoenix': phoenixReady = true; break;
      case 'thunderhead': thunderCount = 0; break;
      case 'rations': if (pl) { if (pl.heal) pl.heal(30); if (pl.addArmor) pl.addArmor(30); } break;
      default: break;
    }
    recompute();
    refreshChips(id);
    const rank = stacks(id);
    game.emit('toast', (def.legendary ? 'LEGENDARY: ' : 'PERK: ') + def.name.toUpperCase() + (def.max > 1 && def !== RATIONS ? '  ' + rank + '/' + def.max : ''));
    game.emit('perkChosen', { id, name: def.name, legendary: !!def.legendary, stacks: rank });
    return true;
  }

  // ------------------------------------------------------------------ DOM: HUD strip
  const styleEl = document.createElement('style'); styleEl.textContent = CSS; document.head.appendChild(styleEl);
  const hudRoot = document.getElementById('hud') || document.body;
  const hudEl = document.createElement('div');
  hudEl.id = 'pk-hud'; hudEl.className = 'off';
  hudEl.innerHTML = '<div class="pk-next"><div class="pk-next-l"></div><div class="pk-next-bar"><i></i></div></div><div class="pk-chips"></div>';
  hudRoot.appendChild(hudEl);
  const nextLbl = hudEl.querySelector('.pk-next-l'), nextBar = hudEl.querySelector('.pk-next-bar i'), chipsEl = hudEl.querySelector('.pk-chips');
  const hudCache = { txt: null, k: -1, ready: null };
  let thunderBadge = null, hudOn = false;
  function showHud(on) { if (hudOn === on) return; hudOn = on; hudEl.classList.toggle('off', !on); }
  const svg = (id) => `<svg viewBox="0 0 24 24">${ICONS[id] || ICONS.rations}</svg>`;
  function refreshChips(fresh) {
    let h = '';
    for (const [id, n] of owned) {
      const d = byId[id]; if (!d) continue;
      let cls = 'pk-chip ' + d.tag + (d.legendary ? ' leg' : '');
      if (id === 'phoenix' && !phoenixReady) cls += ' spent';
      if (id === fresh) cls += ' new';
      let badge = '';
      if (id === 'thunderhead') badge = `<b data-th>${thunderCount}/8</b>`;
      else if (d.max > 1 && n > 1) badge = `<b>${n}</b>`;
      h += `<div class="${cls}">${svg(id)}${badge}</div>`;
    }
    chipsEl.innerHTML = h;
    thunderBadge = chipsEl.querySelector('[data-th]');
  }
  let thunderShown = -1;
  function setThunderBadge() {
    if (!thunderBadge || thunderShown === thunderCount) return;
    thunderShown = thunderCount;
    thunderBadge.textContent = thunderCount + '/8';
  }

  // ------------------------------------------------------------------ DOM: picker
  const pickEl = document.createElement('div');
  pickEl.id = 'pk-pick'; pickEl.className = 'off';
  pickEl.innerHTML = '<div class="pk-back"></div><div class="pk-wrap"><div class="pk-head"><div class="pk-eyebrow"></div><div class="pk-title"></div></div>' +
    '<div class="pk-cards"></div><div class="pk-foot"></div></div>';
  hudRoot.appendChild(pickEl);
  const eyebrowEl = pickEl.querySelector('.pk-eyebrow'), titleEl = pickEl.querySelector('.pk-title');
  const cardsEl = pickEl.querySelector('.pk-cards'), footEl = pickEl.querySelector('.pk-foot');
  let slotEls = [];

  function cardHtml(def, i) {
    const cur = def === RATIONS ? 0 : stacks(def.id), next = cur + 1;
    const leg = !!def.legendary;
    let stack = '';
    if (def === RATIONS) stack = '<span>Supplies</span>';
    else if (def.max > 1) {
      let pips = '';
      for (let k = 0; k < def.max; k++) pips += `<i class="${k < cur ? 'on' : k === cur ? 'nx' : ''}"></i>`;
      stack = `<div class="pk-pips">${pips}</div><span>${cur ? `Rank ${cur} &rarr; ${next}` : 'New'}</span>`;
    } else stack = `<span>${leg ? 'Unique' : 'New'}</span>`;
    const rar = leg ? 'Legendary' : 'Perk &middot; ' + def.tag;
    return `<div class="pk-slot${leg ? ' leg' : ''}" data-i="${i}"><div class="pk-card"><div class="pk-in">` +
      `<div class="pk-key">${i + 1}</div>` +
      `<div class="pk-glyph ${def.tag}">${svg(def.id)}</div>` +
      `<div class="pk-txt"><div class="pk-rar ${def.tag}">${rar}</div><div class="pk-name">${def.name}</div><div class="pk-desc">${def.desc(next)}</div></div>` +
      `<div class="pk-stack">${stack}</div></div></div></div>`;
  }
  function locked() { return document.pointerLockElement === game.canvas; }
  function renderFoot() {
    const n = current ? current.choices.length : 3;
    let keys = '';
    for (let i = 0; i < n; i++) keys += `<b>${i + 1}</b>`;
    const more = queue.length + bossTimers.length * PC.bossPicks;
    footEl.innerHTML = keys + ' to choose &middot; ' + (locked() ? 'or move the mouse and click' : 'or click a card') +
      (more > 0 ? ` &middot; <em>${more} more pick${more > 1 ? 's' : ''} waiting</em>` : '');
    pickEl.classList.toggle('lock', locked());
  }
  function setSel(i, silent) {
    if (!current) return;
    const n = current.choices.length;
    i = ((i % n) + n) % n;
    if (i === current.sel && !silent) return;
    current.sel = i;
    if (!silent) current.moved = true;
    for (let k = 0; k < slotEls.length; k++) slotEls[k].classList.toggle('sel', k === i);
    if (!silent) sfx.move();
  }
  function openPicker(legendary) {
    const choices = rollChoices(legendary);
    const realLeg = legendary && choices.some((d) => d.legendary);
    current = { legendary: realLeg, choices, sel: Math.min(1, choices.length - 1), moved: false };
    game.choosing = true;
    openedAt = performance.now(); mouseAcc = 0;
    const more = queue.length;
    eyebrowEl.textContent = realLeg ? 'The Hollow King is dead' : `${kills} kills`;
    titleEl.textContent = realLeg ? 'Legendary reward' : 'Choose a perk';
    if (realLeg && more > 0) eyebrowEl.textContent += ` · ${more} more to come`;
    let h = '';
    for (let i = 0; i < choices.length; i++) h += cardHtml(choices[i], i);
    cardsEl.innerHTML = h;
    slotEls = Array.prototype.slice.call(cardsEl.querySelectorAll('.pk-slot'));
    for (const el of slotEls) {
      const i = +el.dataset.i;
      el.addEventListener('mouseenter', () => { if (current && !locked()) setSel(i, false); });
      el.addEventListener('mousedown', (ev) => {
        ev.stopPropagation(); ev.preventDefault();       // never reaches player.js: no stray shot
        if (ev.button === 0 && !locked()) choose(i);
      });
    }
    pickEl.classList.toggle('leg', realLeg);
    pickEl.classList.remove('off');
    setSel(current.sel, true);
    renderFoot();
    refreshNext();
    sfx.open(realLeg);
    game.emit('perkOffered', { choices: choices.map((d) => d.id), legendary: realLeg });
    return current;
  }
  function closePicker() {
    current = null;
    pickEl.classList.add('off');
    cardsEl.innerHTML = ''; slotEls = [];
    game.choosing = false;
  }
  function choose(i) {
    if (!current || game.paused || game.state !== 'playing') return;
    if (performance.now() - openedAt < ARM_MS) return;
    const def = current.choices[i];
    if (!def) return;
    closePicker();
    grant(def.id);
    sfx.pick(!!def.legendary);
    const pl = game.player;
    if (pl && pl.input) pl.input.fire = false;           // the confirming click must not fire the gun
    // a boss batch (or several thresholds at once) chains straight into the next card set
    if (queue.length && canOpen()) tryOpen();
    refreshNext();
  }

  // input: keys work while the pointer stays locked (capture phase, before player.js)
  window.addEventListener('keydown', (e) => {
    if (!current || game.state !== 'playing') return;
    const c = e.code;
    let idx = -1;
    if (c.length === 6 && c.startsWith('Digit')) idx = c.charCodeAt(5) - 49;
    else if (c.length === 7 && c.startsWith('Numpad')) idx = c.charCodeAt(6) - 49;
    // consumed keys never reach player.js (so the digit that picks a card does not also switch weapons)
    if (idx >= 0 && idx < 9) {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat && !game.paused && idx < current.choices.length) choose(idx);
      return;
    }
    if (game.paused) return;
    let dir = 0;
    if (c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowUp' || c === 'KeyW') dir = -1;
    else if (c === 'ArrowRight' || c === 'KeyD' || c === 'ArrowDown' || c === 'KeyS') dir = 1;
    if (dir !== 0) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) setSel(current.sel + dir, false); }
    else if (c === 'Enter' || c === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) choose(current.sel); }
  }, true);
  // pointer locked: horizontal mouse motion moves the highlight, a left click takes it
  document.addEventListener('mousemove', (e) => {
    if (!current || game.paused || !locked()) return;
    mouseAcc += e.movementX || 0;
    if (mouseAcc > 110) { mouseAcc = 0; setSel(current.sel + 1, false); }
    else if (mouseAcc < -110) { mouseAcc = 0; setSel(current.sel - 1, false); }
  });
  document.addEventListener('mousedown', (e) => {
    if (!current || game.paused || !locked() || e.button !== 0) return;
    if (!current.moved) return;                       // a held/tapping fire click never confirms the preselected card blind
    choose(current.sel);
  });
  document.addEventListener('pointerlockchange', () => { if (current) renderFoot(); });

  // ------------------------------------------------------------------ update / reset
  function step(dt) {
    time += dt;
    if (arcCd > 0) arcCd -= dt;
    if (zapCd > 0) zapCd -= dt;
    if (reaperCd > 0) reaperCd -= dt;
    if (api.shieldT > 0) {
      api.shieldT = Math.max(0, api.shieldT - dt);
      const p = game.player && game.player.position;
      if (p && rand() < 0.7) {
        const a = rand() * TAU;
        emit(p.x + Math.cos(a) * 0.5, p.y + 0.2 + rand() * 1.4, p.z + Math.sin(a) * 0.5, Math.cos(a) * 0.6, 1 + rand() * 1.5, Math.sin(a) * 0.6, 0.6, 0.14, 2.6, 1.1, 0.3, -0.5, 0.6);
      }
    }
    if (phoenixBlast) { phoenixBlast = false; phoenixStorm(); }
    if (thunderCd > 0) thunderCd -= dt;
    if (thunderPending && thunderCd <= 0) { thunderPending = false; thunderCd = THUNDER_CD; lightningStrike(); }
    // adrenaline expiry
    if (adrenT > 0) {
      adrenT -= dt;
      if (adrenT <= 0 && adrenOn) { adrenOn = false; if (game.mods) game.mods.moveMult = moveBase; }
    }
    updateReaper();
    updateFrost(dt);
    updateBombs(dt);
    // boss reward timers
    for (let i = bossTimers.length - 1; i >= 0; i--) {
      bossTimers[i] -= dt;
      if (bossTimers[i] <= 0) {
        bossTimers.splice(i, 1);
        for (let k = 0; k < PC.bossPicks; k++) queue.push(true);
      }
    }
    // FX
    const canvasH = (game.renderer && game.renderer.domElement && game.renderer.domElement.height) || 800;
    const scale = canvasH / (2 * Math.tan((camera.fov || 70) * Math.PI / 360));
    glow.mat.uniforms.uScale.value = scale; spark.mat.uniforms.uScale.value = scale;
    updateSparks(dt);
    updateGlows(dt);
    updateBolts(dt);
    if (flashT > 0) {
      flashT -= dt;
      const k = Math.max(0, flashT / flashDur);
      flashLight.intensity = flashPeak * k * k * (0.75 + 0.25 * rand());
    } else if (flashLight.intensity !== 0) flashLight.intensity = 0;
    // open a waiting pick (freezes the run through game.choosing)
    if (!current && queue.length) tryOpen();
  }
  function update(dt) {
    try { step(dt); } catch (e) {
      if (!failed) { failed = true; console.error('[perks.update]', e); }
    }
  }

  // pending bombs and every perk FX buffer (restart, and game over: perks.update no longer runs in the 'dead' state)
  function clearFx() {
    for (let i = 0; i < MAX_BOMBS; i++) bombs[i].active = false;
    bombsLive = 0;
    glowLife.fill(0); glow.size.fill(0); glow.col.fill(0); glowLive = 0; glowHead = MAX_BOMBS; flushPoints(glow);
    sLife.fill(0); spark.size.fill(0); spark.col.fill(0); sLive = 0; sHead = 0; flushPoints(spark);
    bLife.fill(0); bvPos.fill(0); bvCol.fill(0); bvPosAttr.needsUpdate = true; bvColAttr.needsUpdate = true; bAny = false;
    flashT = 0; flashLight.intensity = 0;
  }
  function reset() {
    wrapZombies();
    closePicker();
    owned.clear();
    queue.length = 0; bossTimers.length = 0;
    kills = 0; picksEarned = 0; prevAt = 0; nextAt = PC.firstAt;
    baseMods = Object.assign({}, game.mods || {});      // main.js reset game.mods to its defaults just before this
    adrenT = 0; adrenOn = false;
    phoenixReady = true; phoenixBlast = false; api.shieldT = 0;
    thunderCount = 0; thunderPending = false; thunderCd = 0; thunderShown = -1;
    arcCd = 0; arcing = false; zapCd = 0; frostTick = 0; reaperCd = 0; dashWas = false; reaperHit.length = 0;
    bombGen = 0; lastBoss = null; lastBossT = -10; time = 0; failed = false;
    recompute();
    clearFx();
    refreshChips();
    hudCache.txt = null; hudCache.k = -1; hudCache.ready = null;
    refreshNext();
    showHud(true);
  }

  wrapZombies();
  refreshNext();
  return api;
}
