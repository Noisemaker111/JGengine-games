import { createKeyValueStore, type KeyValueStorage } from "@jgengine/core/game/keyValueStore";
import { createQuestEvaluator, type QuestSnapshotEntry } from "@jgengine/core/game/quest";
import { defineStore } from "@jgengine/core/store/defineStore";
import { keybind, proximityPrompt, resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/shell/gameKit";
import type { LifecycleConfig } from "@jgengine/core/game/defineGame";
import { actionContextStack } from "@jgengine/core/game/controlGate";
import { syncLifecyclePhase } from "@jgengine/core/game/gamePhase";
import { editorLayers } from "../editorLayers";
import { keybinds } from "./keybinds";

const QUEST_ID = "field-notes";
const evaluator = createQuestEvaluator([{
  id: QUEST_ID, title: "Prairie field survey",
  objectives: [
    { id: "meadow", kind: "observe", count: 1 },
    { id: "water", kind: "observe", count: 1 },
  ],
}]);

export interface SurveyProfile { reports: number; bestQuality: number }
export interface SurveyState {
  phase: "menu" | "playing" | "paused";
  notes: QuestSnapshotEntry[];
  hazardSample: boolean;
  profile: SurveyProfile;
  feedback: string;
  feedbackSeconds: number;
  rescued: boolean;
}

function freshNotes(): QuestSnapshotEntry[] {
  const result = evaluator.accept([], QUEST_ID);
  if (!Array.isArray(result)) throw new Error(result.reason);
  return result;
}

export const survey = defineStore<SurveyState>("field-station.survey", () => ({
  phase: "menu",
  notes: freshNotes(), hazardSample: false,
  profile: { reports: 0, bestQuality: 0 }, feedback: "", feedbackSeconds: 0, rescued: false,
}));

function freeze(ctx: GameContext, frozen: boolean): void {
  const actor = ctx.scene.entity.get(ctx.player.userId);
  if (actor !== null) ctx.scene.entity.update(actor.id, { movement: { ...actor.movement, frozen } });
}

export const surveyLifecycle: LifecycleConfig<SurveyState> = {
  store: survey,
  start: (state, ctx) => { freeze(ctx, false); return { ...state, phase: "playing" }; },
  restart: (state, ctx) => {
    ctx.scene.entity.resetToSpawn(ctx.player.userId);
    freeze(ctx, false);
    return { ...state, phase: "playing", notes: freshNotes(), hazardSample: false, feedbackSeconds: 0 };
  },
  phaseOf: (state) => state.phase,
};

export function toggleSurveyPause(ctx: GameContext): void {
  survey.update(ctx, (state) => state.phase === "menu" ? state : { ...state, phase: state.phase === "paused" ? "playing" : "paused" });
  freeze(ctx, survey.read(ctx).phase !== "playing");
  syncLifecyclePhase(ctx, surveyLifecycle);
}

export function freezeSurveyPlayer(ctx: GameContext): void {
  freeze(ctx, survey.read(ctx).phase !== "playing");
  // Published shell snapshots bindings at mount; retain codes behind the inactive menu gate until the input release.
  if (survey.read(ctx).phase === "menu") actionContextStack(ctx).push({ id: "menu", codes: keybinds, passthrough: false });
}

function profileSave(storage?: KeyValueStorage | null) {
  return createKeyValueStore<SurveyProfile>({
    key: "field-station.reports.v1", initial: { reports: 0, bestQuality: 0 },
    ...(storage === undefined ? {} : { storage }),
    deserialize(raw) {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null) throw new Error("Invalid report save");
      const data = value as Record<string, unknown>;
      if (!Number.isSafeInteger(data.reports) || Number(data.reports) < 0 ||
          !Number.isSafeInteger(data.bestQuality) || Number(data.bestQuality) < 0 || Number(data.bestQuality) > 3) {
        throw new Error("Invalid report save");
      }
      return { reports: Number(data.reports), bestQuality: Number(data.bestQuality) };
    },
  });
}

export function initSurvey(ctx: GameContext, storage?: KeyValueStorage | null): void {
  survey.write(ctx, { ...survey.read(ctx), notes: freshNotes(), hazardSample: false, profile: profileSave(storage).get() });
  ctx.game.commands.define("survey.interact", { apply: (context) => { interactSurvey(context, storage); } });
  ctx.game.commands.define("survey.pause", { apply: (context) => toggleSurveyPause(context) });
}

export const surveySites = editorLayers.markers.filter((marker) => marker.kind === "survey_point").map((marker) => ({
  id: marker.id, label: marker.label ?? marker.id,
  role: String(marker.meta?.role ?? "sample"), sample: String(marker.meta?.sample ?? ""),
  position: marker.position,
  prompt: proximityPrompt({ radius: Number(marker.meta?.triggerRadius ?? 3), display: keybind("interact", marker.label) }),
}));

export function collected(state: SurveyState, sample: string): boolean {
  return sample === "hazard" ? state.hazardSample : (state.notes[0]?.progress[sample] ?? 0) >= 1;
}

export function noteCount(state: SurveyState): number {
  return Number(collected(state, "meadow")) + Number(collected(state, "water")) + Number(state.hazardSample);
}

export function nearbySurveySite(ctx: GameContext) {
  const actor = ctx.scene.entity.get(ctx.player.userId);
  if (actor === null) return null;
  return resolveActivePrompt({ x: actor.position[0], z: actor.position[2] }, surveySites);
}

function feedback(ctx: GameContext, message: string): void {
  survey.update(ctx, (state) => ({ ...state, feedback: message, feedbackSeconds: 5, rescued: false }));
}

export function interactSurvey(ctx: GameContext, storage?: KeyValueStorage | null): void {
  if (survey.read(ctx).phase !== "playing") return;
  const site = nearbySurveySite(ctx);
  if (site === null) { feedback(ctx, "Move closer to a survey site or the station desk."); return; }
  const state = survey.read(ctx);
  if (site.role === "station") {
    const rejection = evaluator.canTurnIn(state.notes, QUEST_ID);
    if (rejection !== null) { feedback(ctx, "Collect meadow and pond notes before filing a report."); return; }
    const quality = noteCount(state);
    const profile = { reports: state.profile.reports + 1, bestQuality: Math.max(state.profile.bestQuality, quality) };
    profileSave(storage).set(profile);
    const persisted = profileSave(storage).get().reports === profile.reports;
    survey.write(ctx, { ...state, notes: freshNotes(), hazardSample: false, profile,
      feedback: `Report filed: ${quality}/3 observations. ${persisted ? "Banked reports survive reload." : "Storage unavailable; this report is kept for this session only."}`,
      feedbackSeconds: 6, rescued: false });
    return;
  }
  if (!["meadow", "water", "hazard"].includes(site.sample)) return;
  if (collected(state, site.sample)) { feedback(ctx, "This observation is already in your notebook."); return; }
  survey.write(ctx, { ...state,
    notes: site.sample === "hazard" ? state.notes : evaluator.progress(state.notes, QUEST_ID, site.sample, 1),
    hazardSample: state.hazardSample || site.sample === "hazard",
    feedback: site.sample === "hazard" ? "Scorch sample taken. Leave the hazard and file your notes." : `${site.label} recorded.`,
    feedbackSeconds: 5, rescued: false });
}

export function rescueSurvey(ctx: GameContext): void {
  const state = survey.read(ctx);
  const lost = noteCount(state);
  survey.write(ctx, { ...state, notes: freshNotes(), hazardSample: false,
    feedback: `Rescued at the station. ${lost} unfiled observation${lost === 1 ? "" : "s"} lost; banked reports kept.`,
    feedbackSeconds: 6, rescued: true });
}

export function tickSurvey(ctx: GameContext, dt: number): void {
  if (ctx.input.justPressed("interact")) ctx.game.commands.run("survey.interact", null);
  const state = survey.read(ctx);
  if (state.feedbackSeconds > 0) survey.write(ctx, { ...state, feedbackSeconds: Math.max(0, state.feedbackSeconds - dt) });
}

export function surveyProbe(ctx: GameContext): Record<string, number> {
  const position = ctx.scene.entity.get(ctx.player.userId)?.position ?? [0, 0, 0];
  const state = survey.read(ctx);
  return { x: position[0], y: position[1], z: position[2], notes: noteCount(state), reports: state.profile.reports,
    quality: state.profile.bestQuality, playing: Number(state.phase === "playing"),
    health: ctx.scene.entity.stats.get(ctx.player.userId, "health")?.current ?? 0 };
}
