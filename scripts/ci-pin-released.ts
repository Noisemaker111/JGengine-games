/**
 * A PR that names an `Engine pin:` passes its checks against that commit, but `beta` installs the
 * published catalog. Merging such a PR before a release that contains the pin is adopted turns
 * `beta` red: #240 imported `@jgengine/shell/render/InteriorDressing` from engine 8be64264, its
 * `games` job passed against that pin, and beta's own run failed on published 0.41.0 at once.
 *
 * So after the pinned checks have produced their evidence, the `games` job asks one more question:
 * does the engine release the catalog installs already contain the pinned commit?
 *
 *   bun scripts/ci-pin-released.ts <pin-sha>
 *
 * Yes (the pin is that release's commit or an ancestor of it): exit 0, the PR can land.
 * No: exit 1 naming the pin, the catalog version and its commit, and the way out - cut or wait for
 * a release that contains the pin, adopt it in the catalog, and drop the `Engine pin:` line.
 * The release commit is npm's `gitHead` for `@jgengine/core@<catalog version>`; ancestry is GitHub's
 * compare API, so CI needs no deep engine clone.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const ENGINE_REPO = "Noisemaker111/jgengine";

/** GitHub compare status of `release...pin`: the pin is contained when it is the release or behind it. */
export type CompareStatus = "identical" | "behind" | "ahead" | "diverged" | "unknown";

export interface Verdict {
  ok: boolean;
  line: string;
}

export function verdict(input: { pin: string; version: string; releaseSha: string | null; status: CompareStatus }): Verdict {
  const pin = input.pin.slice(0, 8);
  if (input.releaseSha === null) {
    return {
      ok: false,
      line: `ci-pin-released: FAIL - npm names no commit for @jgengine/core@${input.version}, so pin ${pin} cannot be shown to be released`,
    };
  }
  const release = input.releaseSha.slice(0, 8);
  if (input.status === "identical" || input.status === "behind") {
    return { ok: true, line: `ci-pin-released: OK - engine pin ${pin} is contained in published ${input.version} (${release})` };
  }
  if (input.status === "unknown") {
    return {
      ok: false,
      line: `ci-pin-released: FAIL - could not compare pin ${pin} with ${input.version}'s commit ${release} on ${ENGINE_REPO}`,
    };
  }
  return {
    ok: false,
    line:
      `ci-pin-released: FAIL - the checks passed against engine pin ${pin}, but beta installs published ` +
      `${input.version} (${release}), which does not contain it, so merging would turn beta red. ` +
      `Land this after an engine release that contains ${pin} is adopted in the root catalog, then drop the Engine pin line.`,
  };
}

/** The `@jgengine/core` version the root workspace catalog installs. */
export function catalogVersion(packageJson: string): string | null {
  const parsed = JSON.parse(packageJson) as { workspaces?: { catalog?: Record<string, string> } };
  return parsed.workspaces?.catalog?.["@jgengine/core"] ?? null;
}

export interface Deps {
  readPackageJson?: () => string;
  /** npm's `gitHead` for one published version, or null. */
  releaseSha?: (version: string) => string | null;
  compare?: (base: string, head: string) => Promise<CompareStatus>;
  write?: (line: string) => void;
}

function npmGitHead(version: string): string | null {
  const result = spawnSync("npm", ["view", `@jgengine/core@${version}`, "gitHead"], { encoding: "utf8", shell: process.platform === "win32" });
  const sha = (result.stdout ?? "").trim();
  return result.status === 0 && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

async function githubCompare(base: string, head: string): Promise<CompareStatus> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`https://api.github.com/repos/${ENGINE_REPO}/compare/${base}...${head}`, { headers });
    if (!response.ok) return "unknown";
    const body = (await response.json()) as { status?: string };
    return body.status === "identical" || body.status === "behind" || body.status === "ahead" || body.status === "diverged" ? body.status : "unknown";
  } catch {
    return "unknown";
  }
}

export async function runCli(argv: string[], deps: Deps = {}): Promise<number> {
  const write = deps.write ?? ((line: string) => console.log(line));
  const pin = argv[0] ?? "";
  if (!/^[0-9a-f]{7,40}$/.test(pin)) {
    write(`ci-pin-released: FAIL - expected an engine commit sha, got "${pin}"`);
    return 1;
  }
  const version = catalogVersion((deps.readPackageJson ?? (() => readFileSync("package.json", "utf8")))());
  if (version === null) {
    write("ci-pin-released: FAIL - the root catalog names no @jgengine/core version");
    return 1;
  }
  const releaseSha = (deps.releaseSha ?? npmGitHead)(version);
  const status = releaseSha === null ? "unknown" : await (deps.compare ?? githubCompare)(releaseSha, pin);
  const result = verdict({ pin, version, releaseSha, status });
  write(result.line);
  return result.ok ? 0 : 1;
}

if (import.meta.main) process.exit(await runCli(process.argv.slice(2)));
