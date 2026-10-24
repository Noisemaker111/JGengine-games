# Agent instructions

## Project purpose

These playable reference games develop and test JGengine's shared framework. Playing and inspecting different games exposes gaps in layout, input, rendering, asset placement and physics. Resolve reusable causes upstream so one correction benefits every applicable game; a fix copied into each game is unfinished framework work.

Before changing a game, distinguish a broken or missing SDK contract, incorrect adoption and a game-specific design choice using actual code and play evidence. An obstructed HUD does not automatically justify local CSS, and apparent sinking does not justify a guessed model offset. Games retain their own rules, content, art direction and composition; shared behavior stays configurable.

The games consume `@jgengine/*` as real installed packages - the published catalog build, or a pinned build of one engine commit. [`README.md`](./README.md) owns the game list, dev commands and engine-version rules.

- Engine code arrives three ways: **pinned** (`bun run engine:pin --ref <sha|branch>` links a cached, immutable build of one commit, so edits in the live checkout cannot break a lane), **published** (the catalog install PRs and CI verify) and **local** (`bun run engine:local` links a checkout, `bun run engine:published` restores it). `bun run engine:status` names the active mode, the engine commit, whether its dist is stale or its source dirty, and whether uncommitted live edits are visible.
- **An unreleased engine change is adopted by pinning the commit, not by waiting for a publish**: `bun run engine:pin --ref <sha>`, adopt the change in the game, prove it there, land. The catalog bump to a published version is a milestone release, not a step after every engine merge. Prefer `engine:pin` whenever several lanes run at once; use `engine:local` only in the lane that is editing the engine, because it sees uncommitted edits immediately. `bun run engine:snapshots` lists and prunes the cache.
- Never commit link state: `package.json` and `bun.lock` stay clean after `engine:published`. A probe game is not a template; do not copy one game to start another.

## Framework-first development

Every interaction, feature, bugfix and visual pass should improve or adopt JGengine's shared capabilities. These games prove the framework; they must not grow separate engines. Games own unique rules, stories, items, assets, authored scenes, art direction and composition. Keep adapters small without forcing identical games or measuring quality by line count.

1. Name the shared package owner and inspect the installed API/version before editing. If the capability exists, adopt it; do not recreate it in a game helper.
2. If reusable behavior is missing or broken, fix or extend the upstream package with the game as its first adopter. Keep policy configurable and respect engine layering. Recipes wire APIs; they do not substitute for shared implementations.
3. Verify packaged exports and the actual game, coordinating a differently composed second consumer when applicable. Do not edit another session's owned files or duplicate its upstream work.
4. SDK versions belong to the root workspace catalog and lockfile, as described in [README.md](README.md#engine-version). A beta engine merge does not update installed games, and a game does not queue behind a release to adopt one: pin the commit (`bun run engine:pin --ref <sha>`), adopt and prove the change against that build, and name the pinned commit in the PR. The catalog bump to a published version happens at a milestone release, not per change. A pinned build is a real package, so the boundary is unchanged: no engine source is imported here - never use source aliases or per-game version edits to bypass it.
5. Remove superseded algorithms, listeners and resource management after adoption. Delivery evidence names the framework gap resolved, shared owner, consumer cleanup and actual behavior verified, with remaining gaps stated separately. Preserve each game's identity and observable play.

Repeated generic glue is framework friction or adoption debt, even if the game works. Track any necessary fallback with its upstream issue and removal path; do not count it as a completed framework improvement. World placement, terrain, paths, zones and foliage are editor-authored data consumed through shared SDK primitives, not hardcoded runtime coordinate arrays.

**Size signal.** A game module that owns a state machine, reducer, scheduler, resource pool, pathfinder, damage or status table, spawn director or progression curve is an engine system in the wrong repo. If it would pass roughly 50 lines, or a second game would want it, file the engine seam before writing it.

**Escalate with a shape, not a complaint.** File the engine issue naming the seam (`packages/<pkg>/src/<file>:<line>`), the API needed and the two games that would adopt it; track it in [epic #2312](https://github.com/Noisemaker111/jgengine/issues/2312) under the matching system: missions, progression and economy, AI director, vehicles, items and loot, agents, damage and status, abilities, run and session loop, wanted and heat, shell UI. Until it lands, a game works only on its adoption side.

**Say which it is in the PR**, using the template's required line: `Engine seam: packages/shell/src/render/x.ts (adopts #1234)` or `Engine seam: none - authored content only`. `bun run check:framework` (also run by CI) fails on a new engine-shaped module inside a game; pass `-- --allow "<reason>"` only when you can name why it cannot live upstream.

**Say which engine proved it.** A lane that ran against a pinned build writes one line, `Engine pin: <sha>` - the commit `bun run engine:status` reports - instead of "waiting on the release". `lane:close` writes it from the installed snapshot, and `bun run check:engine-mode` fails a pinned or local lane whose body does not name that commit, or whose installed tree and catalog disagree about what is installed. CI reads the same line and installs that commit, so the `games` job checks the engine the PR claims instead of refusing it for the version it is not; with no line the published catalog is the engine, as before.

Precedents: Harbor's 6 -> 60 FPS and Odd Orbit's missing-material fallback were each corrected once in the engine and every game gained; Brightway's flat turf was patched inside the game and had to be paid for twice.

Engine contributors also follow [JGengine's governance](https://github.com/Noisemaker111/jgengine/blob/beta/AGENTS.md#game-changes-improve-the-framework). Its package skills describe discovery and exact APIs; inspect installed declarations rather than assuming unpublished capabilities exist.

## Capability adoption

`capabilities.json` is the generated inventory of game-facing capabilities read from the installed `@jgengine/*` declarations (`bun run capabilities:sync`); a release that adds one shows up as a diff line. Every game owns `<game>/capabilities.json` and gives each capability one of three answers:

- **adopted** - the game runs the shared system.
- **not-applicable** - the capability's domain does not exist in this game, and the reason names that domain. `not-applicable` is a statement about the game, not about our progress.
- **debt** - the game has the domain and has not adopted the shared system. A debt reason names the gap and carries the number of the open issue in this repo that tracks adopting it. Debt is the backlog the ledger exists to surface; its total is the number that must come down.

Every reason is 20+ characters that name the domain or the gap; the old `Not adopted: this game does not run the engine <id> system.` sentence, a bare string, and a reason copied between games all fail. `bun run check:capabilities` fails a missing declaration, a thin or template reason, debt with no owner, debt whose issue is closed, and a ledger behind the installed packages; `--summary` prints the per-game table that CI keeps in the job log. A capability with no probe is still adoptable: the table counts `adopted (verified)` apart from `adopted (declared)`, so adopting early is allowed and the probe, once the capability has one, is what proves it. `bun run capabilities:probe` boots the games that name a probe and proves the adopted system reports on `window.__jgengineAgent` / `window.__jgengineAudio` / `window.__jgengineRun`; a name with no live counters fails. Name a probe only for a system mounted at boot; an on-demand system stays declaration-level until it has one.

**Debt only goes down.** `scripts/debt-budget.json` is the committed debt budget - one total and one number per game - that `bun run check:capabilities --write` seeds from the current tally and may only lower. The gate fails when a game or the total carries more debt than its budget (naming the entry and the open issue to clear first) and when a budget is higher than the tally, so clearing a debt entry has to take its budget with it; `--write` refuses to raise a ceiling and never records a tally that already failed. The summary's last line is the trend, such as `debt: 43 (budget 43, was 50 on 2026-10-16)`. A capability that arrives with an engine release is not silent debt either: the stale-ledger failure lists every game that has not answered it.

## Where the work is defined

- **A game's loop is its `README.md` design checklist**: core loop, progression, failure states, minute 5 → hour 5, references, gap to target. Numbers there are what the build does now; a change that moves them updates them.
- **A game's systems ledger is `<game>/capabilities.json`** (below). The epic for what is left is #2312; a fix that belongs to every game is an engine seam, not a local copy.
- **The engine checkout** defaults to `../jgengine` beside this repo; `ci:status`, `pr:sweep` and every `engine:*` command take `--dir <path>` when it lives elsewhere.

## Agent workflow

- Code work happens in `.claude/worktrees/<name>` (`claude --worktree <name>`, or `git worktree add -b <name> .claude/worktrees/<name> origin/beta`); scratch and evidence go in `.scratch/`, which never holds a checkout. Both are ignored.
- **A lane ends with `bun run lane:close -m "<subject>"`.** It runs `verify:fast`, prints what it will commit and refuses what a lane should not land, commits, pushes, opens or updates the PR into `beta`, arms auto-merge, and prints the URL and `ci:status --pr <n>`. `--seam "<line>"` fills the template's seam line when it opens the PR, and a pinned lane's body gets its `Engine pin: <sha>` line without being asked. Never hand-roll `git add`/`commit`/`push`/`gh pr merge`.
- **Long commands:** `bun run bg:run -- <cmd>` then `bun run bg:await <id>`. Never `Start-Sleep`, never poll a log, never `--watch`. `bun run pr:sweep` lists armed-but-red PRs.
- Work lands on `beta`: `lane:close` arms auto-merge, so GitHub merges when CI is green. `stable` is the stable branch: after an SDK adoption PR merges and the games CI is green on `beta`, fast-forward it with `git push origin origin/beta:stable`, then `bun run games:bump` in the engine and merge that pin PR. Bumping this repo's catalog to a published version is the milestone step; adopting an engine change does not wait for it.
- For a reversible choice, pick the option you'd recommend, say which in the PR body, and keep going. Ask only for irreversible actions, money or production data; merges and releases are never questions.
- Record demo clips and videos yourself with the repo's capture tooling; never ask me to record them.
- Rewrite a PR body yourself whenever it goes stale.
