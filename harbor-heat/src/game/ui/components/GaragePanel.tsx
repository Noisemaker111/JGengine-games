import { useCurrency, useEntityStat, useGame, usePlayer } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudPanel as HudFrame } from "@jgengine/react/hudPanel";
import { useStore } from "@jgengine/react/store";
import { bestRaceStore, garageStore } from "../../commands";
import { VEHICLES } from "../../entities/vehicles/catalog";
import { CRED_GATES } from "../../progression/cred";

const STOCK = VEHICLES.filter((v) => v.price > 0);

export function GaragePanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useStore(garageStore, (v) => v ?? false);
  const cash = useCurrency("cash");
  const cred = useEntityStat(userId, "level")?.current ?? 1;
  const bestLap = useStore(bestRaceStore, (v) => v);
  if (!open) return null;
  return (
    <HudFrame className="hh-counter w-80" padding={0}>
      <div className="flex items-center justify-between border-b-2 border-black bg-[#33c1b1] px-3 py-2">
        <span className="text-sm font-black uppercase tracking-widest">Sunset Motors</span>
        <span className="-skew-x-6 border-2 border-black bg-[#2f8f4e] px-2 text-sm font-black text-[#eaffdd]">${cash.toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        {STOCK.map((car) => {
          const gate = CRED_GATES[car.id];
          const locked = gate !== undefined && cred < gate;
          const affordable = cash >= car.price && !locked;
          return (
            <HudButton
              key={car.id}
              block
              disabled={!affordable}
              onClick={() => commands.run("garage.buy", { vehicle: car.id })}
              className="hh-counter-row hh-counter-row-teal"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-6 -skew-x-12 border border-black" style={{ background: car.body }} />
                {car.label}
              </span>
              {locked ? (
                <span className="-skew-x-6 border border-black bg-[#6d2f8f] px-1 text-[10px] text-white">CRED {gate}</span>
              ) : (
                <span className="tabular-nums">${car.price.toLocaleString()}</span>
              )}
            </HudButton>
          );
        })}
      </div>
      {bestLap !== undefined ? (
        <div className="mx-3 mb-1 border-2 border-black bg-[#12141a]/90 px-2 py-1 text-[10px] font-black uppercase text-[#33c1b1]">
          Ocean Loop best — {bestLap.toFixed(1)}s
        </div>
      ) : null}
      <HudButton onClick={() => commands.run("garage.close", {})} className="hh-street-button hh-street-leave m-3 mt-0">
        Leave
      </HudButton>
    </HudFrame>
  );
}
