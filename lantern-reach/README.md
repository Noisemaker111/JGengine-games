# Lantern Reach

Lantern-lit frontier adventure through Eastbrook Vale, Mirefen Marsh and
Thornpeak Heights. Choose a calling, speak with town residents, and follow the
road toward the Hollow Crypt.

Run `bun install --frozen-lockfile` from the repository root, then provision this
game's existing art before `bun run dev:lantern-reach`:

```sh
cd lantern-reach
bun scripts/provision-models.ts
```

The script verifies 91 model/map files (88,412,952 bytes) against the checked-in
[`model-provenance.json`](scripts/model-provenance.json) SHA-256 hashes. It writes
only ignored `public/models/lantern-reach` files and reuses verified files.
The 25 existing character models are the game's historical **CC0-1.0 KayKit and
Quaternius** art from a pinned JGengine revision, credited in that revision's
[CREDITS.md](https://github.com/Noisemaker111/jgengine/blob/612c174c7fa7b082450139c74ef87f4f5bb336ab/CREDITS.md#world-of-claudecraft).

Eastbrook's provision house, apothecary, watch hall, lantern chapel, workshop and
wayside inn are custom assemblies of individual **Quaternius CC0-1.0**
[Medieval Village](https://quaternius.com/packs/medievalvillagemegakit.html) parts.
The tree belt uses [Stylized Nature](https://quaternius.com/packs/stylizednaturemegakit.html).
Their original model and material-map bytes are pinned in the same provenance
manifest. This is source artwork, not another game's implementation.

`src/editor.scene.json` owns the buildings, roads, clearing sizes, terrain sculpt
and lighting. Eleven compact building GLBs in `src/art` keep their editable parts
in the document's prefab library. The market paving retains its own 52-tile
source prefab and exports as one material group. Eight fence sections, four
planting bushes and six mounted KayKit torches dress specific settlement edges
and entrances; their placements are scene markers, not runtime scatter arrays.
The torch source is Kay Lousberg’s CC0-1.0
[KayKit Dungeon](https://kaylousberg.itch.io/kaykit-dungeon-remastered).
Offline GLTFTransform 4.2.1 dedup/flatten/join
reduced the assemblies to 9–11 material groups each; shared external maps retain
one URL per source image. The asset-integrity test checks baked hashes, prefab
source hashes, map references and the material-group budget. The editor's missing
prefab GLB export workflow is tracked in
[jgengine#1937](https://github.com/Noisemaker111/jgengine/issues/1937).

For an offline copy of the downloaded files, use
`bun scripts/provision-models.ts --from <directory>` with the same `players`,
`enemies`, `creatures` and `scenery` folders. Authored building files are copied
from this checkout. Hash checks are identical. A missing model produces an
obstructive magenta loader placeholder, so provisioning is part of startup.

The forge offers basic engineering recipes for the three starter tools. A Mithril
Mining Pick spends three bone fragments and one linen scrap; an Ironbark Axe
spends three linen scraps and one bone fragment; a Silverleaf Sickle spends three
spider legs and one linen scrap. These materials can be gathered in Eastbrook,
and spending them on tools competes with other recipes. Upgrades consume their
starter tool as well as the next region's materials.

Eastbrook gathering trains each profession to 50, which opens Mirefen. Mirefen
trains to 150, which opens Highwatch. Basic recipes train crafting to 75; higher
recipe bands continue training toward the next unlock. Earned skills and crafted
inventory use the existing save format. Quest-gated recipes check the player's
unlock before consuming any inputs.

Controls: WASD movement, E nearby interaction, 1–9 abilities, T auto-attack,
Tab targets, L quest journal, B bags. Click **Skip Intro** or press Escape to
leave the opening camera sequence. Settings are available from the gear button.

To re-export edited buildings, open the scene in the editor and edit the original
parts in one of its eleven `building:*` prefabs. Save the scene document, then run:

```sh
bun scripts/export-settlements.ts
bun scripts/provision-models.ts
bun scripts/export-settlements.ts --check
```

The deterministic exporter reads prefab-local transforms, verifies every original
CC0 source model and shared material map, and fuses only those source meshes. It
updates the compact GLBs and their provenance hashes/dimensions; it never creates
runtime world geometry. The compact marker's `meta.sourcePrefabId` connects each
visible instance to its editable source. The `--check` mode rebuilds in memory
and fails if either the checked-in GLB or manifest is stale. GLTFTransform 4.2.1
uses its own checked-in tooling lockfile and installs through npm into a temporary
directory outside this repository, without
changing game dependencies or the repository lockfile. Commit the editor document,
updated `src/art` artifacts and provenance manifest together after an edit.

The buildings currently have closed decorative doors and solid exteriors. Published
0.18.1 fits fused models with a conservative movement box; traversable interiors
require authored collision decomposition in the future shared prefab exporter.
`settlementWalking.test.ts` uses the published capsule/walker collision resolver
to check all eleven exterior approaches and walking from spawn to all seven town
residents. It does not claim passage through closed doors. The precise export
limitation is recorded in [#1937](https://github.com/Noisemaker111/jgengine/issues/1937#issuecomment-5969622857).

Rain, snow and the original vale grass remain legacy biome effects. Graveyards,
the crypt and the five outlying dungeon compounds retain their original terrain
flatten radii and falloffs. The published editor document cannot yet express
weather/vegetation bands or individual clearing blend rings, so those features
remain explicit in `world.ts`; the settlement architecture is editor authored.
