import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGame } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { useSyncExternalStore } from "react";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";

import { campaignOrdinal, campaignStore, markStoresRestored } from "../campaign";
import { hudStore } from "../hudStore";
import { preferences } from "../preferences";
import { CAMPAIGN_SLOTS, campaignLabel, campaignSlots, commandProfile, loadCampaignRecord, newCampaignRecord, refreshCampaignSlots, saveCampaignRecord } from "../menuSave";

/** Capture-only focus request: a shot declares which order it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

const MENU_TOKENS = {
  "--jg-accent": "#ffb020",
  "--jg-accent-soft": "rgba(255,176,32,0.22)",
  "--jg-accent-glow": "rgba(255,176,32,0.3)",
  "--jg-text": "#fff6e6",
  "--jg-text-dim": "rgba(255,236,205,0.66)",
  "--jg-font-display": "\"Arial Black\", \"Arial Narrow\", Impact, sans-serif",
  "--jg-font-body": "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  "--jg-menu-logo-size": "clamp(24px, 3.2vw, 50px)",
  "--jg-menu-card-radius": "2px",
} as const;

const credits = mergeCredits({ title: "The makers of the vale", sections: [
  { heading: "Ember Command", entries: [
    { label: "Original miniatures & art direction", detail: "Bastions, warriors, pennants and resource props authored for this game." },
    { label: "JGengine", detail: "Published engine packages", href: "https://jgengine.com" },
  ] },
  { heading: "Icons", entries: [{ label: "game-icons.net contributors", detail: "CC BY 3.0; individual credits in iconData.ts", href: "https://game-icons.net" }] },
] }, creditsForSourceIds(["kaykit-adventurers", "kaykit-city-builder", "quaternius-stylized-nature", "kaykit-dungeon"]));

export function battleTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The New campaign pane: a commander takes the vale and the record remembers their name. */
function NewCampaignPane({ slot, name, onName, onBegin }: { slot: string | null; name: string; onName: (next: string) => void; onBegin: () => void }): ReactNode {
  return (
    <div data-new-campaign-pane="" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800 }}>New campaign</div>
      <p style={{ margin: 0, fontSize: "var(--jg-type-md)", color: "rgba(255,236,205,0.72)", maxWidth: "46ch" }}>
        Five orders stand between the Vanguard and the Marauder Warcamp. Mission I opens with the muster.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
        <span style={{ fontSize: "var(--jg-type-xs)", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,236,205,0.6)" }}>Commander</span>
        <input
          data-new-campaign-name=""
          value={name}
          maxLength={24}
          placeholder="Name the commander"
          onChange={(event) => onName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onBegin(); } }}
          style={{ padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,176,32,0.35)", background: "rgba(10,11,7,0.72)", color: "#fff6e6", fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xl)", fontWeight: 700, outline: "none" }}
        />
      </label>
      <p style={{ margin: 0, fontSize: "var(--jg-type-sm)", color: "rgba(255,236,205,0.6)" }}>
        {slot === null ? "No campaign record available." : `This opens ${campaignLabel(slot)}; a held record is replaced.`}
      </p>
      <button
        type="button"
        data-new-campaign-start=""
        disabled={slot === null}
        onClick={onBegin}
        style={{ alignSelf: "flex-start", padding: "11px 22px", borderRadius: 2, border: "none", background: slot === null ? "rgba(148,163,184,0.24)" : "#ffb020", color: "#141609", fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-lg)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: slot === null ? "not-allowed" : "pointer" }}
      >
        Take command
      </button>
    </div>
  );
}

/**
 * Ember Command's field desk: the shared game menu over the vale, in the campaign's own words -
 * campaign, mission, orders. Continue resumes the record at the mission it reached with its stores.
 */
export function CommandMenu(): ReactNode {
  const ctx = useGameContext();
  const { commands } = useGame();
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
  const store = preferences(ctx);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const settings = useSettings();
  const slots = useSaveSlots(campaignSlots);
  const [name, setName] = useState(commandProfile.name);
  const [screen, setScreen] = useState<"title" | "pause">(hud.phase === "paused" ? "pause" : "title");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = campaignSlots.mostRecent();
  const openSlot = ctx.game.save?.slot() ?? CAMPAIGN_SLOTS[0];
  const newSlot = slots.find((slot) => slot.empty)?.id ?? CAMPAIGN_SLOTS[0];

  useEffect(() => {
    setScreen(hud.phase === "paused" ? "pause" : "title");
    refreshCampaignSlots();
  }, [hud.phase]);

  // Escape is the field desk's own key: pause a running battle, resume a held one.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented) return;
      if (hud.phase === "playing") { event.preventDefault(); commands.run("match.pause", {}); }
      else if (hud.phase === "paused") { event.preventDefault(); commands.run("match.resume", {}); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [commands, hud.phase]);

  const run = (command: string) => { commands.run(command, {}); };

  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try { await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 260))]); }
    finally { setBusy(null); }
  };

  const openRecord = (slot: string) =>
    whileLoading("Opening the campaign record", async () => {
      const opened = await loadCampaignRecord(ctx, slot);
      if (!opened) { setNotice(`${campaignLabel(slot)} is empty.`); return; }
      markStoresRestored(ctx);
      setName(commandProfile.name);
      refreshCampaignSlots();
      run("match.start");
    });

  const startNew = (slot: string | null) => {
    if (slot === null) return;
    void whileLoading("Opening the campaign", async () => {
      await newCampaignRecord(ctx, slot, name);
      run("match.start");
    });
  };

  const saveHere = useCallback(() =>
    whileLoading("Writing the campaign record", async () => {
      await saveCampaignRecord(ctx);
      setNotice(`Orders written to ${campaignLabel(openSlot)}`);
    }), [ctx, openSlot]);

  const campaign = hud.campaign;
  const ready = hud.phase === "ready";
  const paused = hud.phase === "paused";
  const ended = hud.phase === "won" || hud.phase === "lost";

  const report = ended ? (
    <div data-field-report="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800 }}>
        {hud.phase === "won" ? "The vale is yours" : "The keep has fallen"}
      </div>
      <p style={{ margin: 0, fontSize: "var(--jg-type-md)", color: "rgba(255,236,205,0.75)", maxWidth: "46ch" }}>
        {hud.phase === "won"
          ? "Your Vanguard broke the Warcamp. The reinforcements have been silenced."
          : "The Marauders breached your walls. Gather gold early, build a Barracks and cover the road with a Guard Tower."}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[["Battle time", battleTime(hud.elapsed)], ["Waves faced", hud.wavesSent], ["Troops standing", hud.playerUnits]].map(([label, value]) => (
          <li key={label} style={{ border: "1px solid rgba(255,176,32,0.35)", padding: "6px 10px", fontSize: "var(--jg-type-sm)" }}>
            {label} <strong style={{ marginLeft: 6 }}>{value}</strong>
          </li>
        ))}
      </ul>
    </div>
  ) : undefined;

  const titleMenu = (
    <GameMenu
      open={hud.phase !== "playing" && screen === "title"}
      label="Ember Command"
      initialId={menuFocus.id ?? (recent === null ? "new" : "continue")}
      eyebrow={campaign === null ? "The Highland Vale · free skirmish" : `The Highland Vale · Mission ${campaignOrdinal(campaign.index - 1)} of ${campaignOrdinal(campaign.total - 1)}`}
      logo={{ text: <span className="ec-wordmark">Ember<br />Command</span>, title: "Ember Command" }}
      tagline="Lead Bram's Vanguard through the highlands. Raise an army, hold the war-road and break the Marauder Warcamp."
      items={[
        ...(ended ? [{ id: "report", label: "Field report", hint: hud.phase === "won" ? "The vale is yours" : "The keep has fallen" }] : []),
        { id: "continue", label: "Continue campaign", hint: recent === null ? "No campaign on this device" : (recent.name ?? campaignLabel(recent.id)), disabled: recent === null },
        { id: "new", label: "New campaign", hint: `Opens ${campaignLabel(newSlot)}` },
        { id: "missions", label: "Campaigns & orders", hint: `${slots.filter((slot) => !slot.empty).length} of ${slots.length} records held` },
        { id: "settings", label: "Settings", hint: "Preferences, sound, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") {
          return <ContinuePane slot={recent} emptyMessage="No campaign kept yet. Take command, hold a mission and save from the field desk." onContinue={(slot) => void openRecord(slot.id)} />;
        }
        if (id === "new") return <NewCampaignPane slot={newSlot} name={name} onName={setName} onBegin={() => startNew(newSlot)} />;
        if (id === "missions") {
          return (
            <SaveSlotsPane
              model={campaignSlots}
              heading="Campaigns & orders"
              columns="auto"
              onContinue={(slot: SaveSlotMeta) => void openRecord(slot.id)}
              onLoad={(slot: SaveSlotMeta) => void openRecord(slot.id)}
              onNew={(slot: SaveSlotMeta) => startNew(slot.id)}
            />
          );
        }
        if (id === "settings") return <FieldSettings />;
        if (id === "credits") return <CreditsPane sections={credits.sections} notice={credits.notice} heading="Credits" />;
        if (id === "report") return report;
        return null;
      }}
      onHighlight={(id) => { if (id === "missions") refreshCampaignSlots(); }}
      onSelect={(id) => {
        if (id === "continue" && recent !== null) void openRecord(recent.id);
        else if (id === "missions") refreshCampaignSlots();
      }}
      footer={<span>{notice ?? `Service record · ${prefs.wins} victories / ${prefs.losses} defeats`}</span>}
      style={MENU_TOKENS}
    />
  );

  const pauseMenu = (
    <GamePauseMenu
      open={hud.phase === "paused"}
      label="Orders on hold"
      onBack={() => run("match.resume")}
      onResume={() => run("match.resume")}
      logo={{ text: <span className="ec-wordmark">Orders on hold.</span>, title: "Orders on hold" }}
      eyebrow={campaign === null ? "Free skirmish" : `Mission ${campaignOrdinal(campaign.index - 1)} · ${campaign.title}`}
      tagline="The battlefield is frozen. Review your plan before the next wave."
      items={[
        { id: "resume", label: "Resume the mission" },
        { id: "save", label: `Save to ${campaignLabel(openSlot)}`, hint: "Writes the campaign, its mission and its stores" },
        { id: "settings", label: "Settings" },
        { id: "credits", label: "Credits" },
      ]}
      secondary={[{ id: "title", label: "Save & return to the field desk" }]}
      detail={(id) =>
        id === "settings" ? <FieldSettings /> : id === "credits" ? <CreditsPane sections={credits.sections} notice={credits.notice} heading="Credits" /> : null
      }
      onSelect={(id) => {
        if (id === "resume") run("match.resume");
        else if (id === "save") void saveHere();
        else if (id === "title") void whileLoading("Writing the campaign record", async () => { await saveCampaignRecord(ctx); run("match.title"); });
      }}
      footer={<span>{notice ?? `${hud.gold} gold · ${hud.lumber} lumber`}</span>}
      style={MENU_TOKENS}
    />
  );

  return (
    <div className="ec-menu">
      {titleMenu}
      {pauseMenu}
      {busy !== null && <div className="ec-menu-busy" role="status" aria-live="polite"><span>{busy}</span></div>}
    </div>
  );
}

/** Field preferences and the shell's own settings, in the same pane. */
function FieldSettings(): ReactNode {
  const ctx = useGameContext();
  const settings = useSettings();
  const store = preferences(ctx);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [chosen, setChosen] = useState<string | null>(null);
  const categories = settings.categories;
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId) ?? null;
  return (
    <div data-ec-settings="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800 }}>Settings</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {([["largeText", "Larger HUD text", "Enlarge command labels and field reports."], ["highContrast", "High contrast", "Opaque panels and brighter borders."], ["reducedMotion", "Reduce UI motion", "Remove animated menu flourishes."]] as const).map(([key, label, hint]) => (
          <label key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: "1px solid rgba(255,176,32,0.24)", padding: "7px 10px" }}>
            <span><strong style={{ display: "block", fontSize: "var(--jg-type-md)" }}>{label}</strong><small style={{ color: "rgba(255,236,205,0.6)" }}>{hint}</small></span>
            <input type="checkbox" checked={prefs[key]} onChange={(event) => store.set({ [key]: event.target.checked })} />
          </label>
        ))}
      </div>
      <SettingsTabs categories={categories} activeId={activeId} onSelect={setChosen} />
      {active === null ? null : <SettingsSection category={active} heading={false} />}
    </div>
  );
}
