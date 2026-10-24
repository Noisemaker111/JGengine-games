/**
 * Start a long command without waiting for it, then read the answer when it exists.
 *
 *   bun run bg:run -- bun run verify:full     # prints the id and returns at once
 *   bun run bg:await <id>                     # blocks until it exits, then prints its output and code
 *
 * A task lives in this checkout's `.scratch/bg/<id>/`: `cmd.txt`, `out.log`, `runner` (the
 * supervisor's pid) and, when it is over, `exit`. The command runs with this repository as
 * its cwd, so a background job acts on the games repo and not on the engine one.
 *
 * Neither command polls: `bg:await` watches the task directory and returns the moment the
 * exit file appears. A slow heartbeat only notices a supervisor that died without writing
 * one. The engine's own `bg:run`/`bg:await` belong to the engine checkout; these belong here.
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const self = import.meta.filename;
const tasks = join(root, ".scratch", "bg");
const TASK_ID = /^[0-9a-z-]{8,64}$/;
const BEAT_MS = 2_000;

function newId(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function read(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function commandFrom(argv: readonly string[]): string {
  const words = argv[0] === "--" ? argv.slice(1) : argv;
  return words.join(" ").trim();
}

function start(command: string): void {
  if (command.length === 0) {
    console.error("bg:run: nothing to run. Usage: bun run bg:run -- <command>");
    process.exit(2);
  }
  const id = newId();
  const dir = join(tasks, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cmd.txt"), `${command}\n`);
  const child = spawn(process.execPath, [self, "supervise", dir, command], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  console.log(id);
  console.error(`bg:await ${id}   (or: bun run bg:await ${id})`);
  console.error(`output: ${join(dir, "out.log")}`);
}

function supervise(dir: string, command: string): void {
  const fd = openSync(join(dir, "out.log"), "a");
  writeFileSync(join(dir, "runner"), `${process.pid}\n`);
  const [file, args] =
    process.platform === "win32" ? ["cmd.exe", ["/d", "/s", "/c", command]] : ["bash", ["-lc", command]];
  const child = spawn(file, args, { cwd: root, stdio: ["ignore", fd, fd], windowsHide: true });
  const finish = (code: number, note?: string): void => {
    if (note !== undefined) writeFileSync(join(dir, "out.log"), `${note}\n`, { flag: "a" });
    writeFileSync(join(dir, "exit"), `${code}\n`);
    try {
      closeSync(fd);
    } catch {
      // the command inherited the descriptor and closed it already
    }
    process.exit(0);
  };
  child.on("error", (error) => finish(127, `bg:run: could not start the command: ${String(error)}`));
  child.on("exit", (code) => finish(code ?? 1));
}

function exitCode(dir: string): number | null {
  const text = read(join(dir, "exit"));
  if (text === null) return null;
  const code = Number(text.trim());
  return Number.isInteger(code) ? code : 1;
}

function awaitExit(dir: string, id: string, timeoutMs?: number): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    let watcher: ReturnType<typeof watch> | null = null;
    let beat: ReturnType<typeof setInterval> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      watcher?.close();
      if (beat !== null) clearInterval(beat);
      if (deadline !== null) clearTimeout(deadline);
      resolve(code);
    };
    const check = (): void => {
      const code = exitCode(dir);
      if (code !== null) finish(code);
    };
    try {
      watcher = watch(dir, () => check());
      watcher.on("error", () => check());
    } catch {
      watcher = null;
    }
    check();
    beat = setInterval(() => {
      if (exitCode(dir) !== null) return check();
      const runner = read(join(dir, "runner"));
      const pid = runner === null ? null : Number(runner.trim());
      if (pid !== null && Number.isInteger(pid) && !alive(pid)) {
        console.error(`bg:await: the runner for ${id} is gone and left no exit code`);
        finish(null);
      }
    }, BEAT_MS);
    if (timeoutMs !== undefined) {
      deadline = setTimeout(() => {
        console.error(`bg:await: ${id} was still running after ${Math.round(timeoutMs / 1000)}s; it keeps running`);
        finish(null);
      }, timeoutMs);
    }
  });
}

async function awaitTask(argv: readonly string[]): Promise<void> {
  const words = argv[0] === "--" ? argv.slice(1) : argv;
  const id = words.find((word) => !word.startsWith("--"));
  const timeoutIndex = words.indexOf("--timeout");
  const seconds = timeoutIndex >= 0 ? Number(words[timeoutIndex + 1]) : undefined;
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds <= 0)) {
    console.error("bg:await: --timeout needs seconds");
    process.exit(2);
  }
  if (id === undefined || !TASK_ID.test(id)) {
    console.error(`bg:await: "${id ?? ""}" is not a task id. Usage: bun run bg:await <id> [--timeout <seconds>]`);
    process.exit(4);
  }
  const dir = join(tasks, id);
  if (!existsSync(dir)) {
    console.error(`bg:await: no task ${id} in ${root}. A task lives until someone deletes ${dir}`);
    process.exit(4);
  }
  let code = exitCode(dir);
  if (code === null) {
    const command = read(join(dir, "cmd.txt"))?.trim() ?? "";
    console.error(`bg:await: waiting for ${id}${command.length > 0 ? ` (${command})` : ""}`);
    code = await awaitExit(dir, id, seconds === undefined ? undefined : seconds * 1000);
  }
  const output = read(join(dir, "out.log")) ?? "";
  if (output.length > 0) process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  if (code === null) {
    console.error(`bg:await: ${id} never reported an exit code`);
    process.exit(5);
  }
  console.log(`bg:await: ${id} exited ${code}`);
  process.exit(code);
}

if (import.meta.main) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "supervise") {
    const dir = rest[0];
    const command = rest.slice(1).join(" ");
    if (dir === undefined || command.length === 0) {
      console.error("bg:run: --supervise needs a task directory and a command");
      process.exit(2);
    }
    supervise(dir, command);
  } else if (mode === "await") {
    await awaitTask(rest);
  } else {
    start(commandFrom(mode === "run" ? rest : [mode ?? "", ...rest]));
  }
}
