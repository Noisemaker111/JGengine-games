# JGengine Games

Playable games built with [`jgengine`](https://github.com/Noisemaker111/jgengine) — each game is a standalone Vite app on the `@jgengine/*` packages, either the published catalog build or a pinned build of one engine commit.

These games use familiar genres with their own titles, settings, characters, and authored content. They also probe engine capabilities. To build a new game, use `npx jgengine create`; assets and upstream source retain their individual licenses.

## Build games through shared capabilities

Every game interaction composes JGengine behavior. When a reusable capability is
missing or broken, improve its upstream package with a real game adopter instead
of implementing the same fix separately in each game. Adopt existing SDK behavior
and remove redundant local machinery. Games retain their unique rules, stories,
items, assets, editor-authored worlds and presentation.

An engine change reaches a game by **pinning the commit**, not by waiting for a release:
`bun run engine:pin --ref <sha>`, adopt the change, prove it in the game, land. The one
root SDK catalog update that moves every game to a published version is a **milestone
release**, not a step after each engine merge. API changes may need small consumer
migrations; a beta engine merge alone does not change the installed packages. A pinned
build is a real installed package, so no engine source is imported here. Shared behavior
must support different designs and art directions, not impose identical assets or layouts.
[AGENTS.md](AGENTS.md#framework-first-development) owns the discovery, upstream
implementation, adoption and verification workflow.

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
`src/main.tsx`, and `vite.config.ts` resolves published packages. Run commands from
the repository root, or run `bun run dev` inside the target game's directory.

See [historical published-package verification](GAME-PR-VERIFICATION.md) for earlier
Brightway Park and Scrap Signal asset provisioning, checks and playtest limits.
The root catalog below owns the current SDK version.

## Engine version

One root `package.json` workspace catalog owns all published `@jgengine/*` SDK
versions; game and shared workspace manifests use `catalog:` and never own SDK
versions. A published version is adopted by changing the root catalog and regenerating
`bun.lock` at a milestone release. The CLI `jgengine` keeps its separate version cadence.

The current catalog installs SDK 0.41.0, including editor and its published navbake dependency. Keep the root catalog and lockfile coherent when updating SDK packages, following [framework-first policy](AGENTS.md#framework-first-development).

**Adopting an engine change without a release.** Pin the commit you need, adopt it, prove
it, land it. The PR carries one line naming that commit - `Engine pin: <sha>` - and
`bun run check:engine-mode` fails a pinned or local lane whose body does not name the
commit it installed, or an install whose packages disagree with the catalog:

```sh
bun run engine:pin --ref <sha>  # link a cached build of one commit: the adoption path
bun run engine:status     # mode, engine commit, stale-or-fresh dist, uncommitted live edits
bun run engine:local      # link ../jgengine (or --dir <path>): live, sees uncommitted edits
bun run engine:watch      # rebuild changed engine packages (live mode only)
bun run engine:snapshots  # cached snapshots, with --prune <sha|all>
bun run engine:published  # restore the catalog install (--version <x.y.z> pins that release)
bun run check:engine-mode # does the PR name the commit this lane installed?
```

`engine:local` links the checkout itself, so an edit there — even an uncommitted one — lands in every workspace in live mode at once. `engine:pin` builds `git archive <commit>` once into `%LOCALAPPDATA%\jgengine-snapshots`, keys it by commit and build inputs, and links that; concurrent lanes pinning the same commit share the one build, and edits in the live checkout stay invisible. `.engine-mode` (ignored) records the link; never commit it.

A lane that edits the engine uses `engine:local` and sees its uncommitted work; every other
lane that needs the same engine change pins a commit and never queues behind it. Local mode
proves no commit, so it is not adoptable evidence: pin the commit you proved before closing.
CI follows that claim: the `games` job reads the `Engine pin:` line from the PR body and
installs that commit before it typechecks, so the checks run against the engine the PR
proved. A PR without the line runs the published catalog exactly as before, and a claim that
names a commit lacking the seam the branch uses fails there like any other type error. A pinned PR then
lands only when the catalog's published release already contains its pin
(`scripts/ci-pin-released.ts`): beta installs the catalog, so merging earlier turns beta red.
Pin to prove and review; release, adopt and drop the line to land.

The engine repo (`Noisemaker111/jgengine`) clones this repo at build time into `./Games` (gitignored, ephemeral) to render `/games` and `/play`. The games repo is the source of truth for game content; the engine repo no longer commits games.

## Credits

See the engine repo's [CREDITS.md](https://github.com/Noisemaker111/jgengine/blob/main/CREDITS.md) and per-game `src/game.config.ts` (`credit` export).
