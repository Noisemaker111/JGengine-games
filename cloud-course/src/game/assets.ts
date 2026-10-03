import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import models from "./model-index.json";

export const assets = createAssetCatalog();
for (const [id, model] of Object.entries(models)) assets.register(id, model);
