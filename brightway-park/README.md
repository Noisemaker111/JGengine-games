# Brightway Park

A park-builder tycoon: buy rides and stalls, set the ticket and ride prices, keep guests fed and the
rating climbing, and pay the loan at midnight. Runs on published `@jgengine/*` packages; start it with
`bun run dev:brightway-park` from the repository root. Saves to `brightway-park.save.v1`;
`docs/PLAYTEST.md` holds the last verified pass.

## Design checklist

Read from `src/game/{catalog,objects,sim,session,scenarios,milestones,loan,rides}`. Numbers are what the build does now.

- **Core loop.** $6,000 and a 150-second day starting at 09:00. Guests arrive through the gate while
  it is open, pay the entry fee (default $18), then pick a ride or a stall by need, mood, the wait they
  can see and the price. Each midnight charges upkeep, staff wages, stall restocking and the loan
  instalment.
- **Progression — four systems.**
  - [x] Rides that rate. Every placed ride runs the shared ride sim: its own load, ride and unload cycle,
    its own line whose wait comes from measured throughput, its own wear and breakdown curve. A
    breakdown takes the ride offline with a message and a repair bill; a mechanic bay shortens repairs
    and servicing clears wear before it breaks. The status card flags a ride that is down; the park books show the queue.
  - [x] Money that binds. Entry fee plus a per-ride ticket the park sets; guests weigh the ticket
    against the wait. Staff are a wage line separate from facility upkeep. A $6,000 loan at 3% a day
    over ten days is repaid nightly out of the same shared ledger as upkeep; the balance and interest
    show in the park books (Books, or L). Rating still gates the crowd: 34 visitors at zero stars, plus 0.14 per star.
  - [x] Milestones that open real content. Six authored gates on a park-rating standing track. Each
    names the unlock it grants (flower beds and lamps, the drinks kiosk and fountain, the ferris wheel
    and souvenir shop, the mechanic bay, the drop tower, the grand topiary), and the gate set refuses to
    load if a reward id resolves to nothing, so a dead milestone fails at startup instead of in play.
  - [x] Three scenarios. Opening Weekend ($2,000 at the gate over two days), Star Attraction (420 stars
    by the end of day three) and Full House (80 visitors in one day), each a timed objective on the
    shared mission runtime with its own fail states, reward and fresh-park replay. Free play is the
    sandbox: the blue ribbon needs three rides, rating 220, happiness above 50, litter under 40, a
    profitable day, and three days in debt still closes the park for good.
- **Failure states.** A day ends in the red and the loan instalment still comes out of the ledger; an
  unpaid bill becomes debt, and three days in debt closes the park for good. A breakdown takes its ride
  offline until the repair bill is paid — 90 at the carousel, 140 at the coaster station, 180 at the
  drop tower — so a park that skips servicing loses its queue and its rating with it. A scenario that
  misses its clock fails in its own named state rather than ending free play.
- **Minute 5 → hour 5.** A day is 150 seconds and the gate is open from 09:36 to 22:04, so 5:00 is two
  park days in: the first bill settled, one milestone unlocked, and the first instalment of the $6,000
  loan taken. Hour five is around day 24 at 1× (day 6 at 4×): the ferris-wheel milestone is passed, a
  full-house day is the next reachable goal, and the loan is either repaid or the park is gone.
- **References it is chasing.**
  - *RollerCoaster Tycoon 2* — feel: guests as individuals with opinions you can click; density: a park
    full of walkers at every zoom; UI: build palette beside a guest window, price control in the stall.
  - *Parkitect* — feel: upkeep and restocking that actually bite; density: a compact grid where every
    square is accounted for; UI: rating and finance panels that explain the number rather than show it.
  - *Planet Coaster* — feel: milestone celebration worth pausing for; density: crowd scale at the gate;
    UI: dashboard-first management with the park still visible behind it.
- **Gap to target.** Past the scenarios there is no campaign ladder and no second park, and the
  catalogue ends at 16 objects. A long queue's mood cost is the park's main soft failure today; a paid
  queue-skip or a second gate would take the pressure off.

Loop proof: to-open-park

Balance numbers live in `src/game/catalog.ts` and `src/game/objects/catalog.ts`; the simulation is in
`src/game/sim/`, the ride adapter in `src/game/rides.ts`, the loan book in `src/game/loan.ts`, and the
scenario and milestone content in `src/game/scenarios.ts` and `src/game/milestones.ts`. Run
`bun run check-types` and `bun run test` here after changes.
