import { useStore } from "@jgengine/react/store";
import { CARGO_CAPACITY, cargoStore } from "../../items/cargoHaul";

export function CargoPanel() {
  const cargo = useStore(cargoStore);
  return (
    <div className="-skew-x-3 w-56 border-2 border-black bg-[#12141a]/90 px-3 py-2 shadow-[3px_3px_0_#000]">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-black uppercase tracking-widest text-[#ffb020]">Cargo hold</span>
        <span className="text-[11px] font-bold tabular-nums text-[#f4e8c8]/80">
          {cargo.weight}/{CARGO_CAPACITY}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs font-bold text-[#f4e8c8]">
        <span>Carried crates</span>
        <span className="tabular-nums text-[#ffb020]">{cargo.carried}</span>
      </div>
      <div className="flex items-center justify-between text-xs font-bold text-[#f4e8c8]">
        <span>Lockup</span>
        <span className="tabular-nums text-[#3fbf5a]">{cargo.stashed}</span>
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#f4e8c8]/60">
        Job fails - cargo lost. Lockup stays.
      </div>
    </div>
  );
}
