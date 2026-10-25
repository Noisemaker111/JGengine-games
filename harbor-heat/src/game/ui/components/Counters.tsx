import type { ReactNode } from "react";
import { runDialogueChoice, useOpenDialogueId } from "@jgengine/react/components";
import { useCurrency, useEntityStat, useGame, usePlayer } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { KitButton, KitPanel } from "@jgengine/react/uiKitRoot";
import { bestRaceStore, garageStore, shopStore } from "../../commands";
import { ITEM_LABELS } from "../../content";
import { DIALOGUES } from "../../entities/npcs/dialogues";
import { VEHICLES } from "../../entities/vehicles/catalog";
import { wantedStore } from "../../handroll";
import { marketStore } from "../../items/nightMarket";
import { GEAR, WEAPONS } from "../../items/weapons/catalog";
import { CRED_GATES } from "../../progression/cred";

const GUNS = [...WEAPONS, ...GEAR].filter((item) => item.trade?.buy !== undefined && item.trade.shops?.includes("shop_ammunation"));
const CARS = VEHICLES.filter((car) => car.price > 0);

interface Row { id: string; label: string; price: number; run: [string, unknown] }

/** A street counter: what is on sale, what you can afford, and the way out. */
function Counter({ title, rows, extra, leave }: { title: string; rows: Row[]; extra?: ReactNode; leave: string }) {
  const { commands } = useGame();
  const cash = useCurrency("cash");
  const cred = useEntityStat(usePlayer().userId, "level")?.current ?? 1;
  return (
    <KitPanel variant="card" title={title} aside={`$${cash.toLocaleString()}`} style={{ width: "min(22rem, 88vw)" }} footer={<>{extra}<KitButton size="sm" tone="bad" onClick={() => commands.run(leave, {})}>Leave</KitButton></>}>
      <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
        {rows.map((row) => {
          const gate = CRED_GATES[row.id];
          const locked = gate !== undefined && cred < gate;
          return <KitButton key={row.id} size="sm" disabled={locked || cash < row.price} onClick={() => commands.run(...row.run)}>{row.label} · {locked ? `Cred ${gate}` : `$${row.price.toLocaleString()}`}</KitButton>;
        })}
      </div>
    </KitPanel>
  );
}

export function Counters() {
  const { commands } = useGame();
  const dialogueId = useOpenDialogueId();
  const shop = useStore(shopStore, (v) => v ?? null);
  const garage = useStore(garageStore, (v) => v === true);
  const market = useStore(marketStore);
  const stars = useStore(wantedStore, (wanted) => wanted?.stars ?? 0);
  const bestLap = useStore(bestRaceStore, (v) => v);
  const dialogue = dialogueId === null ? undefined : DIALOGUES[dialogueId];
  if (dialogue !== undefined) {
    const speaker = dialogue.lines.find((line) => "speaker" in line);
    return (
      <KitPanel variant="card" title={speaker !== undefined && "speaker" in speaker ? speaker.speaker : undefined} style={{ width: "min(28rem, 88vw)", textTransform: "none" }}>
        {dialogue.lines.map((line, index) => "choices" in line
          ? <div key={index} style={{ display: "flex", gap: 14, marginTop: 12 }}>{line.choices.map((choice, at) => <KitButton key={choice.label} size="sm" variant={at === 0 ? "primary" : "secondary"} onClick={() => runDialogueChoice(commands, choice, null)}>{choice.label}</KitButton>)}</div>
          : <p key={index} style={{ margin: "0 0 8px" }}>{line.text}</p>)}
      </KitPanel>
    );
  }
  if (shop !== null) {
    const deals: Row[] = (market?.items ?? []).map((item) => ({ id: item.id, label: `Night market: ${item.name}`, price: item.price, run: ["market.buy", { itemId: item.id }] }));
    const guns: Row[] = GUNS.map((item) => ({ id: item.id, label: ITEM_LABELS[item.id] ?? item.id, price: item.trade?.buy?.cash ?? 0, run: ["shop.buy", { item: item.id }] }));
    return <Counter title="Ammu-Isle" rows={[...deals, ...guns]} leave="shop.close" extra={stars === 0 ? null : <KitButton size="sm" onClick={() => commands.run("shop.bribe", {})}>Bribe HHPD · ${stars * 250}</KitButton>} />;
  }
  if (!garage) return null;
  return <Counter title="Sunset Motors" rows={CARS.map((car) => ({ id: car.id, label: car.label, price: car.price, run: ["garage.buy", { vehicle: car.id }] }))} leave="garage.close" extra={bestLap === undefined ? null : <span>Ocean Loop best {bestLap.toFixed(1)} s</span>} />;
}
