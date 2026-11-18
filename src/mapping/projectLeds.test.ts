import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { fillFromNeighbours, projectViews, viewCoverage } from "./projectLeds";
import { projectPoint, type CameraPose } from "./solvePose";
import { photoFovForView, photoRect, viewFovForPhoto } from "./photoCamera";
import { SURFACE_OFFSET_M } from "../simulator/placing/raycast";

/** A wall: a 20 m square in the z = 0 plane, facing +z. */
const wall = () => {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial(),
  );
  mesh.updateMatrixWorld(true);
  return mesh;
};

const poseLookingAt = (
  position: THREE.Vector3,
  target: THREE.Vector3,
): CameraPose => {
  const camera = new THREE.PerspectiveCamera(50, 1.5);
  camera.position.copy(position);
  camera.lookAt(target);
  const q = camera.quaternion;
  return {
    position: { x: position.x, y: position.y, z: position.z },
    quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
    fovDeg: 50,
    aspect: 1.5,
  };
};

describe("projecting views onto the house", () => {
  const front = poseLookingAt(
    new THREE.Vector3(2, 3, 12),
    new THREE.Vector3(0, 1, 0),
  );
  // Off to the side: it sees the wall at a glancing angle.
  const side = poseLookingAt(
    new THREE.Vector3(14, 2, 4),
    new THREE.Vector3(0, 1, 0),
  );
  const leds = Array.from({ length: 10 }, (_, i) => ({
    x: -4 + i,
    y: 1 + (i % 3) * 0.5,
    z: 0,
  }));
  const pointsFrom = (pose: CameraPose, confidence: number) =>
    leds.map((p) => {
      const image = projectPoint(pose, p);
      if (!image) throw new Error("test LED is behind the camera");
      return { ...image, confidence };
    });
  const project = (
    views: Array<{
      name: string;
      pose: CameraPose;
      points: Array<{ u: number; v: number; confidence: number } | null>;
    }>,
    ledCount = 10,
  ) =>
    projectViews({
      views: views.map((v) => ({
        name: v.name,
        pose: v.pose,
        strings: [{ nodeKey: "a", points: v.points }],
      })),
      ledCountOf: () => ledCount,
      meshes: [wall()],
    });

  it("casts each photo point back onto the surface, lifted off it", () => {
    const [proposed] = project([
      { name: "front", pose: front, points: pointsFrom(front, 0.9) },
    ]);
    expect(proposed?.nodeKey).toBe("a");
    proposed?.positions.forEach((p, i) => {
      expect(p.x).toBeCloseTo(leds[i].x, 4);
      expect(p.y).toBeCloseTo(leds[i].y, 4);
      expect(p.z).toBeCloseTo(SURFACE_OFFSET_M, 4);
    });
    expect(proposed?.sources.every((s) => s.kind === "seen")).toBe(true);
  });

  it("fills unseen, interpolated and unsure LEDs from their neighbours", () => {
    const points: Array<{ u: number; v: number; confidence: number } | null> =
      pointsFrom(front, 0.9);
    points[3] = null;
    const fifth = points[5];
    // The capture tool's own interpolations come in below 0.25.
    if (fifth) points[5] = { ...fifth, confidence: 0.2 };
    const [proposed] = project([{ name: "front", pose: front, points }], 12);
    if (!proposed) throw new Error("nothing proposed");
    expect(proposed.positions).toHaveLength(12);
    expect(proposed.sources[3]).toEqual({ kind: "filled" });
    expect(proposed.sources[5]).toEqual({ kind: "filled" });
    // Halfway between its neighbours by index.
    expect(proposed.positions[3].x).toBeCloseTo((leds[2].x + leds[4].x) / 2, 4);
    // Past the last LED seen it takes the last one's place.
    expect(proposed.positions[11]).toEqual(proposed.positions[9]);
  });

  it("takes each LED from the surer view, or the more head-on one when they're as sure", () => {
    const surer = project([
      { name: "front", pose: front, points: pointsFrom(front, 0.5) },
      { name: "side", pose: side, points: pointsFrom(side, 0.9) },
    ])[0];
    expect(surer?.sources[0]).toEqual({
      kind: "seen",
      confidence: 0.9,
      view: "side",
    });

    const tie = project([
      { name: "side", pose: side, points: pointsFrom(side, 0.9) },
      { name: "front", pose: front, points: pointsFrom(front, 0.85) },
    ])[0];
    expect(tie?.sources[0]).toEqual({
      kind: "seen",
      confidence: 0.85,
      view: "front",
    });
  });

  it("leaves out a string none of whose LEDs land on the house", () => {
    expect(
      projectViews({
        views: [
          {
            name: "front",
            pose: front,
            strings: [{ nodeKey: "a", points: pointsFrom(front, 0.9) }],
          },
        ],
        ledCountOf: () => 10,
        meshes: [],
      }),
    ).toEqual([]);
  });

  it("counts what each view covers", () => {
    expect(
      viewCoverage({
        strings: [
          {
            nodeKey: "a",
            points: [
              null,
              { u: 0, v: 0, confidence: 0.2 },
              { u: 0, v: 0, confidence: 0.9 },
            ],
          },
        ],
      }),
    ).toEqual([{ nodeKey: "a", seen: 1, total: 3 }]);
  });
});

describe("filling from neighbours", () => {
  it("interpolates by index and copies past the ends", () => {
    const p = (x: number) => ({ x, y: 0, z: 0 });
    expect(fillFromNeighbours([null, p(0), null, null, p(3), null])).toEqual([
      p(0),
      p(0),
      p(1),
      p(2),
      p(3),
      p(3),
    ]);
    expect(fillFromNeighbours([null, null])).toBeNull();
  });
});

describe("the photo over the view", () => {
  it("fits the photo inside the view, centred", () => {
    expect(photoRect(1000, 500, 1.5)).toEqual({
      left: 125,
      top: 0,
      width: 750,
      height: 500,
    });
    expect(photoRect(600, 800, 1.5)).toEqual({
      left: 0,
      top: 200,
      width: 600,
      height: 400,
    });
  });

  it("turns a photo's field of view into the view's and back", () => {
    const rect = photoRect(600, 800, 1.5);
    const viewFov = viewFovForPhoto(40, 800, rect);
    expect(viewFov).toBeGreaterThan(40);
    expect(photoFovForView(viewFov, 800, rect)).toBeCloseTo(40, 9);
  });
});
