# Drift Foundry

A physics racer down one industrial corridor: a welded buggy, twelve pieces of salvage and a compactor
that never stops. Runs on published `@jgengine/*` packages; start it with `bun run dev:drift-foundry`
from the repository root.

## Design checklist

Read from `src/game/{run,parts,route,compactor,vehicle}`. Numbers are what the build runs now.

- **Core loop.** Drive from z=4 to the exit at z=470 m through three yards (0–150 canyons, 150–300
  flats, 300–470 gantry). Debris sits within 1.5 m of the centreline with a 3.2 m collection radius, so
  driving the corridor collects it; each pickup bolts a part into one of four slots. The compactor starts
  behind you at 5.6 m/s and surges to 10.5 m/s at 26–38 s and 11.5 m/s at 62–76 s.
- **Progression — three systems.**
  - [x] Build. 12 parts across engine / front / wheels / frame, one per slot; the plow and springs bolt
    on as you drive over them, while an engine or frame replacement needs a held swap — so engine and
    frame are decisions and the route parts are not. Trade-offs are real: Truck Engine adds 9.5 top speed
    but −0.7 turn rate, the EV conversion adds 0.5 turn rate but tops out at 3, and the plow blade trades
    1 top speed and 0.2 turn rate for clearing walls.
  - [x] Route. Eight full-width barricades at z = 110, 150, 210, 250, 300, 350, 400, 440 alternate
    plow and jump. A jump needs 0.65 m of air, so coil springs are mandatory, not decorative.
  - [x] Records. Attempts, escapes, best time and farthest distance save to `drift-foundry.records.v1`;
    pausing while stopped and grounded parks the build and clock at `drift-foundry.parked-run.v1`.
- **Failure states.** Contact within 1.5 m of the compactor is a crush. Armor plating absorbs one hit and
  throws you 9 m forward, once. A barricade you cannot open is a wall, not a time loss, and a long
  stop is how the crusher catches you. There is no mid-run respawn; results show time, parts on exit,
  near misses, closest gap and armor saves.
- **Minute 5 → hour 5.** Five minutes in, several attempts have already ended at the 110 m plow wall or
  the 150 m tire ramp, with the plow and springs bolted and one surge survived. By hour five the corridor,
  the twelve drops and both surges are memorised; what is left to chase is the clock — best escape time,
  fewest near misses, closest gap.
- **References it is chasing.**
  - *Trackmania* — feel: restart is instant and the clock is the only opponent; density: one clean line
    with no traffic; UI: a live split against your best and a record board at the end.
  - *Trials HD* — feel: a gauntlet where the machine, not the character, is what upgrades; density: an
    obstacle every few seconds; UI: barrier silhouettes read before you reach them.
  - *Mad Max (2015)* — feel: a car getting visibly uglier and faster; density: three distinct yards in
    one run; UI: pit-radio lines that name what you just bolted on.
- **Gap to target.** One authored route. A second corridor, per-zone splits, or a ghost of your best run
  would give the records board something to chase after the first escape.

Part stats live in `src/game/parts/catalog.ts`, zone palettes in `src/game/zones/catalog.ts`, and
the run's scattered prop field and barricade tiling in `src/game/world/setup.ts`. The corridor's
authored landmarks and shoulder rhythm live in `src/editor.scene.json` (authored by
`scripts/author-corridor.ts`): water-tower crowns, one landmark cluster per yard, crane-leg pylons at
each yard seam, and alternating junk sentries at x ±25.5, all clear of the fenced driving line at
x ±18.5. Run `bun run check-types` and `bun run test`
here after changes.
