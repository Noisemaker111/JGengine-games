# Agent instructions

Playable probe games built on the published `@jgengine/*` packages; [`README.md`](./README.md) owns the game list, dev commands and engine-version rules.

- Games depend on published `@jgengine/*`, never on the engine monorepo's source.
- A probe game is not a template; do not copy one game to start another.

## Agent workflow

- After opening a PR, always subscribe to its activity and drive it to green; never ask whether to watch it.
- Work lands on `agents`: branch from `origin/agents`, open the PR into `agents`, and merge it yourself with `gh pr merge <n> --auto --merge` (if GitHub refuses auto-merge, `gh pr merge <n> --merge` once it is green); never ask me to merge. `main` moves only when I ask.
- For a reversible choice, pick the option you'd recommend, say which in the PR body, and keep going. Ask only for irreversible actions, money, production data, or releases.
- Record demo clips and videos yourself with the repo's capture tooling; never ask me to record them.
- Rewrite a PR body yourself whenever it goes stale.
