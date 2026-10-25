# Drift Foundry

A physics racer down one industrial corridor: a welded buggy, twelve pieces of salvage and a compactor
that never stops. Runs on published `@jgengine/*` packages; start it with `bun run dev:drift-foundry`
from the repository root.

The front end is the shared game menu over the live yard: **Continue run** opens the parked buggy
with the build, clock and salvage it had, **New run** starts the next shift on the event picked in
the **Yard calendar**, **Pit garage** buys a ladder rung, and records, settings and credits live in
the same pane. Pause parks the stopped buggy
and captures the frame the card shows; returning to the pit keeps it until the next run replaces it.

## Design checklist

Read from `src/game/{run,parts,route,compactor,vehicle}`. Numbers are what the build runs now.

- **Core loop.** Drive from z=4 to the exit at z=470 m through three yards (0–150 canyons, 150–300
  flats, 300–470 gantry), racing three yard karts. Debris sits within 1.5 m of the centreline with a
  3.2 m collection radius, so driving the corridor collects it; each pickup bolts a part into one of
  four slots. The compactor starts behind you at 5.6 m/s and surges to 10.5 m/s at 26–38 s and
  11.5 m/s at 62–76 s.
- **Progression — four systems.**
  - [x] Build. 12 parts across engine / front / wheels / frame, one per slot; the plow and springs bolt
    on as you drive over them, while an engine or frame replacement needs a held swap — so engine and
    frame are decisions and the route parts are not. Trade-offs are real: Truck Engine adds 9.5 top speed
    but −0.7 turn rate, the EV conversion adds 0.5 turn rate but tops out at 3, and the plow blade trades
    1 top speed and 0.2 turn rate for clearing walls.
  - [x] Route. Eight full-width barricades at z = 110, 150, 210, 250, 300, 350, 400, 440 alternate
    plow and jump. A jump needs 0.65 m of air, so coil springs are mandatory, not decorative.
  - [x] Records. Attempts, escapes, best time and farthest distance save to `drift-foundry.records.v1`;
    pausing while stopped and grounded parks the build and clock at `drift-foundry.parked-run.v1`.
  - [x] Run. Every run carries salvage - 25 cr per part swept plus 100 cr at the gate - and an escape
    banks it scaled by the line: `×0.5` to `×1.8`, from barriers cleared (+0.05 each), finish place
    (+0.30/+0.15/+0.05), beating par (+0.20 under 36 s) and minus 0.10 per folded-nose stage and per
    armor save. A wreck loses everything the run carried and keeps the bank. The haul, the shift it
    draws and the banked/lost totals save to `drift-foundry.run.v1`, so a career survives a reload.
  - [x] Shifts. The first run is honest; every run after it draws one change from
    `src/game/run/shifts.ts` by seed (`drift-foundry-run:run:N`, no repeat, night crew only after two
    runs): HOBBS's line tightens 45% and his pace rises 4%, TALLY loses his tow, the crusher starts
    12 m closer, or the night crew brings both surges 6 s earlier and 0.6 m/s harder. Same seed and
    same run count, same sequence.
  - [x] Calendar. Eight events in `src/game/events/catalog.ts`, each the corridor under other rules,
    graded bronze/silver/gold on one number by the engine's medal board
    (`@jgengine/core/progression/medalBoard`). Medals are worth 1/2/3 points; tiers open at
    0 / 4 / 10 / 16 points of 24. Row Six: Salvage Run (finish place), Time Sheet (solo, clock),
    Scrap Sweep (drops swept). Night Crew: Night Shift (crusher 15 m closer, +3.4 m/s between surges,
    surges 8 s early and +1.5 m/s), Grudge: HOBBS (him alone at 106% pace on a tight line; margin at
    the gate). Bare Metal: Bare Metal (garage shut, route salvage only), Crusher Rush (crusher from
    -15 m at 11.2 m/s, solo). Yard Legend: Foundry Gauntlet (garage shut, night crusher, field at
    107%). Each medal pays once, the first time it is earned: 60/120/220 cr in Row Six up to
    200/400/700 cr in the Gauntlet. A scripted straight line takes bronze on the Time Sheet (40.1 s);
    gold (31.5 s) needs the drops swept and the truck engine swapped in (28.7 s). A 4 s stall is
    survivable on the Salvage Run and fatal on Night Shift and Crusher Rush.
  - [x] Ghost. Timed events record the kart ten times a second on the engine recording buffer; the
    fastest escape on each is saved to `drift-foundry.ghost.v1` and replays as a see-through teal
    kart on the next run, with the tower reading metres ahead of or behind it.
  - [x] Field. Three rivals start ahead of you in the same corridor: TALLY (easy, EV build, wanders
    gate to gate), MOSS (standard, Salvage V6, weaves for the free side) and HOBBS (expert, Truck
    Engine, one clean outside line). Each drives with the shared `ai/driver` brain on its own line from
    `src/game/race/opponents.ts`; position, lap, lap clock and the finish come from `game/race`, so the
    HUD shows `P2/4 · LAP 1/1` live. A rival more than 30 m ahead eases off and one behind closes up
    (per-car band: TALLY takes all of it, HOBBS barely any), and bumper contact moves both karts. A
    clean upgrade run wins in ~30 s; a first attempt usually finishes third.
- **Failure states.** Contact within 1.5 m of the compactor is a crush. Armor plating absorbs one hit and
  throws you 9 m forward, once. A barricade you cannot open is a wall, not a time loss, and a long
  stop is how the crusher catches you. There is no mid-run respawn; results show finish position,
  time, parts on exit, salvage carried, the line that priced it, banked vs lost, and the next shift.
- **Minute 5 to hour 5.** Five minutes in, several attempts have already ended at the 110 m plow wall or
  the 150 m tire ramp, with the plow and springs bolted and one surge survived - and HOBBS has already
  crossed the gate ahead of you. A clean escape is the only income worth planning around: every barrier,
  a high finish and a fast clock push the line toward x1.8, and that pays for the next ladder rung. By
  hour five the corridor, the twelve drops and both surges are memorised; what is left to chase is the
  24 calendar medal points, your own ghost on each timed event, the place, and the shift each new run opens with - HOBBS on a tighter line, TALLY honest, the
  crusher already rolling, or the night crew running the surges early.
- **References it is chasing.**
  - *Trackmania* — feel: restart is instant and the clock is the only opponent; density: one clean line
    with no traffic; UI: a live split against your best and a record board at the end.
  - *Trials HD* — feel: a gauntlet where the machine, not the character, is what upgrades; density: an
    obstacle every few seconds; UI: barrier silhouettes read before you reach them.
  - *Mad Max (2015)* — feel: a car getting visibly uglier and faster; density: three distinct yards in
    one run; UI: pit-radio lines that name what you just bolted on.
- **Gap to target.** One authored route and one lap: all eight events race the same corridor, so
  the calendar varies rules, not road. A second corridor or a lap circuit that returns through a
  different yard is the next content step. Ghosts are local only; there is no shared leaderboard.

Loop proof: to-corridor

Part stats live in `src/game/parts/catalog.ts`, zone palettes in `src/game/zones/catalog.ts`, and
the run's scattered prop field and barricade tiling in `src/game/world/setup.ts`. The corridor's
authored landmarks and shoulder rhythm live in `src/editor.scene.json` (authored by
`scripts/author-corridor.ts`): water-tower crowns, one landmark cluster per yard, crane-leg pylons at
each yard seam, and alternating junk sentries at x ±25.5, all clear of the fenced driving line at
x ±18.5. Run `bun run check-types` and `bun run test`
here after changes.
