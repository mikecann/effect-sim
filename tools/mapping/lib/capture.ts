import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, type Camera } from "./cameras";
import {
  framePlan,
  newManifest,
  writeManifest,
  type FrameRecord,
  type MappedString,
  type RunManifest,
} from "./manifest";
import type { PyWorker } from "./python";
import type { MappingSessionDriver } from "./session";

// One viewpoint's capture: every frame of the plan, each taken after HWIR
// confirms its pattern is out plus a settle delay, each checked before moving
// on. See README "How it works".

export type CaptureOptions = {
  runDir: string;
  projectId: string;
  view: string;
  strings: MappedString[];
  session: MappingSessionDriver;
  camera: Camera;
  py: PyWorker;
  settleMs: number;
  /** Photos of one pattern before asking HWIR to show it again. */
  snapsPerShow?: number;
  /** Times a pattern is shown before giving up. */
  showsPerFrame?: number;
  log?: (line: string) => void;
};

/** Less of the lit area than this changing means the lights hadn't moved on. */
export const MIN_CHANGE = 0.05;
/** A bit's two frames must add up to at least this much of the all-on frame. */
export const MIN_EXPLAINED = 0.6;

export const capture = async (opts: CaptureOptions): Promise<RunManifest> => {
  const log = opts.log ?? console.log;
  const snapsPerShow = opts.snapsPerShow ?? 2;
  const showsPerFrame = opts.showsPerFrame ?? 3;
  mkdirSync(opts.runDir, { recursive: true });
  const manifest = newManifest({
    projectId: opts.projectId,
    sessionId: opts.session.sessionId,
    view: opts.view,
    camera: opts.camera.kind,
    strings: opts.strings,
  });
  const started = Date.now();
  manifest.cameraInfo = await opts.camera.open();

  // Let the camera's auto exposure settle on the lit house, then lock it, so
  // every frame of the code has the same exposure.
  await opts.session.show({ kind: "all" });
  await new Promise((r) => setTimeout(r, opts.settleMs));
  manifest.cameraInfo = {
    ...manifest.cameraInfo,
    locked: await opts.camera.lock(),
  };
  const locked = manifest.cameraInfo.locked as Record<string, unknown>;
  if (locked.exposure === "unsupported")
    log(
      "WARNING: this camera can't lock its exposure, so it will brighten the dark frames and dim the lit ones. The decode copes with some of that, but an iPhone (Continuity Camera, or manual photos with AE/AF lock) maps better.",
    );
  writeManifest(opts.runDir, manifest);
  const path = (name: string) => join(opts.runDir, `${name}.jpg`);
  // An all-on photo for the dark frame to differ from.
  await opts.camera.snap(
    path("locked"),
    { name: "locked", pattern: { kind: "all" } },
    opts.settleMs,
  );

  const plan = framePlan(manifest.bits);
  const file = (name: string) => `${name}.jpg`;
  const byName = new Map<string, FrameRecord>();

  const take = async (index: number): Promise<FrameRecord> => {
    const { name, pattern } = plan[index];
    if (name === "reference") await opts.camera.auto();
    const previous = index > 0 ? plan[index - 1].name : "locked";
    let attempts = 0;
    for (let show = 0; show < showsPerFrame; show++) {
      const { seq } = await opts.session.show(pattern);
      for (let snap = 0; snap < snapsPerShow; snap++) {
        attempts++;
        // Each extra try waits longer: the lights or the camera were slow.
        await opts.camera.snap(
          path(name),
          { name, pattern },
          opts.settleMs * (1 + snap + show),
        );
        let check: Record<string, number> | undefined;
        // The reference photo has a different exposure, so it can't be compared.
        if (name !== "reference") {
          check = await opts.py.call<Record<string, number>>("change", {
            prev: path(previous),
            cur: path(name),
          });
          if (check.changed < MIN_CHANGE) {
            log(
              `  ${name}: only ${(check.changed * 100).toFixed(1)}% changed from ${previous}; taking it again`,
            );
            continue;
          }
        }
        return {
          name,
          file: file(name),
          pattern,
          seq,
          takenAt: Date.now(),
          attempts,
          check,
        };
      }
    }
    throw new Error(
      `Frame ${name} (${describe(pattern)}) looked the same as ${previous} after ${attempts} tries. Are the lights in mapping mode, and is the camera pointing at them?`,
    );
  };

  for (let i = 0; i < plan.length; i++) {
    const { name } = plan[i];
    let record = await take(i);
    byName.set(name, record);
    // After a bit's inverted frame, check the pair against the all-on frame;
    // retake both if they don't add up (a frame caught mid-change).
    if (name.endsWith("i") && name.startsWith("bit")) {
      const normal = name.slice(0, -1);
      for (let retry = 0; ; retry++) {
        const pair = await opts.py.call<{ explained: number }>("pair", {
          dark: path("dark"),
          all: path("all"),
          normal: path(normal),
          inverted: path(name),
        });
        record.check = { ...record.check, explained: pair.explained };
        if (pair.explained >= MIN_EXPLAINED) break;
        if (retry >= 2) {
          log(
            `  ${normal}/${name}: still only ${(pair.explained * 100).toFixed(0)}% of the lit LEDs; keeping them, the decode will mark weak bits`,
          );
          break;
        }
        log(
          `  ${normal}/${name}: together they light only ${(pair.explained * 100).toFixed(0)}% of the LEDs; taking both again`,
        );
        byName.set(normal, await take(i - 1));
        record = await take(i);
        byName.set(name, record);
      }
    }
    manifest.frames = [...byName.values()];
    writeManifest(opts.runDir, manifest);
    log(
      `  ${name} (${describe(plan[i].pattern)}) ok${record.attempts > 1 ? ` after ${record.attempts} tries` : ""}`,
    );
  }

  // Leave the lights showing every LED, which is what verify compares against.
  await opts.session.show({ kind: "all" });
  manifest.complete = true;
  manifest.frames = plan.flatMap((p) => byName.get(p.name) ?? []);
  writeManifest(opts.runDir, manifest);
  log(
    `Captured ${plan.length} frames in ${((Date.now() - started) / 1000).toFixed(0)} s.`,
  );
  return manifest;
};
