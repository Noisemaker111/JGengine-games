import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import { registerTriggerAction } from "@jgengine/core/scene/authoredTriggers";

export const COURSE_OBJECTS = ["course_pad", "course_step", "course_checkpoint", "course_finish", "course_bumper"] as const;

export const content: GameContextContent = {
  entityById: id => id === "player" ? { role: "player", movement: { walkSpeed: 5 } } : null,
  objectById: id => COURSE_OBJECTS.includes(id as typeof COURSE_OBJECTS[number]) ? { breakable: false } : null,
};

registerTriggerAction({ id: "course.checkpoint", label: "Bank course checkpoint", targets: ["marker"], events: ["enter"], schema: { fields: [] } });
registerTriggerAction({ id: "course.finish", label: "Finish course", targets: ["marker"], events: ["enter"], schema: { fields: [] } });
