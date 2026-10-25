import { useCurrency, useEntityStat, usePlayer } from "@jgengine/react/hooks";
import { KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

/** Vitals, kept quieter than the goal: cash on a plain tab, health always, armor only once you have some. */
export function StatusPanel() {
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  const armor = useEntityStat(userId, "armor")?.current ?? 0;
  const cred = useEntityStat(userId, "level")?.current ?? 1;
  const cash = useCurrency("cash");
  const hp = health?.current ?? 0;
  const max = health?.max ?? 100;
  return (
    <KitPanel variant="hud" tone="neutral" title={`$${cash.toLocaleString()}`} aside={`Cred ${cred}`} style={{ width: 196 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <KitMeter label="Health" value={hp} max={max} tone={hp < max * 0.3 ? "bad" : "good"} size="sm" />
        {armor > 0 ? <KitMeter label="Armor" value={armor} max={100} tone="neutral" size="sm" /> : null}
      </div>
    </KitPanel>
  );
}
