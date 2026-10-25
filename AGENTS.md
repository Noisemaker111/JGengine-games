# Agent instructions

These games exist to find and fix gaps in JGengine's shared framework. [JGengine's AGENTS.md](https://github.com/Noisemaker111/jgengine/blob/beta/AGENTS.md) owns the shared rules: writing style, product invariants (editor-authored worlds, no genre kits, UI ownership), verification and how to ask. [README.md](README.md) owns the game list, dev commands and engine version mechanics.

## Engine

Games run engine source at the engine `beta` commit in `engine-ref.txt`, never a published npm version and never engine `src/` paths.

- After checkout or pull: `bun run engine:sync`. `check:engine-mode` fails unless that build is linked.
- Need newer engine code: merge it on engine `beta`, run `bun run engine:bump`, and commit `engine-ref.txt` in the same PR as the game change. `check:engine-ref` fails a ref not on engine beta.
- `bun run engine:local` links a live engine checkout; `lane:close` refuses it.
- The engine checkout is `../jgengine`; `engine:*`, `ci:status` and `pr:sweep` take `--dir <path>`.

## Framework-first development

1. Name the shared package owner and read the engine API before editing. Adopt what exists.
2. If reusable behavior is missing or broken, fix the engine package with this game as first adopter.
3. Verify the game itself, plus a differently built second game when it applies.
4. Delete superseded game code after adoption.

**Size signal.** A game module that owns a state machine, reducer, scheduler, resource pool, pathfinder, damage or status table, spawn director or progression curve is an engine system in the wrong repo. If it would pass roughly 50 lines, or a second game would want it, file the engine seam first: name `packages/<pkg>/src/<file>`, the API needed and two adopting games, under [epic #2312](https://github.com/Noisemaker111/jgengine/issues/2312).

**Seam line.** Every PR body carries `Engine seam: packages/shell/src/render/x.ts (adopts #1234)` or `Engine seam: none - authored content only`. `bun run check:framework` fails a new engine-shaped module in a game; `-- --allow "<reason>"` only when you can say why it cannot live upstream.

## Capability adoption

`capabilities.json` is generated from the engine's game-facing capabilities (`bun run capabilities:sync`). Each game's `<game>/capabilities.json` answers every one:

- **adopted** - the game runs the shared system.
- **not-applicable** - the domain does not exist in this game; the reason names the domain.
- **debt** - the game has the domain but not the shared system; the reason names the gap and an open issue in this repo.

Reasons are 20+ specific characters, never copied between games. `bun run check:capabilities` fails missing, thin or template reasons, ownerless or closed-issue debt, and a stale ledger; `--summary` prints the per-game table. `bun run capabilities:probe` boots games that name a probe and checks the system reports live counters; name a probe only for a system mounted at boot.

**Debt only goes down.** `scripts/debt-budget.json` holds a total and per-game ceiling. The gate fails when debt exceeds a ceiling or a ceiling sits above the tally; clearing debt lowers its budget with `bun run check:capabilities --write`, which never raises one.

## Where the work is defined

A game's loop is its README design checklist ([rules](README.md#design-checklist-and-loop-proofs)); keep its numbers true to the build.

## Lanes

- Work in `.claude/worktrees/<name>` (`claude --worktree <name>` or `git worktree add -b <name> .claude/worktrees/<name> origin/beta`); scratch goes in `.scratch/`.
- **End a lane with `bun run lane:close -m "<subject>" --seam "<line>"`.** It runs `verify:fast`, refuses files a lane should not land, commits, pushes, opens the PR into `beta` and arms auto-merge. Never hand-roll `git add`/`commit`/`push`/`gh pr merge`.
- Long commands: `bun run bg:run -- <cmd>` then `bun run bg:await <id>`. Never sleep or poll.
- When games CI is green on `beta`, fast-forward `stable` with `git push origin origin/beta:stable`, then `bun run games:bump` in the engine and land that PR.
