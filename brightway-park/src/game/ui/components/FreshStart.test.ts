import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FreshStart } from "./FreshStart";

// The suite has no DOM, so this covers the first render only: the save-replacing action must not be
// reachable before the request button is pressed. The click path is checked in browser verification.
describe("fresh start confirmation", () => {
  test("the first render offers only the request, never the archive action", () => {
    const html = renderToStaticMarkup(createElement(FreshStart, {
      idleLabel: "Start fresh", confirmLabel: "Archive and start fresh", onConfirm: () => {},
    }));
    expect(html).toContain("Start fresh");
    expect(html).not.toContain("Archive and start fresh");
    expect(html).not.toContain("Keep my park");
  });

  test("the request keeps its primary styling when the caller asks for it", () => {
    const html = renderToStaticMarkup(createElement(FreshStart, {
      primary: true, idleLabel: "Reopen", confirmLabel: "Archive and reopen", onConfirm: () => {},
    }));
    expect(html).toContain('class="park-button primary"');
  });
});
