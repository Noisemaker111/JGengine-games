# Scrap Signal

A first-person looter-shooter across Ferralon: pick Gunk, Nyx or Cipher, clear six levelled zones, roll
guns off what you kill, and finish at the Foundry Heart. Runs on published `@jgengine/*` packages; start
it with `bun run dev:scrap-signal` from the repository root.

## Design checklist

Read from `src/game/{characters,progression,handroll,quests,world}`, `src/loop.ts` and `src/game.config.ts`.
Numbers are what the build does now.

- **Core loop.** Travel between six zones — Rustflat Waste (level 1), Breakwater Shelf (4), Coretown (8),
  Split-Ridge Pass (12), Glasswind Flats (17), Cores Blight (24) — killing camps, opening red and ammo
  chests, and spending cash and cores at Rigg, Sparx, Bolt and the black market. Kills roll guns at the
  zone's level, and eight main quests plus two side quests carry the level curve.
- **Progression — three systems.**
  - [x] Level 1–30. XP needs 90 × level^1.75; each level grants +8 max health and one talent point (29
    by the cap). The base character is 90 health and 60 shield.
  - [x] Talents. Three characters × three branches × nine nodes, ranks 5/5/1, gated at 5 and 10 points
    in a branch. Points are permanent — there is no respec command.
  - [x] Gear. Five rarities multiply damage ×1 / 1.15 / 1.35 / 1.6 / 2 at weights 100 / 45 / 18 / 6 / 1.4,
    and item level scales damage ×1.13 per level. Elites drop at 55–65%, bosses at 100%, and the Foundry
    Heart drops three guaranteed legendaries.
- **Failure states.** Health hitting zero starts a 12-second Emergency Reserve at walking speed; a kill
  during that window power-surges you back with 40% health and half shield, which makes fighting the way
  out. Expiry reconstructs you at the last discovered travel station for 7% of your cash. Going down
  inside the Dead Air relay contract fails the contract, not the save.
- **Minute 5 → hour 5.** At 5:00 you are five bruisers into Rustflat Waste with the starter pistol. Hour
  five is around level 8–12 in Coretown, three to six talent points spent, Captain Rusk down and the
  first legendary in the hotbar.
- **References it is chasing.**
  - *Borderlands 2* — feel: guns with names, makers and attitudes; density: camps of six to ten, not a
    battlefield; UI: rarity beams on the ground and a comparison card on pickup.
  - *Destiny 2* — feel: shooting and ability uptime that carry a fight; density: patrol spaces with
    occasional event spikes; UI: a mission tracker that never covers the reticle.
  - *Diablo III* — feel: power growth you can feel per level; density: elite packs with a readable
    modifier; UI: a skill grid and loot comparison that work with the game still running.
- **Gap to target.** The highest authored content is Cores Blight at level 24, so levels 25–30 have nothing
  to fight, and 29 talent points leave three of the 33 ranks unbought with no respec to try the other
  branch. A sixth zone for the level 24–30 band, or a reason to rebuild a character, is what hour five
  needs.

Loop proof: to-front (run with `--state boss`, the front's last wave with the Foreman on the field; the flow turns the crosshair off and back with `look` and asserts his health dropped)

The whole-world save restores character, talents, quests, inventory and economy; `src/game/saveCompatibility.ts`
handles the legacy identifiers. Run `bun run check-types` and `bun run test` here after changes.
