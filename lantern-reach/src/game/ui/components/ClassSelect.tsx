import { GameIcon } from "@jgengine/react/gameIcons";
import { SettingsTrigger } from "@jgengine/react";
import { CreditsScreen } from "@jgengine/react/creditsScreen";
import { useMenuRouter } from "@jgengine/react/menuRouter";
import { CREDITS } from "./FieldMenu";
import { useGame, usePlayer } from "@jgengine/react/hooks";
import { type MouseEvent, useCallback, useState } from "react";

import { CLASSES } from "../../classes/catalog";
import {
  classSelectReady,
  isHeroNameValid,
  pickSuggestedName,
  selectClass,
} from "./classSelectState";

export function ClassSelect() {
  const { commands } = useGame();
  const menu = useMenuRouter<"callings" | "credits">("callings");
  const { userId } = usePlayer();
  void userId;
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(pickSuggestedName);
  const handleSelect = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const classId = event.currentTarget.dataset.classId;
    if (classId !== undefined) setSelected((current) => selectClass(current, classId));
  }, []);
  const ready = classSelectReady(selected, name);
  return (
    <div
      className="lantern-title-screen pointer-events-auto absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: "radial-gradient(ellipse at center, #15151f 0%, #08080d 80%)" }}
    >
      <nav className="lantern-title-tools lantern-tools" aria-label="Main menu">
        <button type="button" className="lantern-tool" onClick={() => menu.open("credits")}>Credits</button>
        <SettingsTrigger className="lantern-tool">Settings</SettingsTrigger>
      </nav>
      {menu.current === "credits" ? <div className="lantern-panel lantern-front-credits"><CreditsScreen document={CREDITS} /><button className="lantern-btn mt-5 px-5 py-2" type="button" onClick={menu.back}>Back to callings</button></div> :
      <div className="lantern-callings max-w-4xl px-6 text-center">
        <p
          className="text-sm uppercase tracking-[0.3em] text-[#c8a838]"
          style={{ fontFamily: "var(--lantern-font-display)" }}
        >
          Lantern Reach
        </p>
        <h1 className="lantern-title mt-1 text-4xl font-bold">Choose your calling</h1>
        <p className="mt-2 text-sm text-[#bdb69f]">
          A name, a calling, and a light against the dark.
        </p>
        <input
          type="text"
          value={name}
          maxLength={16}
          placeholder="Name your hero"
          onChange={(event) => setName(event.target.value)}
          className="lantern-panel mx-auto mt-6 block w-72 rounded-md px-4 py-2.5 text-center text-white placeholder:text-[#6b6350] focus:border-[#ffd100] focus:outline-none"
          style={{ fontSize: 16, fontFamily: "var(--lantern-font-display)", letterSpacing: "0.05em" }}
        />
        <div className="lantern-class-grid mt-6 grid grid-cols-3 gap-3">
          {CLASSES.map((cls) => {
            const sel = selected === cls.id;
            return (
              <button
                key={cls.id}
                type="button"
                data-class-id={cls.id}
                aria-pressed={sel}
                onClick={handleSelect}
                className="lantern-panel lantern-calling group flex min-h-[92px] items-center gap-3 px-4 py-3 text-left transition"
                style={
                  sel
                    ? { boxShadow: `0 0 16px ${cls.color}`, borderColor: cls.color }
                    : undefined
                }
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-[radial-gradient(circle_at_35%_30%,#2c2c3a,#15151f)]"
                  style={{ color: cls.color, borderColor: sel ? cls.color : "#4a3d1d" }}
                >
                  <GameIcon name={cls.icon} size={30} />
                </span>
                <span>
                  <span
                    className="block font-semibold"
                    style={{ color: cls.color, fontFamily: "var(--lantern-font-display)" }}
                  >
                    {cls.name}
                  </span>
                  <span className="block text-xs capitalize text-[#bdb69f]">{cls.resource}</span>
                  <span className="block text-xs text-[#bdb69f]">
                    {cls.abilities.slice(0, 2).map((ability) => ability.name).join(" · ")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            if (selected !== null && isHeroNameValid(name)) {
              commands.run("class.select", { classId: selected, name: name.trim() });
            }
          }}
          className="mt-8 rounded-lg px-14 py-3 text-2xl font-bold uppercase tracking-[3px] transition disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            fontFamily: "var(--lantern-font-display)",
            background: "linear-gradient(180deg, #f8da78 0%, #e2b03a 44%, #b7820f 100%)",
            color: "#2a1c05",
            border: "1px solid #ffe6a0",
            boxShadow: "0 2px 8px #000a, 0 0 26px rgba(255,209,0,0.28)",
          }}
        >
          Begin the journey
        </button>
      </div>}
    </div>
  );
}
