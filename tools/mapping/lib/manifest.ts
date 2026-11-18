import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assignCodes,
  bitsNeeded,
  type CodedString,
} from "../../../shared/mapping/ledCodes";
import type { MappingPattern } from "../../../convex/schema";

// A run folder holds one viewpoint's capture: its frames, manifest.json (what
// each frame shows), and once decoded, decoded.json and debug.jpg.

export type MappedString = CodedString & { name: string };

export type FrameName =
  "dark" | "all" | "reference" | `bit${number}` | `bit${number}i`;

export type FrameRecord = {
  name: FrameName;
  file: string;
  pattern: MappingPattern;
  seq: number | null;
  takenAt: number;
  attempts: number;
  check?: Record<string, number>;
};

export type RunManifest = {
  version: 1;
  projectId: string;
  sessionId: string;
  view: string;
  camera: string;
  cameraInfo?: Record<string, unknown>;
  createdAt: number;
  // The code each string starts at, from shared/mapping/ledCodes.ts. The
  // decoder reads codes through this table.
  codeTable: (MappedString & { firstCode: number })[];
  bits: number;
  frames: FrameRecord[];
  complete: boolean;
};

export const newManifest = (args: {
  projectId: string;
  sessionId: string;
  view: string;
  camera: string;
  strings: MappedString[];
}): RunManifest => ({
  version: 1,
  projectId: args.projectId,
  sessionId: args.sessionId,
  view: args.view,
  camera: args.camera,
  createdAt: Date.now(),
  codeTable: assignCodes(args.strings) as RunManifest["codeTable"],
  bits: bitsNeeded(args.strings),
  frames: [],
  complete: false,
});

/** The frames a capture takes, in order. */
export const framePlan = (
  bits: number,
): { name: FrameName; pattern: MappingPattern }[] => [
  { name: "dark", pattern: { kind: "off" } },
  { name: "all", pattern: { kind: "all" } },
  ...Array.from({ length: bits }, (_, bit) => [
    {
      name: `bit${bit}` as FrameName,
      pattern: { kind: "bit", bit, inverted: false } as const,
    },
    {
      name: `bit${bit}i` as FrameName,
      pattern: { kind: "bit", bit, inverted: true } as const,
    },
  ]).flat(),
  // Every LED on again, with the camera back on auto exposure, so the house
  // shows: the photo the editor lines its 3D camera up with.
  { name: "reference", pattern: { kind: "all" } },
];

export const manifestPath = (runDir: string) => join(runDir, "manifest.json");

export const readManifest = (runDir: string): RunManifest =>
  JSON.parse(readFileSync(manifestPath(runDir), "utf8")) as RunManifest;

export const writeManifest = (runDir: string, manifest: RunManifest) => {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(manifestPath(runDir), JSON.stringify(manifest, null, 1));
};

export type DecodedPoint = { u: number; v: number; confidence: number };

export type Decoded = {
  version: 1;
  imageWidth: number;
  imageHeight: number;
  totalLeds: number;
  stats: Record<string, number>;
  strings: {
    key: string;
    name: string;
    ledCount: number;
    measured: number;
    interpolated: number;
    outliers: number[];
    points: (DecodedPoint | null)[];
  }[];
  rejected: Record<string, unknown>[];
};

export const readDecoded = (runDir: string): Decoded =>
  JSON.parse(readFileSync(join(runDir, "decoded.json"), "utf8")) as Decoded;

export const writeDecoded = (runDir: string, decoded: Decoded) =>
  writeFileSync(join(runDir, "decoded.json"), JSON.stringify(decoded, null, 1));
