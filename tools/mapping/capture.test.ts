// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { capture } from "./lib/capture";
import { FakeSession, SyntheticCamera } from "./lib/fakes";
import { readDecoded, readManifest } from "./lib/manifest";
import { PyWorker, pythonReady, runDecode } from "./lib/python";
import { makeScene, type HouseString } from "./lib/scene";

// The whole capture and decode against a made-up photo of the house: the real
// strings' paths, projected through a pinhole camera, with hidden runs of LEDs
// and a few LEDs overlapping another string's. Needs the Python venv
// (tools/mapping/setup.sh); skipped without it.

const fixture = JSON.parse(
  readFileSync(
    join(import.meta.dirname ?? __dirname, "test/fixtures/house-strings.json"),
    "utf8",
  ),
) as {
  strings: (HouseString & {
    pathPoints: { x: number; y: number; z: number }[];
  })[];
};

const dirs: string[] = [];
afterAll(() => {
  if (process.env.KEEP_MAPPING_RUN) return;
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// It takes about 45 s, so it only runs when asked: MAPPING_E2E=1 bun run test.
describe.skipIf(!pythonReady() || process.env.MAPPING_E2E !== "1")(
  "synthetic house",
  () => {
    test(
      "capture and decode find nearly every visible LED within 2 px",
      { timeout: 180_000 },
      async () => {
        const dir = mkdtempSync(join(tmpdir(), "mapping-synthetic-"));
        dirs.push(dir);
        const strings = fixture.strings;
        const scene = makeScene(strings, {
          seed: 7,
          width: 3840,
          height: 2160,
          yawDegrees: 330,
        });
        const scenePath = join(dir, "scene.json");
        writeFileSync(scenePath, JSON.stringify(scene));

        const py = new PyWorker();
        const session = new FakeSession();
        const camera = new SyntheticCamera(
          scenePath,
          scene,
          strings,
          session,
          py,
        );
        // One frame comes back before the lights changed: capture must notice.
        camera.staleOnce.add("bit3");
        const runDir = join(dir, "run");
        const lines: string[] = [];
        try {
          await capture({
            runDir,
            projectId: "synthetic",
            view: "front",
            strings,
            session,
            camera,
            py,
            settleMs: 0,
            log: (l) => lines.push(l),
          });
        } finally {
          py.close();
        }
        const manifest = readManifest(runDir);
        expect(manifest.complete).toBe(true);
        expect(
          manifest.frames.find((f) => f.name === "bit3")?.attempts,
        ).toBeGreaterThan(1);

        runDecode(runDir);
        const decoded = readDecoded(runDir);
        const { width, height } = scene;
        const point = new Map(
          decoded.strings.flatMap((s) =>
            s.points.map((p, i) => [`${s.key}:${i}`, p] as const),
          ),
        );
        const error = (l: (typeof scene.leds)[number]) => {
          const p = point.get(`${l.key}:${l.index}`);
          return p
            ? Math.hypot(p.u * width - 0.5 - l.x, p.v * height - 0.5 - l.y)
            : Infinity;
        };
        const measured = (l: (typeof scene.leds)[number]) =>
          (point.get(`${l.key}:${l.index}`)?.confidence ?? 0) >= 0.3;

        const visible = scene.leds.filter((l) => l.visible);
        const found = visible.filter((l) => measured(l) && error(l) <= 2);
        // LEDs within 1.5 px of another visible one are one spot of light in the
        // photo: no decode can tell which is where. They need another viewpoint.
        const separable = visible.filter((l) =>
          visible.every(
            (o) => o === l || Math.hypot(o.x - l.x, o.y - l.y) >= 1.5,
          ),
        );
        const foundSeparable = separable.filter(
          (l) => measured(l) && error(l) <= 2,
        );
        const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
        const median = (xs: number[]) => sorted(xs)[Math.floor(xs.length / 2)];
        const errors = sorted(found.map(error));
        const off = scene.leds.filter((l) => measured(l) && error(l) > 2);
        const wrong = scene.leds.filter((l) => measured(l) && error(l) > 5);
        const interpolated = scene.leds.filter(
          (l) => point.get(`${l.key}:${l.index}`) && !measured(l),
        );
        const overlapped = visible.filter((l) => l.why === "overlap");

        const summary = {
          leds: scene.leds.length,
          visible: visible.length,
          recovered: found.length,
          recovery: +(found.length / visible.length).toFixed(4),
          separable: separable.length,
          separableRecovery: +(
            foundSeparable.length / separable.length
          ).toFixed(4),
          medianErrorPx: +errors[Math.floor(errors.length / 2)].toFixed(3),
          p95ErrorPx: +errors[Math.floor(errors.length * 0.95)].toFixed(3),
          over2px: off.length,
          over5px: wrong.length,
          interpolated: interpolated.length,
          interpolatedMedianErrorPx: interpolated.length
            ? +median(interpolated.map(error)).toFixed(2)
            : null,
          overlapsFound: `${overlapped.filter((l) => measured(l) && error(l) <= 2).length}/${overlapped.length}`,
        };
        console.log("synthetic mapping:", JSON.stringify(summary));
        expect(summary.separableRecovery).toBeGreaterThanOrEqual(0.98);
        expect(summary.recovery).toBeGreaterThanOrEqual(0.97);
        // Points a little off are LEDs crowded within a pixel or two of another;
        // ones far off would put an LED on the wrong part of the house.
        expect(wrong.length).toBeLessThanOrEqual(
          Math.ceil(found.length * 0.005),
        );
      },
    );
  },
);
