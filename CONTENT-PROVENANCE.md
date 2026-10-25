# Game content and provenance

JGengine Games uses familiar genre mechanics with independently named projects and authored settings. Product titles, route IDs, package names, character callings, quest copy, and reference documents use these identities:

| Game | Identity and setting |
| --- | --- |
| Ember Command | A highland commander leads the Vanguard against Marauder fortifications. |
| Brightway Park | Build attractions and shops, price tickets, and manage visitor demand. |
| Odd Orbit | Care for an alien household through needs, schedules, and shared living space. |
| Scrap Signal | Reclaim Ferralon with Gunk, Nyx, or Cipher; recover modules and breach a reactor. |
| Beacon Bastion | Defend a beacon with towers and authored approach routes. |
| Deepward | Oxygen-limited salvage dives through abandoned printing vaults, with banked salvage, competing refits, and reprint recovery. |
| Harbor Heat | Run courier jobs and crew contracts across a coastal city. |
| Drift Foundry | Race modular scrap vehicles through an industrial canyon. |

The removed Lantern Reach game retained source from Levy Street’s MIT project. Its historical acknowledgment was exactly **Port of World of ClaudeCraft · Levy Street (MIT)**, linked to [the upstream source](https://github.com/levy-street/world-of-claudecraft), in its credit export and running game. Its source and attribution remain in Git history.

Third-party asset catalog keys identify the actual files being loaded. KayKit, Quaternius, ambientCG, and game-icons.net assets keep their source names and license notices; renaming a game does not rename or change the license of an upstream pack. Consult [engine credits](https://github.com/Noisemaker111/jgengine/blob/main/CREDITS.md), the individual packs, and game credit exports for their notices. No new source or asset ownership is claimed by this migration.

All eight listed games have runnable packages. Deepward uses original procedural industrial geometry, materials, and an authored extraction setting; it requires no downloaded model pack. Its current implementation includes salvage banking, permanent tank and reserve-ammunition refits, and persistent loss/reprint acknowledgment. The earlier identity migration preserved game mechanics while changing identities and authored vocabulary. The content review removes explicit positioning as reproductions of commercial titles and the identifiable borrowed names found in authored content. It does not establish legal clearance or exclusive rights to a title.

Harbor Heat and Scrap Signal retain historical save namespaces and identifiers only in their compatibility loaders. A current save takes precedence; otherwise the loader copies an existing legacy slot into the new namespace and translates renamed content IDs through the whole-world save controller. It leaves the old record intact. Save and reload behavior is game-specific; Deepward has an offline continuation path.

## Harbor Heat realistic assets

Harbor Heat's street furniture comes from the engine's realistic model library and its building faces from ambientCG scans. Every file is downloaded from the publisher's own site by `bun run provision harbor-heat` (Poly Haven files are checked against Poly Haven's published md5), compressed, and kept out of Git under `public/`. All are CC0 1.0: no attribution is required, and these credits are given anyway.

| In game | Asset | Author | License | Source |
| --- | --- | --- | --- | --- |
| `obj_streetlight` | Cast-iron street lamp (`city/street-lamp`) | Josh Dean | CC0 1.0 | https://polyhaven.com/a/street_lamp_01 |
| `obj_bench` | Painted wooden bench (`park/bench`) | Kirill Sannikov | CC0 1.0 | https://polyhaven.com/a/painted_wooden_bench |
| `obj_hydrant` | Fire hydrant (`city/fire-hydrant`) | Gonçalo Felício | CC0 1.0 | https://polyhaven.com/a/fire_hydrant |
| `obj_trashcan` | Galvanised trash can (`city/trash-can`) | GurJas Studios | CC0 1.0 | https://polyhaven.com/a/metal_trash_can |
| `obj_dumpster` | Street utility cabinet (`city/utility-cabinet`) | James Ray Cock | CC0 1.0 | https://polyhaven.com/a/utility_box_02 |
| `obj_barrier` | Concrete road barrier (`city/road-barrier`) | Amal Kumar | CC0 1.0 | https://polyhaven.com/a/concrete_road_barrier_02 |
| `obj_crate_dock` | Wooden shipping crate (`industrial/wooden-crate`) | James Ray Cock, Jurita Burger | CC0 1.0 | https://polyhaven.com/a/wooden_crate_02 |
| `obj_barrel` | Steel drum barrel (`industrial/barrel`) | Jorge Camacho | CC0 1.0 | https://polyhaven.com/a/Barrel_01 |
| `obj_planter` | Potted plant (`park/potted-plant`) | Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/potted_plant_02 |
| `obj_hedge` | Wooden planter box (`park/planter-box`) | James Ray Cock | CC0 1.0 | https://polyhaven.com/a/planter_box_01 |
| `obj_cactus` | Quiver tree (`nature/quiver-tree`) | Dario Barresi, Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/quiver_tree_02 |
| building face `facade/brick-red` | Brick facade, red (Facade018A) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Facade018A |
| building face `facade/brick-grey` | Brick facade, grey (Facade019A) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Facade019A |
| building face `facade/brick-brown` | Brick facade, brown (Facade020A) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Facade020A |
| building face `facade/glass-blue` | Glass curtain wall, blue (Facade001) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Facade001 |
| building face `facade/glass-mirror` | Glass curtain wall, mirror (Facade005) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Facade005 |
| streets | Road asphalt (Asphalt003) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Asphalt003 |
| streets | Sidewalk and driveway concrete (Concrete006) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Concrete006 |

The building block itself (`harbor-heat/src/art/city-block.glb`) is original geometry with no textures. Cars, people, aircraft, signs, neon, signals and cargo are still KayKit (CC0): no CC0 realistic glTF cars or rigged humans exist on Poly Haven or ambientCG, and the engine's `MODEL_LIBRARY_GAPS` lists the route for each.

## Games made by `bun run new-game`

Hold the Line, Fernwild and Apex Nights were generated from one-sentence ideas by `bun run new-game` (see [docs/new-game.md](docs/new-game.md)). Their names, story text and settings are original. The generator copies the pack models each game uses from the engine's `apps/dev/public/models/` into `<game>/public/models/imported/`. Textures over 1 MB are scaled down to 1024 px. Library models (`city/...`, `vehicle/...`) come from `bun run provision <game>`, as with Harbor Heat above. Every copied file is CC0 1.0 and keeps its source name. Each game's Credits screen lists them.

| Game | Pack (folder under `public/models/imported/`) | Author | License |
| --- | --- | --- | --- |
| Hold the Line, Apex Nights | KayKit City Builder Bits (`kaykit-city-builder`): buildings, cars, water tower, dumpster | Kay Lousberg | CC0 1.0 |
| Hold the Line, Fernwild | Quaternius Stylized Nature (`quaternius-stylized-nature`): trees, bushes, ferns | Quaternius | CC0 1.0 |
| Fernwild | Quaternius Medieval Village (`quaternius-medieval-village`): wooden fence | Quaternius | CC0 1.0 |
| Fernwild | KayKit Dungeon (`kaykit-dungeon`): lit torch | Kay Lousberg | CC0 1.0 |
| Fernwild | KayKit adventurer and Quaternius animal models renamed for the engine's former Lantern Reach port (`lantern-reach`): ranger, raptor, stag, boar, bull, settlement | Kay Lousberg; Quaternius | CC0 1.0 |
