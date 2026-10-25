import { useStore } from "@jgengine/react/store";
import { KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";
import { MAX_HEAT, MAX_STARS, type WantedSnapshot, wantedStore } from "../../handroll";

/** HHPD's own words for what it is doing, so the stars read as a search rather than a score. */
function heatLine(wanted: WantedSnapshot): string {
  if (wanted.response === "roadblock") return "HHPD has the causeway";
  if (wanted.response === "pursue") return "HHPD is hunting you";
  return wanted.stars >= 2 ? "HHPD is asking around" : "Someone called it in";
}

/** Only on screen while the police want you. */
export function WantedStars() {
  const wanted = useStore(wantedStore);
  if (wanted === undefined || wanted.stars === 0) return null;
  const tone = wanted.stars >= 3 ? "bad" : "warn";
  return (
    <KitPanel variant="hud" tone={tone} title={"★".repeat(wanted.stars) + "☆".repeat(MAX_STARS - wanted.stars)} style={{ width: 236 }}>
      <KitMeter label={heatLine(wanted)} value={wanted.heat} max={MAX_HEAT} tone={tone} size="sm" />
      {wanted.search == null ? null : <div style={{ marginTop: 6 }}>Search {Math.round(wanted.search.radius)} m · lose them outside it</div>}
    </KitPanel>
  );
}
