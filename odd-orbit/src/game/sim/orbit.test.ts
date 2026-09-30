import { afterEach, describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../../game.config";
import { onInit, onTick } from "../../loop";
import { content } from "../content";
import { householdStore } from "../session/store";
import { restoreHousehold, saveHousehold, SAVE_KEY } from "../session/persistence";
import { stepChallenge } from "./challenge";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: {userId:"orbit-test", isNew:true} });
  onInit(ctx);
  ctx.game.commands.run("orbit.begin", {});
  return ctx;
}
const originalStorage = globalThis.localStorage;
afterEach(() => { Object.defineProperty(globalThis, "localStorage", {value:originalStorage, configurable:true}); });

describe("first orbit and care boundaries", () => {
  test("charter wins from all goals and pauses; timeout preserves the household for another attempt", () => {
    const ctx=boot(); const state=householdStore.read(ctx);
    state.orbit!.built=1; state.orbit!.earned=420;
    stepChallenge(ctx,state,12);
    expect(state.orbit!.phase).toBe("won"); expect(ctx.time.isPaused()).toBe(true);
    householdStore.write(ctx,state); ctx.game.commands.run("orbit.begin",{});
    const retry=householdStore.read(ctx); const members=retry.order.slice();
    stepChallenge(ctx,retry,210);
    expect(retry.orbit!.phase).toBe("recovery"); expect(retry.order).toEqual(members);
    householdStore.write(ctx,retry); ctx.game.commands.run("orbit.sandbox",{});
    expect(householdStore.read(ctx).orbit!.phase).toBe("sandbox"); expect(ctx.time.isPaused()).toBe(false);
  });
  test("directed exhausted workers leave work and earn no extra pay", () => {
    const ctx=boot(); const state=householdStore.read(ctx); const member=state.members[state.order[0]!]!;
    member.action={kind:"use",goal:"work",objId:"starter:work_console"}; member.assignedByPlayer=true; member.needs.energy=15;
    const credits=state.credits; householdStore.write(ctx,state); onTick(ctx,0.1);
    expect(member.action.kind).toBe("idle"); expect(member.assignedByPlayer).toBe(false); expect(householdStore.read(ctx).credits).toBe(credits);
  });
  test("wander follows terrain height instead of sinking toward zero", () => {
    const ctx=boot(); ctx.time.hydrate({...ctx.time.snapshot(), now:0, calendar:ctx.time.calendar()});
    const state=householdStore.read(ctx); const id=state.order[0]!; const member=state.members[id]!;
    member.needs={hunger:99,energy:99,social:99,fun:99}; member.action={kind:"wander",x:15,z:15}; member.actionUntil=100;
    householdStore.write(ctx,state); onTick(ctx,0.5);
    const p=ctx.scene.entity.get(id)!.position;
    expect(p[1]).toBeCloseTo(ctx.world.groundHeightAt(p[0],p[2]),5);
  });
  test("overlapping builds do not charge; saved placement ids stay unique", () => {
    const ctx=boot(); const state=householdStore.read(ctx); const existing=ctx.scene.object.get("starter:bloom_planter")!;
    ctx.game.commands.run("build.tool",{toolId:"bloom_planter"});
    ctx.game.commands.run("world.pointer",{point:{x:existing.position[0],y:0,z:existing.position[2]},entity:null,object:null});
    expect(householdStore.read(ctx).credits).toBe(state.credits);
    ctx.scene.object.place("bloom_planter",20,0,20,{instanceId:"placed:bloom_planter:1"});
    ctx.game.commands.run("world.pointer",{point:{x:19,y:0,z:-20},entity:null,object:null});
    expect(ctx.scene.object.get("placed:bloom_planter:1")).not.toBeNull();
    expect(ctx.scene.object.list().filter(o=>o.instanceId.startsWith("placed:bloom_planter:")).length).toBe(2);
    expect(householdStore.read(ctx).credits).toBe(state.credits-70);
    expect(householdStore.read(ctx).buildTool).toBeNull();
  });
  test("whole household save round-trips furniture, care, credits, clock and orbit", () => {
    const values=new Map<string,string>();
    Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
    const ctx=boot(); ctx.game.commands.run("build.tool",{toolId:"bloom_planter"});
    ctx.game.commands.run("world.pointer",{point:{x:20,y:0,z:20},entity:null,object:null});
    ctx.time.advance(3); onTick(ctx,3); saveHousehold(ctx);
    const expected=JSON.parse(JSON.stringify(householdStore.read(ctx)));
    const next=boot(); restoreHousehold(next);
    const actual=householdStore.read(next);
    expect(actual.members).toEqual(expected.members); expect(actual.credits).toBe(expected.credits); expect(actual.orbit).toEqual(expected.orbit);
    expect(next.scene.object.list().length).toBe(ctx.scene.object.list().length); expect(next.time.now()).toBe(ctx.time.now());
    expect(values.has(SAVE_KEY)).toBe(true);
  });
});
