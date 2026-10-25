# Harbor Heat

A coastal city adventure in Mainsail: courier parcels, street crews, four race circuits, ground vehicles and aircraft. It consumes published `@jgengine/*` packages.

Run `bun run dev`, `bun run check-types` and `bun run test` from this directory. `bun run vite build` produces the standalone build. Provision the seven licensed asset sources declared in `src/game/assets.ts` with the published assets CLI before launching a fresh checkout; the original models are bundled from `src/art/`.

The teal dispatch booth is beside the starting boardwalk. Press **E / Use** or tap the prompt to take a standard parcel and start a timed delivery. The goal card shows the distance, an arrow toward the drop and the clock, which turns coral near the end; the minimap marks the same parcel tower. Stop within the handoff radius, then press **E / Use**. Boardwalk breakfast, Plaza night shift and Sunset spare parts rotate after successful runs. Delivery pays cash, a remaining-time bonus and 15 cred. Missing a deadline returns the parcel without a cash penalty; clinic and police recovery end an active delivery.

Use **WASD** to move or drive, **Shift** to sprint, **E** to interact and **F** to exit a vehicle. **P** or the pause button stops the world and delivery clock. Settings retain their own pause reason; closing settings opened from pause returns to the pause menu. The pause menu can save progress. The receipt offers Try again, Free roam or Title, and Title saves first. Reload returns to the title; Continue restores campaign progress and an active delivery with its saved remaining time. Existing legacy save identifiers remain supported.

Garage purchases use the published SDK's entity allocator: each paid vehicle has a distinct identity, even when buying the same model at one game time or after reload. Existing saved vehicle identities remain intact.

The dispatch booth, three parcel towers, coconut palm and title poster are original repository art. The readable generator is `scripts/author-harbor.mjs`; run it with Node to rebuild the GLBs. See [art credits](src/art/README.md) and the repository's [content provenance](../CONTENT-PROVENANCE.md) for source attribution. Existing KayKit, Quaternius and ambientCG credits and licenses remain in force.

## Design checklist

Read from `src/game/{quests,jobs,progression,entities,handroll}`. Numbers are what the build does now.

- **Core loop.** On foot or in a vehicle, take work in Mainsail: the eight-mission chain from "Welcome to the Isle" to Sal, courier runs from the teal dispatch booth, bounties after Dock Sweep, four race circuits and the hidden stashes. Cash pays for weapons, gear and the garage; cred levels gate the good stock.
- **Progression — three systems.**
  - [x] Cred 1–10 at 150 + 130 × level, gating the Carmine SMG (2), Boardwalk shotgun (3) and Cicada GT (4); missions pay 100–800, a bounty 140, a race 150, a stash 25.
  - [x] Garage. Pico 800 → Bandolero 2,400 → Vagabond 3,800 → Cicada GT 6,500 → Islander bus 9,000, then aircraft from the Maverick 44 at 12,000 to the Harrier V at 110,000. Each car's mass, grip and centre of mass are its own numbers, so the ladder changes handling and not just top speed.
  - [x] Contracts. Three courier routes (250 at 65 s, 400 at 95 s, 500 at 110 s, then rotating), a rush variant at 35% of the deadline for a $60 bond, bounties at 350 + 175 per completion up to eight, and 6,000 for bagging every stash.
- **Failure states.** Death costs a clinic fee of 8% of cash (minimum $150); arrest costs $150 a star after 1.2 s of a cop inside 2.6 m. A missed courier deadline returns the parcel with no cash penalty, and losing a race is second place, not a wipe. Wanted heat runs to five stars, with cruisers from three.
- **Screen.** The engine's ink kit in Harbor colours: one goal card, one action prompt, vitals, minimap and the filled hotbar slots. Cargo, wanted stars and the speedometer appear only when they apply.
- **Minute 5 → hour 5.** At 5:00 the first two missions are done with a pistol, about $1,000 and no car. Hour five is cred 3–5 in a bought ground car, the courier loop and bounties as repeatable income, one race circuit learned; aircraft start at $12,000, so they are later than this.
- **References it is chasing.**
  - *GTA: Vice City* — feel: a coast learned by landmark rather than map pin; density: traffic and pedestrians on every block; UI: minimap with mission blips and radio-style notices.
  - *Crazy Taxi* — feel: timer pressure with a clean run always available; density: constant pickups, no downtime; UI: one arrow and one clock, legible while driving.
  - *Need for Speed: Most Wanted* — feel: pursuit that escalates by star; density: street races sharing the same roads; UI: speedometer plus wanted stars readable at a glance.
- **Gap to target.** The chain is eight missions and four circuits long; past them the city repeats courier and bounty work with no new tier. Hour five wants either a second act of missions or a reason the repeatable jobs change.

Loop proof: to-chase (run with `--state chase`, the game's own `chase.stage`; the flow drives out of the search area and asserts it grew, so the heat ran and the keypress was not the whole event)
