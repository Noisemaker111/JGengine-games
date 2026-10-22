# Brightway Park

A park-builder tycoon: buy rides and stalls, set the ticket price, keep guests fed and the rating
climbing. Runs on published `@jgengine/*` packages; start it with `bun run dev:brightway-park` from the
repository root. Saves to `brightway-park.save.v1`; `docs/PLAYTEST.md` holds the last verified pass.

## Design checklist

Read from `src/game/{catalog,objects,sim,session}`. Numbers are what the build does now.

- **Core loop.** $6,000 and a 150-second day starting at 09:00. Guests arrive through the gate while
  it is open, pay the ticket price (default $18), then choose among rides and stalls by need pressure
  and proximity. Rides and stalls add appeal; scenery and paths add a little more. Each midnight charges
  upkeep plus stall restocking.
- **Progression — three systems.**
  - [x] Rating. Target = appeal × 3.4 + variety × 9 + (happiness − 40) × 1.6 + guests × 0.28 − litter ×
    1.4, eased toward rather than snapped. Milestones at 60 / 120 / 220 / 360 / 540 / 760 unlock
    flowers and lamps, the fountain and drinks, the ferris wheel and souvenirs, the janitor badge, the
    drop tower, then the gardens.
  - [x] Purse. Upkeep runs $0–95 per object per day plus restock, and the ticket price fights demand
    from $6 at 2.6% per dollar. The guest cap is 60 + 0.6 × rating, so a park that stalls also stops
    filling.
  - [x] Build depth. 15 buildables in six categories; each coaster track piece costs $130 and adds 0.7
    thrill to the station it sits beside, so a coaster is the one thing you keep buying into.
- **Failure states.** Three consecutive days with cash below zero closes the park for good. Guests leave
  below 18 happiness or after six stops, so a badly served park empties instead of crashing. The ribbon
  needs three rides, rating 220, happiness ≥ 50, litter ≤ 40, day 2 or later and yesterday's revenue
  covering yesterday's upkeep; after it, free play continues.
- **Minute 5 → hour 5.** At 5:00 one carousel, one burger stall and a strip of path have opened the
  gates: rating under 60, cash a few thousand. Hour five is roughly day 24 at 1× speed — all six
  milestones reachable, the ribbon achievable, and past it only the sandbox.
- **References it is chasing.**
  - *RollerCoaster Tycoon 2* — feel: guests as individuals with opinions you can click; density: a park
    full of walkers at every zoom; UI: build palette beside a guest window, price control in the stall.
  - *Parkitect* — feel: upkeep and restocking that actually bite; density: a compact grid where every
    square is accounted for; UI: rating and finance panels that explain the number rather than show it.
  - *Planet Coaster* — feel: milestone celebration worth pausing for; density: crowd scale at the gate;
    UI: dashboard-first management with the park still visible behind it.
- **Gap to target.** Past the ribbon there is no second scenario and no harder price or upkeep curve, and
  the catalogue ends at 15 objects. Hour five needs either a scenario ladder or a deeper build list.

Balance numbers live in `src/game/catalog.ts` and `src/game/objects/catalog.ts`; the simulation is in
`src/game/sim/`. Run `bun run check-types` and `bun run test` here after changes.
