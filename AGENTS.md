# Agent instructions

## Project purpose

These playable reference games develop and test JGengine's shared framework. Playing and inspecting different games exposes gaps in layout, input, rendering, asset placement and physics. Resolve reusable causes upstream so one correction benefits every applicable game; a fix copied into each game is unfinished framework work.

Before changing a game, distinguish a broken or missing SDK contract, incorrect adoption and a game-specific design choice using actual code and play evidence. An obstructed HUD does not automatically justify local CSS, and apparent sinking does not justify a guessed model offset. Games retain their own rules, content, art direction and composition; shared behavior stays configurable.

The games use published `@jgengine/*` packages; [`README.md`](./README.md) owns the game list, dev commands and engine-version rules.

- Games depend on published `@jgengine/*`, never on the engine monorepo's source.
- A probe game is not a template; do not copy one game to start another.

## Framework-first development

Every interaction, feature, bugfix and visual pass should improve or adopt JGengine's shared capabilities. These games prove the framework; they must not grow separate engines. Games own unique rules, stories, items, assets, authored scenes, art direction and composition. Keep adapters small without forcing identical games or measuring quality by line count.

1. Name the shared package owner and inspect the installed API/version before editing. If the capability exists, adopt it; do not recreate it in a game helper.
2. If reusable behavior is missing or broken, fix or extend the upstream package with the game as its first adopter. Keep policy configurable and respect engine layering. Recipes wire APIs; they do not substitute for shared implementations.
3. Verify packaged exports and the actual game, coordinating a differently composed second consumer when applicable. Do not edit another session's owned files or duplicate its upstream work.
4. SDK versions belong to the root workspace catalog and lockfile, as described in [README.md](README.md#engine-version). A beta engine merge does not update installed games. Prepare a reviewable adopter patch until the required package is published; never use source aliases or per-game version edits to bypass this boundary.
5. Remove superseded algorithms, listeners and resource management after adoption. Delivery evidence names the framework gap resolved, shared owner, consumer cleanup and actual behavior verified, with remaining gaps stated separately. Preserve each game's identity and observable play.

Repeated generic glue is framework friction or adoption debt, even if the game works. Track any necessary fallback with its upstream issue and removal path; do not count it as a completed framework improvement. World placement, terrain, paths, zones and foliage are editor-authored data consumed through shared SDK primitives, not hardcoded runtime coordinate arrays.

**Size signal.** A game module that owns a state machine, reducer, scheduler, resource pool, pathfinder, damage or status table, spawn director or progression curve is an engine system in the wrong repo. If it would pass roughly 50 lines, or a second game would want it, file the engine seam before writing it.

**Escalate with a shape, not a complaint.** File the engine issue naming the seam (`packages/<pkg>/src/<file>:<line>`), the API needed and the two games that would adopt it; track it in [epic #2038](https://github.com/Noisemaker111/jgengine/issues/2038) under the matching system: missions, progression and economy, AI director, vehicles, items and loot, agents, damage and status, abilities, run and session loop, wanted and heat, shell UI. Until it lands, a game works only on its adoption side.

**Say which it is in the PR**, using the template's required line: `Engine seam: packages/shell/src/render/x.ts (adopts #1234)` or `Engine seam: none - authored content only`. `bun run check:framework` (also run by CI) fails on a new engine-shaped module inside a game; pass `-- --allow "<reason>"` only when you can name why it cannot live upstream.

Precedents: Harbor's 6 -> 60 FPS and Odd Orbit's missing-material fallback were each corrected once in the engine and every game gained; Brightway's flat turf was patched inside the game and had to be paid for twice.

Engine contributors also follow [JGengine's governance](https://github.com/Noisemaker111/jgengine/blob/beta/AGENTS.md#game-changes-improve-the-framework). Its package skills describe discovery and exact APIs; inspect installed declarations rather than assuming unpublished capabilities exist.

## Capability adoption

`capabilities.json` is the generated inventory of game-facing capabilities read from the installed `@jgengine/*` declarations (`bun run capabilities:sync`); a release that adds one shows up as a diff line. Every game owns `<game>/capabilities.json` and declares each capability adopted, or declined with 20+ characters of why. `bun run check:capabilities` fails a missing declaration, a thin decline and a ledger behind the installed packages; `bun run capabilities:probe` boots the games that name a probe and proves the adopted system reports on `window.__jgengineAgent` / `window.__jgengineAudio`. Name a probe only for a system mounted at boot; an on-demand system stays declaration-level until it has one.

## Agent workflow

- Code work happens in `.claude/worktrees/<name>` (`claude --worktree <name>`, or `git worktree add -b <name> .claude/worktrees/<name> origin/beta`); scratch and evidence go in `.scratch/`, which never holds a checkout. Both are ignored.
- After opening a PR, always subscribe to its activity and drive it to green; never ask whether to watch it.
- Work lands on `beta`: branch from `origin/beta`, then push verified commits to `beta` directly or open the PR into `beta` and merge it yourself with `gh pr merge <n> --auto --merge` (if that errors for any reason but a failing check, `gh pr merge <n> --merge`), and confirm it shows MERGED; never ask me to merge. When a change needs unreleased engine work, cut the engine release yourself per the engine's AGENTS.md, then adopt it here and merge that too. `stable` is the stable branch: after an SDK adoption PR merges and the games CI is green on `beta`, fast-forward it yourself with `git push origin origin/beta:stable`, then run `bun run games:bump` in the engine and merge that pin PR.
- For a reversible choice, pick the option you'd recommend, say which in the PR body, and keep going. Ask only for irreversible actions, money or production data; merges and releases are never questions.
- Record demo clips and videos yourself with the repo's capture tooling; never ask me to record them.
- Rewrite a PR body yourself whenever it goes stale.
