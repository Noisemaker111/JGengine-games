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

The salvage receiving-room view can become almost black despite working
movement and UI. Room visibility needs further work. Combat, steam damage,
rifle packing and mobile controls remain unverified; the current application
expects desktop landscape input. At 400 × 225, the HUD obscures much of the
world; those small captures do not establish overall scene or HUD quality. This slice does not implement the whole
[design](DESIGN.md).

See [credits](CREDITS.md) for original content and dependency provenance.
