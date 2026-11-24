# HOLLOW DAWN

A third-person zombie night-survival game built with three.js only. No build step, no other libraries, no external assets: every model and sound is generated in code.

Scavenge the island by day. At night the horde comes out of the treeline. Hold until dawn, then do it again with less.

## Run

From the repository root:

```bash
python3 -m http.server 5173 --directory workspace
```

Then open http://localhost:5173 in Chrome or Safari. three.js loads from a CDN, so you need a network connection.

## Controls

| Key | Action |
|---|---|
| WASD, Shift, C, Space | move, sprint, crouch, jump (Space again in the air: double jump) |
| Shift + C | slide |
| C in the air | ground slam |
| Mouse / right click | fire / aim |
| 1 – 5, R | weapons, reload |
| F, H, B | pick up / open, heal, barricade |
| Q, E, G, X | dash, sunflare, frag grenade, Dawnbreaker (ultimate) |
| Z | build menu (click places) |
| 1 / 2 / 3 | pick a perk when the picker is open |
| T, V, Esc | flashlight, first / third person, pause |

## Features

- Day/night loop with growing waves: walkers, runners, brutes, spitters
- A boss each night, The Hollow King: charge, ground slam, summons, enrage. Its chest can hold a flamethrower or a rocket launcher
- Perks every so many kills (pick 1 of 3), plus legendary perks from the boss
- Kill drops, airdrops with a Gatling gun, explosive barrels, kill-chain score multiplier
- Rooftops reachable over boulders and crate stacks; zombies climb after you
- Abilities and building: traps, lamps, campfires, turrets, barricades

## Code

`workspace/src/` holds one module per system (`world`, `player`, `weapons`, `zombies`, `loot`, `hud`, `audio`, `skills`, `build`, `extras`, `perks`), wired together in `main.js`. Tuning values live in `config.js`.
