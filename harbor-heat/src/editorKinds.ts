import { definePlaceableMarkerKind } from "@jgengine/core/scene/sceneKinds";

/**
 * Harbor Heat's own click-to-place marker kinds. Registering them here (imported for its side effect by
 * `editorLayers.ts`, which the editor always loads for this game) makes "Stash", "Bounty", "Crossing"
 * and "Kerb space" tools in the editor's `+ Add` menu: pick one, click the world to drop it, Shift-click
 * to keep placing a whole run of them. The runtime still reads these off `editorLayers.markers` by
 * `kind` — the registration only teaches the editor how to place and inspect them.
 */
export const STASH_KIND = definePlaceableMarkerKind({
  kind: "stash",
  label: "Stash",
  category: "Harbor Heat",
  accent: "#38d6c4",
  fields: [{ type: "number", key: "value", label: "Payout ($)", default: 300, min: 0, step: 50 }],
});

export const BOUNTY_KIND = definePlaceableMarkerKind({
  kind: "bounty",
  label: "Bounty spot",
  category: "Harbor Heat",
  accent: "#6d2f8f",
});

/**
 * A signalised (or first-come) crossing. The engine's lane-graph reader (`laneGraphFromDocument`) reads
 * `traffic_intersection` markers for a junction's right-of-way and signal program; registering the kind
 * makes it placeable and gives the common knobs an inspector. The signal program itself is authored as
 * `meta.signal` in the document, because a nested object is not a marker field.
 */
export const TRAFFIC_INTERSECTION_KIND = definePlaceableMarkerKind({
  kind: "traffic_intersection",
  label: "Traffic crossing",
  category: "Harbor Heat",
  accent: "#f6cf4a",
  fields: [
    {
      type: "select",
      key: "rightOfWay",
      label: "Right of way",
      options: [
        { value: "signal", label: "Signal" },
        { value: "priority", label: "First come" },
      ],
      default: "signal",
    },
    { type: "number", key: "offsetSeconds", label: "Cycle offset (s)", default: 0, min: 0, step: 0.5 },
    { type: "number", key: "stopLine", label: "Stop line (m)", default: 6, min: 1, step: 0.5 },
  ],
});

/** A kerbside parking spot. The lane graph projects it onto its nearest lane and its arc. */
export const TRAFFIC_PARKING_KIND = definePlaceableMarkerKind({
  kind: "traffic_parking",
  label: "Kerb space",
  category: "Harbor Heat",
  accent: "#8aa0b4",
});
