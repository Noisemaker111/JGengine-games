# Drift Foundry art

The Row Six salvage buggy, four pickup stations, jump barriers, teal jump marks and open exit gantry in
`src/game/art/` are original procedural geometry authored for this game. Regenerate
them with `bun run author-models`. The pit poster in `StartScreen.tsx` is original SVG.
Model module URLs travel with the published-package game through either its standalone
mount or the engine host.

Amber plow posts and cyan jump posts mark approaches before each barricade. Static
lamps, towers, route cues and the finish landmark are authored in `src/editor.scene.json` through the
published editor RPC; runtime resolves those placements with shared authored-object APIs.
The live compactor and destructible barricades remain simulation-owned.

The exit gantry has steel and rust trusses, hazard stripes and cyan lamps. Its center
stays open beneath a crossbeam more than nine meters above the road. Approach posts
sit eleven meters either side of the centerline so their icons fit the chase view
before the launch marks.

Use **X / Keep Engine** to retain the current motor at later engine stations. The
truck motor carries more speed but turns less sharply than the EV. The choice survives
a stopped, grounded checkpoint and resets for a new run. Gate advice distinguishes
missing parts, approaching jumps, launch timing and reversing for a missed launch.

Existing yard props retain their catalog source credits: Kay Lousberg's
[KayKit City Builder](https://kaylousberg.itch.io/kaykit-city-builder-bits) and
[KayKit Dungeon](https://kaylousberg.itch.io/kaykit-dungeon), and the
[ambientCG Ground025](https://ambientcg.com/view?id=Ground025) ground material.
The in-game credits list those sources. For a fresh checkout, install dependencies
from the repository root, then provision all three sources with the installed
published assets CLI:

```sh
bun install --frozen-lockfile
cd drift-foundry
bun run --bun assets pull kaykit-city-builder --dir public
bun run --bun assets pull kaykit-dungeon --dir public
bun run --bun assets pull ambientcg-ground025 --dir public
bun run dev
```

The CLI creates ignored `public/models/<source>/` and
`public/materials/<source>/` directories. No engine checkout or SDK alias is needed.
Published `@jgengine/assets` 0.18.1 first downloads from the
[JGengine packs release mirror](https://github.com/Noisemaker111/jgengine/releases/tag/packs),
then falls back to the catalog's provider URLs. Original game models stay bundled
from `src/game/art/`.
