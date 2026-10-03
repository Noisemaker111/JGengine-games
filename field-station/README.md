# Field Station

A prairie environment studio with an unarmed field researcher. The researcher
wears muted leather workwear and boots; the environment remains authored in
`src/editor.scene.json`.

Run `bun run dev:field-station` from the repository root after `bun install --frozen-lockfile`.
The single researcher model ships with the game; a clean checkout needs no asset pull.

Begin a survey, observe the meadow and pond with E, then return to the station
desk to file a report. The scorch sample is optional and raises report quality;
rescue loses unfiled notes. Filed reports survive reload when device storage is
available. WASD moves, Shift runs, Space jumps and P pauses. Graphics quality
and credits are available from the menu.

## Model provenance

`public/models/explorer.glb` adapts the unhooded Rogue from
[KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers), by Kay Lousberg.
The source's [CC0 license](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/main/LICENSE.txt)
permits modification and redistribution; a copy ships beside the model as
`explorer.license.txt`. The game credits the creator in its UI.

The adaptation removes the five knife/crossbow/throwable meshes, authors the
character at 1.8 meters with feet at ground level, and keeps eight movement and
reaction clips. The embedded atlas, body meshes and skin rig remain intact.
Unused buffers are pruned with glTF Transform 4.3.0; the result is 531 KB.
`src/game/researcher.asset.json` records the source and derivative hashes,
measured dimensions, north-facing orientation, meter units, center anchor and
free placement rotation. Its `importSpec` uses the shared model-import contract,
validated with published `@jgengine/assets`. The shipped catalog resolves this
one committed model.

To reproduce the derivative from the published tools, run these commands from
the repository root. The downloaded pack remains in ignored scratch space:

```sh
bunx --package @jgengine/assets@0.18.1 assets pull kaykit-adventurers --dir .scratch/field-station-source
bun field-station/scripts/import-researcher.ts .scratch/field-station-source/models/kaykit-adventurers/Rogue.glb
bun --cwd=field-station run test
```

The import script pins the reviewed source hash and stops if it changes.
Metadata was measured with the published `@jgengine/assets/dims` reader.
The asset test checks the shipped hash, rig, embedded texture, clips and geometry,
and uses the shared model-response diagnostic before parsing it.
