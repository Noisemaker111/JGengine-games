# Deepward credits

Deepward's setting, terminology, characters, item fiction, procedural industrial
meshes and interface are original content in this repository. No downloaded
model pack or commissioned bitmap artwork is used in the current slice.

The terrain, room volumes and stable markers in `src/editor.scene.json` were
authored through the published JGengine editor host using its decoded RPC
operations and `export_document`. The game derives navigation from that document;
it does not claim an editor-baked navigation mesh.

The application consumes published JGengine core, React, shell and editor
packages, React, React Three Fiber and Three.js. Their distributed package
licenses and notices remain with those dependencies. Build tooling includes
Vite, Tailwind CSS and TypeScript under their respective distributed licenses.

The 2026 station pass adds original canopies, receiving hoist, pressure vessels,
print press ribs, service cabinets, conduits and waysigns. Its reproducible
`scripts/author-station.ts` uses the published editor host's session commands
and marker RPC, then exports the document. Runtime batches those authored
volumes and room-derived surfaces; it does not embed their world placements.

Original detailed rotary press, salvage printer, duplex ink recovery pump,
stash cabinet, dispatch desk, receiving portal and rail transfer trolley are
CC0-1.0 assets under `public/models/imported/deepward`. The supplied license and
asset manifest record their reproducible Blender tooling, metre bounds and
embedded original enamel/metal grain, wear, roughness and normal maps.
`place-original-machinery.ts` attaches them to stable editor catalog markers.

The original seventeen-joint Fitter, skinned tools, service sidearm and rifle
are CC0-1.0 models under `public/models/imported/deepward/fitter`; the manifest
records bounds, embedded maps, skins and the idle/walk/windup clips. The models
are reproducible through `build-original-fitter.py`. Original tileable station
enamel and mineral floor grain/grease maps are under `surfaces`, with their own
hash manifest and `build-original-surfaces.py` source.
