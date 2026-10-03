import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { gunById, registerGun } from "./handroll/roll";
import { gunCatalogStore } from "./stores";

export function rememberGun(ctx: GameContext, id: string): void {
  const gun = gunById(id);
  if (gun === undefined || gunCatalogStore.read(ctx)[id] !== undefined) return;
  gunCatalogStore.update(ctx, (catalog) => ({ ...catalog, [id]: gun }));
}

export function restoreGuns(ctx: GameContext): void {
  for (const gun of Object.values(gunCatalogStore.read(ctx))) registerGun(gun);
}
