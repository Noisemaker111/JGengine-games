import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGame } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { useStore } from "@jgengine/react/store";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";

import { ASSET_SOURCE_IDS } from "../../assets";
import { keybinds } from "../../keybinds";
import { ControlsList } from "@jgengine/react/startScreen";
import { orbitSession } from "../../session/lifecycle";
import { householdStore } from "../../session/store";
import { ORBIT_SLOTS, orbitProfile, orbitSlotKey, readOrbitSave } from "../../session/save";
import {
  newOrbitSlot,
  openOrbitSlot,
  orbitSlotLabel,
  orbitSlots,
  refreshOrbitSlots,
  saveOrbitSlot,
  workingMember,
} from "../../menuSave";

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

/** The habitat's dusk palette, handed to the shared menu as CSS tokens rather than a preset. */
const MENU_TOKENS = {
  "--jg-accent": "#f5a8dc",
  "--jg-accent-soft": "rgba(245,168,220,0.24)",
  "--jg-accent-glow": "rgba(245,168,220,0.32)",
  "--jg-text": "#ffe9f5",
  "--jg-text-dim": "rgba(228,205,225,0.7)",
  "--jg-font-display": "\"Trebuchet MS\", \"Segoe UI\", sans-serif",
  "--jg-font-body": "\"Trebuchet MS\", \"Segoe UI\", sans-serif",
  "--jg-menu-logo-size": "clamp(30px, 4.4vw, 64px)",
  "--jg-menu-card-radius": "4px 22px 4px 4px",
} as const;

const credits = mergeCredits({
  sections: [
    { heading: "Original game art", entries: [{ label: "Odd Orbit", detail: "Original plan-derived household portraits and habitat interface." }] },
    { heading: "Engine", entries: [
      { label: "JG Engine", detail: "Apache-2.0", href: "https://github.com/Noisemaker111/jgengine" },
      { label: "React / Three.js", detail: "MIT" },
    ] },
  ],
}, creditsForSourceIds(ASSET_SOURCE_IDS));

export interface OrbitPreferences {
  calm: boolean;
  contrast: boolean;
}

/** The New career pane: a household moves in and its name is what the cards remember. */
function NewCareerPane({ slot, name, onName, onBegin, canWrite }: {
  slot: string;
  name: string;
  onName: (next: string) => void;
  onBegin: () => void;
  canWrite: boolean;
}): ReactNode {
  return (
    <div data-new-career-pane="" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 900 }}>New career</div>
      <p style={{ margin: 0, fontSize: "var(--jg-type-md)", color: "rgba(228,205,225,0.78)", maxWidth: "46ch" }}>
        Four beings move into the habitat with 640 credits and 12 rations. Each one takes a post, works a shift and lives a rhythm of their own.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
        <span style={{ fontSize: "var(--jg-type-xs)", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(228,205,225,0.62)" }}>Household</span>
        <input
          data-new-career-name=""
          value={name}
          maxLength={40}
          placeholder="Name the household"
          onChange={(event) => onName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onBegin(); } }}
          style={{ padding: "10px 12px", borderRadius: 4, border: "1px solid rgba(245,168,220,0.4)", background: "rgba(24,14,41,0.72)", color: "#ffe9f5", fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xl)", fontWeight: 700, outline: "none" }}
        />
      </label>
      <p style={{ margin: 0, fontSize: "var(--jg-type-sm)", color: "rgba(228,205,225,0.6)" }}>
        {canWrite ? `This opens ${orbitSlotLabel(slot)}; a held household there is replaced.` : "No household slot is free; the records pane replaces the oldest."}
      </p>
      <button
        type="button"
        data-new-career-start=""
        disabled={!canWrite}
        onClick={onBegin}
        style={{ alignSelf: "flex-start", padding: "11px 22px", borderRadius: 4, border: "none", background: canWrite ? "#f5a8dc" : "rgba(148,163,184,0.24)", color: "#291634", fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-lg)", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", cursor: canWrite ? "pointer" : "not-allowed" }}
      >
        Move in
      </button>
    </div>
  );
}

/** The field guide, kept from the old screen: one paragraph per rhythm of the day. */
function FieldGuide(): ReactNode {
  const steps: readonly [string, string][] = [
    ["Share the day", "Select a being. Yield works 08-14 for credits; Bloom tends 14-18 for rations. After three completed shifts, a being can work 08-18."],
    ["Grow a post", "Every being holds a post with three rungs. Each completed shift adds one household standing and one station mastery level; rungs open at 3 and 9 standing and are promoted in the inspector, never bought with credits."],
    ["Keep a pantry", "Meals consume rations. Buy six for 36 credits, or borrow emergency supplies once daily. The habitat bill arrives at midnight."],
    ["Make room to recover", "Work raises stress. Burnout stops earnings until Nourish and Rest reach 50 and stress falls below 35. Release directions to let a being care for itself."],
    ["Build bonds", "Choose a conversation partner. Friends prefer each other's company off-hours, and a bonded pair will not work separate shifts: give them neighbouring stations with matching rhythms."],
  ];
  return (
    <div data-field-guide="" style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 900 }}>Care for a strange household</div>
      {steps.map(([title, body]) => (
        <div key={title}>
          <strong style={{ display: "block", fontSize: "var(--jg-type-md)", color: "#ffe1ad" }}>{title}</strong>
          <span style={{ fontSize: "var(--jg-type-sm)", lineHeight: 1.65, color: "rgba(228,205,225,0.78)" }}>{body}</span>
        </div>
      ))}
    </div>
  );
}

/** Preferences and the shell's own settings, in the same pane. */
function HabitatSettings({ preferences, onPreference }: { preferences: OrbitPreferences; onPreference: (key: keyof OrbitPreferences, value: boolean) => void }): ReactNode {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const categories = settings.categories;
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId) ?? null;
  return (
    <div data-orbit-settings="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 900 }}>Habitat settings</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {([["calm", "Reduce interface motion", "Remove the habitat's animated flourishes."], ["contrast", "Higher contrast panels", "Opaque habitat panels and brighter borders."]] as const).map(([key, label, hint]) => (
          <label key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: "1px solid rgba(245,168,220,0.26)", padding: "7px 10px" }}>
            <span><strong style={{ display: "block", fontSize: "var(--jg-type-md)" }}>{label}</strong><small style={{ color: "rgba(228,205,225,0.6)" }}>{hint}</small></span>
            <input type="checkbox" checked={preferences[key]} onChange={(event) => onPreference(key, event.target.checked)} />
          </label>
        ))}
      </div>
      <SettingsTabs categories={categories} activeId={activeId} onSelect={setChosen} />
      {active === null ? null : <SettingsSection category={active} heading={false} />}
      <div>
        <div style={{ fontSize: "var(--jg-type-xs)", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(228,205,225,0.62)", marginBottom: 6 }}>Controls</div>
        <ControlsList bindings={keybinds} controls={[{ action: "pauseToggle", label: "Pause time" }, { action: "speedCycle", label: "Cycle speed" }, { action: "buildCancel", label: "Cancel placement" }, { keys: "WASD", label: "Pan camera" }, { keys: "Mouse wheel", label: "Zoom camera" }]} />
      </div>
    </div>
  );
}

/**
 * Odd Orbit's front end: the shared game menu over the station, in its own words - career,
 * household, shift. Continue resumes a career at the shift it paused on, with its credits and
 * member state; the household's current shift is named on the card.
 */
export function OrbitMenu({ preferences, onPreference }: { preferences: OrbitPreferences; onPreference: (key: keyof OrbitPreferences, value: boolean) => void }): ReactNode {
  const ctx = useGameContext();
  const { commands } = useGame();
  const session = useStore(orbitSession);
  const household = useStore(householdStore);
  const slots = useSaveSlots(orbitSlots);
  const [name, setName] = useState(orbitProfile.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = orbitSlots.mostRecent();
  const emptySlot = slots.find((slot) => slot.empty)?.id ?? ORBIT_SLOTS[0];
  const openSlot = session.slot;
  const open = session.screen;

  useEffect(() => {
    setName(orbitProfile.name);
    refreshOrbitSlots();
  }, []);

  useEffect(() => {
    if (open === "menu") refreshOrbitSlots();
    setNotice(null);
  }, [open]);

  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 260))]);
    } finally {
      setBusy(null);
    }
  };

  const close = () => {
    if (open === "paused") commands.run("orbit.resume", {});
  };

  const openCareer = (slot: string) =>
    whileLoading("Opening the household", async () => {
      if (!openOrbitSlot(ctx, slot)) { setNotice(`${orbitSlotLabel(slot)} is empty.`); return; }
      setName(orbitProfile.name);
    });

  const startCareer = () => {
    void whileLoading("Moving the household in", async () => {
      newOrbitSlot(ctx, emptySlot, name);
    });
  };

  const saveHere = useCallback(() =>
    whileLoading("Writing the household", async () => {
      const written = await saveOrbitSlot(ctx);
      setNotice(written ? `Written to ${orbitSlotLabel(openSlot)}` : "This browser could not write the household");
    }), [ctx, openSlot]);

  const working = workingMember(household);
  const shiftLine = working === null
    ? "Nobody is on a station right now: the household is between shifts."
    : `${working.name} is working this shift - ${working.completedShifts} shift${working.completedShifts === 1 ? "" : "s"} done, ${working.stress > 60 ? "and the day is wearing on them" : "and holding their rhythm"}.`;

  /** The Continue pane: the saved career plus the member whose shift it stopped on. */
  const continuePane = () => {
    const saved = recent === null ? null : readOrbitSave(undefined, recent.id).save;
    const member = saved === null ? null : workingMember(saved.household);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        <ContinuePane
          slot={recent}
          emptyMessage={session.saveStatus === "damaged"
            ? "The saved household is unreadable; a new career replaces it."
            : session.saveStatus === "unavailable"
              ? "This browser cannot read its saved household; a new career saves nowhere."
              : "No career kept yet. Move a household in, work a shift and save from the pause menu."}
          onContinue={(slot) => void openCareer(slot.id)}
        />
        <p data-continue-shift="" style={{ margin: 0, fontSize: "var(--jg-type-sm)", color: "rgba(228,205,225,0.72)" }}>
          {saved === null
            ? "A saved career shows the daylight it stopped on and the being at the station."
            : member === null
              ? `${orbitSlotLabel(recent!.id)} is saved between shifts: nobody is at a station.`
              : `${member.name} is on the ${member.lifestyle === "yield" ? "Yield" : "Bloom"} shift in ${orbitSlotLabel(recent!.id)} - ${saved.household.credits} credits and ${saved.household.pantry} rations held.`}
        </p>
      </div>
    );
  };

  const titleMenu = (
    <GameMenu
      open={open === "menu"}
      label="Odd Orbit"
      initialId={menuFocus.id ?? (recent === null ? "new" : "continue")}
      eyebrow="Odd Orbit / household logbook"
      logo={{ text: <span className="orbit-wordmark">Odd<br />Orbit</span>, title: "Odd Orbit" }}
      tagline="Four beings, one habitat, one working day. Give each a post, a shift and enough room to recover."
      items={[
        { id: "continue", label: "Continue career", hint: recent === null ? "No career on this device" : (recent.name ?? orbitSlotLabel(recent.id)), disabled: recent === null },
        { id: "new", label: "New career", hint: `Moves into ${orbitSlotLabel(emptySlot)}` },
        { id: "careers", label: "Careers & shifts", hint: `${slots.filter((slot) => !slot.empty).length} of ${slots.length} households kept` },
        { id: "guide", label: "Field guide", hint: "Shifts, posts, bonds, bills" },
        { id: "settings", label: "Settings", hint: "Preferences, sound, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") return continuePane();
        if (id === "new") return <NewCareerPane slot={emptySlot} name={name} onName={setName} onBegin={startCareer} canWrite={emptySlot !== null} />;
        if (id === "careers") {
          return (
            <SaveSlotsPane
              model={orbitSlots}
              heading="Careers & shifts"
              columns="auto"
              onContinue={(slot: SaveSlotMeta) => void openCareer(slot.id)}
              onLoad={(slot: SaveSlotMeta) => void openCareer(slot.id)}
              onNew={(slot: SaveSlotMeta) => { newOrbitSlot(ctx, slot.id, name); }}
              onDelete={(slot: SaveSlotMeta) => {
                void whileLoading("Clearing the household", async () => {
                  window.localStorage.removeItem(orbitSlotKey(slot.id));
                  refreshOrbitSlots();
                  setNotice(`${orbitSlotLabel(slot.id)} is clear.`);
                });
              }}
            />
          );
        }
        if (id === "guide") return <FieldGuide />;
        if (id === "settings") return <HabitatSettings preferences={preferences} onPreference={onPreference} />;
        if (id === "credits") return <CreditsPane sections={credits.sections} notice={credits.notice} heading="Credits" />;
        return null;
      }}
      onHighlight={(id) => { if (id === "careers") refreshOrbitSlots(); }}
      onSelect={(id) => {
        if (id === "continue" && recent !== null) void openCareer(recent.id);
        else if (id === "careers") refreshOrbitSlots();
      }}
      footer={<span>{notice ?? `${orbitSlotLabel(openSlot)} - ${household.credits} credits, ${household.pantry} rations, ${household.order.length} beings`}</span>}
      style={MENU_TOKENS}
    />
  );

  const pauseMenu = (
    <GamePauseMenu
      open={open === "paused"}
      label="The household is paused"
      onBack={close}
      onResume={close}
      logo={{ text: <span className="orbit-wordmark">Hold<br />still.</span>, title: "The household is paused" }}
      eyebrow={`${orbitSlotLabel(openSlot)} / day ${household.day + 1}`}
      tagline="Needs, bills and schedules wait while this is open."
      items={[
        { id: "resume", label: "Back to the household", hint: shiftLine },
        { id: "save", label: `Save to ${orbitSlotLabel(openSlot)}`, hint: "Writes the household, its beings and their shift" },
        { id: "guide", label: "Field guide" },
        { id: "settings", label: "Settings" },
        { id: "credits", label: "Credits" },
      ]}
      secondary={[{ id: "title", label: "Save & return to orbit" }]}
      detail={(id) =>
        id === "guide" ? <FieldGuide />
          : id === "settings" ? <HabitatSettings preferences={preferences} onPreference={onPreference} />
            : id === "credits" ? <CreditsPane sections={credits.sections} notice={credits.notice} heading="Credits" />
              : null
      }
      onSelect={(id) => {
        if (id === "resume") close();
        else if (id === "save") void saveHere();
        else if (id === "title") void whileLoading("Writing the household", async () => { await saveOrbitSlot(ctx); commands.run("orbit.title", {}); });
      }}
      footer={<span>{notice ?? `${household.credits} credits - ${household.pantry} rations - ${household.debt} debt`}</span>}
      style={MENU_TOKENS}
    />
  );

  return (
    <div className="orbit-menu">
      {titleMenu}
      {pauseMenu}
      {busy !== null && <div className="orbit-menu-busy" role="status" aria-live="polite"><span>{busy}</span></div>}
    </div>
  );
}
