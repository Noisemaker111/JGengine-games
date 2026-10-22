# Ember Command

A highland RTS skirmish: the Vanguard holds a keep against Marauder waves and wins by razing their
warcamp. Runs on published `@jgengine/*` packages; start it with `bun run dev:ember-command` from the
repository root.

## Design checklist

Read from `src/game/{catalog,tuning,upgrades,hero,systems,ai}`. Numbers are what the build does now.

- **Core loop.** 250 gold, 120 lumber and 30 supply open the match. Peasants walk to a gold seam or
  logging camp, work 2.2 seconds, and haul 12 gold or 8 lumber back to the keep. That pays for
  Peasants (55 gold, 8 s), Footmen (80 gold + 10 lumber, 14 s, barracks) and Riflemen (70 + 20, 16 s),
  plus Barracks (140 + 60, 20 s), Farms (60 + 30, 12 s, +8 supply) and Guard Towers (90 + 40, 16 s).
- **Progression — three systems.**
  - [x] Supply. 30 from the hall plus 8 per farm, spent 1–5 per unit, reserved when training is queued
    rather than when the recruit lands.
  - [x] Research. Iron Weapons (+3 damage per rank) and Iron Armor (−2 damage taken per rank), three
    ranks each, 18 + 8 × rank seconds, two jobs at once, barracks required.
  - [x] Hero. Bram 1–5 earns 35% of a victim's max health as XP; each level adds 70 health, 4 damage and
    20 max mana. Thunder Clap costs 40 mana, hits a 7 m radius for 26 + 8 per level, 9 s cooldown.
- **Failure states.** Player keep at 1600 health, warcamp at 1300; either reaching zero ends the match,
  and there is no save (`save: "none"`). The Marauders wait 30 seconds, then muster every 42 seconds,
  adding grunts up to 6 and reavers up to 3 per wave, and the clock freezes while 22 are already fielded
  — bounded pressure rather than a swarm. Razing the warcamp stops reinforcements for good.
- **Minute 5 → hour 5.** At 5:00 the clock has called six or seven waves (first at 0:30, then every
  42 s, held whenever 22 Marauders are already fielded), a barracks and a farm are affordable, and Bram
  is level 1–2. An hour later nothing new answers: one map, one enemy composition, no campaign state
  between matches.
- **References it is chasing.**
  - *Warcraft III* — feel: one hero who matters with four units behind him; density: 20–30 bodies a
    side, not 200; UI: a command card holding the selected unit's verbs and costs.
  - *StarCraft* — feel: a supply-and-gather rhythm you can hear; density: a bounded field, matched by the
    22-unit Marauder cap; UI: resource strip, supply count and a wave clock you can read mid-fight.
  - *Age of Empires II* — feel: hauling to a drop-off building; density: a base that fits one screen;
    UI: queue progress bars and unit portraits for what is being trained.
- **Gap to target.** The skirmish is complete for one match and stops there. A second map, an enemy
  composition past six grunts and three reavers, or between-match progression is what hour five needs.

Placement lives in `src/editor.scene.json`; the roster, costs and wave cadence live in the files above.
Run `bun run check-types` and `bun run test` here after changes.
