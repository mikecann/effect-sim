#!/usr/bin/env bun
// The camera mapping tool. Runbook: tools/mapping/README.md.
//
//   bun tools/mapping/cli.ts status  --project <id>
//   bun tools/mapping/cli.ts capture --project <id> --view front --camera snap:1
//   bun tools/mapping/cli.ts decode  <run dir>
//   bun tools/mapping/cli.ts verify  <run dir> --string 3 --led 3:0,50,100
//   bun tools/mapping/cli.ts verify  <run dir> --fill-blocks all
//   bun tools/mapping/cli.ts upload  <run dir> [--finish]

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { MappingPattern } from "../../convex/schema";
import {
  describe as describePattern,
  FfmpegCamera,
  listCameras,
  ManualCamera,
  PhoneCamera,
  SnapCamera,
  type Camera,
} from "./lib/cameras";
import { capture } from "./lib/capture";
import { SyntheticCamera, type Lights } from "./lib/fakes";
import {
  readDecoded,
  readManifest,
  writeDecoded,
  type Decoded,
  type MappedString,
} from "./lib/manifest";
import { PyWorker, runDecode, toolDir } from "./lib/python";
import { ensure } from "../../shared/ensure";
import { makeScene, type HouseString, type Scene } from "./lib/scene";
import { ConvexMapping } from "./lib/session";
import { checkWrites } from "./lib/deployment";
import { fillBlocks } from "./lib/blockFill";
import { hwirSupportsRanges } from "./lib/hwirSupport";
import { uploadView } from "./lib/upload";

// The deployment comes from CONVEX_URL, or VITE_CONVEX_URL in the repo's
// .env.local (what `npx convex dev` selected). The editor token from
// EDITOR_TOKEN in the environment or .env.local.
const envLocal = (() => {
  const path = join(toolDir, "..", "..", ".env.local");
  if (!existsSync(path)) return {} as Record<string, string>;
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.replace(/\s+#.*$/, "").match(/^([A-Z_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2].trim()]),
  );
})();
const convexUrl = () => {
  const url = process.env.CONVEX_URL ?? envLocal.VITE_CONVEX_URL;
  if (!url)
    throw new Error(
      "No Convex URL: set CONVEX_URL or run `npx convex dev` once.",
    );
  return url;
};
const connect = () =>
  new ConvexMapping(
    convexUrl(),
    process.env.EDITOR_TOKEN ?? envLocal.EDITOR_TOKEN,
  );

/** connect(), for commands that change a session: says which deployment, and
 *  refuses a cloud one without --prod (and with a fake camera at all). */
const connectForWrites = (opts: { prod?: boolean; camera?: string }) => {
  log(
    checkWrites(convexUrl(), {
      prod: opts.prod,
      fake: opts.camera?.startsWith("synthetic")
        ? "synthetic camera"
        : undefined,
    }),
  );
  return connect();
};
const prodOption = [
  "--prod",
  "allow changing a session on a cloud deployment (production: the real lights)",
] as const;

const log = (line: string) => console.log(line);
const ago = (t: number | undefined) =>
  t ? `${((Date.now() - t) / 1000).toFixed(0)} s ago` : "never";

/** Checks HWIR and the display before lighting anything; returns warnings. */
const preflight = async (
  mapping: ConvexMapping,
  projectId: string,
  strings: MappedString[],
) => {
  const warnings: string[] = [];
  const presence = await mapping.presence(projectId);
  if (presence) {
    if (presence.status !== "online")
      warnings.push(
        `HWIR is ${presence.status} (last heartbeat ${ago(presence.lastSeenAt)}). Patterns won't be acked.`,
      );
    for (const s of strings) {
      const st = presence.strings.find((x) => x.key === s.key);
      if (st?.connection !== "live")
        warnings.push(
          `String ${s.name} is ${st?.connection ?? "unknown to HWIR"} (last seen ${ago(st?.lastSeenAt)}): its ${s.ledCount} LEDs won't light, so they won't decode. Fix it, or capture now and map it later in its own session.`,
        );
    }
  } else warnings.push("HWIR has never reported for this project.");
  const display = await mapping.client.query(api.display.get, {
    projectId: projectId as Id<"projects">,
  });
  if (display && !display.settings.isOn)
    warnings.push(
      "The display is OFF: HWIR shows mapping patterns at brightness 0. Turn it on in the Lights app first.",
    );
  else if (display && display.settings.brightness > 0.6)
    warnings.push(
      `Display brightness is ${display.settings.brightness}. Full-white LEDs at night saturate the camera; 0.3 to 0.5 maps better.`,
    );
  return warnings;
};

const makeCamera = (
  spec: string,
  lights?: () => Lights,
  py?: PyWorker,
  strings?: MappedString[],
): Camera => {
  const [kind, ...rest] = spec.split(":");
  const arg = rest.join(":");
  if (kind === "snap") return new SnapCamera(arg || "0");
  if (kind === "ffmpeg") return new FfmpegCamera(arg || "0");
  if (kind === "phone") return new PhoneCamera(arg || "http://127.0.0.1:18731");
  if (kind === "manual")
    return new ManualCamera(
      resolve(arg || join(process.env.HOME ?? ".", "Downloads")),
    );
  if (kind === "synthetic") {
    const scene = JSON.parse(readFileSync(arg, "utf8")) as Scene;
    return new SyntheticCamera(
      resolve(arg),
      scene,
      ensure(strings, "The synthetic camera needs the strings."),
      ensure(lights, "The synthetic camera needs the lights.")(),
      ensure(py, "The synthetic camera needs the Python worker."),
    );
  }
  throw new Error(
    `Unknown camera "${spec}": snap:<index|name>, ffmpeg:<index>, phone[:<server url>], manual[:<folder>] or synthetic:<scene.json>.`,
  );
};

/** What the lights show, read from the session (for the synthetic camera). */
class SessionLights implements Lights {
  current: MappingPattern = { kind: "off" };
  constructor(mapping: ConvexMapping, sessionId: string) {
    mapping.client.onUpdate(
      api.mapping.get,
      { sessionId: sessionId as Id<"mappingSessions"> },
      (row) => {
        if (
          row?.state.kind === "capturing" &&
          row.state.shownSeq === row.state.request.seq
        )
          this.current = row.state.request.pattern;
      },
    );
  }
  showing() {
    return this.current;
  }
}

const findString = (strings: { key: string; name: string }[], ref: string) => {
  const s =
    strings.find((x) => x.key === ref) ?? strings.find((x) => x.name === ref);
  if (!s)
    throw new Error(
      `No string "${ref}". Strings: ${strings.map((x) => x.name).join(", ")}`,
    );
  return s;
};

const program = new Command("mapping").description(
  "Camera mapping of the house's LEDs (tools/mapping/README.md)",
);

program
  .command("cameras")
  .description("List the cameras the snap backend can open")
  .action(() => {
    const cams = listCameras();
    if (!cams.length)
      log("No cameras (or the helper isn't built: tools/mapping/setup.sh).");
    for (const c of cams) log(`snap:${c.index}  ${c.name}  (${c.id})`);
  });

program
  .command("status")
  .description("HWIR, the display and the mapping session for a project")
  .requiredOption("--project <id>")
  .action(async ({ project }) => {
    const mapping = connect();
    try {
      const strings = await mapping.strings(project);
      const presence = await mapping.presence(project);
      const display = await mapping.client.query(api.display.get, {
        projectId: project,
      });
      const active = await mapping.active(project);
      log(`Convex: ${convexUrl()}`);
      log(
        `HWIR: ${presence ? `${presence.status}, commit ${presence.commit.slice(0, 7)}, ${presence.fps.toFixed(0)} fps, last heartbeat ${ago(presence.lastSeenAt)}` : "never reported"}`,
      );
      log(
        `Display: ${display ? `${display.settings.isOn ? "on" : "OFF"}, brightness ${display.settings.brightness}, mode ${display.settings.mode.kind} (${display.status})` : "none"}`,
      );
      log(
        `Session: ${active ? `${active.id} ${active.state.kind}${active.state.kind === "capturing" ? ` (seq ${active.state.request.seq}, shown ${active.state.shownSeq})` : ""}` : "none"}`,
      );
      for (const s of strings) {
        const st = presence?.strings.find((x) => x.key === s.key);
        log(
          `  ${s.name.padEnd(12)} ${String(s.ledCount).padStart(4)} LEDs  ${(st?.connection ?? "?").padEnd(10)} seen ${ago(st?.lastSeenAt)}  key ${s.key}`,
        );
      }
      for (const w of await preflight(mapping, project, strings))
        log(`WARNING: ${w}`);
    } finally {
      await mapping.close();
    }
  });

program
  .command("capture")
  .description(
    "Start or join the project's session and photograph every pattern for one viewpoint",
  )
  .requiredOption("--project <id>")
  .requiredOption(
    "--view <name>",
    "a name for this camera position, e.g. front, left-corner",
  )
  .requiredOption(
    "--camera <spec>",
    "snap:<index|name> | ffmpeg:<index> | manual[:<folder>] | synthetic:<scene.json>",
  )
  .option(
    "--out <dir>",
    "run folder (default tools/mapping/runs/<time>-<view>)",
  )
  .option("--settle <ms>", "wait after HWIR's ack before each photo", "400")
  .option(
    "--recapture",
    "take a session in solving or review back to capturing",
  )
  .option("--force", "capture even when the preflight finds problems")
  .option(...prodOption)
  .action(async (opts) => {
    const mapping = connectForWrites(opts);
    const py = new PyWorker();
    let camera: Camera | undefined;
    try {
      const strings = await mapping.strings(opts.project);
      const warnings = await preflight(mapping, opts.project, strings);
      for (const w of warnings) log(`WARNING: ${w}`);
      if (
        warnings.some(
          (w) => w.startsWith("The display is OFF") || w.startsWith("HWIR"),
        ) &&
        !opts.force
      )
        throw new Error("Not capturing until that's fixed (or pass --force).");
      const { sessionId, joined } = await mapping.startOrJoin(opts.project, {
        recapture: opts.recapture,
      });
      log(`${joined ? "Joined" : "Started"} session ${sessionId}.`);
      const runDir = resolve(
        opts.out ??
          join(
            toolDir,
            "runs",
            `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}-${opts.view}`,
          ),
      );
      camera = makeCamera(
        opts.camera,
        () => new SessionLights(mapping, sessionId),
        py,
        strings,
      );
      const settleMs = Number(opts.settle);
      log(
        `Capturing into ${runDir} (${strings.length} strings, ${strings.reduce((a, s) => a + s.ledCount, 0)} LEDs).`,
      );
      await capture({
        runDir,
        projectId: opts.project,
        view: opts.view,
        strings,
        session: mapping.driver(sessionId),
        camera,
        py,
        settleMs: opts.camera.startsWith("manual") ? 0 : settleMs,
        log,
      });
      log(`Next: bun tools/mapping/cli.ts decode ${runDir}`);
    } finally {
      await camera?.close();
      py.close();
      await mapping.close();
    }
  });

program
  .command("decode <run>")
  .description("Find every LED's 2D point in a run's frames")
  .action((run: string) => {
    const started = Date.now();
    const summary = runDecode(resolve(run));
    log(
      `Decoded in ${((Date.now() - started) / 1000).toFixed(1)} s: of ${summary.totalLeds} LEDs, ${summary.stats.measured} seen, ${summary.stats.interpolated} filled between neighbours (low confidence), ${summary.stats.outliers} thrown out as not fitting their string; ${summary.stats.impossibleCodes} spots had codes no LED has.`,
    );
    for (const s of summary.strings) {
      const missing = s.ledCount - s.measured - s.interpolated;
      log(
        `  ${s.name.padEnd(12)} ${String(s.measured).padStart(4)} seen ${String(s.interpolated).padStart(3)} filled ${String(missing).padStart(4)} missing${s.measured === 0 ? "   <- nothing: offline, hidden from this view, or out of frame" : ""}`,
      );
    }
    log(`Look at ${join(resolve(run), "debug.jpg")}.`);
  });

program
  .command("verify <run>")
  .description(
    "Light single strings or LEDs and check them against the decode; --fill-blocks fills gaps a block at a time, --fill one LED at a time",
  )
  .option("--camera <spec>", "camera spec (default: the run's)")
  .option("--string <ref...>", "string names or keys to light one at a time")
  .option("--led <ref...>", "<string>:<i>,<i>,... LEDs to light one at a time")
  .option(
    "--fill <ref...>",
    "measure every missing or interpolated LED of these strings, one at a time",
  )
  .option("--max <n>", "most LEDs --fill lights", "60")
  .option(
    "--fill-blocks <ref...>",
    "fill the gaps of these strings (or all) a block of LEDs at a time, robust to twinkling lights",
  )
  .option("--block <n>", "LEDs per block for --fill-blocks", "8")
  .option(
    "--repeats <n>",
    "photos of each block frame (light must be in all of them); one more where twinkle got through",
    "1",
  )
  .option(
    "--minutes <n>",
    "--fill-blocks starts no new round after this long",
    "6",
  )
  .option("--settle <ms>", "", "400")
  .option(...prodOption)
  .action(async (run: string, opts) => {
    const runDir = resolve(run);
    const manifest = readManifest(runDir);
    const decoded = readDecoded(runDir);
    const mapping = connectForWrites({
      prod: opts.prod,
      camera: opts.camera ?? manifest.camera,
    });
    const py = new PyWorker();
    let camera: Camera | undefined;
    try {
      const active = await mapping.active(manifest.projectId);
      if (
        active?.state.kind !== "capturing" ||
        active.id !== manifest.sessionId
      )
        throw new Error(
          `Session ${manifest.sessionId} isn't capturing any more (it's ${active?.id === manifest.sessionId ? active.state.kind : "gone"}). Verify before upload --finish.`,
        );
      const session = mapping.driver(manifest.sessionId);
      const strings = manifest.codeTable;
      const spec =
        opts.camera ??
        (manifest.camera === "snap"
          ? `snap:${String(manifest.cameraInfo?.id ?? 0)}`
          : manifest.camera);
      camera = makeCamera(
        spec,
        () => new SessionLights(mapping, manifest.sessionId),
        py,
        strings,
      );
      await camera.open();
      await session.show({ kind: "all" });
      await camera.lock();
      const settle = Number(opts.settle);
      const dark = join(runDir, "dark.jpg");
      const shot = async (pattern: MappingPattern, name: string) => {
        await session.show(pattern);
        const file = join(runDir, `verify-${name}.jpg`);
        await ensure(camera).snap(file, { name, pattern }, settle);
        return file;
      };
      const tol = Math.max(3, decoded.imageWidth / 600);
      let failures = 0;
      const pointOf = (key: string, i: number) =>
        decoded.strings.find((s) => s.key === key)?.points[i] ?? null;

      for (const ref of opts.string ?? []) {
        const s = findString(strings, ref);
        const expect = ensure(
          decoded.strings.find((x) => x.key === s.key),
        ).points.filter((p) => p !== null);
        const res = await py.call<{ expectedLit: number; litExpected: number }>(
          "locate",
          {
            dark,
            frame: await shot(
              { kind: "string", nodeKey: s.key },
              `string-${s.name}`,
            ),
            expect,
            debug: join(runDir, `verify-string-${s.name}-debug.jpg`),
          },
        );
        const ok = res.expectedLit >= 0.9 && res.litExpected >= 0.9;
        if (!ok) failures++;
        log(
          `${ok ? "OK  " : "FAIL"} string ${s.name}: ${(res.expectedLit * 100).toFixed(0)}% of its decoded points are lit, ${(res.litExpected * 100).toFixed(0)}% of the lit light is near them`,
        );
      }

      // Single LEDs are compared with a fresh all-off frame, not the run's
      // dark frame: a phone that can't lock exposure sets the same exposure
      // for both nearly dark scenes, but not for the dark frame taken right
      // after the all-on one.
      let ledDark: string | undefined;
      // Where LED i of a string can be: between its nearest measured
      // neighbours, with room for how far apart they are.
      const nearOf = (key: string, i: number) => {
        const pts = decoded.strings.find((x) => x.key === key)?.points ?? [];
        const ok = (
          p: (typeof pts)[number] | undefined,
        ): p is NonNullable<(typeof pts)[number]> => !!p && p.confidence >= 0.3;
        let a = i - 1;
        while (a >= 0 && !ok(pts[a])) a--;
        let b = i + 1;
        while (b < pts.length && !ok(pts[b])) b++;
        const pa = a >= 0 ? pts[a] : null;
        const pb = b < pts.length ? pts[b] : null;
        // Typical spacing between neighbouring LEDs in the image (u units,
        // scaled to the long side).
        const aspect = decoded.imageHeight / decoded.imageWidth;
        const gaps: number[] = [];
        for (let k = 1; k < pts.length; k++) {
          const p = pts[k - 1],
            q = pts[k];
          if (ok(p) && ok(q))
            gaps.push(Math.hypot(p.u - q.u, (p.v - q.v) * aspect));
        }
        gaps.sort((x, y) => x - y);
        const step = gaps.length ? gaps[gaps.length >> 1] : 0.01;
        if (pa && pb) {
          const t = (i - a) / (b - a);
          const half = Math.hypot(pa.u - pb.u, (pa.v - pb.v) * aspect) / 2;
          return {
            u: pa.u + (pb.u - pa.u) * t,
            v: pa.v + (pb.v - pa.v) * t,
            radius: half + step * 4,
          };
        }
        const p = pa ?? pb;
        if (!p) return undefined;
        return {
          u: p.u,
          v: p.v,
          radius: step * (Math.abs(i - (pa ? a : b)) + 4),
        };
      };
      const measure = async (key: string, name: string, i: number) => {
        ledDark ??= await shot({ kind: "off" }, "off");
        const res = await py.call<{
          blobs: { u: number; v: number; weight: number }[];
        }>("locate", {
          near: nearOf(key, i),
          dark: ledDark,
          frame: await shot(
            { kind: "led", nodeKey: key, index: i },
            `led-${name}-${i}`,
          ),
        });
        const [best, second] = res.blobs;
        const clear = best && (!second || second.weight < best.weight * 0.3);
        return clear ? best : null;
      };

      for (const spec of opts.led ?? []) {
        const [ref, list] = spec.split(":");
        const s = findString(strings, ref);
        for (const i of list.split(",").map(Number)) {
          const seen = await measure(s.key, s.name, i);
          const p = pointOf(s.key, i);
          if (!seen) {
            failures++;
            log(
              `FAIL ${s.name}[${i}]: no single clear spot lit (hidden from this view, or a reflection)`,
            );
            continue;
          }
          const dist = p
            ? Math.hypot(
                (seen.u - p.u) * decoded.imageWidth,
                (seen.v - p.v) * decoded.imageHeight,
              )
            : Infinity;
          const ok = dist <= tol;
          if (!ok) failures++;
          log(
            `${ok ? "OK  " : "FAIL"} ${s.name}[${i}]: ${p ? `decoded ${dist.toFixed(1)} px from where it lights${p.confidence < 0.3 ? " (that point was interpolated)" : ""}` : "not in the decode"}`,
          );
        }
      }

      let filled = 0;
      let measuredCount = 0;
      const max = Number(opts.max);
      for (const ref of opts.fill ?? []) {
        const s = findString(strings, ref);
        const out = ensure(decoded.strings.find((x) => x.key === s.key));
        const todo = out.points.flatMap((p, i) =>
          p === null || p.confidence < 0.3 ? [i] : [],
        );
        log(
          `Filling ${s.name}: ${todo.length} LEDs to measure${todo.length > max - filled ? `, only the first ${Math.max(0, max - filled)} (--max)` : ""}.`,
        );
        for (const i of todo) {
          if (filled >= max) break;
          const seen = await measure(s.key, s.name, i);
          filled++;
          if (seen) measuredCount++;
          // Seen on its own: a measured point. Not seen: hidden from this
          // view, so no guess either (another viewpoint may have it).
          out.points[i] = seen
            ? { u: +seen.u.toFixed(6), v: +seen.v.toFixed(6), confidence: 0.9 }
            : null;
          log(
            `  ${s.name}[${i}]: ${seen ? "measured" : "not visible from here"}`,
          );
        }
        out.measured = out.points.filter(
          (p) => p && p.confidence >= 0.3,
        ).length;
        out.interpolated = out.points.filter(
          (p) => p && p.confidence < 0.3,
        ).length;
      }
      if (filled) {
        writeDecoded(runDir, decoded as Decoded);
        log(
          `Lit ${filled} LEDs one by one: ${measuredCount} measured, ${filled - measuredCount} hidden from this view (now empty). Saved decoded.json.`,
        );
      }

      if (opts.fillBlocks) {
        const presence = await mapping.presence(manifest.projectId);
        const support = hwirSupportsRanges(presence?.commit, toolDir);
        if (!support.ok) throw new Error(support.why);
        const refs: string[] = opts.fillBlocks;
        const keys = refs.includes("all")
          ? decoded.strings.map((s) => s.key)
          : refs.map((ref) => findString(strings, ref).key);
        const report = await fillBlocks({
          decoded: decoded as Decoded,
          keys,
          names: new Map(strings.map((s) => [s.key, s.name])),
          session,
          camera,
          py,
          dir: join(runDir, "blocks"),
          settleMs: settle,
          blockSize: Number(opts.block),
          repeats: Number(opts.repeats),
          minutes: Number(opts.minutes),
          log,
        });
        writeDecoded(runDir, decoded as Decoded);
        await py.call("draw", {
          photo: join(
            runDir,
            existsSync(join(runDir, "reference.jpg"))
              ? "reference.jpg"
              : "all.jpg",
          ),
          result: decoded,
          out: join(runDir, "debug-blocks.jpg"),
        });
        log(
          `Block fill: ${report.found} LEDs placed, ${report.hidden} hidden from this view, ${report.unclear} unclear, ${report.left} not reached, of ${report.todo}, in ${report.rounds} rounds, ${report.frames} photos, ${report.seconds.toFixed(0)} s (${report.secondsPerFrame.toFixed(1)} s a photo). Saved decoded.json; look at ${join(runDir, "debug-blocks.jpg")} and the frames in ${join(runDir, "blocks")}.`,
        );
      }
      await session.show({ kind: "all" });
      if (failures) process.exitCode = 1;
    } finally {
      await camera?.close();
      py.close();
      await mapping.close();
    }
  });

program
  .command("upload <run>")
  .description(
    "Put a run's points and photos into its session as a view; --finish ends the capture (session → solving)",
  )
  .option(
    "--finish",
    "this was the last viewpoint: the lights go back to playing",
  )
  .option(
    "--session <id>",
    "upload into this session instead of the run's (when the run's lapsed)",
  )
  .option(...prodOption)
  .action(async (run: string, opts) => {
    const runDir = resolve(run);
    const manifest = readManifest(runDir);
    const decoded = readDecoded(runDir);
    const sessionId: string = opts.session ?? manifest.sessionId;
    const mapping = connectForWrites({
      prod: opts.prod,
      camera: manifest.camera,
    });
    try {
      const { reference } = await uploadView(mapping, {
        runDir,
        sessionId,
        manifest,
        decoded,
      });
      const seen = decoded.strings.reduce(
        (a, s) => a + s.points.filter((p) => p && p.confidence >= 0.3).length,
        0,
      );
      log(
        `Uploaded view "${manifest.view}" (${seen} LEDs seen, photo ${reference}) to session ${sessionId}.`,
      );
      if (opts.finish) {
        await mapping.mutate(api.mapping.captured, {
          sessionId: sessionId,
        });
        log(
          "Capture finished: the session is solving, the lights are back to playing. Hand over to the editor's review.",
        );
      }
    } finally {
      await mapping.close();
    }
  });

program
  .command("start")
  .description(
    "Start (or join) the project's session without capturing, e.g. to aim the camera with show",
  )
  .requiredOption("--project <id>")
  .option(...prodOption)
  .action(async ({ project, prod }) => {
    const mapping = connectForWrites({ prod });
    try {
      const { sessionId, joined } = await mapping.startOrJoin(project);
      log(
        `${joined ? "Joined" : "Started"} session ${sessionId}. Light patterns with show; it lapses after 10 idle minutes.`,
      );
    } finally {
      await mapping.close();
    }
  });

program
  .command("finish")
  .description(
    "End the project's capture (session → solving) without uploading",
  )
  .requiredOption("--project <id>")
  .option(...prodOption)
  .action(async ({ project, prod }) => {
    const mapping = connectForWrites({ prod });
    try {
      const active = await mapping.active(project);
      if (active?.state.kind !== "capturing")
        throw new Error(
          `No capturing session (${active?.state.kind ?? "none"}).`,
        );
      await mapping.mutate(api.mapping.captured, { sessionId: active.id });
      log(`Session ${active.id} is solving; the lights are back to playing.`);
    } finally {
      await mapping.close();
    }
  });

program
  .command("discard")
  .description(
    "Give up on the project's session (the lights go back to playing)",
  )
  .requiredOption("--project <id>")
  .option(...prodOption)
  .action(async ({ project, prod }) => {
    const mapping = connectForWrites({ prod });
    try {
      const active = await mapping.active(project);
      if (!active) throw new Error("No active session.");
      await mapping.mutate(api.mapping.discard, { sessionId: active.id });
      log(`Discarded ${active.id}.`);
    } finally {
      await mapping.close();
    }
  });

program
  .command("show <pattern>")
  .description(
    "Light one pattern in the capturing session (off, all, string:<ref>, led:<ref>:<i>, range:<ref>:<from>-<to>, bit:<n>[:inv]), to aim the camera",
  )
  .requiredOption("--project <id>")
  .option(...prodOption)
  .action(async (pattern: string, { project, prod }) => {
    const mapping = connectForWrites({ prod });
    try {
      const active = await mapping.active(project);
      if (active?.state.kind !== "capturing")
        throw new Error(
          "No capturing session; start one with capture (or show after a capture).",
        );
      const strings = await mapping.strings(project);
      const [kind, a, b] = pattern.split(":");
      const p: MappingPattern =
        kind === "string"
          ? { kind, nodeKey: findString(strings, a).key }
          : kind === "led"
            ? { kind, nodeKey: findString(strings, a).key, index: Number(b) }
            : kind === "range"
              ? {
                  kind: "ranges",
                  ranges: [
                    {
                      nodeKey: findString(strings, a).key,
                      from: Number(b.split("-")[0]),
                      to: Number(b.split("-")[1] ?? b.split("-")[0]),
                    },
                  ],
                }
              : kind === "bit"
                ? { kind, bit: Number(a), inverted: b === "inv" }
                : kind === "all"
                  ? { kind }
                  : { kind: "off" };
      const { seq } = await mapping.driver(active.id).show(p);
      log(`Showing ${describePattern(p)} (seq ${seq}).`);
    } finally {
      await mapping.close();
    }
  });

program
  .command("scene")
  .description(
    "Make a synthetic house photo scene from the project's strings, for the synthetic camera",
  )
  .option(
    "--project <id>",
    "read strings from Convex (default: the test fixture)",
  )
  .requiredOption("--out <file>")
  .option("--width <px>", "", "3840")
  .option("--height <px>", "", "2160")
  .option("--yaw <deg>", "", "330")
  .option("--seed <n>", "", "7")
  .option(
    "--twinkles <n>",
    "twinkling warm lights near the strings, like the icicle lights",
    "0",
  )
  .action(async (opts) => {
    let strings: HouseString[];
    if (opts.project) {
      const mapping = connect();
      const data = await mapping.client.query(api.functions.getDataForProject, {
        projectId: opts.project,
      });
      await mapping.close();
      strings = data.nodes.flatMap((n) =>
        n.kind === "string"
          ? [
              {
                key: n.key,
                name: n.name,
                ledCount: n.ledCount,
                spacingMeters: n.spacingMeters,
                pathPoints: n.pathPoints.map((p) => p.position),
              },
            ]
          : [],
      );
    } else
      strings = (
        JSON.parse(
          readFileSync(
            join(toolDir, "test/fixtures/house-strings.json"),
            "utf8",
          ),
        ) as { strings: HouseString[] }
      ).strings;

    const scene = makeScene(strings, {
      width: Number(opts.width),
      height: Number(opts.height),
      yawDegrees: Number(opts.yaw),
      seed: Number(opts.seed),
      twinkles: Number(opts.twinkles),
    });
    writeFileSync(opts.out, JSON.stringify(scene));
    log(
      `Wrote ${opts.out}: ${scene.leds.filter((l) => l.visible).length} of ${scene.leds.length} LEDs visible.`,
    );
  });

program.parseAsync().catch((e: unknown) => {
  console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
