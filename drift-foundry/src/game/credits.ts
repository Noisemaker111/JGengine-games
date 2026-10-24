import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";

import { ASSET_SOURCE_IDS } from "./assets";

/** The yard's credits: its own art, then every asset pack the corridor uses. */
export const FOUNDRY_CREDITS = mergeCredits({
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
}, creditsForSourceIds(ASSET_SOURCE_IDS));
