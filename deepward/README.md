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

The salvage receiving-room view can become almost black despite working
movement and UI. Room visibility needs further work. Combat, steam damage,
rifle packing and mobile controls remain unverified; the current application
expects desktop landscape input. This slice does not implement the whole
[design](DESIGN.md).

See [credits](CREDITS.md) for original content and dependency provenance.
