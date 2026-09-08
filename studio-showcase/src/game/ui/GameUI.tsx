import { useSyncExternalStore } from "react";

import { HealthBar } from "@jgengine/react/bars";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/shell/gameKit";

import { currentAnnouncement, subscribeAnnouncement } from "../triggers";

function TriggerBanner() {
  const announcement = useSyncExternalStore(subscribeAnnouncement, currentAnnouncement, () => null);
  if (announcement === null) return null;
  const tone =
    announcement.tone === "warn"
      ? "text-amber-300"
      : announcement.tone === "good"
        ? "text-emerald-300"
        : "text-cyan-200";
  return (
    <div className={`rounded-sm bg-black/75 px-3 py-1.5 text-sm font-semibold ${tone}`}>
      {announcement.message}
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "studio-showcase" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-slate-100">
      <HudPanel id="health" anchor="bottom-left" compact="keep" interactive={false}>
        <HealthBar label="HP" shape="pill" width={220} />
      </HudPanel>
      <HudPanel id="trigger-banner" anchor="top" compact="keep" interactive={false}>
        <TriggerBanner />
      </HudPanel>
    </HudCanvas>
  );
}
