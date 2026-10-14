import { expect, test } from "bun:test";
import { guardDiveExit } from "./controls";

test("the dive exit guard prompts on leave only while attached", () => {
  const target = new EventTarget();
  const detach = guardDiveExit(target);
  const attached = new Event("beforeunload", { cancelable: true });
  target.dispatchEvent(attached);
  expect(attached.defaultPrevented).toBe(true);

  detach();
  const detached = new Event("beforeunload", { cancelable: true });
  target.dispatchEvent(detached);
  expect(detached.defaultPrevented).toBe(false);
});
