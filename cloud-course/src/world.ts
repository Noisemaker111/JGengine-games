import { world as place } from "@jgengine/core/world/place";

// The world is the place you play in: substrate + laws. Dress the place — sky look, foliage,
// props, sculpt — in the editor (F2+E), which writes editor.scene.json; never here.
export const world = place({
  id: "cloud-course",
  ground: { mode: "flat", size: { x: Infinity, z: Infinity } },
  physics: { gravity: -24 },
});
