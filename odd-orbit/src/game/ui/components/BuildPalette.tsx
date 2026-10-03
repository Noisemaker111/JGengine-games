import { useGame, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { NEED_DEFS } from "../../needs/needs";
import { FURNITURE, FURNITURE_BY_ID } from "../../objects/catalog";
import { creditsText } from "./bits";
import { householdStore } from "../../session/store";

export function BuildPalette({ onChoose }: { onChoose?: () => void }) {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const objects = useSceneObjects().filter(object => FURNITURE_BY_ID[object.catalogId]);
  return <section className="orbit-build"><h2>Make room for life</h2><p className="orbit-fine">Choose a furnishing, then select open ground. Placing spends credits and increases nightly upkeep.</p><div className="orbit-build-options">{FURNITURE.map(def => {
    const affordable = household.credits >= def.cost;
    const selected = household.buildTool === def.id;
    return <button key={def.id} aria-pressed={selected} disabled={!affordable} onClick={() => { commands.run("build.tool", { toolId:def.id }); onChoose?.(); }}><span className="orbit-furniture-icon" style={{ color:def.color }} aria-hidden="true">{def.role === "work" ? "⌘" : NEED_DEFS[def.role].icon}</span><strong>{def.name}</strong><span>{def.blurb}</span><b>{def.cost} credits</b>{!affordable && <small>Need {creditsText(def.cost-household.credits)} more credits</small>}</button>;
  })}</div>{household.buildTool && <div className="orbit-placement" role="status">Place {FURNITURE_BY_ID[household.buildTool]?.name} · cost {FURNITURE_BY_ID[household.buildTool]?.cost} credits<button onClick={() => commands.run("build.cancel", {})}>Cancel placement</button></div>}
    <details><summary>Manage placed furnishings · {objects.length}</summary><div className="orbit-object-list">{objects.map(object => <div key={object.instanceId}><span>{FURNITURE_BY_ID[object.catalogId]!.name}</span><button onClick={() => commands.run("object.sell", { id:object.instanceId })}>Sell · {Math.round(FURNITURE_BY_ID[object.catalogId]!.cost/2)} credits</button></div>)}</div></details>
  </section>;
}
