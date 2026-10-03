# Harbor Heat

A coastal city adventure in Mainsail: courier parcels, street crews, four race circuits, ground vehicles and aircraft. It consumes published `@jgengine/*` packages.

Run `bun run dev`, `bun run check-types` and `bun run test` from this directory. `bun run vite build` produces the standalone build. Provision the seven licensed asset sources declared in `src/game/assets.ts` with the published assets CLI before launching a fresh checkout; the original models are bundled from `src/art/`.

The teal dispatch booth is beside the starting boardwalk. Press **E / Use** or click **Take standard parcel** to start a free timed delivery on foot or in a vehicle. Follow the numbered parcel tower on the minimap, stop within the handoff radius, then press **E / Use**. Boardwalk breakfast, Plaza night shift and Sunset spare parts rotate after successful runs. Standard delivery pays cash, a remaining-time bonus and 15 cred; missing its deadline costs no cash.

**Fragile express** needs a ground vehicle and a $100 bond. Its shorter deadlines pay up to 1.8 times the base cash and 30 cred. Vehicle damage reduces cargo condition and pay; destroyed cargo, missed deadlines, clinic recovery and arrest forfeit the bond. Deliver successfully or return intact cargo at dispatch to recover the bond. Standard deliveries stay free after failure. Sunset Motors compares each vehicle's role, brakes, grip, price and cred requirement.

Four authored circuits have different rival cars and paces. Enter near a start line in a ground vehicle; leaving or losing the entered car forfeits the race. Police stand down after recovery, while a commandeered cruiser becomes your car.

Use **WASD** to move or drive, **Shift** to sprint, **E** to interact and **F** to exit a vehicle. **P** or the pause button stops the world and delivery clock. Settings retain their own pause reason; closing settings opened from pause returns to the pause menu. The pause menu can save progress. Reload returns to the title; Continue restores campaign progress and an active delivery with its saved remaining time. Existing legacy save identifiers remain supported.

The dispatch booth, three parcel towers, coconut palm and title poster are original repository art. The readable generator is `scripts/author-harbor.mjs`; run it with Node to rebuild the GLBs. See [art credits](src/art/README.md) and the repository's [content provenance](../CONTENT-PROVENANCE.md) for source attribution. Existing KayKit, Quaternius and ambientCG credits and licenses remain in force.
