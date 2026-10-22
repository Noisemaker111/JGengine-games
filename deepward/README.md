# Deepward

A first-person extraction slice built on published JGengine packages. Leave
Marrow through the Garage, search Bellwether for salvage, pack the haul and return
to the entrance before oxygen runs out. Banked salvage survives the next life.

Run `bun run dev:deepward` from the repository root, or `bun run dev` here.
The original industrial geometry needs no downloaded asset packs. The terrain,
room volumes and markers in `src/editor.scene.json` were exported from the real
published editor host; gameplay derives walkability and navigation from them.

Desktop controls: click the world to capture the pointer; use WASD to walk,
Shift to sprint, E to interact, Tab to open the carried cache, Escape to pause,
left mouse to fire and R to reload. Select a carried item and a grid cell to
repack it. Close the cache to return to movement.

The verified native slice includes Garage departure, copper-spool search,
grid repacking, return extraction, a full reload retaining the banked spool,
and a second dive interrupted by reload. That interruption loses the carried
haul and advances the life once, retaining the banked stash; another reload
does not repeat the loss. The save is local to this browser under
`deepward.marrow.v1`.

At Marrow's stash, spend banked salvage on two permanent refits. A sealed tank
costs one copper spool and one set of suit seals and starts each departure with 145
seconds of air. A reserve rack costs one copper spool and one pack of power cells and
starts each departure with 30 reserve rounds. Both need the same copper: buying
one leaves the other short until you bring another spool home. Installed refits
survive death; purchases consume exact saved items before confirmation.

Recovered service rifles can be prepared at the stash bench for the next shift.
Travel light to keep banked rifles safe and all twelve cache squares free, or
bring one for 30 damage per shot instead of 20. It takes three cache squares.
Preparation does not spend the rifle; verified departure removes its exact
instance from the stash. Return banks it again, while death or dive reload loses
it. Existing saves need no schema change. Save and command tests cover failed
departure writes, returned rifles and interrupted departures; native play of
this new preparation choice remains unverified.

A lost Life now stops at Halloway's reprint screen. The loss is already saved;
accept the next Life before moving or departing again. Reloading at this screen
keeps the acknowledgement pending. The pause menu offers an explicit reload /
abandon action. Save records use schema v2 under the original key; legacy v1
bytes migrate on the next verified transition. Damaged and future saves remain
untouched. Cost, loadout, failure and reload boundaries have deterministic tests
against published engine commands. Native after-play confirmed Garage departure, explicit pause-menu abandonment,
the reprint screen, acknowledgement and another reload retaining Life 2 with
one loss. The full refit purchase and upgraded departure were tested through
published engine commands but remain unverified in native browser play.
Validation status is tracked in
[slice #35](https://github.com/Noisemaker111/JGengine-games/issues/35).

The station presentation uses original editor-authored rail canopies, pressure
vessels, print press ribs, receiving gantry and service panels. Only the current
station architecture renders, with static surfaces and equipment batched. Original detailed GLB machinery is placed from the same
editor document and includes embedded authored material maps; see the per-model
manifest and reproducible tooling in `scripts/`. The original skinned Fitter
uses the SDK animation driver for idle/walk and the accepted strike countdown
for windup. Grip-origin service weapons retain the simulation-owned pose and
muzzle anchors. Original tileable wall/floor maps accompany the imported art.
Generic static instancing and PBR-map handling in the current renderer are a
temporary integration awaiting the shared published SDK seam.
Native art captures establish the actual home portal/trolley/surface detail,
bench close control, empty cache sheet and sidearm. Pump/press closeups and
Fitter windup remain unverified natively; software rendering limited the
accepted movement to the return spine. A pause-button/pointer-lock race blocked
the latest reload step; browser lifecycle ownership is being moved upstream.
The compact shift HUD leaves the central rail route visible. Combat, steam damage,
rifle packing and mobile controls remain unverified; the current application
expects desktop landscape input. At 400 × 225, the HUD obscures much of the
world; those small captures do not establish overall scene or HUD quality. This slice does not implement the whole
[design](DESIGN.md).

See [credits](CREDITS.md) for original content and dependency provenance.

## Design checklist

Read from `src/game/{state,progression,save,stationModels}`, `DESIGN.md` and the authored scene. The slice,
not the full design, is what the numbers describe.

- **Core loop.** At Marrow, depart through the Garage, walk Bellwether with 110 seconds of air, channel
  loot from a source into a 4 × 3 cache grid, then retrace the route to the entrance before air runs out.
  Banked salvage stays home; the next dive starts from the same entrance.
- **Progression — three systems.**
  - [x] Refits. Two permanent buys at the stash: a sealed tank (145 seconds instead of 110) and a reserve
    rack (30 rounds instead of 18). Both cost one copper spool plus seals or cells, so one spool buys one
    of them, and that shortage is the intended decision.
  - [x] Salvage. Five item kinds with real footprints — ink 2 × 2, power cells 1 × 2, service rifle 3 × 1,
    suit seals 2 × 1, wire 1 × 1 — so what fits in twelve squares is the choice, not a weight number.
  - [x] Lives. Death advances the Life once, keeps the stash, and stops at Halloway's reprint screen.
    A service rifle can be prepared for one departure (30 damage against the 20-damage sidearm), leaves
    the stash on departure, and is gone if that dive ends in death.
- **Failure states.** Air at zero suffocates at 12 health a second; steam costs 18 a second; the Fitter
  print has 80 health and a windup. Death banks nothing carried and requires acknowledging the reprint
  before departing again. A dive interrupted by reload loses its carried haul exactly once and keeps the
  banked stash.
- **Minute 5 → hour 5.** At 5:00 you are on the first departure with the sidearm and two or three items,
  still deciding whether the rifle is worth three cache squares. Hour five is roughly two or three Lives
  in, both refits installed, and the light-or-armed departure actually costing something.
- **References it is chasing.**
  - *Escape from Tarkov* — feel: the way out is the whole tension; density: loot scattered through rooms
    rather than poured out of one chest; UI: the timer and the extraction point, plus grid packing.
  - *Subnautica* — feel: oxygen as the only clock, so depth is a bet; density: one route out that you
    re-cross; UI: air and depth readable without opening a map.
  - *Prey (2017)* — feel: a station that reads as somewhere people worked; density: rooms with a job, not
    corridors with props; UI: a hand wheel instead of a spellbook.
- **Gap to target.** Five item kinds are the entire loot table. [DESIGN.md](DESIGN.md) describes six hand
  families, item levels, per-item trees and a two-axis rarity ladder; until some of that exists, the
  second delve has nothing new to hold.
