import type * as THREE from "three";
import type { MappingView } from "../../convex/schema";
import type { Point3 } from "../../shared/geometry/stringLayout";
import { cameraForPose, imageToNdc } from "./photoCamera";
import type { CameraPose } from "./solvePose";
import { rayFromCamera, raycastSurfaceHit } from "../simulator/placing/raycast";

// Turning the camera views' 2D points into LED positions. Each lined-up view
// casts the points it saw from its camera onto the house; where several views
// saw an LED, the surer one wins, and between two about as sure, the one that
// saw it more head-on. LEDs no view saw well enough are filled in from their
// neighbours along the string.

/**
 * The capture tool measures points at 0.3 or more and interpolates its own
 * gaps below 0.25; only measured points are used.
 */
export const SEEN_CONFIDENCE = 0.3;

/** Two views this close in confidence count as equally sure. */
const CONFIDENCE_TIE = 0.1;

/** How an LED got its proposed position. */
export type LedSource =
  | { kind: "seen"; confidence: number; view: string }
  /** Filled in from its neighbours: not seen, unsure, or off the house. */
  | { kind: "filled" };

export type ProposedString = {
  nodeKey: string;
  positions: Point3[];
  sources: LedSource[];
};

/** A view, lined up: its points and the camera that took its photo. */
export type AlignedView = {
  name: string;
  pose: CameraPose;
  strings: MappingView["strings"];
};

type Candidate = {
  position: Point3;
  confidence: number;
  headOn: number;
  view: string;
};

const lerp = (a: Point3, b: Point3, t: number): Point3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

/**
 * Fills each missing LED from its neighbours along the string: between two
 * known LEDs it sits on the line between them, by index; past either end it
 * takes the nearest known one. Null when no LED is known.
 */
export const fillFromNeighbours = (
  points: ReadonlyArray<Point3 | null>,
): Point3[] | null => {
  const known = points.flatMap((p, i) => (p ? [i] : []));
  if (known.length === 0) return null;
  return points.map((p, i) => {
    if (p) return p;
    const after = known.find((k) => k > i);
    const before = [...known].reverse().find((k) => k < i);
    const a = before === undefined ? null : points[before];
    const b = after === undefined ? null : points[after];
    if (a && b && before !== undefined && after !== undefined)
      return lerp(a, b, (i - before) / (after - before));
    return a ?? b ?? { x: 0, y: 0, z: 0 };
  });
};

/** Whether `a` should win over `b` for the same LED. */
const isBetter = (a: Candidate, b: Candidate) =>
  Math.abs(a.confidence - b.confidence) < CONFIDENCE_TIE
    ? a.headOn > b.headOn
    : a.confidence > b.confidence;

/** Each LED one view saw, cast onto the house. */
const castView = (
  view: AlignedView,
  meshes: THREE.Object3D[],
): Map<string, Map<number, Candidate>> => {
  const camera = cameraForPose(view.pose);
  const found = new Map<string, Map<number, Candidate>>();
  for (const { nodeKey, points } of view.strings) {
    const leds = new Map<number, Candidate>();
    points.forEach((point, index) => {
      if (!point || point.confidence < SEEN_CONFIDENCE) return;
      const hit = raycastSurfaceHit(
        rayFromCamera(camera, imageToNdc(point)),
        meshes,
      );
      if (!hit) return;
      leds.set(index, {
        position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        confidence: point.confidence,
        headOn: hit.headOn,
        view: view.name,
      });
    });
    found.set(nodeKey, leds);
  }
  return found;
};

/**
 * Every string's proposed LED positions from the lined-up views, gaps filled.
 * A string no view put on the house is left out.
 */
export const projectViews = ({
  views,
  ledCountOf,
  meshes,
}: {
  views: ReadonlyArray<AlignedView>;
  ledCountOf: (nodeKey: string) => number | null;
  meshes: THREE.Object3D[];
}): ProposedString[] => {
  const best = new Map<string, Map<number, Candidate>>();
  for (const view of views)
    for (const [nodeKey, leds] of castView(view, meshes)) {
      const merged = best.get(nodeKey) ?? new Map<number, Candidate>();
      for (const [index, candidate] of leds) {
        const current = merged.get(index);
        if (!current || isBetter(candidate, current))
          merged.set(index, candidate);
      }
      best.set(nodeKey, merged);
    }

  return [...best].flatMap(([nodeKey, leds]) => {
    const ledCount = ledCountOf(nodeKey);
    if (!ledCount) return [];
    const hits = Array.from(
      { length: ledCount },
      (_, i) => leds.get(i)?.position ?? null,
    );
    const positions = fillFromNeighbours(hits);
    if (!positions) return [];
    const sources = Array.from({ length: ledCount }, (_, i): LedSource => {
      const seen = leds.get(i);
      return seen
        ? { kind: "seen", confidence: seen.confidence, view: seen.view }
        : { kind: "filled" };
    });
    return [{ nodeKey, positions, sources }];
  });
};

/** How much of the house one view covers: per string, the LEDs it measured. */
export const viewCoverage = (view: Pick<MappingView, "strings">) =>
  view.strings.map(({ nodeKey, points }) => ({
    nodeKey,
    seen: points.filter((p) => p && p.confidence >= SEEN_CONFIDENCE).length,
    total: points.length,
  }));

/**
 * How each LED of a string was most likely placed, from the views alone (for
 * a review opened after a reload, when the projection's own record is gone).
 */
export const sourcesFromViews = (
  views: ReadonlyArray<Pick<MappingView, "name" | "strings">>,
  nodeKey: string,
  ledCount: number,
): LedSource[] =>
  Array.from({ length: ledCount }, (_, i): LedSource => {
    let best: LedSource = { kind: "filled" };
    for (const view of views) {
      const point = view.strings.find((s) => s.nodeKey === nodeKey)?.points[i];
      if (!point || point.confidence < SEEN_CONFIDENCE) continue;
      if (best.kind === "filled" || point.confidence > best.confidence)
        best = { kind: "seen", confidence: point.confidence, view: view.name };
    }
    return best;
  });
