/**
 * The engine commit a PR claims to have proved, for CI to install instead of guessing.
 *
 * A pinned lane's game code compiles against an engine build the published catalog does not
 * have, so typechecking the catalog refuses a change that already passed against the commit
 * it named (JGengine-games#211: `games` failed, `games-local-engine` passed, same commit).
 * The `games` job therefore runs against whatever engine the body claims:
 *
 *   pin="$(bun scripts/ci-engine.ts)"   # the sha, or empty when the body claims no pin
 *
 * Empty is the ordinary case: the published catalog is the engine, exactly as before. A
 * claim the body cannot name - an empty line, a version, a non-hex value - exits 1, because
 * a PR that cannot say which engine it used has no evidence to install.
 *
 * The body comes from `--body-file`, then `--body`, then `$GITHUB_EVENT_PATH`
 * (`pull_request.body`). A push event has no body and claims nothing.
 */
import { readFileSync } from "node:fs";

import { PIN_LINE, namedCommit } from "./engine-mode-check";
import { bodyFromEvent } from "./seam-line-check";

export type Claim = { sha: string | null; problem: string | null };

/**
 * The commit the body claims, or nothing. Only a body that carries the line and then
 * fails to name a usable commit is a problem; silence is the published-catalog path.
 */
export function claimFrom(body: string | undefined): Claim {
  if (body === undefined || !body.split(/\r?\n/).some((line) => PIN_LINE.test(line))) {
    return { sha: null, problem: null };
  }
  return namedCommit(body);
}

export interface CliDeps {
  readBodyFile?: (path: string) => string;
  warn?: (line: string) => void;
}

export function runCli(argv: string[], env: Record<string, string | undefined>, write: (line: string) => void, deps: CliDeps = {}): number {
  const warn = deps.warn ?? ((line: string) => console.error(line));
  const readBodyFile = deps.readBodyFile ?? ((path: string) => readFileSync(path, "utf8"));
  const at = argv.indexOf("--body-file");
  const inlineAt = argv.indexOf("--body");
  let body: string | undefined;
  if (at >= 0) body = readBodyFile(argv[at + 1] ?? "");
  else if (inlineAt >= 0) body = argv[inlineAt + 1] ?? "";
  else {
    const eventPath = env.GITHUB_EVENT_PATH;
    body = eventPath === undefined ? undefined : bodyFromEvent(readFileSync(eventPath, "utf8"));
  }

  const claim = claimFrom(body);
  if (claim.problem !== null) {
    warn(`ci-engine: FAIL - this PR claims a pinned engine it cannot name: ${claim.problem}`);
    return 1;
  }
  write(claim.sha ?? "");
  return 0;
}

if (import.meta.main) process.exit(runCli(process.argv.slice(2), process.env, (line) => console.log(line)));
