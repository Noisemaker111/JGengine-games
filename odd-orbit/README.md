# Odd Orbit

A small alien household simulation about making room for different needs and rhythms. Four named household members share six furnishing types, a pantry, credits, debt and reciprocal bonds. The existing orbital habitat and body plans remain the game's canon; interface portraits are original SVG artwork.

Run `bun run dev`, `bun run check-types` and `bun run test` here. Vite resolves published `@jgengine/*` packages. On a clean checkout, provision the catalog's CC0 packs with the installed asset CLI before playing:

```sh
bunx --no-install assets pull quaternius-modular-scifi --dir public
bunx --no-install assets pull quaternius-stylized-nature --dir public
bunx --no-install assets pull kaykit-adventurers --dir public
bunx --no-install assets pull kaykit-furniture --dir public
bunx --no-install assets pull kaykit-space-base --dir public
bunx --no-install assets pull ambientcg-metalplates001 --dir public
```

Quaternius, KayKit and ambientCG supply the existing CC0 models/materials through the engine catalog. Remote pack bytes remain ignored. The floor pack has no downloaded AO map, so the game ships an original white neutral map under `public/materials/imported/odd-orbit` to express no baked occlusion.

Choose New household or Continue. Select a member to inspect needs, stress, schedule and bonds; direct activities through the inspector or let members choose. Build opens the furnishing palette: choose an affordable item, then select vacant ground. Occupied placement is rejected without spending. Sell returns half the purchase price and releases users. Escape pauses. Guide, settings, credits, speed controls and the household ledger are available in the HUD.

Households start at 09:00 with 640 credits and 12 rations. A Yield career shift uses a console during 08–14 for 20 seconds and earns up to 100 credits. A Bloom shift uses a planter during 14–18 for 20 seconds and earns four rations and 48 credits; friends tending together earn a bonus. Furnishing capacity matters. Productive progress locks that member's rhythm for the rest of the day. Three completed shifts unlock the wider 08–18 window. Late assignments lose their remaining shift rather than creating overtime.

The pantry supplies meals. Six rations cost 36 credits, subject to a 40-ration capacity. Nightly upkeep is 80 credits plus each furnishing's running cost. Relief requires fewer than four rations and fewer than 36 credits; it supplies four rations and adds 40 debt once per day. Up to 40 debt is repaid with the next bill. Poor needs and overload stop work. Food, torpor and lower stress restore agency. Shared conversations build reciprocal bonds; interruption can damage them. The bounded event feed and daily ledger show consequences.

Actions and each game second checkpoint to the browser-local key `odd-orbit.household-save.v1`. Saves include the household, clock, entities, furniture poses, stats, economy cursor and next event deadline. Reload opens the paused menu; Continue resumes the saved moment without offline event bursts or duplicate bills. Invalid/newer data stays untouched until explicit New household; unavailable storage is shown honestly. Saving stays on the current browser origin.

Directing the same activity at the same furnishing preserves the ongoing action while renewing player direction. Each meal spends one ration when it begins; repeating that direction also lets an already-paid meal finish after the pantry empties or the household reloads.

Each settlement processes at most seven overdue bills. Remaining due cycles stay
in the saved economy cursor and settle on later simulation steps; repayment stops
when the outstanding debt reaches zero. Bills skipped by an older build cannot
be reconstructed from its already-advanced cursor.

## Design checklist

Read from `src/game/{needs,objects,sim,session}`. Numbers are what the build does now.

- **Core loop.** A 210-second day starts at 09:00 with 640 credits and 12 rations for four generated
  members. Each member has four needs that decay per day — Nourish 118, Rest 82, Bond 74, Play 90,
  scaled by metabolism 0.75–1.35 — and you either direct an activity or let them choose. A meal spends
  one ration; a 20-second shift pays 100 credits (Yield, 08–14) or 4 rations and 48 credits (Bloom,
  14–18). Midnight charges 80 credits plus each furnishing's running cost.
- **Progression — three systems.**
  - [x] Shift mastery. Three completed shifts unlock the wider 08–18 window; before that a late order
    loses its shift rather than creating overtime.
  - [x] Bonds. Pair relationships run -100 to 100 with milestones at 35 (friends), 70 (close) and 95
    (bonded); tending Bloom together pays more for friends, and two stressed members clash instead.
    Friends and bonded pairs prefer each other's company, so an off-hours stroll walks to a friend
    instead of a random spot ("Keeping X company"). A bonded pair will not split for work: ordering one
    of them to a paid station sends the free partner to the neighbouring station, or the order stops
    with the reason (a different rhythm, a depleted partner, or a missing second station) until fixed.
    The household panel shows each being's bond (partner and the book's word) and it moves as friends talk.
  - [x] Furnishing. Six types from 70 to 220 credits, capacity 1–4, running cost 1–4 a day, satisfying
    5–12 points a second — so a full household needs duplicates of the same station.
- **Failure states.** There is no game over. An unpaid bill becomes debt, which the next bill repays at up
  to 40; relief supplies 4 rations and adds 40 debt once per day; an empty pantry stops meals, a need
  below 25 pulls a member off whatever they were doing, and overload stops paid work until food, rest and
  company fix it. The household can drift down, but nothing evicts it.
- **Minute 5 → hour 5.** At 5:00 you are about a day and a half in: the first bill has settled, one shift
  has been worked and flex scheduling is still two shifts away. Hour five is roughly day 17 at 1× speed
  — all three plans of the day have been tried, several bonds are at friends, and the only stated goal
  is still `dayGoal`, which never names anything but the next bill.
- **References it is chasing.**
  - *The Sims 2* — feel: mood legible from one portrait; density: one household, four bodies, no crowd;
    UI: needs bars beside a direct action queue.
  - *RimWorld* — feel: a schedule that explains itself before you read it; density: a small roster where
    each person is a plan; UI: priorities, bills and the day's work on one screen.
  - *This War of Mine* — feel: scarcity with a tone, not a score; density: few rooms visited repeatedly;
    UI: the nightly summary as the consequence readout.
- **Gap to target.** No win or loss condition exists, so the household can only drift. Naming an end
  state — debt-free and bonded, or evicted — is what makes hour five different from hour one.
