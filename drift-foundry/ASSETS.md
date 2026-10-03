# Drift Foundry art

The Row Six salvage buggy, four pickup stations, jump barriers and teal jump marks in
`src/game/art/` are original procedural geometry authored for this game. Regenerate
them with `bun run author-models`. The pit poster in `StartScreen.tsx` is original SVG.
Model module URLs travel with the published-package game through either its standalone
mount or the engine host.

Amber plow posts and cyan jump posts mark approaches before each barricade. Static
lamps, towers and route cues are authored in `src/editor.scene.json` through the
published editor RPC; runtime resolves those placements with shared authored-object APIs.
The live compactor and destructible barricades remain simulation-owned.

Use **X / Keep Engine** to retain the current motor at later engine stations. The
truck motor carries more speed but turns less sharply than the EV. The choice survives
a stopped, grounded checkpoint and resets for a new run. Gate advice distinguishes
missing parts, approaching jumps, launch timing and reversing for a missed launch.

Existing yard props retain their catalog source credits: Kay Lousberg's
[KayKit City Builder](https://kaylousberg.itch.io/kaykit-city-builder-bits) and
[KayKit Dungeon](https://kaylousberg.itch.io/kaykit-dungeon), and the
[ambientCG Ground025](https://ambientcg.com/view?id=Ground025) ground material.
The in-game credits list those sources. Local `public/models/` and `public/materials/`
are unchanged copies of the engine's licensed asset files, provisioned for standalone
development according to this repository's ignored asset-cache convention.
