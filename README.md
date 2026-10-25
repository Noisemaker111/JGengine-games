# JGengine Games

Playable games built with [`jgengine`](https://github.com/Noisemaker111/jgengine) — each game is a standalone Vite app on `@jgengine/*` built from engine source: the engine `beta` commit in [`engine-ref.txt`](engine-ref.txt).

These games use familiar genres with their own titles, settings, characters, and authored content. They also probe engine capabilities. To build a new game, use `npx jgengine create`; assets and upstream source retain their individual licenses.

## Build games through shared capabilities

Every game interaction composes JGengine behavior. When a reusable capability is
missing or broken, improve its upstream package with a real game adopter instead
of implementing the same fix separately in each game. Adopt existing SDK behavior
and remove redundant local machinery. Games retain their unique rules, stories,
items, assets, editor-authored worlds and presentation.

An engine change reaches a game when `engine-ref.txt` moves to an engine beta commit that
contains it - in the same PR as the game change (`bun run engine:bump`), or by the hourly
`engine-bump` workflow. No release is involved. API changes may need small consumer
migrations in that PR. Shared behavior must support different designs and art directions,
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

## Design checklist and loop proofs

Every game's README states the same six-section design checklist (core loop, progression, failure
states, minute 5 → hour 5, references, gap to target) and ends it with one `Loop proof:` line naming
the flow that proves the stated loop. `bun run check:game-design` (also run by CI) fails a game that
is missing a section, names a flow whose `<game>/proofs/flows/<name>.json` is absent or does not
parse, or ships a flow with no arrival assert. A name marked `TODO` is a promised flow nobody has
written: it is reported, and `--strict` fails it.

A flow runs headless from the engine checkout, with the game visible to it:

```sh
bun run drive harbor-heat --state chase --flow to-chase     # add --state when the flow needs a staged entry
```

`bun run prove harbor-heat --view boulevard --view downtown --sizes 1600x900,1024x640 --flow to-chase --state chase`
is the whole evidence set for one item in one command: captures each view at each size in play mode, a same-code
control pair for this machine's noise floor, a pixel diff between the two states (mean-abs and >8 share), the driven
flow with its step log, and one `.scratch/proofs/<game>/runs/<stamp>/manifest.json` listing every artefact and its
numbers. A capture the engine's guards refuse - no 3D canvas, a flat frame, a missing tier, an engine-identity
mismatch - fails the bundle with the reason instead of leaving a blank frame. Artefacts are cached on the game's tree hash, the engine commit, the tools, the view, the size and the tier, so
an unchanged input says `[cached]` and a changed one re-runs. Run it from the checkout the engine serves
(`Games/<game>`); it refuses to bundle another checkout's code. A lane cites those numbers in its PR body instead of
a paragraph of claims.

Deepward uses original procedural industrial geometry and needs no downloaded
asset packs. Start it with `bun run dev:deepward`; see [its controls and current limits](deepward/README.md).

Each playable game is a standalone Vite harness: `index.html` loads
`src/main.tsx`, and `vite.config.ts` resolves the linked engine packages. Run commands from
the repository root, or run `bun run dev` inside the target game's directory.

See [historical published-package verification](GAME-PR-VERIFICATION.md) for earlier
Brightway Park and Scrap Signal asset provisioning, checks and playtest limits.

## Engine version

`engine-ref.txt` names one full engine `beta` commit. Every check, test and dev server here
runs against that commit's source: `bun run engine:sync` fetches it into the engine checkout
(`../jgengine`, or `--dir <path>`), builds the packages from `git archive <commit>` into a
cached snapshot (`%LOCALAPPDATA%\jgengine-snapshots`, keyed by commit) and junctions every
installed `@jgengine/*` to it. Edits in the live engine checkout never reach the snapshot.

```sh
bun install --frozen-lockfile
bun run engine:sync          # build and link the commit in engine-ref.txt (cached after the first build)
bun run engine:bump          # move engine-ref.txt to engine beta's tip (or --ref <sha>), then sync
bun run engine:status        # what is linked: snapshot commit, or a live checkout
bun run check:engine-mode    # fails unless the build of engine-ref.txt is linked
bun run check:engine-ref     # fails unless engine-ref.txt is on engine beta (uses gh)
bun run engine:local         # live link to ../jgengine while editing the engine; never lands
bun run engine:watch         # rebuild changed engine packages (live mode only)
bun run engine:snapshots     # cached snapshots, with --prune <sha|all>
```

The root catalog's `@jgengine/*` npm versions only give `bun install` entries to link over;
they are never what a game runs, and moving them is not part of adopting engine work. npm
publishing is for users outside this repo. `.engine-mode` (ignored) records the link; never
commit it.

CI's `games` job checks `engine-ref.txt` is on engine beta, fetches and syncs that commit,
then runs every check. The `engine-bump` workflow (hourly, or run it by hand) commits engine
beta's tip and the regenerated `capabilities.json` to `bot/engine-bump` and dispatches CI
there; when `games` passes, CI fast-forwards `beta` to that commit. A red bump stays on the
branch until a PR fixes what the new engine broke (a type error, or a new game-facing
capability each game must answer) and bumps the ref itself.

The engine repo (`Noisemaker111/jgengine`) clones this repo at build time into `./Games` (gitignored, ephemeral) to render `/games` and `/play`. The games repo is the source of truth for game content; the engine repo no longer commits games.

## Credits

See the engine repo's [CREDITS.md](https://github.com/Noisemaker111/jgengine/blob/main/CREDITS.md) and per-game `src/game.config.ts` (`credit` export).
