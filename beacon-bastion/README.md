# Beacon Bastion

Tower defense on a highland approach: nine authored plots beside one raider path, a keep with twenty
lives, twelve waves — six authored, six composed. Runs on published `@jgengine/*` packages; start it
with `bun run dev:beacon-bastion` from the repository root.

## Design checklist

Read from `src/game/{waves,entities,combat,build,world}`. Every number below is what the build does now.

- **Core loop.** 150 starting gold buys an Archer Post (50), a Frost Spire (70) or a Cannon Redoubt
  (90, which takes 4 s to rise) onto one of nine plots. The keep, its plots, towers, purse and walls
  are one engine world spec (`src/game/keep.ts`), shared by every player in co-op. You press **Send wave** yourself; raiders walk the one authored path and
  leak 1 life each (2 for a Brute) into the 20-life keep. A kill pays the raider's weight times the wave
  curve (Scout 4 to the Warlord's 140 at wave 1); releasing a wave with raiders still alive pays 2 gold
  per survivor, capped at 20.
- **Progression — four systems.**
  - [x] Tower tiers 1–3. An upgrade costs 75% of base cost × current level (Archer 38 then 76 gold) and
    adds 50% damage, 0.5 range and 15% fire rate per step; selling returns 70% of the build price per
    level reached (Archer 35 / 70 / 105).
  - [x] Purse. Bounties plus the overlap bonus are the only income, so a leak costs gold as well as a
    life. There is no passive trickle.
  - [x] Bounty ladder. Kill pay is the raider's weight × `1 + 0.25 × (wave − 1)`, capped at ×4, so the
    same Scout pays 4 on wave 1 and 11 on wave 8. The HUD shows the live multiplier and the result card
    prints both ends.
  - [x] Between-run growth. A finished defense hands its remaining purse to the engine run loop, which
    banks half of it (the keep's vault caps the bank at 200) and remembers the relic the next defense
    opens with; the result card presents three relics through the engine's seeded draft - opening gold,
    keep lives or a kill-pay multiplier - and the pick becomes the next run's change. The keep adds the
    waves it reached to its standing, and the bank is its own save section, so a new run clears the
    field but not what the last one left.
- **Failure states.** 20 lives, then "The Keep Has Fallen" and a rebuild from the banked purse and the
  chosen relic. Waves are also the escalation clock: budget per second climbs 1.0 → 2.5, duration
  20 → 30 seconds, Brutes go from weight 1 to weight 4, and at most 18 raiders are alive. Victory is
  twelve waves released with the field clear.
- **The composed act.** Waves 1–6 are authored; waves 7–12 come from `waves/composer.ts`, a pure
  function of `DIRECTOR_SEED` and the wave number. It draws a squad pattern, names its elites from the
  roster (Captain Ironjaw, Reaver Sable, Breaker Hollow), scales counts by the wave's rank, and puts a
  boss on every fourth wave — the Warlord on 8, the Warden back on 12. The HUD previews the next wave
  by name, boss included, before you release it, because the composer is deterministic.
- **Minute 5 → hour 5.** At 5:00 roughly waves 1–3 are down, two or three level-1 towers stand and the
  purse sits near 200–300. At hour 5 the composed act, the bounty ladder and the banked relic mean the
  second run opens differently from the first, and the tenth wave is not the sixth wave again.
- **References it is chasing.**
  - *Kingdom Rush* — feel: the manual wave release and its early-call bonus; density: a trickle you can
    still read raider by raider; UI: tower cards that show level and next upgrade cost at a glance.
  - *Defense Grid: The Awakening* — feel: plot planning before the wave lands; density: several towers
    firing down one long sightline; UI: range and splash shown before you commit, leaks called loudly.
  - *Plants vs. Zombies* — feel: a build bar understood in two seconds; density: one screen, no camera
    homework; UI: affordable and locked states plus short denial text.
- **Gap to target.** The run has a second act and a reason to start again. Still missing: a second
  approach path, and a relic that changes how a tower works rather than only the numbers.

Loop proof: to-first-defense

The creep path and plot centres are read from `src/editor.scene.json`, so moving the route is an editor
edit rather than a coordinate table. Run `bun run check-types` and `bun run test` here after changes.
