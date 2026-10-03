import { expect, test } from "bun:test";
import { RECIPES } from "./crafting/catalog";
import { GATHER_NODES } from "./professions/catalog";
import { validateLanternContent } from "./contentValidation";
import { DIALOGUES } from "./entities/npcs/dialogues";
import { QUESTS } from "./quests/catalog";
import { ROAD_CLEAR } from "./quests/lanternCatalog";

test("the original unreachable tool chain fails with content ids and repair paths", () => {
  const original = validateLanternContent({
    recipes: RECIPES.filter(recipe => !["recipe_mithril_mining_pick", "recipe_ironbark_axe", "recipe_silverleaf_sickle"].includes(recipe.id)),
    gatherNodes: GATHER_NODES.map(node => ({ ...node, skillReq: node.zone === "marsh" ? 100 : node.zone === "peaks" ? 200 : node.skillReq })),
    trainingWindow: 40,
  });
  for (const id of ["ore_mirefen", "wood_mirefen", "herb_mirefen", "recipe_thorium_mining_pick", "recipe_ashwood_axe", "recipe_goldleaf_sickle"]) {
    expect(original.some(issue => issue.severity === "error" && issue.contentId === id && issue.path.length > 0 && issue.repair.length > 0), id).toBe(true);
  }
});

test("missing tool sources and training gaps each independently invalidate progression", () => {
  const missingSources = validateLanternContent({ recipes: RECIPES.filter(recipe => !["recipe_mithril_mining_pick", "recipe_ironbark_axe", "recipe_silverleaf_sickle"].includes(recipe.id)) });
  expect(missingSources.some(issue => issue.severity === "error" && issue.contentId === "recipe_thorium_mining_pick" && issue.message.includes("mithril_mining_pick") && issue.repair.length > 0)).toBe(true);
  const skillGap = validateLanternContent({ trainingWindow: 40 });
  expect(skillGap.some(issue => issue.severity === "error" && issue.contentId === "recipe_thorium_mining_pick" && issue.message.includes("crafting:75") && issue.repair.length > 0)).toBe(true);
});

test("a known quest offered by the wrong resident fails its declared relationship", () => {
  const dialogues = DIALOGUES.map(dialogue => dialogue.id !== "dlg_marshal_redbrook" ? dialogue : {
    ...dialogue,
    lines: dialogue.lines.map(line => !line.choices ? line : { ...line, choices: line.choices.map(choice => choice.invoke?.command !== "quest.accept" ? choice : { ...choice, invoke: { ...choice.invoke, args: { questId: "q_spiders" } } }) }),
  });
  expect(validateLanternContent({ dialogues }).some(issue => issue.code === "inconsistent-reference" && issue.contentId === "dlg_marshal_redbrook" && issue.referenceId === "q_spiders" && issue.repair.length > 0)).toBe(true);
});

test("valid custom recipe authoring passes while broken native references and amounts fail", () => {
  expect(validateLanternContent({ recipes: [...RECIPES, { id: "lin_small_batch", category: "clinic-barter", inputs: [{ itemId: "spider_leg", count: 2 }], outputs: [{ itemId: "minor_healing_potion", count: 1 }] }] })).toEqual([]);
  const invalid = validateLanternContent({ recipes: [...RECIPES, { id: "bad_batch", inputs: [{ itemId: "spider_typo", count: -1 }], outputs: [{ itemId: "minor_healing_potion", count: 1 }] }] });
  expect(invalid.some(issue => issue.severity === "error" && issue.referenceId === "spider_typo" && issue.repair.length > 0)).toBe(true);
  expect(invalid.some(issue => issue.severity === "error" && issue.path.includes("count"))).toBe(true);
});

test("custom unlock recipes follow declared rewards, and unsupported station ranges fail authoring", () => {
  const gated = { id: "road_watch_batch", requires: [ROAD_CLEAR], inputs: [{ itemId: "bone_fragments", count: 1 }], outputs: [{ itemId: "minor_healing_potion", count: 1 }] };
  expect(validateLanternContent({ recipes: [...RECIPES, gated] })).toEqual([]);
  expect(validateLanternContent({ recipes: [...RECIPES, { ...gated, requires: ["q_wolves"] }] }).some(issue => issue.severity === "error" && issue.contentId === gated.id)).toBe(true);
  expect(validateLanternContent({ recipes: [...RECIPES, { ...gated, station: "forge", stationRange: 1 }] }).some(issue => issue.code === "unsupported-lantern-craft-context" && issue.path.endsWith("stationRange"))).toBe(true);
});

test("missing native quest objective and dialogue command fields fail before play", () => {
  const quests = QUESTS.map(quest => quest.id === "q_wolves" ? { ...quest, objectives: quest.objectives.map(objective => ({ ...objective, target: undefined })) } : quest.id === "q_boars" ? { ...quest, objectives: quest.objectives.map(objective => ({ ...objective, item: undefined })) } : quest);
  expect(validateLanternContent({ quests }).some(issue => issue.contentId === "q_wolves" && issue.path.endsWith("target") && issue.severity === "error")).toBe(true);
  expect(validateLanternContent({ quests }).some(issue => issue.contentId === "q_boars" && issue.path.endsWith("item") && issue.severity === "error")).toBe(true);
  const dialogues = DIALOGUES.map(dialogue => dialogue.id === "dlg_marshal_redbrook" ? { ...dialogue, lines: [{ choices: [{ label: "Broken acceptance", invoke: { command: "quest.accept", args: {} } }] }] } : dialogue.id === "dlg_trader_wilkes" ? { ...dialogue, lines: [{ choices: [{ label: "Broken shop", invoke: { command: "shop.open", args: {} } }] }] } : dialogue);
  expect(validateLanternContent({ dialogues }).some(issue => issue.contentId === "dlg_marshal_redbrook" && issue.severity === "error" && issue.message.includes("questId"))).toBe(true);
  expect(validateLanternContent({ dialogues }).some(issue => issue.contentId === "dlg_trader_wilkes" && issue.severity === "error" && issue.message.includes("shopId"))).toBe(true);
});


test("custom dialogue commands retain game-owned argument shapes", () => {
  const dialogues = DIALOGUES.map(dialogue => dialogue.id !== "dlg_marshal_redbrook" ? dialogue : { ...dialogue, lines: [...dialogue.lines, { choices: [{ label: "Record the marshal’s note", invoke: { command: "quest.custom-note", args: { note: "Eastbrook road ledger" } } }] }] });
  expect(validateLanternContent({ dialogues })).toEqual([]);
});
