# JGengine Games

Playable probe games built with [`jgengine`](https://github.com/Noisemaker111/jgengine) — each game is a standalone Vite app on the published `@jgengine/*` packages (`^0.18.0`).

These are **not templates** — they are engine-gap probes (some recreate well-known titles for feel testing) and their content is not licensed for reuse. To build a new game, use `npx jgengine create` in the engine repo, not a copy of a game here.

## Games

| Game | Id | Description |
| --- | --- | --- |
| Claudecraft | `claudecraft` | World of Warcraft homage |
| Duet Keys | `duet-keys` | Co-op puzzle |
| Ironhold | `ironhold` | Warcraft III RTS skirmish |
| Loopline | `loopline` | Park-builder tycoon |
| Spire Cards | `spire-cards` | Deckbuilder |
| Starhome | `starhome` | Alien household sim |
| Studio Showcase | `studio-showcase` | Environment studios showcase |
| The Robots | `the-robots` | Looter-shooter |
| Tower Guard | `tower-guard` | Tower defense |
| Vaultbreak | `vaultbreak` | Extraction RPG |
| Vice Isle | `vice-isle` | GTA / Borderlands open world |
| Wreckway | `wreckway` | Physics racer |

See [CLASSICS.md](./CLASSICS.md) for inspirations.

## Develop

```sh
bun install
bun run dev:vice-isle   # or any game id
# or inside a game:
cd vice-isle && bun run dev
```

Each game is a standalone Vite harness: `index.html` + `vite.config.ts` + `src/index.tsx`.

## Engine version

Games depend on published `@jgengine/*@0.18.0` from npm. Bump via:

```sh
bun update @jgengine/core @jgengine/react @jgengine/shell @jgengine/ws @jgengine/assets @jgengine/editor
```

The engine repo (`Noisemaker111/jgengine`) clones this repo at build time into `./Games` (gitignored, ephemeral) to render `/games` and `/play`. The games repo is the source of truth for game content; the engine repo no longer commits games.

## Credits

See the engine repo's [CREDITS.md](https://github.com/Noisemaker111/jgengine/blob/main/CREDITS.md) and per-game `src/game.config.ts` (`credit` export).
