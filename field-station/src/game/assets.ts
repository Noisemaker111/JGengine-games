import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { AssetSpace } from "@jgengine/core/scene/assetSpace";
import type { CreditsDocument } from "@jgengine/core/game/credits";

import researcher from "./researcher.asset.json";

export const FIELD_RESEARCHER_ASSET_ID = "field-station/researcher";

export const assets = createAssetCatalog();
assets.register(FIELD_RESEARCHER_ASSET_ID, {
  url: "/models/explorer.glb",
  dims: researcher.dims,
  space: researcher.space as AssetSpace,
  clips: researcher.clips,
});

export const assetCredits: CreditsDocument = {
  sections: [{
    heading: "3D assets",
    entries: [{
      label: "Kay Lousberg — KayKit Adventurers",
      detail: "CC0-1.0 · Field Station unarmed researcher adaptation",
      href: researcher.source.homepage,
    }],
  }],
};
