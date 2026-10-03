import { validateContentProgression, validateContentReferences, type ContentEntry, type ContentIssue, type ContentReference } from "@jgengine/core/game/contentValidation";
import { validateQuestCatalog } from "@jgengine/core/game/questCatalog";
import { validateRecipeCatalog } from "@jgengine/core/crafting/recipeCatalog";
import type { RecipeDef } from "@jgengine/core/crafting/recipe";
import { CLASSES } from "./classes/catalog";
import { CRAFT_TRAINING_WINDOW, FISH_TABLE, RECIPES, RECIPE_SKILL } from "./crafting/catalog";
import { MOBS } from "./entities/enemies/catalog";
import { NPCS } from "./entities/npcs/catalog";
import { DIALOGUES } from "./entities/npcs/dialogues";
import { ITEMS } from "./items/catalog";
import type { GatherNodeDef, ProfessionId } from "./model";
import { GATHER_NODES, PROFESSIONS, STARTING_PROFESSION_SKILL } from "./professions/catalog";
import { QUESTS } from "./quests/catalog";

export interface LanternAuthoringInput {
  recipes?: readonly RecipeDef[];
  gatherNodes?: readonly GatherNodeDef[];
  trainingWindow?: number;
  dialogues?: typeof DIALOGUES;
  quests?: typeof QUESTS;
}

/** Lantern checks possible supply and repeatable training, assuming mobs/vendors/fishing are accessible.
 * Quantities, consumption, location access, currency costs and exclusive story outcomes remain game policy. */
export function validateLanternContent(input: LanternAuthoringInput = {}): ContentIssue[] {
  const recipes = input.recipes ?? RECIPES;
  const gatherNodes = input.gatherNodes ?? GATHER_NODES;
  const trainingWindow = input.trainingWindow ?? CRAFT_TRAINING_WINDOW;
  const dialogues = input.dialogues ?? DIALOGUES;
  const quests = input.quests ?? QUESTS;
  const entries: ContentEntry[] = [];
  const refs: ContentReference[] = [];
  const gameIssues: ContentIssue[] = [];
  const invalid = (path: string, contentId: string, message: string, repair: string) => gameIssues.push({ code: "invalid-lantern-contract", severity: "error", path, contentId, message, repair });
  const add = (kind: string, id: string, path: string) => entries.push({ kind, id, path });
  const ref = (kind: string, id: string, path: string, contentId: string, allowedIds?: readonly string[]) => refs.push({ kind, id, path, contentId, ...(allowedIds === undefined ? {} : { allowedIds }) });
  for (const [i, item] of ITEMS.entries()) add("item", item.id, `/items/${i}`);
  for (const [i, mob] of MOBS.entries()) {
    add("mob", mob.id, `/mobs/${i}`);
    for (const [j, drop] of mob.drops.entries()) if (drop.itemId !== undefined) ref("item", drop.itemId, `/mobs/${i}/drops/${j}/itemId`, mob.id);
  }
  const shops = new Set(NPCS.flatMap(npc => npc.shopId === undefined ? [] : [npc.shopId]));
  for (const shop of shops) add("shop", shop, `/shops/${shop}`);
  for (const [i, item] of ITEMS.entries()) for (const [j, shop] of (item.shops ?? []).entries()) ref("shop", shop, `/items/${i}/shops/${j}`, item.id);
  for (const [i, npc] of NPCS.entries()) {
    add("npc", npc.id, `/npcs/${i}`);
    if (npc.kind === "questgiver") add("questgiver", npc.id, `/npcs/${i}`);
    if (npc.dialogueId !== undefined) ref("dialogue", npc.dialogueId, `/npcs/${i}/dialogueId`, npc.id);
  }
  const npcsByDialogue = new Map(NPCS.map(npc => [npc.dialogueId, npc]));
  const questOffers = new Map<string, string[]>();
  for (const quest of quests) for (const [command, npc] of [["quest.accept", quest.giver], ["quest.turnIn", quest.turnIn]] as const) {
    if (npc === undefined) continue;
    const key = `${command}:${npc}`, offers = questOffers.get(key) ?? [];
    offers.push(quest.id); questOffers.set(key, offers);
  }
  for (const [i, dialogue] of dialogues.entries()) {
    add("dialogue", dialogue.id, `/dialogues/${i}`);
    for (const [j, line] of dialogue.lines.entries()) for (const [k, choice] of ("choices" in line ? line.choices : []).entries()) {
      const invoke = choice.invoke;
      if (invoke === null || invoke === undefined) continue;
      const kind = (invoke.command === "quest.accept" || invoke.command === "quest.turnIn") ? "quest" : invoke.command === "shop.open" ? "shop" : null;
      const args = invoke.args as Record<string, unknown> | undefined;
      const id = kind === "quest" ? args?.questId : args?.shopId;
      const npc = npcsByDialogue.get(dialogue.id);
      const allowed = kind === "quest" && npc !== undefined ? questOffers.get(`${invoke.command}:${npc.id}`) ?? [] : undefined;
      if (kind !== null && typeof id !== "string") invalid(`/dialogues/${i}/lines/${j}/choices/${k}/invoke/args`, dialogue.id, `${invoke.command} requires a string ${kind === "quest" ? "questId" : "shopId"}.`, "Set the command argument to a declared quest or shop id.");
      if (kind !== null && typeof id === "string") ref(kind, id, `/dialogues/${i}/lines/${j}/choices/${k}/invoke/args/${kind === "quest" ? "questId" : "shopId"}`, dialogue.id, allowed);
    }
  }
  for (const [i, quest] of quests.entries()) {
    add("quest", quest.id, `/quests/${i}`);
    for (const [j, objective] of quest.objectives.entries()) {
      const field = objective.kind === "kill" ? "target" : objective.kind === "collect" ? "item" : null;
      if (field !== null && typeof objective[field] !== "string") invalid(`/quests/${i}/objectives/${j}/${field}`, quest.id, `${objective.kind} objective requires ${field}.`, `Set ${field} to an existing ${field === "target" ? "mob" : "item"} id.`);
    }
    if (quest.giver !== undefined) {
      ref("questgiver", quest.giver, `/quests/${i}/giver`, quest.id);
    }
    if (quest.turnIn !== undefined) {
      ref("questgiver", quest.turnIn, `/quests/${i}/turnIn`, quest.id);
    }
  }
  for (const [i, cls] of CLASSES.entries()) {
    ref("item", cls.startWeapon, `/classes/${i}/startWeapon`, cls.id);
    for (const [j, ability] of cls.abilities.entries()) add("ability", ability.id, `/classes/${i}/abilities/${j}`);
  }
  for (const [i, node] of gatherNodes.entries()) for (const [j, material] of node.materials.entries()) ref("item", material.itemId, `/gather/${i}/materials/${j}/itemId`, node.id);
  for (const [i, node] of gatherNodes.entries()) add("gather", node.id, `/gather/${i}`);
  for (const [i, fish] of FISH_TABLE.entries()) ref("item", fish.itemId, `/fish/${i}/itemId`, fish.itemId);
  const ids = new Map<string, Set<string>>();
  for (const entry of entries) {
    const set = ids.get(entry.kind) ?? new Set<string>();
    set.add(entry.id); ids.set(entry.kind, set);
  }
  const issues = [...gameIssues, ...validateContentReferences(entries, refs)];
  for (const [i, recipe] of recipes.entries()) if (recipe.station !== undefined && recipe.stationRange !== undefined && recipe.stationRange > 0) issues.push({ code: "unsupported-lantern-craft-context", severity: "error", path: `/recipes/${i}/stationRange`, contentId: recipe.id, message: "Lantern crafting does not supply station positions and player origin for ranged station checks.", repair: "Use the supported forge contract without stationRange, or wire authored station positions and origin in the game before adding ranged recipes." });
  const unlocks = new Set(quests.flatMap(quest => quest.rewards?.unlocks ?? []));
  issues.push(...validateRecipeCatalog(recipes, { hasReference: (kind, id) => kind === "station" ? id === "forge" : kind === "unlock" ? unlocks.has(id) : ids.get(kind)?.has(id) === true }).map(issue => ({ ...issue, path: `/recipes${issue.path}` })));
  issues.push(...validateQuestCatalog(quests, {
    hasReference(kind, id, context) {
      if (kind === "inventory") return id === "bags" || id === "bank";
      if (kind === "currency") return id === "copper";
      return ids.get(kind === "target" ? context.objective?.kind === "talk" ? "npc" : "mob" : kind)?.has(id) === true;
    },
  }).map(issue => ({ ...issue, contentId: issue.questId, path: `/quests${issue.path}`, repair: "Repair the referenced Lantern catalog entry or declare the external quest grant that supplies it." })));
  const fact = (kind: string, id: string | number) => `${kind}:${id}`;
  const initial = new Set<string>();
  for (const mob of MOBS) for (const drop of mob.drops) if (drop.itemId !== undefined && drop.chance > 0) initial.add(fact("item", drop.itemId));
  for (const item of ITEMS) if (item.buyPrice !== undefined && item.shops?.some(shop => shops.has(shop))) initial.add(fact("item", item.id));
  for (const cls of CLASSES) initial.add(fact("item", cls.startWeapon));
  const rules: { id: string; path: string; requires: string[]; provides: string[] }[] = [];
  const required: { id: string; path: string; contentId: string }[] = [];
  const milestones = new Map<ProfessionId, Set<number>>();
  for (const profession of ["mining", "logging", "herbalism", "crafting", "fishing"] as const) milestones.set(profession, new Set([0, STARTING_PROFESSION_SKILL]));
  for (const node of gatherNodes) { milestones.get(node.profession)!.add(node.skillReq); milestones.get(node.profession)!.add(node.skillUpTo); }
  for (const recipe of recipes) milestones.get("crafting")!.add(RECIPE_SKILL[recipe.id] ?? 0);
  for (const fish of FISH_TABLE) milestones.get("fishing")!.add(fish.minSkill);
  const skills = (profession: ProfessionId, cap: number) => [...milestones.get(profession)!].filter(n => n <= cap).map(n => fact(profession, n));
  for (const profession of milestones.keys()) for (const skill of skills(profession, STARTING_PROFESSION_SKILL)) initial.add(skill);
  for (const [i, node] of gatherNodes.entries()) {
    const id = fact("gather", node.id), path = `/gather/${i}`;
    const maxSkill = PROFESSIONS.find(profession => profession.id === node.profession)!.maxSkill;
    rules.push({ id: node.id, path, requires: [fact(node.profession, node.skillReq)], provides: [id, ...node.materials.filter(m => m.max > 0).map(m => fact("item", m.itemId)), ...skills(node.profession, Math.min(node.skillUpTo, maxSkill))] });
    required.push({ id, path, contentId: node.id });
  }
  for (const [i, recipe] of recipes.entries()) {
    const req = RECIPE_SKILL[recipe.id] ?? 0, id = fact("recipe", recipe.id), path = `/recipes/${i}`;
    rules.push({ id: recipe.id, path, requires: [fact("crafting", req), ...recipe.inputs.filter(item => item.count > 0).map(item => fact("item", item.itemId)), ...(recipe.requires ?? []).map(id => fact("unlock", id))], provides: [id, ...recipe.outputs.filter(item => item.count > 0).map(item => fact("item", item.itemId)), ...skills("crafting", Math.min(300, req + trainingWindow))] });
    required.push({ id, path, contentId: recipe.id });
  }
  rules.push({ id: "successful-fishing", path: "/fishing", requires: [fact("fishing", STARTING_PROFESSION_SKILL)], provides: skills("fishing", 300) });
  for (const [i, fish] of FISH_TABLE.entries()) rules.push({ id: `fish:${fish.itemId}`, path: `/fish/${i}`, requires: [fact("fishing", fish.minSkill)], provides: [fact("item", fish.itemId)] });
  for (const [i, quest] of quests.entries()) {
    const path = `/quests/${i}`, id = fact("quest", quest.id);
    rules.push({ id: quest.id, path, requires: [...(quest.requires ?? []).map(id => fact("requirement", id)), ...quest.objectives.filter(o => o.item !== undefined && o.count > 0).map(o => fact("item", o.item!))], provides: [id, fact("requirement", quest.id), ...(quest.rewards?.unlocks ?? []).flatMap(id => [fact("unlock", id), fact("requirement", id)]), ...(quest.rewards?.items ?? []).filter(item => item.count > 0).map(item => fact("item", item.item))] });
    required.push({ id, path, contentId: quest.id });
  }
  issues.push(...validateContentProgression({ initial: [...initial], rules, required, closedWorld: true }).issues);
  return issues;
}
