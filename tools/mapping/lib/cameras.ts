import {
  spawn,
  spawnSync,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { createInterface } from "node:readline";
import type { MappingPattern } from "../../../convex/schema";
import { toolDir } from "./python";

// Where the photos come from. Every backend saves one JPEG per call to `snap`.

export type FrameRequest = { name: string; pattern: MappingPattern };

export interface Camera {
  readonly kind: string;
  /** Opens the camera; returns what it found (name, size). */
  open(): Promise<Record<string, unknown>>;
  /** Locks exposure, focus and white balance where the camera allows it. */
  lock(): Promise<Record<string, unknown>>;
  /** Back to automatic exposure, for the reference photo. */
  auto(): Promise<Record<string, unknown>>;
  /** Waits settleMs, then saves the next photo to `path` (a .jpg). */
  snap(path: string, frame: FrameRequest, settleMs: number): Promise<void>;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const snapBinary = join(toolDir, ".bin", "snap");

/** Cameras the Swift helper sees, for `cameras`. */
export const listCameras = () => {
  if (!existsSync(snapBinary)) return [];
  const out = spawnSync(snapBinary, ["--list"], { encoding: "utf8" });
  return out.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { index: number; name: string; id: string });
};

/**
 * A Mac webcam or an iPhone as a Continuity Camera, through the Swift helper
 * (camera/snap.swift). The camera stays open for the whole capture, so its
 * exposure is the same for every frame once locked.
 */
export class SnapCamera implements Camera {
  readonly kind = "snap";
  private proc?: ChildProcessWithoutNullStreams;
  private replies: ((line: string) => void)[] = [];

  constructor(private readonly device: string) {}

  private next(): Promise<Record<string, unknown>> {
    return new Promise((resolve) =>
      this.replies.push((line) =>
        resolve(JSON.parse(line) as Record<string, unknown>),
      ),
    );
  }

  private async command(cmd: string) {
    const reply = this.next();
    if (!this.proc) throw new Error("The camera isn't open.");
    this.proc.stdin.write(cmd + "\n");
    const res = await reply;
    if (!res.ok) throw new Error(`Camera: ${String(res.error)}`);
    return res;
  }

  async open() {
    if (!existsSync(snapBinary))
      throw new Error(
        `No camera helper at ${snapBinary}. Run tools/mapping/setup.sh.`,
      );
    this.proc = spawn(snapBinary, ["--device", this.device], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stderr.pipe(process.stderr);
    createInterface({ input: this.proc.stdout }).on("line", (line) =>
      this.replies.shift()?.(line),
    );
    const ready = await this.next();
    if (!ready.ok) throw new Error(`Camera: ${String(ready.error)}`);
    // Let auto exposure and focus settle before anything locks them.
    await sleep(2500);
    return ready;
  }

  lock() {
    return this.command("lock");
  }

  auto() {
    return this.command("auto");
  }

  async snap(path: string, _frame: FrameRequest, settleMs: number) {
    await this.command(`snap ${path} ${Math.round(settleMs)}`);
  }

  async close() {
    const proc = this.proc;
    if (!proc || proc.exitCode !== null) return;
    proc.stdin.write("quit\n");
    await Promise.race([new Promise((r) => proc.once("exit", r)), sleep(2000)]);
    proc.kill();
  }
}

/**
 * The fallback when the Swift helper won't build: ffmpeg streams the camera
 * into one file it keeps overwriting, and a snap copies the first version
 * written after the settle delay. It can't lock exposure.
 */
export class FfmpegCamera implements Camera {
  readonly kind = "ffmpeg";
  private proc?: ChildProcess;
  private readonly latest = join(tmpdir(), `mapping-ffmpeg-${process.pid}.jpg`);

  constructor(private readonly device: string) {}

  async open() {
    this.proc = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "avfoundation",
        "-framerate",
        "30",
        "-i",
        this.device,
        "-vf",
        "fps=10",
        "-q:v",
        "2",
        "-update",
        "1",
        "-atomic_writing",
        "1",
        "-y",
        this.latest,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    const deadline = Date.now() + 10_000;
    while (!existsSync(this.latest)) {
      if (Date.now() > deadline || this.proc.exitCode !== null)
        throw new Error(
          'ffmpeg sent no frames. Check the device index with `ffmpeg -f avfoundation -list_devices true -i ""`.',
        );
      await sleep(100);
    }
    await sleep(2500);
    return { device: this.device, exposure: "auto (ffmpeg can't lock it)" };
  }

  async lock() {
    return {
      exposure: "unsupported",
      focus: "unsupported",
      whiteBalance: "unsupported",
    };
  }

  async auto() {
    return {};
  }

  async snap(path: string, _frame: FrameRequest, settleMs: number) {
    const after = Date.now() + settleMs;
    await sleep(settleMs);
    const deadline = after + 5000;
    while (statSync(this.latest).mtimeMs <= after) {
      if (Date.now() > deadline)
        throw new Error("ffmpeg stopped sending frames.");
      await sleep(20);
    }
    copyFileSync(this.latest, path);
  }

  async close() {
    this.proc?.kill("SIGINT");
  }
}

/**
 * A phone running the page from phonecam/server.ts in Safari, on any lens
 * (the ultra-wide fits the whole garden in). The server must be running and
 * the phone's page connected. Exposure lock depends on what Safari allows.
 */
export class PhoneCamera implements Camera {
  readonly kind = "phone";

  constructor(private readonly server: string) {}

  private async call(path: string) {
    const res = await fetch(`${this.server}/${path}`);
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok || body.ok === false)
      throw new Error(`Phone camera: ${String(body.error ?? res.status)}`);
    return body;
  }

  async open() {
    const status = await this.call("status");
    if (!status.connected)
      throw new Error(
        "Phone camera: no phone connected. Open the phonecam page on the phone and tap Start camera.",
      );
    return { lens: status.lens, width: status.width, height: status.height };
  }

  lock() {
    return this.call("lock");
  }

  auto() {
    return this.call("auto");
  }

  async snap(path: string, _frame: FrameRequest, settleMs: number) {
    const res = await fetch(
      `${this.server}/snap?settle=${Math.round(settleMs)}`,
    );
    if (!res.ok)
      throw new Error(`Phone camera: ${await res.text()}`);
    writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
  }

  async close() {}
}

const imageExts = new Set([".jpg", ".jpeg", ".heic", ".png"]);

/**
 * A person takes each photo (a phone on a tripod) and drops it into a folder,
 * by AirDrop (which lands in ~/Downloads) or a synced folder. The tool says
 * which photo it wants, then waits for a new image in the folder.
 */
export class ManualCamera implements Camera {
  readonly kind = "manual";

  constructor(
    private readonly inbox: string,
    private readonly prompt: (message: string) => void = console.log,
  ) {}

  async open() {
    mkdirSync(this.inbox, { recursive: true });
    this.prompt(
      `Manual camera: put the phone on its tripod, lock exposure and focus on the lit house (Camera app: press and hold on the lights until "AE/AF LOCK" shows), and send each photo to ${this.inbox} (AirDrop goes to ~/Downloads).`,
    );
    return { inbox: this.inbox };
  }

  async lock() {
    return { exposure: "by hand", focus: "by hand", whiteBalance: "by hand" };
  }

  async auto() {
    this.prompt(
      "For the next photo, tap the screen once to unlock exposure (AE/AF LOCK off), so the house shows.",
    );
    return {};
  }

  private images() {
    return new Map(
      readdirSync(this.inbox)
        .filter((f) => imageExts.has(extname(f).toLowerCase()))
        .map((f) => [f, statSync(join(this.inbox, f)).mtimeMs] as const),
    );
  }

  async snap(path: string, frame: FrameRequest, settleMs: number) {
    const before = this.images();
    await sleep(settleMs);
    this.prompt(
      `PHOTO NEEDED: "${frame.name}" (${describe(frame.pattern)}) is showing. Take it now and send it to ${this.inbox}.`,
    );
    for (;;) {
      await sleep(500);
      const fresh = [...this.images()].filter(([f, m]) => before.get(f) !== m);
      if (fresh.length === 0) continue;
      const [file] = fresh.sort((a, b) => b[1] - a[1])[0];
      const src = join(this.inbox, file);
      // Wait for AirDrop to finish writing it.
      let size = -1;
      while (statSync(src).size !== size) {
        size = statSync(src).size;
        await sleep(400);
      }
      if (
        extname(file).toLowerCase() === ".heic" ||
        extname(file).toLowerCase() === ".png"
      ) {
        const out = spawnSync(
          "sips",
          [
            "-s",
            "format",
            "jpeg",
            "-s",
            "formatOptions",
            "95",
            src,
            "--out",
            path,
          ],
          { encoding: "utf8" },
        );
        if (out.status !== 0)
          throw new Error(`Couldn't convert ${src}: ${out.stderr}`);
      } else copyFileSync(src, path);

      renameSync(src, join(this.inbox, `.used-${file}`));
      this.prompt(`Got ${file}.`);
      return;
    }
  }

  async close() {}
}

export const describe = (p: MappingPattern) =>
  p.kind === "bit"
    ? `bit ${p.bit}${p.inverted ? " inverted" : ""}`
    : p.kind === "string"
      ? `string ${p.nodeKey}`
      : p.kind === "led"
        ? `LED ${p.index} of ${p.nodeKey}`
        : p.kind === "all"
          ? "every LED on"
          : "every LED off";
