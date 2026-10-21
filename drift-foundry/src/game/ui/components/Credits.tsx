import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";
import { CreditsScreen } from "@jgengine/react/creditsScreen";
import { HudButton } from "@jgengine/react/hudButton";
import { HudPanel } from "@jgengine/react/hudPanel";

import { ASSET_SOURCE_IDS } from "../../assets";

const AUTHORED = {
  title: "DRIFT FOUNDRY",
  sections: [
    {
      heading: "Original Drift Foundry art",
      entries: [{ label: "Row Six buggy & salvage stations", detail: "Original procedural geometry by JGengine Games contributors; source in drift-foundry/scripts/author-models.mjs." }],
    },
    {
      heading: "Built with",
      entries: [{ label: "JGengine", detail: "game SDK", href: "https://github.com/Noisemaker111/jgengine" }],
    },
  ],
  notice: "Every pack above is used under the license it is listed with.",
};

const DOCUMENT = mergeCredits(AUTHORED, creditsForSourceIds(ASSET_SOURCE_IDS));

export function Credits({ onBack }: { onBack: () => void }) {
  return (
    <div className="df-overlay">
      <HudPanel className="df-card df-credits" role="dialog" aria-label="Credits" elevation="modal" style={{ padding: undefined }}>
        <CreditsScreen document={DOCUMENT} />
        <div className="df-actions">
          <HudButton variant="primary" className="df-primary" onClick={onBack}>BACK <kbd>Esc</kbd></HudButton>
        </div>
      </HudPanel>
    </div>
  );
}
