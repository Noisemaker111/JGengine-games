import type { EditorDocument } from "@jgengine/core/editor/types";
import type { GameLoop } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { forgetPlayerMovement } from "@jgengine/core/movement/playerMovement";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createAuthoredTriggerRuntime, type AuthoredTriggerRuntime } from "@jgengine/core/scene/authoredTriggers";
import { resolveAuthoredObjects } from "@jgengine/core/world/authoredObjects";
import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";

import "./game/course/catalog";
import { assets } from "./game/assets";

export interface CourseRun {
  phase: "menu" | "running" | "paused" | "tumbled" | "finished";
  elapsed: number;
  falls: number;
  checkpoint: string | null;
}

export const RUN_KEY = "cloud-course.run";
export const INITIAL_RUN: CourseRun = { phase: "menu", elapsed: 0, falls: 0, checkpoint: null };

export function courseRun(ctx: GameContext): CourseRun {
  return (ctx.game.store.get(RUN_KEY) as CourseRun | undefined) ?? INITIAL_RUN;
}

function writeRun(ctx: GameContext, state: CourseRun): void {
  ctx.game.store.set(RUN_KEY, state);
  setGamePhase(ctx, state.phase === "running" ? "playing" : state.phase === "menu" ? "menu" : state.phase === "finished" ? "ended" : "paused");
  if (state.phase === "running" && ctx.time.isPaused()) ctx.time.play();
  else if (state.phase !== "running" && !ctx.time.isPaused()) ctx.time.pause();
}

export function createCourseLoop(document: EditorDocument, startInMenu = true): GameLoop<GameContext> {
  const runtime = new WeakMap<GameContext, AuthoredTriggerRuntime>();
  const authoredSpawn = authoredSpawnPosition(document);
  if (authoredSpawn === null) throw new Error("The course needs a player spawn.");
  const spawn: [number, number, number] = [...authoredSpawn];
  const placements = resolveAuthoredObjects(document);
  const triggerDocument = { ...document, markers: document.markers.map(marker => {
    const action = marker.catalogId === "course_checkpoint" ? "course.checkpoint" : marker.catalogId === "course_finish" ? "course.finish" : null;
    return action === null ? marker : { ...marker, meta: { ...marker.meta, on: "enter", action, triggerRadius: 2 } };
  }) };

  function resetPose(ctx: GameContext, checkpoint: string | null): void {
    const marker = document.markers.find(entry => entry.id === checkpoint);
    const placed = placements.find(entry => entry.instanceId === checkpoint);
    const top = placed === undefined ? 0 : (assets.resolve(placed.catalogId)?.dims?.maxY ?? 0.8) + placed.verticalOffset;
    const position: [number, number, number] = marker === undefined ? [...spawn] : [marker.position.x, ctx.world.groundHeightAt(marker.position.x, marker.position.z) + top, marker.position.z];
    forgetPlayerMovement(ctx, ctx.player.userId);
    ctx.scene.entity.setPose(ctx.player.userId, { position });
    runtime.get(ctx)?.reset();
  }

  return {
    onInit(ctx) {
      writeRun(ctx, { ...INITIAL_RUN, phase: startInMenu ? "menu" : "running" });
      runtime.set(ctx, createAuthoredTriggerRuntime({ document: triggerDocument, handlers: {
        "course.checkpoint": event => {
          const current = courseRun(ctx);
          if (current.phase === "running" && current.checkpoint !== event.sourceId) writeRun(ctx, { ...current, checkpoint: event.sourceId });
        },
        "course.finish": () => {
          const current = courseRun(ctx);
          if (current.phase === "running") writeRun(ctx, { ...current, phase: "finished" });
        },
      } }));
      ctx.game.commands.define("course.start", { apply() {
        resetPose(ctx, null);
        writeRun(ctx, { ...INITIAL_RUN, phase: "running" });
      } });
      ctx.game.commands.define("course.pause", { validate() { return courseRun(ctx).phase === "running" ? null : { reason: "The course is not running." }; }, apply() { writeRun(ctx, { ...courseRun(ctx), phase: "paused" }); } });
      ctx.game.commands.define("course.resume", { validate() { return courseRun(ctx).phase === "paused" ? null : { reason: "The course is not paused." }; }, apply() { writeRun(ctx, { ...courseRun(ctx), phase: "running" }); } });
      ctx.game.commands.define("course.retry", { validate() { return courseRun(ctx).phase === "tumbled" ? null : { reason: "You have not fallen." }; }, apply() {
        resetPose(ctx, courseRun(ctx).checkpoint);
        writeRun(ctx, { ...courseRun(ctx), phase: "running" });
      } });
      ctx.game.commands.define("course.menu", { apply() { writeRun(ctx, { ...courseRun(ctx), phase: "menu" }); } });
    },
    onNewPlayer(ctx) { ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [...spawn] }); },
    onTick(ctx, dt) {
      const current = courseRun(ctx);
      if (current.phase !== "running" || dt <= 0) return;
      writeRun(ctx, { ...current, elapsed: current.elapsed + dt });
      const player = ctx.scene.entity.get(ctx.player.userId);
      if (player === null) return;
      if (player.position[1] < 0.35) {
        writeRun(ctx, { ...courseRun(ctx), phase: "tumbled", falls: current.falls + 1 });
        return;
      }
      runtime.get(ctx)?.step({ actors: [{ id: player.id, position: player.position }] });
    },
    onDispose(ctx) { runtime.delete(ctx); },
  };
}
