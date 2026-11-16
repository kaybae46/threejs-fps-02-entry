# IRONLINE — Tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter built with three.js 0.187.0, made for
make.fun's "Make the best three.js tactical FPS" bounty. Single-player against bots,
playable in desktop Chrome from static files — no build step, no network requests.

## The game

Azure versus Ember, four against four, on **Ironworks Yard** — an industrial yard
with two marked sites (A and B), crate cover, a mid wall with lanes, and a glowing
uplink beacon at the centre.

- **Rounds**: first team to 5 round wins takes the match. A round is won by
  eliminating the enemy team, or by holding the uplink beacon uncontested for
  8 seconds. If the 100-second timer runs out, the team with more fighters
  standing wins the round.
- **Economy**: start with $800. Kills pay $300, a round win $3,250, a loss $1,900.
  Between rounds a buy menu offers the VK-9 SMG ($1,500), the AR-77 rifle
  ($2,700), the scoped LANCE DMR ($4,100) and a Kevlar vest ($650).
- **Gunplay where accuracy counts**: spread grows while moving and firing, recoil
  kicks the aim up, and standing still with short bursts is far more accurate
  than spraying. Headshots deal double damage; damage falls off at range.
- **Bots**: three Azure allies and four Ember enemies with patrol, line-of-sight
  checks, burst fire, strafing and beacon pushes. Bot names, map, art and all
  sounds (synthesised with WebAudio) are original.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Aim (click the game to capture the pointer) |
| Click | Fire |
| Right-click | Scope (LANCE DMR) |
| R | Reload |
| B | Buy menu (during the buy phase) |
| 1–4 | Switch weapon, Shift Walk slow & steady, Space Jump |

## Play it

Serve the `game/` directory with any static server and open `index.html`:

```sh
cd game
python3 -m http.server 8080
# open http://localhost:8080 in desktop Chrome
```

## Layout

- `game/` — the playable game: `index.html`, `src/main.js`, vendored three.js
  0.187.0 under `game/vendor/three/`.
- `screenshots/` — real in-browser renders of the game (cover first by name).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to the output
  directory and writes `dossier.json` with `buildDossier` from
  `vendor/makefun-threejs.ts`.
- `vendor/makefun-threejs.ts` — make.fun's dossier library, copied unchanged
  from the competition kit.

## License

MIT — see `LICENSE`.
