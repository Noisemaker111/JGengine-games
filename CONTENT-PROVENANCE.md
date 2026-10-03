# Game content and provenance

JGengine Games uses familiar genre mechanics with independently named projects and authored settings. Product titles, route IDs, package names, character callings, quest copy, and reference documents use these identities:

| Game | Identity and setting |
| --- | --- |
| Lantern Reach | Nine frontier callings explore lantern-lit settlements, marshes, and crypts. |
| Resonant Crossing | Two travelers coordinate anchors, prisms, and environmental puzzles. |
| Ember Command | A highland commander leads the Vanguard against Marauder fortifications. |
| Brightway Park | Build attractions and shops, price tickets, and manage visitor demand. |
| Wayfarer Deck | A traveler assembles a deck and faces road encounters and a Gate Colossus. |
| Odd Orbit | Care for an alien household through needs, schedules, and shared living space. |
| Field Station | Explore a research landscape with an environment-studio toolkit. |
| Scrap Signal | Reclaim Ferralon with Gunk, Nyx, or Cipher; recover modules and breach a reactor. |
| Beacon Bastion | Defend a beacon with towers and authored approach routes. |
| Deepward | Oxygen-limited salvage dives through abandoned printing vaults, with banked salvage, competing refits, and reprint recovery. |
| Harbor Heat | Run courier jobs and crew contracts across a coastal city. |
| Drift Foundry | Race modular scrap vehicles through an industrial canyon. |

Lantern Reach retains source from Levy Street’s MIT project. Its required acknowledgment remains exactly **Port of World of ClaudeCraft · Levy Street (MIT)**, linked to [the upstream source](https://github.com/levy-street/world-of-claudecraft), in the credit export and running game. This historical source attribution is separate from the game’s current identity.

Third-party asset catalog keys identify the actual files being loaded. KayKit, Quaternius, ambientCG, and game-icons.net assets keep their source names and license notices; renaming a game does not rename or change the license of an upstream pack. Consult [engine credits](https://github.com/Noisemaker111/jgengine/blob/main/CREDITS.md), the individual packs, and game credit exports for their notices. No new source or asset ownership is claimed by this migration.

All twelve listed games have runnable packages. Deepward uses original procedural industrial geometry, materials, and an authored extraction setting; it requires no downloaded model pack. Its current implementation includes salvage banking, permanent tank and reserve-ammunition refits, and persistent loss/reprint acknowledgment. The earlier identity migration preserved game mechanics while changing identities and authored vocabulary. The content review removes explicit positioning as reproductions of commercial titles and the identifiable borrowed names found in authored content. It does not establish legal clearance or exclusive rights to a title.

Harbor Heat and Scrap Signal retain historical save namespaces and identifiers only in their compatibility loaders. A current save takes precedence; otherwise the loader copies an existing legacy slot into the new namespace and translates renamed content IDs through the whole-world save controller. It leaves the old record intact. Save and reload behavior is game-specific; Deepward and Wayfarer Deck have offline continuation paths. Lantern Reach's authoritative multiplayer persistence belongs to its configured host.
