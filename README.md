# JGengine Games

Playable probe games built with [`jgengine`](https://github.com/Noisemaker111/jgengine) — each game is a standalone Vite app on the published `@jgengine/*` packages (`^0.18.0`).

These games use familiar genres with their own titles, settings, characters, and authored content. They also probe engine capabilities. To build a new game, use `npx jgengine create`; assets and upstream source retain their individual licenses.

## Games

| Game | Id | Description |
| --- | --- | --- |
| Lantern Reach | `lantern-reach` | Lantern-lit frontier adventure |
| Resonant Crossing | `resonant-crossing` | Co-op puzzle |
| Ember Command | `ember-command` | Highland command skirmish |
| Brightway Park | `brightway-park` | Park-builder tycoon |
| Wayfarer Deck | `wayfarer-deck` | Deckbuilder |
| Odd Orbit | `odd-orbit` | Alien household sim |
| Field Station | `field-station` | Environment studios showcase |
| Scrap Signal | `scrap-signal` | Looter-shooter |
| Beacon Bastion | `beacon-bastion` | Tower defense |
| Deepward | `deepward` | Extraction RPG design (no playable app yet) |
| Harbor Heat | `harbor-heat` | Coastal courier and crew adventure |
| Drift Foundry | `drift-foundry` | Physics racer |

See [the genre roadmap](./CLASSICS.md) for planned mechanics and [content provenance](./CONTENT-PROVENANCE.md) for source and asset attribution.

## Develop

```sh
bun install
bun run dev:harbor-heat   # or any game id
# or inside a game:
cd harbor-heat && bun run dev
```

Each game is a standalone Vite harness: `index.html` + `vite.config.ts` + `src/index.tsx`.

See [published-package verification](GAME-PR-VERIFICATION.md) for the Brightway Park,
Field Station and Scrap Signal dependency pin, asset provisioning, checks and remaining
playtest limits.

## Engine version

Games depend on published `@jgengine/*@0.18.0` from npm. Bump via:

```sh
bun update @jgengine/core @jgengine/react @jgengine/shell @jgengine/ws @jgengine/assets @jgengine/editor
```

The engine repo (`Noisemaker111/jgengine`) clones this repo at build time into `./Games` (gitignored, ephemeral) to render `/games` and `/play`. The games repo is the source of truth for game content; the engine repo no longer commits games.

## Credits

See the engine repo's [CREDITS.md](https://github.com/Noisemaker111/jgengine/blob/main/CREDITS.md) and per-game `src/game.config.ts` (`credit` export).
