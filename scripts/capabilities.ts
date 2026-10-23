/**
 * The adoption ledger: what the installed `@jgengine/*` packages publish, and
 * which of those capabilities each game says it runs.
 *
 * An engine capability is game-facing when the installed package that declares
 * it also ships a live probe - a devtools probe name or a `window.__jgengine*`
 * readout. Those are the systems whose absence can be proven at boot, so they
 * are the ones a game must adopt or decline. Everything else stays in the
 * engine's own inventory and is out of the gate's scope.
 *
 * `capabilities.json` is generated from the installed `.d.ts` files by
 * `bun run capabilities:sync`; each game's `capabilities.json` is generated once
 * by `bun run capabilities:declare` and then owned by that game.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const DECLINE_MIN = 20;
export const LEDGER_FILE = "capabilities.json";
export const DECLARATION_FILE = "capabilities.json";

export interface CapabilityProbe {
  kind: "devtools" | "window";
  /** The global to read for a `window` probe, such as `__jgengineAudio`. */
  global?: string;
}

export interface CapabilityEntry {
  /** The `@capability` slug, such as `mission-runtime` or `agents`. */
  id: string;
  packages: string[];
  /** `@jgengine/<pkg>/<module>` that publishes this capability. */
  module: string;
  /** True when the owning package ships a live probe; only these need a game decision. */
  gameFacing: boolean;
  probe: CapabilityProbe | null;
  intent: string;
}

export interface Ledger {
  generatedBy: string;
  engineVersion: string;
  gameFacingRule: string;
  capabilities: CapabilityEntry[];
}

export interface Declaration {
  adopts: string[];
  /** Boot probe names keyed by the module that can prove the system live. */
  probes?: Record<string, string[]>;
  declines: Record<string, string>;
}

export interface GameDeclaration {
  game: string;
  declaration: Declaration | null;
}

export interface ModuleInfo {
  specifier: string;
  packageName: string;
  slugs: string[];
  intents: Map<string, string>;
  api: Set<string>;
  probe: CapabilityProbe | null;
}

interface Installed {
  packagesRoot: string;
  version: string;
  modules: ModuleInfo[];
}

const CAPABILITY = /@capability\s+([A-Za-z][\w.-]*)\s*([^\r\n*]*)/g;
const DECLARED_EXPORT =
  /export\s+declare\s+(?:abstract\s+)?(?:function|const|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;
const WINDOW_GLOBAL = /window\.(__jgengine[A-Za-z0-9_]*)/g;
const DEVTOOLS = /\bdevtoolsName\b/;

function dtsFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".d.ts")) out.push(path);
    }
  };
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir);
  return out;
}

let installedCache: { root: string; installed: Installed } | null = null;

/** Read every installed declaration that carries a `@capability` tag. */
export function readInstalled(root: string): Installed {
  if (installedCache !== null && installedCache.root === root) return installedCache.installed;
  const packagesRoot = findPackagesRoot(root);
  if (packagesRoot === null) {
    throw new Error(`no installed @jgengine packages under ${root}; run bun install first`);
  }
  const modules: ModuleInfo[] = [];
  let version = "unknown";

  for (const pkg of readdirSync(packagesRoot).sort()) {
    const packageDir = join(packagesRoot, pkg);
    const manifest = join(packageDir, "package.json");
    if (!existsSync(manifest)) continue;
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { version?: string };
    if (pkg === "core" && typeof parsed.version === "string") version = parsed.version;

    for (const file of dtsFiles(join(packageDir, "dist"))) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("@capability")) continue;
      const relativePath = relative(packageDir, file)
        .replace(/^dist[\\/]/, "")
        .replace(/\.d\.ts$/, "")
        .replace(/\\/g, "/");
      const specifier = `@jgengine/${pkg}/${relativePath.replace(/[\\/]index$/, "")}`;
      const tagged = [...source.matchAll(CAPABILITY)].map((match) => ({
        slug: match[1] as string,
        intent: (match[2] ?? "").trim(),
      }));
      if (tagged.length === 0) continue;
      const slugs = [...new Set(tagged.map((entry) => entry.slug))];
      const intents = new Map<string, string>();
      for (const entry of tagged) if (!intents.has(entry.slug)) intents.set(entry.slug, entry.intent);
      const globals = [...source.matchAll(WINDOW_GLOBAL)].map((match) => match[1] as string);
      const probe: CapabilityProbe | null =
        globals.length > 0
          ? { kind: "window", global: [...globals].sort()[0] }
          : DEVTOOLS.test(source)
            ? { kind: "devtools" }
            : null;
      modules.push({
        specifier,
        packageName: `@jgengine/${pkg}`,
        slugs,
        intents,
        api: new Set([...source.matchAll(DECLARED_EXPORT)].map((match) => match[1] as string)),
        probe,
      });
    }
  }

  installedCache = { root, installed: { packagesRoot, version, modules } };
  return installedCache.installed;
}

/** Derive the checked-in inventory from the installed packages, not from memory. */
export function deriveLedger(root: string): Ledger {
  const installed = readInstalled(root);
  const bySlug = new Map<
    string,
    { intent: string; packages: Set<string>; module: string; probe: CapabilityProbe | null }
  >();

  for (const module of installed.modules) {
    for (const slug of module.slugs) {
      const existing = bySlug.get(slug);
      const candidate = {
        intent: module.intents.get(slug) ?? "",
        packages: new Set([...(existing?.packages ?? []), module.packageName]),
        module: module.specifier,
        probe: module.probe,
      };
      // A probed module wins; between otherwise equal modules keep the shortest specifier.
      const preferNew =
        existing === undefined ||
        (module.probe !== null && existing.probe === null) ||
        (module.probe === existing.probe &&
          (module.specifier.length < existing.module.length ||
            (module.specifier.length === existing.module.length && module.specifier < existing.module)));
      if (preferNew) {
        bySlug.set(slug, candidate);
      } else {
        existing.packages.add(module.packageName);
      }
    }
  }

  const capabilities: CapabilityEntry[] = [...bySlug.entries()]
    .map(([id, entry]) => ({
      id,
      packages: [...entry.packages].sort(),
      module: entry.module,
      gameFacing: entry.probe !== null,
      probe: entry.probe,
      intent: entry.intent,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    generatedBy: "bun run capabilities:sync",
    engineVersion: installed.version,
    gameFacingRule:
      "Game-facing means the installed package ships a live probe with the capability: a devtools probe name or a window.__jgengine* readout. Every game declares each one: adopt it, or decline it with a reason.",
    capabilities,
  };
}

/** The hoisted install may sit at the root or inside the first game. */
export function findPackagesRoot(root: string): string | null {
  const candidates = [join(root, "node_modules", "@jgengine")];
  for (const game of gameDirs(root)) candidates.push(join(root, game, "node_modules", "@jgengine"));
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "core", "package.json"))) return candidate;
  }
  return null;
}

/** Game directories: a package named `@games/*` with a config module. */
export function gameDirs(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const manifestPath = join(root, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: string };
    if (manifest.name?.startsWith("@games/") !== true) continue;
    const hasConfig =
      existsSync(join(root, entry.name, "src", "game.config.ts")) ||
      existsSync(join(root, entry.name, "src", "game.config.tsx"));
    if (hasConfig) out.push(entry.name);
  }
  return out.sort();
}

export function readDeclaration(root: string, game: string): Declaration | null {
  const path = join(root, game, DECLARATION_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Declaration;
}

export function declarationPath(root: string, game: string): string {
  return join(root, game, DECLARATION_FILE);
}

/** Source files a declaration is seeded from. */
export function sourceFiles(root: string, game: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        out.push(path);
      }
    }
  };
  walk(join(root, game, "src"));
  return out;
}

export interface ImportEvidence {
  specifiers: Set<string>;
  names: Set<string>;
  /** `devtoolsName` values keyed by the module whose API call owns them. */
  probeNames: Map<string, Set<string>>;
}

/** Module specifier -> API names, cached for one checkout. */
export function moduleIndex(root: string): Map<string, ModuleInfo> {
  return new Map(readInstalled(root).modules.map((module) => [module.specifier, module]));
}

/** Read imports and `devtoolsName` probes from one game's source. */
export function collectEvidence(root: string, game: string, ledger: Ledger): ImportEvidence {
  const modules = moduleIndex(root);
  const evidence: ImportEvidence = { specifiers: new Set(), names: new Set(), probeNames: new Map() };
  for (const entry of ledger.capabilities) {
    const set = evidence.probeNames.get(entry.module) ?? new Set<string>();
    evidence.probeNames.set(entry.module, set);
  }

  for (const file of sourceFiles(root, game)) {
    const source = readFileSync(file, "utf8");
    const importedModules = new Set<string>();
    const importedNames = new Set<string>();
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1] as string;
      importedModules.add(specifier);
      evidence.specifiers.add(specifier);
    }
    for (const match of source.matchAll(/\{([^}]*)\}\s*from\s+["'][^"']+["']/g)) {
      for (const part of (match[1] as string).split(",")) {
        const name = part.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0]?.trim();
        if (name !== undefined && name !== "") {
          evidence.names.add(name);
          importedNames.add(name);
        }
      }
    }

    const modulesHere = [...modules.values()].filter(
      (module) =>
        importedModules.has(module.specifier) ||
        [...module.api].some((name) => importedNames.has(name)),
    );

    for (const match of source.matchAll(/devtoolsName\s*:\s*(["'`])(.*?)\1/gs)) {
      const probe = (match[2] as string).replace(/\$\{[^}]*\}/g, "*");
      const before = source.slice(0, match.index ?? 0);
      let owner: ModuleInfo | undefined;
      let lastAt = -1;
      for (const module of modulesHere) {
        for (const name of module.api) {
          const at = before.lastIndexOf(name);
          if (at > lastAt) {
            lastAt = at;
            owner = module;
          }
        }
      }
      if (owner === undefined && modulesHere.length === 1) owner = modulesHere[0];
      if (owner === undefined || owner.probe === null) continue;
      const set = evidence.probeNames.get(owner.specifier) ?? new Set<string>();
      set.add(probe);
      evidence.probeNames.set(owner.specifier, set);
    }
  }
  return evidence;
}

/** API names of the module that owns a capability, for barrel imports. */
export function moduleApiNames(root: string, entry: CapabilityEntry): string[] {
  return [...(moduleIndex(root).get(entry.module)?.api ?? [])];
}

/** Seed a declaration from source evidence; declines carry a real reason. */
export function seedDeclaration(root: string, game: string, ledger: Ledger): Declaration {
  const evidence = collectEvidence(root, game, ledger);
  let hasAudioConfig = false;
  for (const file of sourceFiles(root, game)) {
    if (/audio\s*:\s*\{/.test(readFileSync(file, "utf8"))) hasAudioConfig = true;
  }

  const adopts: string[] = [];
  const probeModules = new Map<string, Set<string>>();
  const declines: Record<string, string> = {};

  for (const entry of ledger.capabilities) {
    if (!entry.gameFacing) continue;
    const byModule = evidence.specifiers.has(entry.module);
    const byName = moduleApiNames(root, entry).some((name) => evidence.names.has(name));
    const byConfig = entry.id === "audio-probe" && hasAudioConfig;
    if (byModule || byName || byConfig) {
      adopts.push(entry.id);
      const found = evidence.probeNames.get(entry.module) ?? new Set<string>();
      if (byConfig && entry.probe?.kind === "window" && entry.probe.global !== undefined) {
        found.add(`window:${entry.probe.global}`);
      }
      if (found.size > 0) probeModules.set(entry.module, found);
      continue;
    }
    declines[entry.id] = `Not adopted: this game does not run the engine ${entry.id} system.`;
  }

  return {
    adopts: adopts.sort(),
    probes: Object.fromEntries([...probeModules].map(([module, names]) => [module, [...names].sort()])),
    declines,
  };
}

export function renderDeclaration(declaration: Declaration): string {
  const ordered: Declaration = {
    adopts: [...declaration.adopts].sort(),
    ...(declaration.probes === undefined
      ? {}
      : {
          probes: Object.fromEntries(
            Object.entries(declaration.probes)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([module, probes]) => [module, [...probes].sort()]),
          ),
        }),
    declines: Object.fromEntries(Object.entries(declaration.declines).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function renderLedger(ledger: Ledger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

export interface DeclarationProblem {
  game: string;
  capability: string;
  module: string;
  message: string;
}

export interface DeclarationReport {
  problems: DeclarationProblem[];
  /** Adopted capabilities whose module has no boot probe: declaration-level only for now. */
  declarationLevel: Array<{ game: string; capability: string; module: string }>;
  adopted: number;
  declined: number;
}

/** The four adoption-gate cases, plus unknown ids and double declarations. */
export function checkDeclarations(ledger: Ledger, games: GameDeclaration[]): DeclarationReport {
  const known = new Map(
    ledger.capabilities.filter((entry) => entry.gameFacing).map((entry) => [entry.id, entry]),
  );
  const problems: DeclarationProblem[] = [];
  const declarationLevel: DeclarationReport["declarationLevel"] = [];
  let adopted = 0;
  let declined = 0;

  for (const { game, declaration } of games) {
    if (declaration === null) {
      problems.push({
        game,
        capability: "*",
        module: "*",
        message: `${game}/capabilities.json is missing - run bun run capabilities:declare ${game}`,
      });
      continue;
    }
    const adoptSet = new Set(declaration.adopts);
    const declineSet = new Set(Object.keys(declaration.declines));
    const probedModules = new Set(Object.keys(declaration.probes ?? {}));

    for (const id of adoptSet) {
      const entry = known.get(id);
      if (entry === undefined) {
        problems.push({
          game,
          capability: id,
          module: "unknown",
          message: `${game} adopts "${id}", which is not a game-facing capability in capabilities.json - only probed capabilities need a decision; remove it or run bun run capabilities:sync`,
        });
        continue;
      }
      if (declineSet.has(id)) {
        problems.push({
          game,
          capability: id,
          module: entry.module,
          message: `${game} both adopts and declines "${id}" (${entry.module}) - keep exactly one`,
        });
      }
      adopted += 1;
      if (!probedModules.has(entry.module)) {
        declarationLevel.push({ game, capability: id, module: entry.module });
      }
    }

    for (const [id, reason] of Object.entries(declaration.declines)) {
      const entry = known.get(id);
      if (entry === undefined) {
        problems.push({
          game,
          capability: id,
          module: "unknown",
          message: `${game} declines "${id}", which is not a game-facing capability in capabilities.json - remove it or run bun run capabilities:sync`,
        });
        continue;
      }
      if (adoptSet.has(id)) continue;
      declined += 1;
      if (reason.trim().length < DECLINE_MIN) {
        problems.push({
          game,
          capability: id,
          module: entry.module,
          message: `${game} declines "${id}" (${entry.module}) with a ${reason.trim().length}-character reason; write ${DECLINE_MIN}+ characters of why, or adopt it`,
        });
      }
    }

    for (const entry of ledger.capabilities) {
      if (!entry.gameFacing) continue;
      if (adoptSet.has(entry.id) || declineSet.has(entry.id)) continue;
      problems.push({
        game,
        capability: entry.id,
        module: entry.module,
        message: `${game} does not declare game-facing capability "${entry.id}" (${entry.module}) - adopt it, or decline it with a ${DECLINE_MIN}+ character reason`,
      });
    }

    const knownModules = new Set(ledger.capabilities.map((entry) => entry.module));
    for (const module of probedModules) {
      if (!knownModules.has(module)) {
        problems.push({
          game,
          capability: "*",
          module,
          message: `${game} names a boot probe for unknown module "${module}" - remove it or run bun run capabilities:sync`,
        });
        continue;
      }
      const adoptedHere = ledger.capabilities.some((entry) => entry.module === module && adoptSet.has(entry.id));
      if (!adoptedHere) {
        problems.push({
          game,
          capability: "*",
          module,
          message: `${game} names a boot probe for "${module}" but adopts none of its capabilities - adopt one or remove the probe`,
        });
      }
    }
  }

  return { problems, declarationLevel, adopted, declined };
}

/** Is the checked-in ledger behind the installed packages? */
export function ledgerDrift(committed: Ledger, installed: Ledger): string[] {
  const problems: string[] = [];
  const old = new Map(committed.capabilities.map((entry) => [entry.id, entry]));
  const next = new Map(installed.capabilities.map((entry) => [entry.id, entry]));

  for (const [id, entry] of next) {
    const before = old.get(id);
    if (before === undefined) {
      problems.push(`added "${id}" (${entry.module}) - no game declares it yet`);
      continue;
    }
    if (before.module !== entry.module) problems.push(`"${id}" moved from ${before.module} to ${entry.module}`);
    if (before.gameFacing !== entry.gameFacing) {
      problems.push(
        before.gameFacing
          ? `"${id}" lost its live probe (${describeProbe(before.probe)} -> none)`
          : `"${id}" became game-facing (${describeProbe(entry.probe)}) - every game must declare it`,
      );
    } else if (describeProbe(before.probe) !== describeProbe(entry.probe)) {
      problems.push(`"${id}" probe changed from ${describeProbe(before.probe)} to ${describeProbe(entry.probe)}`);
    }
  }
  for (const [id, entry] of old) {
    if (!next.has(id)) problems.push(`removed "${id}" (${entry.module})`);
  }
  if (committed.engineVersion !== installed.engineVersion) {
    problems.push(`engine version ${committed.engineVersion} -> ${installed.engineVersion}`);
  }
  return problems;
}

function describeProbe(probe: CapabilityProbe | null): string {
  return probe === null ? "none" : probe.kind === "window" ? `window:${probe.global}` : "devtools";
}

/** A probe name with `*` wildcards, matched against the live devtools probe keys. */
export function probeMatches(pattern: string, keys: string[]): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`);
  return keys.some((key) => regex.test(key));
}
