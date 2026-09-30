# JGengine Games

Playable games built with [`jgengine`](https://github.com/Noisemaker111/jgengine) — each game is a standalone Vite app on the published `@jgengine/*` packages.

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
bun install --frozen-lockfile
```

For games with an asset catalog, provision its downloaded packs before launch.
Catalogs such as Harbor Heat's `src/game/assets.ts` list their source identifiers.
Run the published assets CLI from the repository root for each source, writing
into that game's public directory:

```sh
bun node_modules/@jgengine/assets/dist/cli/pull.js pull <source> --dir <game-id>/public
bun run dev:harbor-heat   # or another playable game id
```

Wayfarer Deck uses authored interface artwork and does not need downloaded 3D
packs. Deepward is a design document and has no dev script.

Each playable game is a standalone Vite harness: `index.html` loads
`src/main.tsx`, and `vite.config.ts` resolves published packages. Run commands from
the repository root, or run `bun run dev` inside the target game's directory.

See [published-package verification](GAME-PR-VERIFICATION.md) for the Brightway Park,
Field Station and Scrap Signal dependency pin, asset provisioning, checks and remaining
playtest limits.

## Engine version

Games declare published `@jgengine/*` ranges starting at `^0.18.0`. The committed
lockfile resolves core/react/shell/ws/assets to 0.18.1 and pins editor to 0.18.0;
editor 0.18.1 requires the unpublished navbake package. Keep the lockfile and editor
override together when changing dependencies. An intentional package update uses:

```sh
bun update @jgengine/core @jgengine/react @jgengine/shell @jgengine/ws @jgengine/assets @jgengine/editor
```

The engine repo (`Noisemaker111/jgengine`) clones this repo at build time into `./Games` (gitignored, ephemeral) to render `/games` and `/play`. The games repo is the source of truth for game content; the engine repo no longer commits games.

## Credits

See the engine repo's [CREDITS.md](https://github.com/Noisemaker111/jgengine/blob/main/CREDITS.md) and per-game `src/game.config.ts` (`credit` export).
