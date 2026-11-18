export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
/** A pinhole camera in three.js conventions: it looks down its local -Z with +Y up; principal point at the image centre, square pixels. */
export type CameraPose = {
  position: Vec3;
  quaternion: Quat; // camera-to-world rotation, as THREE.Camera.quaternion
  fovDeg: number; // vertical field of view, as THREE.PerspectiveCamera.fov
  aspect: number; // image width / height
};
/** u goes right and v goes down, both 0..1 across the image. */
export type ImagePoint = { u: number; v: number };
export type Correspondence = { image: ImagePoint; world: Vec3 };

export type SolveResult = {
  pose: CameraPose;
  /** Root mean square reprojection error, in units of image height. */
  rmsError: number;
};

/** Row-major 3x3 matrix. */
type Mat3 = number[];

/**
 * The camera as the solver works with it. `focal` is the focal length in
 * image-height units, so a point at camera-space (x, y, -d) lands
 * `focal * x / d` image heights right of the centre.
 */
type Camera = { rotation: Mat3; position: Vec3; focal: number };

/** An image point measured in image heights from the centre, right and down. */
type Centred = { a: number; b: number };

/** Where a world point lands, centred, plus its distance in front of the camera. */
type Projection = Centred & { depth: number };

const MAX_ITERATIONS = 200;
const JACOBIAN_STEP = 1e-6;

/** Where a world point lands in the image, or null if it's behind the camera. Same maths as THREE's camera.project, then u = (ndcX+1)/2, v = (1-ndcY)/2. */
export function projectPoint(pose: CameraPose, world: Vec3): ImagePoint | null {
  const p = projectCentred(cameraFromPose(pose), world);
  if (p.depth <= 0) return null;
  return { u: 0.5 + p.a / pose.aspect, v: 0.5 + p.b };
}

/**
 * Fits the camera to the correspondences. `aspect` is the photo's.
 * `initial` (e.g. the editor's current camera) seeds the fit; with 6 or more points a DLT gives its own seed as well, and the better fit wins.
 * Throws an Error with a plain-English message when there are fewer than 4 points, or fewer than 6 and no `initial`.
 */
export function solvePose(
  correspondences: Correspondence[],
  options: { aspect: number; initial?: CameraPose },
): SolveResult {
  const count = correspondences.length;
  if (count < 4)
    throw new Error(
      `Pick at least 4 matching points to line up the camera (you have ${count}).`,
    );
  if (count < 6 && !options.initial)
    throw new Error(
      `With fewer than 6 matching points (you have ${count}) the fit needs a starting camera. Pick at least 6 points, or start from the current view.`,
    );

  const observed = correspondences.map((c) =>
    centredFromImage(c.image, options.aspect),
  );
  const worlds = correspondences.map((c) => c.world);

  const seeds: Camera[] = [];
  if (options.initial) seeds.push(cameraFromPose(options.initial));
  const dlt = count >= 6 ? dltCamera(worlds, observed) : null;
  if (dlt) seeds.push(dlt);

  const fits = seeds
    .map((seed) => refine(seed, worlds, observed))
    .filter((cam) => allInFront(cam, worlds) && cam.focal > 0)
    .map((cam) => ({ cam, rms: rmsError(cam, worlds, observed) }))
    .filter((fit) => Number.isFinite(fit.rms))
    .sort((x, y) => x.rms - y.rms);

  const best = fits[0];
  if (!best)
    throw new Error(
      "Couldn't find a camera that sees all these points. Check the points are matched up correctly and aren't all in one flat plane or line.",
    );
  return {
    pose: poseFromCamera(best.cam, options.aspect),
    rmsError: best.rms,
  };
}

// ---------- Camera model ----------

/** Converts a three.js-style pose into the solver's camera. */
function cameraFromPose(pose: CameraPose): Camera {
  const halfFov = (pose.fovDeg * Math.PI) / 360;
  return {
    rotation: rotationFromQuat(pose.quaternion),
    position: { ...pose.position },
    focal: 1 / (2 * Math.tan(halfFov)),
  };
}

/** Converts the solver's camera back into a three.js-style pose. */
function poseFromCamera(cam: Camera, aspect: number): CameraPose {
  return {
    position: { ...cam.position },
    quaternion: quatFromRotation(cam.rotation),
    fovDeg: (360 / Math.PI) * Math.atan(1 / (2 * cam.focal)),
    aspect,
  };
}

/** Projects a world point to centred image-height units (no behind-camera check). */
function projectCentred(cam: Camera, world: Vec3): Projection {
  const r = cam.rotation;
  const dx = world.x - cam.position.x;
  const dy = world.y - cam.position.y;
  const dz = world.z - cam.position.z;
  // Camera-space point is R^T (world - position).
  const x = r[0] * dx + r[3] * dy + r[6] * dz;
  const y = r[1] * dx + r[4] * dy + r[7] * dz;
  const depth = -(r[2] * dx + r[5] * dy + r[8] * dz);
  return { a: (cam.focal * x) / depth, b: (-cam.focal * y) / depth, depth };
}

/** Converts a 0..1 image point to image heights from the centre. */
function centredFromImage(p: ImagePoint, aspect: number): Centred {
  return { a: (p.u - 0.5) * aspect, b: p.v - 0.5 };
}

/** True when every world point is in front of the camera. */
function allInFront(cam: Camera, worlds: Vec3[]): boolean {
  return worlds.every((w) => projectCentred(cam, w).depth > 0);
}

/** Stacked (dx, dy) reprojection residuals, in image heights. */
function residuals(cam: Camera, worlds: Vec3[], observed: Centred[]): number[] {
  return worlds.flatMap((w, i) => {
    const p = projectCentred(cam, w);
    return [p.a - observed[i].a, p.b - observed[i].b];
  });
}

/** Sum of squared residuals, or Infinity if any point is behind the camera. */
function cost(cam: Camera, worlds: Vec3[], observed: Centred[]): number {
  if (!allInFront(cam, worlds)) return Infinity;
  return sumOfSquares(residuals(cam, worlds, observed));
}

/** RMS of the per-point reprojection distance, in image heights. */
function rmsError(cam: Camera, worlds: Vec3[], observed: Centred[]): number {
  return Math.sqrt(cost(cam, worlds, observed) / worlds.length);
}

// ---------- DLT seed ----------

/** Linear camera estimate from 6+ points (normalised DLT), or null if degenerate. */
function dltCamera(worlds: Vec3[], observed: Centred[]): Camera | null {
  const wn = worldNormaliser(worlds);
  const im = imageNormaliser(observed);
  const normal = zeros(12, 12);
  worlds.forEach((w, i) => {
    const X = [
      (w.x - wn.centre.x) * wn.scale,
      (w.y - wn.centre.y) * wn.scale,
      (w.z - wn.centre.z) * wn.scale,
      1,
    ];
    const x = (observed[i].a - im.a) * im.scale;
    const y = (observed[i].b - im.b) * im.scale;
    addOuter(normal, [...X, 0, 0, 0, 0, ...X.map((v) => -x * v)]);
    addOuter(normal, [0, 0, 0, 0, ...X, ...X.map((v) => -y * v)]);
  });
  const p = smallestEigenvector(normal);
  const normalised = [p.slice(0, 4), p.slice(4, 8), p.slice(8, 12)];
  return decomposeProjection(denormalise(normalised, wn, im));
}

/** Centroid and scale that put world points at mean distance sqrt(3) from the origin. */
function worldNormaliser(worlds: Vec3[]): { centre: Vec3; scale: number } {
  const n = worlds.length;
  const centre = {
    x: worlds.reduce((s, w) => s + w.x, 0) / n,
    y: worlds.reduce((s, w) => s + w.y, 0) / n,
    z: worlds.reduce((s, w) => s + w.z, 0) / n,
  };
  const meanDistance =
    worlds.reduce(
      (s, w) => s + Math.hypot(w.x - centre.x, w.y - centre.y, w.z - centre.z),
      0,
    ) / n;
  return { centre, scale: Math.sqrt(3) / meanDistance };
}

/** Centroid and scale that put image points at mean distance sqrt(2) from the origin. */
function imageNormaliser(points: Centred[]): {
  a: number;
  b: number;
  scale: number;
} {
  const n = points.length;
  const a = points.reduce((s, p) => s + p.a, 0) / n;
  const b = points.reduce((s, p) => s + p.b, 0) / n;
  const meanDistance =
    points.reduce((s, p) => s + Math.hypot(p.a - a, p.b - b), 0) / n;
  return { a, b, scale: Math.SQRT2 / meanDistance };
}

/** Undoes both normalisations: P = T_image^-1 * P_normalised * T_world. */
function denormalise(
  pn: number[][],
  wn: { centre: Vec3; scale: number },
  im: { a: number; b: number; scale: number },
): number[][] {
  const c = [wn.centre.x, wn.centre.y, wn.centre.z];
  // P_normalised * T_world, where T_world = [s*I, -s*c; 0, 1].
  const right = pn.map((row) => [
    row[0] * wn.scale,
    row[1] * wn.scale,
    row[2] * wn.scale,
    row[3] - wn.scale * (row[0] * c[0] + row[1] * c[1] + row[2] * c[2]),
  ]);
  // T_image^-1 = [1/s, 0, a; 0, 1/s, b; 0, 0, 1].
  return [
    right[0].map((v, j) => v / im.scale + im.a * right[2][j]),
    right[1].map((v, j) => v / im.scale + im.b * right[2][j]),
    right[2],
  ];
}

/** Splits a 3x4 projection matrix into a camera via RQ, or null if degenerate. */
function decomposeProjection(projection: number[][]): Camera | null {
  const det = det3(projection.map((row) => row.slice(0, 3)));
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  // P's scale is arbitrary; pick the sign that makes det(M) > 0 so R is a proper rotation and points in front get positive depth.
  const P = det > 0 ? projection : projection.map((row) => row.map((v) => -v));
  const M = P.map((row) => row.slice(0, 3));
  const centre = solveLinear(
    M,
    P.map((row) => -row[3]),
  );
  if (!centre) return null;

  // RQ by Gram-Schmidt from the bottom row: M = K R, K upper triangular with positive diagonal.
  const k33 = norm(M[2]);
  const r3 = scale(M[2], 1 / k33);
  const m2 = subtract(M[1], scale(r3, dot(M[1], r3)));
  const k22 = norm(m2);
  const r2 = scale(m2, 1 / k22);
  const m1 = subtract(
    subtract(M[0], scale(r3, dot(M[0], r3))),
    scale(r2, dot(M[0], r2)),
  );
  const k11 = norm(m1);
  const r1 = scale(m1, 1 / k11);

  // R's rows are the camera's right, down and forward axes (computer-vision convention); three.js wants right, up and backward as columns.
  // prettier-ignore
  const rotation = [
    r1[0], -r2[0], -r3[0],
    r1[1], -r2[1], -r3[1],
    r1[2], -r2[2], -r3[2],
  ];
  return {
    rotation,
    position: { x: centre[0], y: centre[1], z: centre[2] },
    focal: (k11 + k22) / 2 / k33,
  };
}

// ---------- Levenberg-Marquardt refinement ----------

/** Nudges the camera by a 7-vector: rotation increment (axis-angle), position change, log focal change. */
function applyStep(cam: Camera, step: number[]): Camera {
  return {
    rotation: mul3(rodrigues(step.slice(0, 3)), cam.rotation),
    position: {
      x: cam.position.x + step[3],
      y: cam.position.y + step[4],
      z: cam.position.z + step[5],
    },
    focal: cam.focal * Math.exp(step[6]),
  };
}

/** Central-difference Jacobian of the residuals with respect to the 7 step parameters, as columns. */
function jacobianColumns(
  cam: Camera,
  worlds: Vec3[],
  observed: Centred[],
): number[][] {
  return Array.from({ length: 7 }, (_, k) => {
    const step = Array.from({ length: 7 }, (_, j) =>
      j === k ? JACOBIAN_STEP : 0,
    );
    const plus = residuals(applyStep(cam, step), worlds, observed);
    const minus = residuals(
      applyStep(
        cam,
        step.map((v) => -v),
      ),
      worlds,
      observed,
    );
    return plus.map((p, i) => (p - minus[i]) / (2 * JACOBIAN_STEP));
  });
}

/** Minimises reprojection error from a starting camera with Levenberg-Marquardt. */
function refine(start: Camera, worlds: Vec3[], observed: Centred[]): Camera {
  let cam = start;
  let current = cost(cam, worlds, observed);
  let lambda = 1e-3;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const r = residuals(cam, worlds, observed);
    const columns = jacobianColumns(cam, worlds, observed);
    const jtj = columns.map((ci) => columns.map((cj) => dot(ci, cj)));
    const jtr = columns.map((c) => dot(c, r));
    const accepted = tryDamping(
      cam,
      current,
      jtj,
      jtr,
      lambda,
      worlds,
      observed,
    );
    if (!accepted) return cam;
    const improvement = current - accepted.cost;
    cam = accepted.cam;
    current = accepted.cost;
    lambda = accepted.lambda / 10;
    if (improvement <= 1e-15 * (1 + current)) return cam;
  }
  return cam;
}

/** Raises the damping until a step lowers the cost; null when none does. */
function tryDamping(
  cam: Camera,
  current: number,
  jtj: number[][],
  jtr: number[],
  startLambda: number,
  worlds: Vec3[],
  observed: Centred[],
): { cam: Camera; cost: number; lambda: number } | null {
  for (let lambda = startLambda; lambda < 1e12; lambda *= 10) {
    const damped = jtj.map((row, i) =>
      row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)),
    );
    const step = solveLinear(
      damped,
      jtr.map((v) => -v),
    );
    if (!step) continue;
    const candidate = applyStep(cam, step);
    const candidateCost = cost(candidate, worlds, observed);
    if (candidateCost < current)
      return { cam: candidate, cost: candidateCost, lambda };
  }
  return null;
}

// ---------- Rotations ----------

/** Rotation matrix for an axis-angle vector (Rodrigues' formula). */
function rodrigues(w: number[]): Mat3 {
  const theta = Math.hypot(w[0], w[1], w[2]);
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (theta < 1e-15) return identity;
  const [x, y, z] = w.map((v) => v / theta);
  const k = [0, -z, y, z, 0, -x, -y, x, 0];
  const k2 = mul3(k, k);
  const s = Math.sin(theta);
  const c = 1 - Math.cos(theta);
  return identity.map((v, i) => v + s * k[i] + c * k2[i]);
}

/** Rotation matrix for a (not necessarily unit) quaternion. */
function rotationFromQuat(q: Quat): Mat3 {
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  const x = q.x / n;
  const y = q.y / n;
  const z = q.z / n;
  const w = q.w / n;
  // prettier-ignore
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/** Unit quaternion for a rotation matrix (same method as THREE.Quaternion.setFromRotationMatrix). */
function quatFromRotation(m: Mat3): Quat {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return {
      w: 0.25 / s,
      x: (m21 - m12) * s,
      y: (m02 - m20) * s,
      z: (m10 - m01) * s,
    };
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return {
      w: (m21 - m12) / s,
      x: 0.25 * s,
      y: (m01 + m10) / s,
      z: (m02 + m20) / s,
    };
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return {
      w: (m02 - m20) / s,
      x: (m01 + m10) / s,
      y: 0.25 * s,
      z: (m12 + m21) / s,
    };
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return {
    w: (m10 - m01) / s,
    x: (m02 + m20) / s,
    y: (m12 + m21) / s,
    z: 0.25 * s,
  };
}

// ---------- Small linear algebra ----------

/** Product of two row-major 3x3 matrices. */
function mul3(a: Mat3, b: Mat3): Mat3 {
  return Array.from({ length: 9 }, (_, i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    return (
      a[row * 3] * b[col] +
      a[row * 3 + 1] * b[3 + col] +
      a[row * 3 + 2] * b[6 + col]
    );
  });
}

/** Determinant of a 3x3 matrix given as rows. */
function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** Dot product. */
function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

/** Euclidean length. */
function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/** Sum of squares. */
function sumOfSquares(a: number[]): number {
  return dot(a, a);
}

/** a * k. */
function scale(a: number[], k: number): number[] {
  return a.map((v) => v * k);
}

/** a - b. */
function subtract(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - b[i]);
}

/** An all-zero rows x cols matrix. */
function zeros(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

/** Adds the outer product v v^T into a square matrix. */
function addOuter(target: number[][], v: number[]): void {
  for (let i = 0; i < v.length; i++)
    for (let j = 0; j < v.length; j++) target[i][j] += v[i] * v[j];
}

/** Solves A x = b by Gaussian elimination with partial pivoting; null if A is singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-300) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = col + 1; row < n; row++) {
      const f = m[row][col] / m[col][col];
      for (let k = col; k <= n; k++) m[row][k] -= f * m[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = m[row][n];
    for (let k = row + 1; k < n; k++) sum -= m[row][k] * x[k];
    x[row] = sum / m[row][row];
  }
  return x.every(Number.isFinite) ? x : null;
}

/** Eigenvector of the smallest eigenvalue of a symmetric matrix (cyclic Jacobi). */
function smallestEigenvector(symmetric: number[][]): number[] {
  const n = symmetric.length;
  const a = symmetric.map((row) => [...row]);
  const v = zeros(n, n).map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
  const total = a.reduce((s, row) => s + sumOfSquares(row), 0);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off <= 1e-30 * total) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) jacobiRotate(a, v, p, q);
  }
  let smallest = 0;
  for (let i = 1; i < n; i++) if (a[i][i] < a[smallest][smallest]) smallest = i;
  return v.map((row) => row[smallest]);
}

/** One Jacobi rotation that zeroes a[p][q], accumulating the rotation into v's columns. */
function jacobiRotate(
  a: number[][],
  v: number[][],
  p: number,
  q: number,
): void {
  if (a[p][q] === 0) return;
  const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
  const t =
    (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;
  for (const row of [...a, ...v]) {
    const kp = row[p];
    const kq = row[q];
    row[p] = c * kp - s * kq;
    row[q] = s * kp + c * kq;
  }
  for (let k = 0; k < a.length; k++) {
    const pk = a[p][k];
    const qk = a[q][k];
    a[p][k] = c * pk - s * qk;
    a[q][k] = s * pk + c * qk;
  }
}
