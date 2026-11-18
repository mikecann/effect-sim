import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

// The pixel work lives in py/mapping_cv.py, run with the venv's interpreter in
// isolated mode (README "Setup" makes the venv).

export const toolDir = fileURLToPath(new URL("..", import.meta.url));
export const venvPython = join(toolDir, ".venv", "bin", "python");
const script = join(toolDir, "py", "mapping_cv.py");

export const pythonReady = () => existsSync(venvPython);

const ensureVenv = () => {
  if (!pythonReady())
    throw new Error(
      `No Python venv at ${venvPython}. Run tools/mapping/setup.sh first.`,
    );
};

/** Runs `mapping_cv.py decode <run>` and returns its summary. */
export const runDecode = (runDir: string) => {
  ensureVenv();
  const out = spawnSync(venvPython, ["-I", script, "decode", runDir], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (out.status !== 0)
    throw new Error(`Decoding failed:\n${out.stderr || out.stdout}`);
  return JSON.parse(
    out.stdout.trim().split("\n").at(-1) ?? "",
  ) as DecodeSummary;
};

export type DecodeSummary = {
  totalLeds: number;
  stats: {
    measured: number;
    interpolated: number;
    outliers: number;
    impossibleCodes: number;
  };
  strings: {
    key: string;
    name: string;
    ledCount: number;
    measured: number;
    interpolated: number;
    outliers: number;
  }[];
};

/** A long-lived `mapping_cv.py worker`, for checks and renders mid-capture. */
export class PyWorker {
  private proc: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private waiting = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  constructor() {
    ensureVenv();
    this.proc = spawn(venvPython, ["-I", script, "worker"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    this.proc.stderr.on("data", (d) => (stderr += String(d)));
    createInterface({ input: this.proc.stdout }).on("line", (line) => {
      const res = JSON.parse(line) as {
        id: number;
        ok: boolean;
        result?: unknown;
        error?: string;
      };
      const waiter = this.waiting.get(res.id);
      this.waiting.delete(res.id);
      if (res.ok) waiter?.resolve(res.result);
      else waiter?.reject(new Error(res.error));
    });
    this.proc.on("exit", (code) => {
      for (const w of this.waiting.values())
        w.reject(new Error(`Python worker exited (${code}): ${stderr}`));
      this.waiting.clear();
    });
  }

  call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.proc.stdin.write(JSON.stringify({ id, cmd, ...args }) + "\n");
    });
  }

  close() {
    this.proc.stdin.end();
    this.proc.kill();
  }
}
