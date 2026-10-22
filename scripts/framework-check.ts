/**
 * Fails when a game directory grows an engine-shaped module.
 *
 * A game owns content and feel. Missions, economy, vehicles, loot, AI, damage,
 * progression and UI kits belong to `Noisemaker111/jgengine` so one fix reaches
 * every game; see "Framework before game code" in AGENTS.md.
 *
 * Usage: bun run check:framework [--base origin/beta] [--allow "<reason>"]
 */
import { $ } from "bun";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const reason = arg("--allow");
const base = arg("--base") ?? "origin/beta";

const NON_GAME = new Set(["shared", "studios", "registry", "scripts", "docs", ".github", "node_modules"]);

const SYSTEM_PATH = /(^|\/)(systems?|sim|simulation|gameplay|mechanics)\//i;
const SYSTEM_NAME =
  /(mission|objective|quest|contract|economy|progression|inventory|loot|ability|abilities|talent|perk|damage|status|vehicle|traffic|wanted|heat|director|spawner|scheduler|pathfind|navigat|reputation|unlock)/i;
const LOGIC = /export\s+(async\s+)?(function|class)\s|export\s+const\s+\w+\s*=\s*(async\s*)?\(|=>\s*\{/;

const changed = async (diffArgs: string[]) => {
  const out = await $`git diff --name-status ${diffArgs}`.text().catch(() => "");
  return out
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 2 && parts[0] === "A")
    .map((parts) => parts[1]);
};

const gameFiles = (paths: string[]) =>
  paths.filter((p) => {
    const first = p.split("/")[0];
    return p.includes("/") && !NON_GAME.has(first) && !p.startsWith(".");
  });

const added = gameFiles([...(await changed([`${base}...HEAD`])), ...(await changed(["--cached"]))]);

const offences: string[] = [];
for (const file of added) {
  const source = await Bun.file(file).text().catch(() => "");
  if (!LOGIC.test(source)) continue;
  if (SYSTEM_PATH.test(file) || SYSTEM_NAME.test(file.split("/").pop() ?? "")) offences.push(file);
}

if (offences.length === 0) {
  console.log(`framework check: ${added.length} new game files, none engine-shaped`);
  process.exit(0);
}

if (reason !== undefined) {
  console.log(`framework check: allowed ${offences.length} engine-shaped file(s) - ${reason}`);
  for (const file of offences) console.log(`  allowed: ${file}`);
  process.exit(0);
}

console.error("framework check: these are engine systems written inside a game:");
for (const file of offences) console.error(`  ${file}`);
console.error(
  [
    "",
    "File the seam in Noisemaker111/jgengine and adopt it here instead:",
    "  packages/<pkg>/src/<file>:<line>, the API the game needs, and the second game that would adopt it.",
    "If it truly cannot live upstream, rerun with: bun run check:framework -- --allow \"<reason>\"",
    "Rule: AGENTS.md -> Framework before game code.",
  ].join("\n"),
);
process.exit(1);
