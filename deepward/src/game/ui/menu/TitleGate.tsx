import { useState } from "react";
import { CreditsPanel } from "@jgengine/react/creditsPanel";
import { useOptionalGamePhase } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSettings } from "@jgengine/react/settings";
import { TitleMenu } from "@jgengine/react/titleMenu";
import { useStore } from "@jgengine/react/store";

import { continueSaved, enterFromTitle, viewStore } from "../../controls";
import { DEEPWARD_CREDITS } from "../../credits";
import { storedMarrow } from "../../save";

/** Deepward's front-end: the Marrow platform stands behind the title, frozen until a shift is chosen. */
export function TitleGate() {
  const ctx = useGameContext();
  const view = useStore(viewStore);
  const settings = useSettings();
  const phase = useOptionalGamePhase();
  const [credits, setCredits] = useState(false);

  // A real record on disk, not a remembered flag.
  let saved = false;
  try {
    saved = typeof localStorage !== "undefined" && storedMarrow(localStorage);
  } catch {
    saved = false;
  }

  if (phase !== "menu") return null;

  const summary = `Life ${view.home.life} · ${view.home.extractions} return${view.home.extractions === 1 ? "" : "s"} · ${view.home.stash.length} banked`;

  return (
    <div className="dw-title">
      <TitleMenu
        eyebrow="Halloway municipal print service / 06"
        title={<span className="dw-wordmark">Deepward<span>/ Marrow</span></span>}
        tagline="Air is the clock. Bank what you can carry, and take the rail before it runs out."
        items={[
          {
            id: "continue",
            label: "Continue",
            hint: saved ? summary : "No saved Marrow on this profile",
            primary: saved,
            disabled: !saved,
          },
          { id: "enter", label: "Enter Marrow", hint: "Walk to the garage and take the rail to Bellwether" },
          { id: "settings", label: "Settings & controls", hint: "Sound, picture and the shift's keys" },
          { id: "credits", label: "Credits" },
        ]}
        onSelect={(id) => {
          if (id === "continue") {
            continueSaved(ctx);
            return;
          }
          if (id === "enter") {
            enterFromTitle(ctx);
            return;
          }
          if (id === "settings") {
            settings.open();
            return;
          }
          setCredits(true);
        }}
        footer={<span>Marrow / {saved ? "record found" : "no saved record"}</span>}
        controlHint="Arrows move · Enter select"
      >
        <p className="dw-title-note">
          {saved
            ? "Continue re-reads the saved record; nothing you carry on a dive is safe until it is banked."
            : "A fresh Marrow. Departure writes the first record; from then on Continue appears here."}
        </p>
      </TitleMenu>

      {credits && (
        <CreditsPanel
          document={DEEPWARD_CREDITS}
          onBack={() => setCredits(false)}
          title="Deepward / credits"
          backLabel="Back to the rail"
          open
        />
      )}
    </div>
  );
}
