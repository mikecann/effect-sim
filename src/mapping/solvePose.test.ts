import { describe, expect, test } from "vitest";
import {
  projectPoint,
  solvePose,
  type CameraPose,
  type Correspondence,
  type Quat,
  type Vec3,
} from "./solvePose";

/** three.js-style lookAt: the camera's -Z points from eye to target, +Y as close to world up as it can be. */
function lookAt(eye: Vec3, target: Vec3): Quat {
  const z = normalise(sub(eye, target));
  const x = normalise(cross({ x: 0, y: 1, z: 0 }, z));
  const y = cross(z, x);
  return quatFromAxes(x, y, z);
}

/** Quaternion for the rotation whose columns are the given axes. */
function quatFromAxes(x: Vec3, y: Vec3, z: Vec3): Quat {
  const trace = x.x + y.y + z.z;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return {
      w: 0.25 / s,
      x: (y.z - z.y) * s,
      y: (z.x - x.z) * s,
      z: (x.y - y.x) * s,
    };
  }
  if (x.x > y.y && x.x > z.z) {
    const s = 2 * Math.sqrt(1 + x.x - y.y - z.z);
    return {
      w: (y.z - z.y) / s,
      x: 0.25 * s,
      y: (y.x + x.y) / s,
      z: (z.x + x.z) / s,
    };
  }
  if (y.y > z.z) {
    const s = 2 * Math.sqrt(1 + y.y - x.x - z.z);
    return {
      w: (z.x - x.z) / s,
      x: (y.x + x.y) / s,
      y: 0.25 * s,
      z: (z.y + y.z) / s,
    };
  }
  const s = 2 * Math.sqrt(1 + z.z - x.x - y.y);
  return {
    w: (x.y - y.x) / s,
    x: (z.x + x.z) / s,
    y: (z.y + y.z) / s,
    z: 0.25 * s,
  };
}

/** Hamilton product a * b. */
function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/** Quaternion rotating `degrees` about an axis. */
function axisAngle(axis: Vec3, degrees: number): Quat {
  const n = normalise(axis);
  const half = (degrees * Math.PI) / 360;
  const s = Math.sin(half);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(half) };
}

/** Angle in degrees between two rotations. */
function angleBetween(a: Quat, b: Quat): number {
  const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return (360 / Math.PI) * Math.acos(Math.min(1, d));
}

/** a - b. */
function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** a x b. */
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Unit vector along a. */
function normalise(a: Vec3): Vec3 {
  const n = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / n, y: a.y / n, z: a.z / n };
}

/** Distance between two points. */
function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Deterministic standard-normal samples (mulberry32 + Box-Muller). */
function gaussian(seed: number): () => number {
  let state = seed;
  const uniform = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () =>
    Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}

const eye = { x: 6, y: 3, z: 9 };
const truth: CameraPose = {
  position: eye,
  quaternion: lookAt(eye, { x: 0, y: 1.5, z: 0 }),
  fovDeg: 50,
  aspect: 1.5,
};

/** Corners, roof ridge, a door and a chimney of a house about 8 x 6 x 5 m. */
const housePoints: Vec3[] = [
  { x: -4, y: 0, z: 3 },
  { x: 4, y: 0, z: 3 },
  { x: 4, y: 0, z: -3 },
  { x: -4, y: 0, z: -3 },
  { x: -4, y: 3, z: 3 },
  { x: 4, y: 3, z: 3 },
  { x: 4, y: 3, z: -3 },
  { x: -4, y: 5, z: 0 },
  { x: 4, y: 5, z: 0 },
  { x: 1, y: 2.1, z: 3 },
  { x: -2, y: 5.8, z: -1 },
];

/** Image positions of world points as seen by `pose`, optionally with noise. */
function correspondences(
  pose: CameraPose,
  worlds: Vec3[],
  noise?: () => number,
): Correspondence[] {
  return worlds.map((world) => {
    const image = projectPoint(pose, world);
    if (!image) throw new Error("test point is behind the camera");
    if (!noise) return { image, world };
    return {
      image: {
        u: image.u + noise() / pose.aspect,
        v: image.v + noise(),
      },
      world,
    };
  });
}

/** Asserts a solved pose is close to the true one. */
function expectClose(
  pose: CameraPose,
  tolerance: { metres: number; fovDeg: number; rotationDeg: number },
) {
  expect(distance(pose.position, truth.position)).toBeLessThan(
    tolerance.metres,
  );
  expect(Math.abs(pose.fovDeg - truth.fovDeg)).toBeLessThan(tolerance.fovDeg);
  expect(angleBetween(pose.quaternion, truth.quaternion)).toBeLessThan(
    tolerance.rotationDeg,
  );
  expect(pose.aspect).toBe(truth.aspect);
}

const tight = { metres: 1e-3, fovDeg: 0.01, rotationDeg: 0.01 };

/** The true camera pushed off by about a metre, 10 degrees of fov and 5 degrees of rotation. */
const perturbed: CameraPose = {
  position: { x: 6.6, y: 3.5, z: 9.7 },
  quaternion: quatMul(axisAngle({ x: 1, y: 2, z: 0.5 }, 5), truth.quaternion),
  fovDeg: 60,
  aspect: 1.5,
};

describe("projectPoint", () => {
  test("a point on the optical axis lands in the centre", () => {
    const ahead = { x: -6, y: -1.5, z: -9 }; // eye + 2 * (target - eye)
    const p = projectPoint(truth, {
      x: eye.x + ahead.x,
      y: eye.y + ahead.y,
      z: eye.z + ahead.z,
    });
    expect(p?.u).toBeCloseTo(0.5, 12);
    expect(p?.v).toBeCloseTo(0.5, 12);
  });

  test("matches a hand-checked off-centre value", () => {
    // Identity camera at the origin, fov 90 so the top edge is at y = z, aspect 2.
    const pose: CameraPose = {
      position: { x: 0, y: 0, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      fovDeg: 90,
      aspect: 2,
    };
    // ndcX = x / (aspect * d) = 1 / 4, ndcY = y / d = 0.5.
    const p = projectPoint(pose, { x: 1, y: 1, z: -2 });
    expect(p?.u).toBeCloseTo(0.625, 12);
    expect(p?.v).toBeCloseTo(0.25, 12);
  });

  test("returns null for a point behind the camera", () => {
    const behind = { x: eye.x + 6, y: eye.y + 1.5, z: eye.z + 9 };
    expect(projectPoint(truth, behind)).toBeNull();
  });
});

describe("solvePose", () => {
  test("recovers the camera from the DLT alone", () => {
    const result = solvePose(correspondences(truth, housePoints), {
      aspect: 1.5,
    });
    expectClose(result.pose, tight);
    expect(result.rmsError).toBeLessThan(1e-9);
  });

  test("recovers the camera from 5 points and a rough starting camera", () => {
    const result = solvePose(correspondences(truth, housePoints.slice(4, 9)), {
      aspect: 1.5,
      initial: perturbed,
    });
    expectClose(result.pose, tight);
    expect(result.rmsError).toBeLessThan(1e-9);
  });

  test("recovers the camera from 4 points and a close starting camera", () => {
    const close: CameraPose = {
      position: { x: 6.1, y: 2.95, z: 9.1 },
      quaternion: quatMul(axisAngle({ x: 0, y: 1, z: 1 }, 1), truth.quaternion),
      fovDeg: 52,
      aspect: 1.5,
    };
    const four = [
      housePoints[0],
      housePoints[2],
      housePoints[5],
      housePoints[7],
    ];
    const result = solvePose(correspondences(truth, four), {
      aspect: 1.5,
      initial: close,
    });
    expectClose(result.pose, tight);
  });

  test("the DLT seed beats a poor starting camera", () => {
    const result = solvePose(correspondences(truth, housePoints), {
      aspect: 1.5,
      initial: perturbed,
    });
    expectClose(result.pose, tight);
  });

  test("stays within a few centimetres with pixel noise", () => {
    const noise = gaussian(42);
    const result = solvePose(
      correspondences(truth, housePoints, () => noise() * 0.002),
      { aspect: 1.5 },
    );
    // Across seeds this noise level gives 3-8 cm, 0.1-0.4 degrees of fov and 0.1-0.2 degrees of rotation: the statistical floor, not the solver.
    expectClose(result.pose, { metres: 0.05, fovDeg: 0.5, rotationDeg: 0.3 });
    expect(result.rmsError).toBeGreaterThan(0.0005);
    expect(result.rmsError).toBeLessThan(0.005);
  });

  test("explains when there are too few points", () => {
    const pts = correspondences(truth, housePoints);
    expect(() => solvePose(pts.slice(0, 3), { aspect: 1.5 })).toThrow(
      "Pick at least 4 matching points to line up the camera (you have 3).",
    );
    expect(() =>
      solvePose(pts.slice(0, 3), { aspect: 1.5, initial: perturbed }),
    ).toThrow("at least 4");
    expect(() => solvePose(pts.slice(0, 5), { aspect: 1.5 })).toThrow(
      "With fewer than 6 matching points (you have 5) the fit needs a starting camera. Pick at least 6 points, or start from the current view.",
    );
  });
});
