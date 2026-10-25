/**
 * The one owner of the drive flow shape: the JSON step file a game's proofs are written in.
 *
 * The runner that executes these files is `drive` in `Noisemaker111/jgengine`
 * (`packages/jgengine/src/templates/captureArgs.ts`: `driveStepKinds()` and `parseStepFile`).
 * This module is what `check:game-design` reads, and `flow-schema.test.ts` compares it with that
 * engine source whenever a checkout sits beside this repo, so the gate and the runner cannot drift
 * into disagreeing about a field.
 *
 * Two rules govern what is accepted:
 *
 *   - A field the runner honours is accepted here. `waitFor` states a condition and `timeoutMs`
 *     caps how long that condition may be polled, so both are part of the shape; the rule "a step
 *     states a condition, never a guessed wait" is about `wait`, a bare sleep with no condition.
 *   - A field the runner silently ignores is refused here, with the rule named. `timeoutMs` outside
 *     `waitFor`, and `ms` outside `key`, do nothing in the runner, so a flow carrying one looks
 *     like it waits and does not; the cap belongs inside `before` / `after`.
 */

/** The step kinds a JSON step file accepts, in the order the engine lists them. */
export const FLOW_STEP_KINDS = [
  "click",
  "doubleClick",
  "clickAt",
  "rightClickAt",
  "moveMouse",
  "look",
  "aimAt",
  "fill",
  "key",
  "wait",
  "waitFor",
  "reload",
  "shot",
  "rpc",
  "probe",
  "assert",
  "flow",
] as const;

export type FlowStepKind = (typeof FLOW_STEP_KINDS)[number];

/** Fields that sit beside a step's kind: both conditions, the aim tolerance and a note. */
export const STEP_EXTRAS = ["before", "after", "note", "tolerancePx"] as const;

/** The fields a `before` / `after` condition carries, and nothing else. */
export const CONDITION_FIELDS = ["is", "value", "timeoutMs", "note"] as const;

/** A step's own value fields, which belong to exactly one kind. */
export const STEP_VALUE_FIELDS = ["ms", "timeoutMs", "is", "until"] as const;

/** How deep a flow may include another before the run refuses the script (engine DRIVE_FLOW_MAX_DEPTH). */
export const MAX_FLOW_DEPTH = 4;

/** A condition's poll cap when it names none (engine DRIVE_CONDITION_TIMEOUT_MS). */
export const CONDITION_TIMEOUT_MS = 15_000;

/** A flow name as a file is named: lowercase letters, digits and dashes. */
export const FLOW_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** The rule a refused field breaks, named in the failure so a lane can fix it without guessing. */
export const RULES = {
  oneKind: "one step is one kind",
  capOutsideCondition:
    'a poll cap proves nothing without a condition: timeoutMs is waitFor\'s own cap, and any other step takes its cap inside before { "timeoutMs": n } / after { "timeoutMs": n }',
  holdOutsideKey: 'ms is the hold length of a key step; a step that waits states a condition (waitFor) or caps one in before / after',
  untilOutsideKey: "until releases a held key once its condition holds, so it belongs on a key step",
  unknownField: "a drive step is one kind plus before, after, note and tolerancePx",
  unknownConditionField: "a condition is is, value, timeoutMs and note, and nothing else",
} as const;

/** An `[x, y]` pair of CSS viewport pixels, the shape the engine's step file takes for a click. */
export function isPoint(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

/** A positive poll cap in milliseconds, the shape the engine's condition takes. */
function isCap(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Check one `before` / `after` condition; an empty list means the runner accepts it too. */
export function conditionProblems(value: unknown, at: string): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [`${at} must be a condition object { "is": "<page expression>" } (${RULES.unknownConditionField})`];
  }
  const problems: string[] = [];
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(CONDITION_FIELDS as readonly string[]).includes(key)) {
      problems.push(`${at} has unknown condition field "${key}" (${RULES.unknownConditionField})`);
    }
  }
  if (typeof record.is !== "string" || record.is.trim().length === 0) {
    problems.push(`${at} needs "is": the page expression it waits for`);
  }
  if (record.timeoutMs !== undefined && !isCap(record.timeoutMs)) {
    problems.push(`${at} timeoutMs must be a positive number of milliseconds`);
  }
  if (record.note !== undefined && typeof record.note !== "string") problems.push(`${at} note must be a string`);
  return problems;
}

/** What a step's own value must look like, per kind. */
export function stepValueProblem(kind: string, value: unknown): string | null {
  switch (kind) {
    case "assert":
      return typeof value === "string" && value.trim().length > 0 ? null : "the assert expression must be a non-empty string";
    case "clickAt":
    case "rightClickAt":
    case "look":
    case "moveMouse":
      return isPoint(value) ? null : `${kind} takes [x, y] pixel numbers`;
    case "aimAt":
      return typeof value === "string" && value.trim().length > 0 ? null : "aimAt takes the page expression that returns the target's screen point";
    case "wait":
      return typeof value === "number" && value >= 0 ? null : "wait takes milliseconds as a number";
    case "waitFor":
      return typeof value === "string" && value.trim().length > 0 ? null : "waitFor takes the page expression it waits for";
    case "flow":
      return typeof value === "string" && FLOW_NAME.test(value) ? null : "a flow include takes a flow name (lowercase letters, digits and dashes)";
    case "probe":
      return typeof value === "string" ? null : "probe takes a name string";
    case "key":
      return typeof value === "string" && value.trim().length > 0 ? null : 'key takes a key chord such as "KeyW" or "KeyW+ShiftLeft"';
    case "reload":
      return null;
    case "rpc":
      // The engine's drive reads a bridge request object, e.g. {"method":"run_command","name":"x.y"}.
      return value !== null && typeof value === "object" && !Array.isArray(value) && typeof (value as { method?: unknown }).method === "string"
        ? null
        : 'rpc takes a bridge request object such as {"method":"run_command","name":"game.command"}';
    default:
      return typeof value === "string" && value.trim().length > 0 ? null : `${kind} takes a non-empty string`;
  }
}

export interface StepCheck {
  problems: string[];
  /** The step's kind, or null when the object names none or several. */
  kind: FlowStepKind | null;
}

/**
 * Check one step object: exactly one kind, only the fields that kind or a condition owns, and a
 * value the runner can read. A `{ "flow": name }` include carries no fields of its own, because the
 * runner expands it in place.
 */
export function stepProblems(step: unknown, at: string): StepCheck {
  if (step === null || typeof step !== "object" || Array.isArray(step)) {
    return { problems: [`${at} is not an object`], kind: null };
  }
  const record = step as Record<string, unknown>;
  const kinds = Object.keys(record).filter((key) => (FLOW_STEP_KINDS as readonly string[]).includes(key));
  if (kinds.length === 0) {
    return { problems: [`${at} has none of the drive step keys (${FLOW_STEP_KINDS.join(", ")})`], kind: null };
  }
  if (kinds.length > 1) {
    return { problems: [`${at} mixes step keys ${kinds.join(" and ")}; ${RULES.oneKind}`], kind: null };
  }
  const kind = kinds[0] as FlowStepKind;
  const problems: string[] = [];

  for (const key of Object.keys(record)) {
    if (key === kind) continue;
    if ((STEP_EXTRAS as readonly string[]).includes(key)) continue;
    if (key === "timeoutMs") {
      if (kind !== "waitFor") problems.push(`${at} carries timeoutMs on a ${kind} step; ${RULES.capOutsideCondition}`);
      continue;
    }
    if (key === "ms") {
      if (kind !== "key") problems.push(`${at} carries ms on a ${kind} step; ${RULES.holdOutsideKey}`);
      continue;
    }
    if (key === "until") {
      if (kind !== "key") problems.push(`${at} carries until on a ${kind} step; ${RULES.untilOutsideKey}`);
      else problems.push(...conditionProblems(record.until, `${at} until`));
      continue;
    }
    if (key === "is") {
      if (kind !== "assert") problems.push(`${at} carries "is" on a ${kind} step; "is" is the expected value of an assert`);
      continue;
    }
    problems.push(`${at} has unknown field "${key}" (${RULES.unknownField})`);
  }

  if (kind === "flow") {
    const extra = Object.keys(record).filter((key) => key !== kind);
    if (extra.length > 0) {
      problems.push(`${at} is a flow include, which carries no fields of its own (got ${extra.join(", ")}); put them on the flow's steps`);
      return { problems, kind };
    }
  }

  if (kind === "key" && "ms" in record && (typeof record.ms !== "number" || record.ms < 0)) {
    problems.push(`${at} key hold takes ms as a non-negative number`);
  }
  if (kind === "waitFor" && "timeoutMs" in record && !isCap(record.timeoutMs)) {
    problems.push(`${at} timeoutMs must be a positive number of milliseconds`);
  }
  for (const key of ["before", "after"] as const) {
    if (key in record) problems.push(...conditionProblems(record[key], `${at} ${key}`));
  }

  const problem = stepValueProblem(kind, record[kind]);
  if (problem !== null) {
    problems.push(`${at} ${problem}`);
    return { problems, kind };
  }
  return { problems, kind };
}
