import { useStore } from "@jgengine/react/store";
import { MAX_HEAT, MAX_STARS, type WantedSnapshot, wantedStore } from "../../handroll";

/** HHPD's own words for what it is doing, so the pips read as a search rather than a score. */
function heatLine(wanted: WantedSnapshot): string {
  if (wanted.stars === 0) return "Nobody is looking.";
  if (wanted.response === "roadblock") return "HHPD has the causeway.";
  if (wanted.response === "pursue") return "HHPD is hunting you.";
  return wanted.stars >= 2 ? "HHPD is asking around the block." : "Someone called it in.";
}

export function WantedStars() {
  const wanted = useStore(wantedStore);
  const stars = wanted?.stars ?? 0;
  const heat = wanted?.heat ?? 0;
  const search = wanted?.search ?? null;
  const hot = stars >= 3;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex gap-1.5 -skew-x-6 border-2 border-black px-3 py-1 shadow-[4px_4px_0_#000] ${
          hot ? "bg-[#5a1414]/90" : "bg-[#12141a]/85"
        }`}
      >
        {Array.from({ length: MAX_STARS }, (_, i) => (
          <span
            key={i}
            className={`text-2xl leading-none drop-shadow-[1px_1px_0_#000] ${
              i < stars ? "text-[#ffb020]" : "text-[#3a3d46]"
            } ${i < stars && stars >= 3 ? "animate-pulse" : ""}`}
          >
            ★
          </span>
        ))}
      </div>
      {stars > 0 && wanted !== undefined ? (
        <div className="flex w-[230px] flex-col items-center gap-1 -skew-x-6 border-2 border-black bg-[#12141a]/85 px-2 py-1 shadow-[3px_3px_0_#000]">
          <div className="h-1.5 w-full border border-black bg-[#2a2d35]">
            <div
              className={`h-full ${hot ? "bg-[#f2599b]" : "bg-[#ffb020]"}`}
              style={{ width: `${Math.min(100, Math.round((heat / MAX_HEAT) * 100))}%` }}
            />
          </div>
          <span className={`text-[10px] font-black uppercase tracking-wider ${hot ? "text-[#f2599b]" : "text-[#ffb020]"}`}>
            {heatLine(wanted)}
          </span>
          {search !== null ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
              Search {Math.round(search.radius)} m · last seen
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
