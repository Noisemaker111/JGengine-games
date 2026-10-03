import { expect, test } from "bun:test";
import { createEditorSession } from "@jgengine/core/editor/commands";
import { createCreatorDocumentStorage, exportCreatorDocument, importCreatorDocument, validateCreatorDocument } from "@jgengine/core/editor/creatorStorage";
import { cloneEditorDocument } from "@jgengine/core/editor/document";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { placeAuthoredObjectsFromDocument } from "@jgengine/core/world/authoredObjects";

import { editorLayers } from "../../editorLayers";
import { createCoursePlayable } from "../../game.config";
import { courseRun } from "../../loop";
import { creatorPolicy } from "../creator";
import { entityModels, objectModels } from "../models";

function boot(startInMenu = false) {
  const playable = createCoursePlayable(editorLayers, { startInMenu });
  const runner = createHeadlessRunner({ definition: playable.game, content: playable.content, loop: playable.loop, now: () => 0, playerMovement: true, heading: Math.PI, movement: playable.movement, models: { entity: kind => entityModels[kind], object: id => objectModels[id] } });
  placeAuthoredObjectsFromDocument(runner.ctx.scene.object, editorLayers, (x, z) => runner.ctx.world.groundHeightAt(x, z));
  return runner;
}

test("the published course loop freezes menu and pause, then resumes the same timer", () => {
  const runner = boot(true);
  for (let i = 0; i < 60; i++) runner.step(1 / 60, { held: ["moveForward"] });
  expect(courseRun(runner.ctx).elapsed).toBe(0);
  expect(runner.ctx.scene.entity.get(runner.userId)?.position).toEqual([0, 0.8, 0]);
  runner.ui.invoke("course.start");
  for (let i = 0; i < 30; i++) runner.step(1 / 60);
  const playing = courseRun(runner.ctx);
  expect(playing.elapsed).toBeCloseTo(0.5);
  runner.ui.invoke("course.pause");
  const before = runner.ctx.scene.entity.get(runner.userId)?.position;
  for (let i = 0; i < 60; i++) runner.step(1 / 60, { held: ["moveForward"] });
  expect(courseRun(runner.ctx).elapsed).toBe(playing.elapsed);
  expect(runner.ctx.scene.entity.get(runner.userId)?.position).toEqual(before);
  runner.ui.invoke("course.resume");
  runner.step(1 / 60, { held: [] });
  expect(courseRun(runner.ctx).elapsed).toBeGreaterThan(playing.elapsed);
});

test("real movement jumps the first gap and a miss exposes a retry before repositioning", () => {
  const runner = boot();
  for (let i = 0; i < 15; i++) runner.step(1 / 60, { held: ["moveForward"] });
  let apex = 0;
  for (let i = 0; i < 43; i++) {
    runner.step(1 / 60, { held: i === 0 ? ["moveForward", "jump"] : ["moveForward"] });
    apex = Math.max(apex, runner.ctx.scene.entity.get(runner.userId)!.position[1]);
  }
  const player = runner.ctx.scene.entity.get(runner.userId)!;
  expect(apex).toBeGreaterThan(1.4);
  expect(player.position[2]).toBeLessThan(-4);
  expect(courseRun(runner.ctx).phase).toBe("running");
  for (let i = 0; i < 100 && courseRun(runner.ctx).phase === "running"; i++) runner.step(1 / 60, { held: ["moveRight"] });
  expect(courseRun(runner.ctx).phase).toBe("tumbled");
  const missed = [...runner.ctx.scene.entity.get(runner.userId)!.position];
  expect(missed).not.toEqual([0, 0.8, 0]);
  for (let i = 0; i < 20; i++) runner.step(1 / 60, { held: [] });
  expect(runner.ctx.scene.entity.get(runner.userId)!.position).toEqual(missed);
  runner.ui.invoke("course.retry");
  expect(courseRun(runner.ctx).phase).toBe("running");
  expect(courseRun(runner.ctx).falls).toBe(1);
  expect(runner.ctx.scene.entity.get(runner.userId)!.position).toEqual([0, 0.8, 0]);
});

test("checkpoint and finish consume shared authored trigger edges; a repeated finish stays settled", () => {
  const runner = boot();
  const checkpoint = editorLayers.markers.find(marker => marker.catalogId === "course_checkpoint")!;
  runner.ctx.scene.entity.setPose(runner.userId, { position: [checkpoint.position.x, 0.8, checkpoint.position.z] });
  runner.step(1 / 60);
  expect(courseRun(runner.ctx).checkpoint).toBe(checkpoint.id);
  runner.ctx.scene.entity.setPose(runner.userId, { position: [40, 0, 40] });
  runner.step(1 / 60);
  expect(courseRun(runner.ctx).phase).toBe("tumbled");
  runner.ui.invoke("course.retry");
  expect(runner.ctx.scene.entity.get(runner.userId)!.position).toEqual([checkpoint.position.x, 0.8, checkpoint.position.z]);
  const finish = editorLayers.markers.find(marker => marker.catalogId === "course_finish")!;
  runner.ctx.scene.entity.setPose(runner.userId, { position: [finish.position.x, 0.8, finish.position.z] });
  runner.step(1 / 60);
  const settled = courseRun(runner.ctx);
  expect(settled.phase).toBe("finished");
  for (let i = 0; i < 60; i++) runner.step(1 / 60);
  expect(courseRun(runner.ctx)).toBe(settled);
  expect(runner.ui.tryInvoke("course.retry").status).toBe("rejected");
});

test("a named edited course reopens durably and repeated play snapshots cannot write into its document", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const saves = createCreatorDocumentStorage({ storage, key: "cloud-course-test", policy: creatorPolicy });
  const session = createEditorSession(cloneEditorDocument(editorLayers), 100, document => { validateCreatorDocument(document, creatorPolicy); });
  session.dispatch({ type: "translate", ids: ["first_step"], delta: { x: 1, y: 0, z: 0 } });
  const saved = await saves.save({ version: 1, id: "my-course", name: "My first course", revision: 0, document: session.getState().document }, null);
  const reopened = createCreatorDocumentStorage({ storage, key: "cloud-course-test", policy: creatorPolicy });
  for (let i = 0; i < 3; i++) {
    const latest = (await reopened.load(saved.id))!;
    const playable = createCoursePlayable(latest.document, { startInMenu: false });
    playable.editorLayers!.markers.find(marker => marker.id === "first_step")!.position.x = 99;
    expect(latest.document.markers.find(marker => marker.id === "first_step")!.position.x).toBe(1);
  }
  expect((await reopened.load(saved.id))!.document.markers.find(marker => marker.id === "first_step")!.position.x).toBe(1);
  expect(await reopened.list()).toEqual([{ version: 1, id: "my-course", name: "My first course", revision: 1 }]);
  expect(importCreatorDocument(exportCreatorDocument(session.getState().document, creatorPolicy), creatorPolicy)).toEqual(session.getState().document);
  const unsafe = cloneEditorDocument(session.getState().document);
  unsafe.volumes[0]!.center.y = 1e308;
  expect(() => validateCreatorDocument(unsafe, creatorPolicy)).toThrow("20 m of ground");
  await expect(saves.save({ ...saved, document: unsafe }, saved.revision)).rejects.toThrow("20 m of ground");
  expect(await reopened.load(saved.id)).toEqual(saved);
});

test("course catalog and budget reject unavailable assets and loss of a playable start or finish", () => {
  const document = cloneEditorDocument(editorLayers);
  expect(validateCreatorDocument(document, creatorPolicy)).toEqual(document);
  expect(() => validateCreatorDocument({ ...document, markers: document.markers.filter(marker => marker.catalogId !== "course_finish") }, creatorPolicy)).toThrow("finish");
  expect(() => validateCreatorDocument({ ...document, markers: document.markers.filter(marker => marker.kind !== "player_spawn") }, creatorPolicy)).toThrow("spawn");
  const prop = document.markers.find(marker => marker.catalogId === "course_step")!;
  expect(() => validateCreatorDocument({ ...document, markers: [...document.markers, { ...prop, id: "foreign", catalogId: "foreign_asset" }] }, creatorPolicy)).toThrow("catalog");
  const expanded = [...document.markers];
  for (let i = 0; i < 48; i++) expanded.push({ ...prop, id: `extra_${i}` });
  expect(() => validateCreatorDocument({ ...document, markers: expanded }, creatorPolicy)).toThrow("object budget");
});
