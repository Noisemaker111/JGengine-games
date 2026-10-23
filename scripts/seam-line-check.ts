/**
 * Fails a games PR whose body has no usable `Engine seam:` line.
 *
 * The line was unchecked advice: four of the last twelve merged games PRs
 * omitted it, so a game could grow around a missing capability without naming
 * the shared package that should own it. See "Framework-first development" in
 * AGENTS.md; `bun run check:framework` guards the code, this guards the claim.
 *
 * Accepted forms (case-sensitive, no leading whitespace):
 *   Engine seam: packages/<pkg>/src/<file> (adopts #1234)
 *   Engine seam: @jgengine/<pkg>
 *   Engine seam: none - <reason of 10+ characters>
 *
 * Usage: bun run check:seam-line [--body-file <path>]
 * In CI the body comes from $GITHUB_EVENT_PATH (`pull_request.body`); a push
 * event has no PR body, so it passes with one line.
 */
import { readFileSync } from "node:fs";

export const ACCEPTED_FORMS =
  '"Engine seam: packages/<pkg>/src/<file> (adopts #1234)" or "Engine seam: none - <reason, 10+ characters>"';

/** `none` reasons match the engine's `Prevention: none` bar: ten characters. */
export const MIN_REASON = 10;

export type Verdict = { ok: boolean; message: string };

/** A path into a shared package, an issue/PR number, or a package name. */
const SEAM_REFERENCE = /packages\/[^/\s]+\/src\/[^\s)]+|#\d+|@jgengine\/[A-Za-z0-9._-]+/;

const LINE = /^Engine seam: /;

/** Checks one PR body; returns the line to print and whether the check passed. */
export function checkPrBody(body: string | undefined): Verdict {
  if (body === undefined) {
    return { ok: true, message: "seam check: OK - no PR body (push event), nothing to check" };
  }

  const lines = body.split(/\r?\n/);
  const seam = lines.find((line) => LINE.test(line));

  if (seam === undefined) {
    const empty = lines.find((line) => line.trimEnd() === "Engine seam:");
    if (empty !== undefined) {
      return { ok: false, message: `seam check: FAIL - the Engine seam line is empty; use ${ACCEPTED_FORMS}` };
    }
    return { ok: false, message: `seam check: FAIL - no "Engine seam: " line in the PR body; add ${ACCEPTED_FORMS}` };
  }

  const value = seam.slice("Engine seam: ".length).trim();

  if (value.length === 0) {
    return { ok: false, message: `seam check: FAIL - the Engine seam line is empty; use ${ACCEPTED_FORMS}` };
  }

  if (value === "none" || value.startsWith("none")) {
    const rest = value.slice("none".length).trim();
    const reason = rest.startsWith("-") ? rest.slice(1).trim() : "";
    if (reason.length < MIN_REASON) {
      return {
        ok: false,
        message: `seam check: FAIL - "Engine seam: none" needs "- <reason>" of ${MIN_REASON}+ characters (got ${reason.length}); ${ACCEPTED_FORMS}`,
      };
    }
    return { ok: true, message: `seam check: OK - no seam: ${reason}` };
  }

  if (!SEAM_REFERENCE.test(value)) {
    return {
      ok: false,
      message: `seam check: FAIL - "${seam.trim()}" names no path or issue; name packages/<pkg>/src/<file>, #<number> or @jgengine/<pkg>`,
    };
  }

  return { ok: true, message: `seam check: OK - ${value}` };
}

/** Reads `pull_request.body` from a GitHub event payload; undefined for events without a PR. */
export function bodyFromEvent(raw: string): string | undefined {
  const event = JSON.parse(raw) as { pull_request?: { body?: string | null } } | null;
  const pr = event?.pull_request;
  if (pr === undefined || pr === null) return undefined;
  return pr.body ?? "";
}

type Env = Record<string, string | undefined>;

/** CLI shell with injectable env/IO so the tests drive the same path CI does. */
export function runCli(argv: string[], env: Env, log: (line: string) => void): number {
  const at = argv.indexOf("--body-file");
  const bodyFile = at >= 0 ? argv[at + 1] : undefined;

  let body: string | undefined;
  if (bodyFile !== undefined) {
    body = readFileSync(bodyFile, "utf8");
  } else {
    const eventPath = env.GITHUB_EVENT_PATH;
    if (eventPath === undefined) {
      body = undefined;
    } else {
      body = bodyFromEvent(readFileSync(eventPath, "utf8"));
    }
  }

  const verdict = checkPrBody(body);
  log(verdict.message);
  return verdict.ok ? 0 : 1;
}

if (import.meta.main) process.exit(runCli(process.argv.slice(2), process.env, console.log));
