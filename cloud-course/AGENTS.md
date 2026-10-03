# Cloud Course — agent briefing

You are in a **JGengine** game project. JGengine is a pure-TypeScript game engine SDK on npm (`@jgengine/core`, `react`, `shell`, …). Site: https://jgengine.com · source: https://github.com/Noisemaker111/jgengine

**How people use JGengine:** they say *Make a game that … with jgengine* to an agent. They do **not** start from a CLI tutorial. `npx jgengine` is for **you** (scaffold, skills, docs).

**This project is the game.** Build here, on the `@jgengine/*` npm packages. Never clone the jgengine GitHub repo, and never copy code, assets, or content from its `Games/*` directory — those are private in-repo test games, not templates, and their content is not licensed for reuse.

## Framework-first game development

For every interaction, feature, fix or visual change, discover the installed SDK capability before implementing reusable behavior. The game owns unique rules, content, assets, authored scenes and presentation; JGengine owns common input, rendering lifecycle, storage, interaction and UI accessibility. Compose its APIs instead of copying those mechanisms into game helpers.

Check installed versions before recreating a fix already delivered upstream. Adopt compatible published updates, apply required migrations and remove superseded local code. In a workspace using an SDK catalog, versions belong to that root catalog, not each game manifest. Shared behavior must preserve distinct game designs and artwork.

When a reusable contract is missing, report the upstream gap below. Engine contributors fix its shared owner with a real game adopter; recipes illustrate SDK composition rather than another implementation. A necessary temporary fallback must have a tracked upstream issue and removal path, and does not complete the shared fix. Never use engine source aliases to bypass publication.

## Path to a playable game

1. Start from `.claude/skills/jgengine/recipes/minimal-game.md` — the default end-to-end path, installed with the project skills. Skills missing (your problem, not the user's): `npx jgengine skills -p` restores the minimal set; add `--all` for the full domain skills when the game outgrows it.
2. Discovery ladder: a skill's `capabilities.md` → its recipes → package source under `node_modules/@jgengine/<pkg>/` — never a full api inventory.
3. Import from `@jgengine/shell/gameKit` first — the happy-path surface (`defineGame`, `defineSystem`, `GameHost`, HUD primitives, editor-layer helpers). Reach for deeper module paths only when the kit lacks the seam.
4. **User-facing first reply is short** — game name, fantasy in 2–4 lines, POV (1st / 3rd / top-down / HUD-only), world kind, scale vibe. Ask a few tight questions. **Do not** dump file trees, catalog ids, keybind tables, or full phase plans to the user. Keep the engineering plan internal.
5. Setup broken or UI unstyled: `npx jgengine doctor`. Dev: `bun dev`. Windows installer: `npx jgengine desktop`.

## Built-in modes — engine-owned via GameHost, use them

`GameHost` owns the F2 chord family in every JGengine game, and it is **your** toolkit, not just the player's:

- **F2+E — editor mode** (also `?mode=editor`): the scene editor on `src/editor.scene.json` — place spawns, props, zones, paths, vegetation; Ctrl+S saves. Leave it via the top-bar **Exit to game** button or **F2+Q**; the mode mirrors to the URL, so stripping `?mode=editor` (and reloading) also drops back to the game.
- **F2+D — debug mode** (also `?debug`): engine devtools overlay (perf, logs, keybinds, live tunables with Save-to-source). Open/close mirrors to the `?debug` param — share the URL to reopen it, strip the param to close.
- **F2+C — canvas mode**: drag/resize HUD panels; layout persists to the scene document's `ui.panels`.

Author world content in the editor — never as coordinate tables in code. Agents drive all three headlessly through `window.__jgengineAgent.handle({ method: ... })` on any running game page (`agent_status`, `debug_snapshot`, `canvas_move_panel`, `editor_summon`, editor verbs, `save_scene`) — the easiest way is `bun run drive -- --rpc '{"method":"agent_status"}'`, which boots the dev server and Chrome for you; a browser tool on the `bun dev` page works too. See the `jgengine-editor` skill.

## Before you hand-roll UI or motion — check what's already shipped

The engine ships far more drop-in building blocks than you'll discover by writing code. Reinventing them is the #1 way agents waste a build. **Before you write a window manager, a bag, a paperdoll, a keydown listener for a hotkey, a stat bar, a minimap, or a walk-cycle/bob, run `npx jgengine find <intent>`** — it searches every shipped capability by intent and prints the primitive + its import:

```sh
npx jgengine find "toggleable window"   # → usePanels / PanelHost (hotkeys, ESC, drag, z-stack — all wired)
npx jgengine find inventory             # → InventoryGrid (real drag/stack/split)
npx jgengine find "character sheet"     # → CharacterSheet / Paperdoll
npx jgengine find "3d portrait"         # → EntityPreview (live in-game model in a panel)
```

If you catch yourself writing a `z-index` for a HUD window, a `keydown` listener to open a panel, a `<div>`-grid inventory, or a sine-wave limb bob, **stop and `find` it first** — a shipped, accessible, themeable version almost certainly exists. Games own their *look* (skin, layout, terminology, art direction) — compose and reskin the blocks; don't re-derive them from raw divs. Only genuinely game-specific content is hand-built.

## Hit an engine bug or gap? File it upstream, don't just work around it

When a shared primitive misbehaves or lacks a reusable contract, **file a short upstream issue** at https://github.com/Noisemaker111/jgengine/issues. Check the installed version and existing fixes first. Do not treat a game-local replacement as the finished solution. Engine contributors fix the package and verify its adopter; independent projects track the gap and the published version that can replace any temporary adapter. Include:

- **What** you were doing and what you expected.
- **Cause** — the underlying behavior you traced, precisely. e.g. *"`HeadlessRunner.step(dt)` clamps game-dt to `maxStepSeconds` (default 0.05s) regardless of the dt passed, so time-based tests need ~20 steps per second of game-time."*
- **Why** it bit you — the false negative, wrong result, wasted time, or blocked path it caused.
- **How** to reproduce (smallest steps) and, if you can see it, a suggested fix or the missing seam.
- A **screenshot** whenever the problem is visual.

Title it `[BUG] …` for wrong behavior or `[FEATURE] …` for a missing capability. One clear report beats a paragraph of workaround apologetics — the fix belongs in the engine, not in your game.

## Project rules

- Shape: `src/` holds only `game.config.ts`, `index.tsx`, `main.tsx`, `index.css`, `style.css` plus optional `loop.ts`, `world.ts`, `editorLayers.ts`, `editorLayers.test.ts`, `editor.scene.json`; everything else under `src/game/`.
- Entry: `defineGame({...})` in `game.config.ts`; `editorLayers` passed to defineGame auto-mounts the authored scene, and the player spawns at the authored `player_spawn` marker.
- Spawn player with `id === ctx.player.userId` in `onNewPlayer`; systems (`defineSystem`) own the rules tick.
- Tailwind v4: `@source` in `src/index.css` must cover `@jgengine/react`, `@jgengine/shell`, and `@jgengine/editor` (dist under node_modules), or the HUD — and the F2+E editor chrome mounted into this same page — is silently unstyled.
- Visual claims are screenshot-judged, by you, harshly — flat untextured ground and an empty horizon fail. Prove content with `bun test`, prove looks with your eyes (`jgengine-verify` skill).
- Models live in `public/models`, pulled — not shipped inside the package. `jgengine create` pulls them for you; if that was skipped (offline, `--no-assets`, `--no-install`) run `npx assets pull starter` in this folder, or every `asset:` id falls back to an untextured placeholder primitive and fails the bar above.
- Screenshots: `bun run shoot` (or `node scripts/shoot.mjs`) captures the running game to `shots/shot.png` — it starts the dev server if needed, forces a real viewport so the WebGL canvas is not stuck at 300x150, waits for an honest frame, and works headless. Add `--device mobile`, `--out shots/hud.png`, `--settle <ms>`, or `--url <page>`; `--help` for all flags. Do **not** rely on a browser tool's "screenshot" button for the 3D canvas — it captures before the GPU draws.
- Play & test from the CLI: `bun run drive` (or `node scripts/drive.mjs`) drives the running game headlessly — ordered `--click "TEXT"`, `--key KeyW:2500`, `--wait <ms>`, `--shot <name>`, and `--rpc '{"method":"agent_status"}'` steps, plus `--playtest --strict` for a progress/softlock verdict off the game's `capture.probe`; `--help` for all flags. **Never hand-roll a Playwright/Puppeteer/CDP script to play or test this game** — if drive cannot express what you need, that is an engine gap: file it upstream (see below).
