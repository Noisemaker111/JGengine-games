# Beacon Bastion

Tower defense on a highland approach: nine authored plots beside one raider path, a keep with twenty
lives, six waves. Runs on published `@jgengine/*` packages; start it with `bun run dev:beacon-bastion`
from the repository root.

## Design checklist

Read from `src/game/{waves,entities,combat,build,world}`. Every number below is what the build does now.

- **Core loop.** 150 starting gold buys an Archer Post (50), a Frost Spire (70) or a Cannon Redoubt
  (90) onto one of nine plots. You press **Send wave** yourself; raiders walk the one authored path and
  leak 1 life each (2 for a Brute) into the 20-life keep. Kills pay 4 / 6 / 15 gold, and releasing a
  wave with raiders still alive pays 2 gold per survivor, capped at 20.
- **Progression — three systems.**
  - [x] Tower tiers 1–3. An upgrade costs 75% of base cost × current level (Archer 38 then 75 gold) and
    adds 50% damage, 0.5 range and 15% fire rate per step; selling returns 70% of everything spent.
  - [x] Purse. Bounties plus the overlap bonus are the only income, so a leak costs gold as well as a
    life. There is no passive trickle.
  - [ ] Between-run growth. Restart clears the field and returns to 150 gold; the same three towers are
    available on wave 1 and wave 6.
- **Failure states.** 20 lives, then "The Keep Has Fallen" and a rebuild from a fresh purse. Waves are
  also the escalation clock: budget per second climbs 1.0 → 2.5, duration 20 → 26 seconds, Brutes go
  from weight 1 to weight 4, and at most 18 raiders are alive. Victory is six waves released with the
  field clear.
- **Minute 5 → hour 5.** At 5:00 roughly waves 1–3 are down, two or three level-1 towers stand and the
  purse sits near 200–300. At hour 5 the same six waves and three towers meet you: no new plot, tower,
  path, mutator or difficulty step, so the second run is the first run again.
- **References it is chasing.**
  - *Kingdom Rush* — feel: the manual wave release and its early-call bonus; density: a trickle you can
    still read raider by raider; UI: tower cards that show level and next upgrade cost at a glance.
  - *Defense Grid: The Awakening* — feel: plot planning before the wave lands; density: several towers
    firing down one long sightline; UI: range and splash shown before you commit, leaks called loudly.
  - *Plants vs. Zombies* — feel: a build bar understood in two seconds; density: one screen, no camera
    homework; UI: affordable and locked states plus short denial text.
- **Gap to target.** The run is complete but one-shot. The missing system is a reason to start again —
  a fourth tower, a second approach path, or a difficulty ladder — not more waves in the same six.

The creep path and plot centres are read from `src/editor.scene.json`, so moving the route is an editor
edit rather than a coordinate table. Run `bun run check-types` and `bun run test` here after changes.
