# JGengine Games

Playable games built with [`jgengine`](https://github.com/Noisemaker111/jgengine) — each game is a standalone Vite app on the published `@jgengine/*` packages.

These games use familiar genres with their own titles, settings, characters, and authored content. They also probe engine capabilities. To build a new game, use `npx jgengine create`; assets and upstream source retain their individual licenses.

## Build games through shared capabilities

Every game interaction composes JGengine behavior. When a reusable capability is
missing or broken, improve its upstream package with a real game adopter instead
of implementing the same fix separately in each game. Adopt existing SDK behavior
and remove redundant local machinery. Games retain their unique rules, stories,
items, assets, editor-authored worlds and presentation.

Compatible engine fixes reach games through one root SDK catalog update. API changes
may need small consumer migrations; a beta engine merge alone does not change the
installed packages. Shared behavior must support different designs and art directions,
not impose identical assets or layouts. [AGENTS.md](AGENTS.md#framework-first-development)
owns the discovery, upstream implementation, adoption and verification workflow.

## Games

| Game | Id | Description |
| --- | --- | --- |
| Ember Command | `ember-command` | Highland command skirmish |
| Brightway Park | `brightway-park` | Park-builder tycoon |
| Odd Orbit | `odd-orbit` | Alien household sim |
| Scrap Signal | `scrap-signal` | Looter-shooter |
| Beacon Bastion | `beacon-bastion` | Tower defense |
| Deepward | `deepward` | First-person extraction slice: salvage, pack, return and bank |
| Harbor Heat | `harbor-heat` | Coastal courier and crew adventure |
| Drift Foundry | `drift-foundry` | Physics racer |

See [the genre roadmap](./CLASSICS.md) for planned mechanics and [content provenance](./CONTENT-PROVENANCE.md) for source and asset attribution.

## Improve the games

[The individual improvement plans](https://github.com/Noisemaker111/JGengine-games/issues/52) cover all eight games: identity, interacting decisions, progression and recovery, authored space, terrain and art, feedback, and complete-session testing. Use the engine's [game-improvement skill](https://github.com/Noisemaker111/jgengine/blob/beta/.claude/skills/game-improvement/SKILL.md) with the existing domain skills. Keep verified rules, playing experience and presentation separate; a passing test suite does not establish a finished game.

## Develop

```sh
bun install --frozen-lockfile
bun run provision           # pull every asset pack the games reference (skips packs already on disk)
bun run dev:harbor-heat     # or another playable game id
```

`bun run provision <game-id>` pulls one game's packs. A pack counts as referenced when its source
id appears in the game's `src/`. CI runs the same command, then `check-types` and `test`.

Deepward uses original procedural industrial geometry and needs no downloaded
asset packs. Start it with `bun run dev:deepward`; see [its controls and current limits](deepward/README.md).

Each playable game is a standalone Vite harness: `index.html` loads
`src/main.tsx`, and `vite.config.ts` resolves published packages. Run commands from
the repository root, or run `bun run dev` inside the target game's directory.

See [historical published-package verification](GAME-PR-VERIFICATION.md) for earlier
Brightway Park and Scrap Signal asset provisioning, checks and playtest limits.
The root catalog below owns the current SDK version.

## Engine version

One root `package.json` workspace catalog owns all published `@jgengine/*` SDK
versions; game and shared workspace manifests use `catalog:` and never own SDK
versions. Change the root catalog and regenerate `bun.lock` for an intentional
SDK update. The CLI `jgengine` keeps its separate version cadence.

The current catalog installs SDK 0.33.0, including editor and its published navbake dependency. Keep the root catalog and lockfile coherent when updating SDK packages, following [framework-first policy](AGENTS.md#framework-first-development).

To test unpublished engine work, link a checkout instead of releasing:

```sh
bun run engine:local      # every @jgengine/* -> ../jgengine (or --dir <engine path>)
bun run engine:watch      # rebuild engine packages as their sources change
bun run engine:status     # mode, engine commit, stale-or-fresh linked dist
bun run engine:published  # restore the catalog install
```

`.engine-mode` (ignored) records the mode, engine commit and path. The catalog and `bun.lock` are never edited, so `git status` stays clean and both modes install with `--frozen-lockfile`.

The engine repo (`Noisemaker111/jgengine`) clones this repo at build time into `./Games` (gitignored, ephemeral) to render `/games` and `/play`. The games repo is the source of truth for game content; the engine repo no longer commits games.

## Credits

See the engine repo's [CREDITS.md](https://github.com/Noisemaker111/jgengine/blob/main/CREDITS.md) and per-game `src/game.config.ts` (`credit` export).
