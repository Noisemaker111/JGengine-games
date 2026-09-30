import type { GamePreviewProps } from "@jgengine/react/preview";
import { CARD_CATALOG } from "./game/cards";
import { CardArtIcon } from "./game/ui/icons";
import { EnemyArt, RoadLandscape } from "./game/ui/RoadArt";

/** Authored gallery illustration; this is not a playtest capture. */
export default function WayfarerDeckPreview({ className }: GamePreviewProps) {
  return <div className={className} style={{position: "relative", height: "100%", overflow: "hidden", containerType: "inline-size", background: "#193039", color: "#f2e8cf", fontFamily: "Georgia, serif"}}>
    <RoadLandscape stage={0} style={{position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0}}/>
    <div style={{position: "absolute", inset: 0, background: "linear-gradient(#0c1e2670,transparent,#08191cdb)"}}/>
    <div style={{position: "absolute", top: "5%", left: "5%", fontSize: "3cqw"}}>Wayfarer Deck<div style={{font: "1cqw Segoe UI, sans-serif", letterSpacing: ".2em", marginTop: "1cqw", color: "#d8c596"}}>THE OLD ROAD · FIVE ENCOUNTERS</div></div>
    <EnemyArt index={0} style={{position: "absolute", left: "53%", top: "14%", width: "29%", height: "auto", margin: 0, animation: "none"}}/>
    <div style={{position: "absolute", top: "29%", left: "10%", fontSize: "2cqw"}}>Wayfarer<div style={{height: "1cqw", width: "22cqw", background: "#a8c998", borderRadius: "1cqw", marginTop: "1cqw"}}/><small style={{font: "1.2cqw Segoe UI, sans-serif"}}>72 / 72 HP · 3 energy</small></div>
    <div style={{position: "absolute", top: "14%", left: "56%", background: "#193039", border: "1px solid #d1bb83", padding: ".7cqw 1.5cqw", borderRadius: "2cqw", font: "1.2cqw Segoe UI, sans-serif"}}>9 incoming damage</div>
    <div style={{position: "absolute", bottom: "5%", insetInline: "10%", display: "flex", justifyContent: "center", gap: "1cqw"}}>{["trail_cut", "pack_guard", "campfire_oath", "hilt_check", "weather_the_road"].map(type => {
      const card = CARD_CATALOG[type]!;
      return <div key={type} style={{width: "14cqw", minHeight: "19cqw", background: "linear-gradient(135deg,#ede2bf,#c6c4a1)", border: "1px solid #9d966f", borderRadius: ".8cqw", padding: ".8cqw", color: "#243638", boxShadow: "0 1cqw 2cqw #08191c99"}}><div style={{fontSize: "1.2cqw", fontWeight: 700}}>{card.cost} · {card.name}</div><div style={{marginBlock: ".8cqw", height: "8cqw", background: card.kind === "skill" ? "#496e78" : card.kind === "power" ? "#71647b" : "#94644e", borderRadius: ".5cqw", display: "grid", placeItems: "center", color: "#f7dfb2"}}><div style={{width: "5cqw", height: "5cqw"}}><CardArtIcon art={card.art} className="h-full w-full"/></div></div><p style={{font: "1.15cqw Segoe UI, sans-serif", lineHeight: 1.5, margin: 0}}>{card.text}</p></div>;
    })}</div>
  </div>;
}
