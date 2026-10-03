# Agent instructions

Playable probe games built on the published `@jgengine/*` packages; [`README.md`](./README.md) owns the game list, dev commands and engine-version rules.

- Games depend on published `@jgengine/*`, never on the engine monorepo's source.
- A probe game is not a template; do not copy one game to start another.

## Framework-first development

Every interaction, feature, bugfix and visual pass should improve or adopt JGengine's shared capabilities. These games prove the framework; they must not grow separate engines. Games own unique rules, stories, items, assets, authored scenes, art direction and composition. Keep adapters small without forcing identical games or measuring quality by line count.

1. Name the shared package owner and inspect the installed API/version before editing. If the capability exists, adopt it; do not recreate it in a game helper.
2. If reusable behavior is missing or broken, fix or extend the upstream package with the game as its first adopter. Keep policy configurable and respect engine layering. Recipes wire APIs; they do not substitute for shared implementations.
3. Verify packaged exports and the actual game, coordinating a differently composed second consumer when applicable. Do not edit another session's owned files or duplicate its upstream work.
4. SDK versions belong to the root workspace catalog and lockfile, as described in [README.md](README.md#engine-version). A beta engine merge does not update installed games. Prepare a reviewable adopter patch until the required package is published; never use source aliases or per-game version edits to bypass this boundary.
5. Remove superseded algorithms, listeners and resource management after adoption. Delivery evidence names the shared owner, the consumer cleanup and behavior verified. Preserve each game's identity and observable play.

Repeated generic glue is framework friction or adoption debt, even if the game works. Track any necessary fallback with its upstream issue and removal path; do not count it as a completed framework improvement. World placement, terrain, paths, zones and foliage are editor-authored data consumed through shared SDK primitives, not hardcoded runtime coordinate arrays.

Engine contributors also follow [JGengine's governance](https://github.com/Noisemaker111/jgengine/blob/beta/AGENTS.md#game-changes-improve-the-framework). Its package skills describe discovery and exact APIs; inspect installed declarations rather than assuming unpublished capabilities exist.

## Agent workflow

- Code work happens in `.claude/worktrees/<name>` (`claude --worktree <name>`, or `git worktree add -b <name> .claude/worktrees/<name> origin/beta`); scratch and evidence go in `.scratch/`, which never holds a checkout. Both are ignored.
- After opening a PR, always subscribe to its activity and drive it to green; never ask whether to watch it.
- Work lands on `beta`: branch from `origin/beta`, then push verified commits to `beta` directly or open the PR into `beta` and merge it yourself with `gh pr merge <n> --auto --merge` (if that errors for any reason but a failing check, `gh pr merge <n> --merge`), and confirm it shows MERGED; never ask me to merge. `stable` is the stable branch and moves only when I ask.
- For a reversible choice, pick the option you'd recommend, say which in the PR body, and keep going. Ask only for irreversible actions, money, production data, or releases.
- Record demo clips and videos yourself with the repo's capture tooling; never ask me to record them.
- Rewrite a PR body yourself whenever it goes stale.
