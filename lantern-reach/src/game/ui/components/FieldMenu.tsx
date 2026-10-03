import { KeyHint, PanelHost, SettingsTrigger, type PanelsManager } from "@jgengine/react";
import { CreditsScreen } from "@jgengine/react/creditsScreen";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useGame } from "@jgengine/react/hooks";
import type { CreditsDocument } from "@jgengine/core/game/credits";
import { Minimap } from "./Minimap";

export const FIELD_WINDOWS = [
  { id: "field", title: "Field journal", group: "reference" },
  { id: "credits", title: "The makers", group: "reference" },
  { id: "map", title: "Survey map", group: "reference" },
] as const;
const TOOLS = [
  { command: "openBags", label: "Backpack", key: "B", icon: "backpack" },
  { command: "openCharacter", label: "Character", key: "C", icon: "shield" },
  { command: "openQuestLog", label: "Quest journal", key: "L", icon: "scroll" },
  { command: "openSpellbook", label: "Spellbook", key: "P", icon: "tome" },
  { command: "openTalents", label: "Talents", key: "N", icon: "star" },
  { command: "openArena", label: "Arena", key: "G", icon: "sword" },
] as const;
export const CREDITS: CreditsDocument = {
  title: "Lantern Reach",
  sections: [
    { heading: "Original game", entries: [{ label: "Levy Street", detail: "World of ClaudeCraft · MIT", href: "https://github.com/levy-street/world-of-claudecraft" }] },
    { heading: "Engine", entries: [{ label: "JGengine", detail: "Game runtime and interface · Apache 2.0" }] },
    { heading: "Models", entries: [{ label: "Kay Lousberg (KayKit)", detail: "Character models · CC0", href: "https://kaylousberg.com/game-assets" }, { label: "KayKit Dungeon Remastered", detail: "Mounted torch models · CC0 · Kay Lousberg", href: "https://kaylousberg.itch.io/kaykit-dungeon-remastered" }, { label: "Quaternius", detail: "Fantasy character and creature packs · CC0", href: "https://quaternius.com" }, { label: "Quaternius Medieval Village MegaKit", detail: "Environment art · CC0", href: "https://quaternius.com/packs/medievalvillagemegakit.html" }, { label: "Quaternius Stylized Nature MegaKit", detail: "Environment art · CC0", href: "https://quaternius.com/packs/stylizednaturemegakit.html" }] },
  ],
};

export function FieldMenu({ manager }: { manager: PanelsManager }) {
  const { commands } = useGame();
  return <nav className="lantern-tools" aria-label="Field tools">
      <button type="button" className="lantern-tool" aria-label="Backpack" title="Backpack (B)" onClick={() => commands.run("openBags", {})}><GameIcon name="backpack" size={20} /><span>Bag</span><KeyHint>B</KeyHint></button>
      <button type="button" className="lantern-tool" onClick={() => manager.toggle("field")}><GameIcon name="tome" size={20} /><span>Journal</span></button>
      <SettingsTrigger className="lantern-tool"><GameIcon name="gear" size={20} /><span>Settings</span></SettingsTrigger>
    </nav>;
}

export function FieldWindows({ manager }: { manager: PanelsManager }) {
  const { commands } = useGame();
  return <PanelHost manager={{ ...manager, defs: FIELD_WINDOWS }} variation="themed" width="min(360px, calc(var(--lantern-hud-width, 100vw) - 32px))" windowClassName="lantern-reference-window" bodyStyle={{ maxHeight: "min(65dvh, 540px)", overflowY: "auto", padding: 16 }} render={(id) => {
      if (id === "credits") return <CreditsScreen document={CREDITS} />;
      if (id === "map") return <div className="lantern-map-sheet"><Minimap expanded /><p className="mt-3 text-sm text-[#c9c3ad]">◆ Quest contact · ● Townsperson · red: hostile</p></div>;
      return <div className="lantern-journal-menu">
        <p className="lantern-eyebrow">Your road through the Reach</p>
        {TOOLS.map((tool) => <button type="button" className="lantern-menu-row" key={tool.command} onClick={() => { manager.close("field"); commands.run(tool.command, {}); }}><GameIcon name={tool.icon} size={22} /><span>{tool.label}</span><KeyHint>{tool.key}</KeyHint></button>)}
        <button type="button" className="lantern-menu-row" onClick={() => manager.open("map")}><GameIcon name="map" size={22} /><span>Survey map</span></button>
        <button type="button" className="lantern-menu-row" onClick={() => manager.open("credits")}><span className="text-lg">✦</span><span>The makers · Credits</span></button>

      </div>;
    }} />;
}
