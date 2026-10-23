import { useCurrency, useEntityStat, useGame, usePlayer } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { useStore } from "@jgengine/react/store";
import { shopStore } from "../../commands";
import { marketStore } from "../../items/nightMarket";
import { wantedStore } from "../../handroll";
import { GEAR, WEAPONS } from "../../items/weapons/catalog";
import { ITEM_LABELS } from "../../content";
import { CRED_GATES } from "../../progression/cred";

const STOCK = [...WEAPONS, ...GEAR].filter((item) => item.trade?.buy !== undefined && item.trade.shops?.includes("shop_ammunation"));

function BribeButton() {
  const { commands } = useGame();
  const stars = useStore(wantedStore, (wanted) => wanted?.stars ?? 0);
  if (stars === 0) return null;
  return (
    <HudButton onClick={() => commands.run("shop.bribe", {})} className="hh-street-button hh-street-bribe mx-3 mb-1">
      Bribe HHPD — ${stars * 250} clears {stars}★
    </HudButton>
  );
}

export function ShopPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useStore(shopStore, (v) => v ?? null);
  const market = useStore(marketStore);
  const cash = useCurrency("cash");
  const cred = useEntityStat(userId, "level")?.current ?? 1;
  if (open === null) return null;
  return (
    <HudSurface className="hh-counter w-80" padding={0}>
      <div className="flex items-center justify-between border-b-2 border-black bg-[#ffb020] px-3 py-2">
        <span className="text-sm font-black uppercase tracking-widest">Ammu-Isle</span>
        <span className="-skew-x-6 border-2 border-black bg-[#2f8f4e] px-2 text-sm font-black text-[#eaffdd]">${cash.toLocaleString()}</span>
      </div>
      {market !== null && market.items.length > 0 ? (
        <div className="border-b-2 border-black bg-[#6d2f8f] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white">
          Night market - restocks daily
        </div>
      ) : null}
      {market?.items.map((item) => (
        <HudButton
          key={item.id}
          block
          disabled={cash < item.price}
          onClick={() => commands.run("market.buy", { itemId: item.id })}
          className="hh-counter-row hh-counter-row-gold"
        >
          <span>
            {item.name}
            <span className="ml-1 text-[10px] text-[#f4e8c8]/70">
              {item.rarity} lvl {item.level}
            </span>
          </span>
          <span className="tabular-nums">${item.price}</span>
        </HudButton>
      ))}
      <div className="flex flex-col gap-1 p-3">
        {STOCK.map((item) => {
          const price = item.trade?.buy?.cash ?? 0;
          const gate = CRED_GATES[item.id];
          const locked = gate !== undefined && cred < gate;
          const affordable = cash >= price && !locked;
          return (
            <HudButton
              key={item.id}
              block
              disabled={!affordable}
              onClick={() => commands.run("shop.buy", { item: item.id })}
              className="hh-counter-row hh-counter-row-gold"
            >
              <span>{ITEM_LABELS[item.id] ?? item.id}</span>
              {locked ? (
                <span className="-skew-x-6 border border-black bg-[#6d2f8f] px-1 text-[10px] text-white">CRED {gate}</span>
              ) : (
                <span className="tabular-nums">${price}</span>
              )}
            </HudButton>
          );
        })}
      </div>
      <BribeButton />
      <HudButton onClick={() => commands.run("shop.close", {})} className="hh-street-button hh-street-leave m-3 mt-0">
        Leave
      </HudButton>
    </HudSurface>
  );
}
