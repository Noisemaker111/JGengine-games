# Resonant Crossing

Guide Lumen and Anchor through four observatory chambers. Lumen plants a directional prism; Anchor leaves one weight. The final two chambers require moving these devices between ordered relay stations on distinct beam lines. Later stations change prism direction while Anchor advances the weight, keeping live gates and hazards safe.

Use WASD or arrows for one tile per press, Q to swap heroes, E to use a device, R to restart the chamber, and Escape or P to pause. The on-screen direction and aiming buttons offer the same commands. Ready, Hold, Go and Recover callouts identify the sending hero. Both heroes must reach their matching exit rings.

Spikes return a hero to the last safe tile. Planted devices and secured relays survive that recovery. Restart clears the chamber's devices and relay progress. Browser checkpoints retain the furthest unlocked chamber; Continue restarts that chamber rather than restoring a partial circuit.

## Authoring

`src/editor.scene.json` owns the four room grids, circuit wiring, relay order, routes, zones and ambient placements. `src/game/rooms/catalog.ts` validates and derives runtime rooms from that document. Invalid signal references, duplicate spawns, non-unit grids and cyclic relay wiring report room-specific errors.

Open the editor by holding F2 and pressing E. Live document revisions, undo and redo rebuild the active chamber; a scene edit deliberately restarts the circuit. Running expeditions preserve room ids and campaign order. Invalid edits retain the last playable circuit and show a diagnostic.

For persisted headless authoring, supply an array of normal editor RPC requests:

```sh
bun resonant-crossing/scripts/author-scene.ts operations.json --save
```

The script validates the export and checks an identical decode roundtrip before saving. Without `--save`, it reports the result without changing the scene file.

Two distinct authored layouts exercise the same workflow:

| Layout | Individual cell authoring | Batched cell authoring |
| --- | ---: | ---: |
| Relay Circuit, 119 cells | 121 RPC calls | 3 RPC calls |
| Relay Courtyard, 231 cells | 233 RPC calls | 3 RPC calls |

These recreate identical documents using existing published editor operations. Five local trials of the final authored layouts measured medians of 16.17 → 1.07 ms and 56.89 → 1.27 ms respectively. These are in-memory authoring measurements, not browser play times or an SDK performance comparison. Both layouts also exercise persisted paint, undo, redo and export.

## Verification

```sh
bun --cwd=resonant-crossing run check-types
bun test resonant-crossing/src
cd resonant-crossing
bun node_modules/vite/bin/vite.js build
```

Game commands enforce hero ownership and phase gates, using the authenticated hosted command actor before any supplied player id. Join callbacks seat the joining player even when the context belongs to the host. The native keyboard uses discrete commands so the shell's continuous half-cell grid snapping cannot move an idle integer-centered puzzle hero. Boot explicitly seats the local player when the published offline fallback omits its join callback. The native capture probe reports role, devices, relays, recovery, phase and positions after actual rendered frames.

The configured P2P adapter requires a playable-aware authoritative session bootstrap. The current published shell's default resolver falls back to offline play; this standalone build therefore supports one player swapping both heroes. Joint-seat rules are tested, but two-browser shared-puzzle gameplay awaits the coordinated SDK release and bootstrap adoption. PR/HQ evidence records the native play coverage separately.
