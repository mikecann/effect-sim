// Plays a sequence headlessly with the real effects and writes every frame's
// LED colours, so a sequence can be previewed (as a video) without the editor
// or the lights.
//
//   bun tools/preview/renderSequence.ts <project.json> <sequence key> <out.bin> [--seconds N]
//
// <project.json> is functions:getDataForProject's output. out.bin holds, per
// frame, 3 bytes per LED for every string in key order; out.bin.json says
// which (string key, LED count) and the frame count.

import { readFileSync, writeFileSync } from "node:fs";
import { createElement, Fragment, type ReactElement } from "react";
import { render } from "react-nil";
import { makeAutoObservable, runInAction } from "mobx";
import {
  EffectScopeContext,
  type EffectString,
  type EffectTiming,
} from "../../shared/effects/api";
import { stringEffects } from "../../shared/effects/registry";
import { hashSeed } from "../../shared/random";
import {
  boundsOf,
  layoutString,
  normaliseInBounds,
  type Bounds,
  type Point3,
} from "../../shared/geometry/stringLayout";

const [projectFile, sequenceKey, outFile] = process.argv.slice(2);
const secondsArg = process.argv.indexOf("--seconds");
const FPS = 15;

// getDataForProject's output, read loosely: this script only picks out a few fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON from the CLI
type Node = Record<string, any>;
const data = JSON.parse(readFileSync(projectFile, "utf8")) as {
  nodes: Node[];
  sequences: Node[];
};
const strings = data.nodes
  .filter((n) => n.kind === "string")
  .sort((a, b) => a.key.localeCompare(b.key));
const positions = new Map<string, Point3[]>();
for (const s of strings) {
  const layout = layoutString({
    ledCount: s.ledCount,
    spacingMeters: s.spacingMeters,
    pathPoints: s.pathPoints,
    ledPositions: s.ledPositions,
  });
  positions.set(
    s.key,
    layout.positions.map((p) => p ?? { x: 0, y: 0, z: 0 }),
  );
}
const bounds = boundsOf(
  strings.flatMap((s) => positions.get(s.key) ?? []),
) as Bounds;
if (process.env.PRINT_BOUNDS) console.log(JSON.stringify(bounds));
const buffers = new Map(
  strings.map((s) => [s.key, new Uint8Array(s.ledCount * 3)]),
);
const bufferOf = (key: string) => {
  const buf = buffers.get(key);
  if (!buf) throw new Error(`No string ${key}`);
  return buf;
};

/** A string or virtual string, as (string key, index) slots in order. */
const slotsOf = (key: string): Array<[string, number]> => {
  const node = data.nodes.find((n) => n.key === key);
  if (!node) return [];
  if (node.kind === "string")
    return Array.from({ length: node.ledCount }, (_, i) => [key, i]);
  if (node.kind !== "virtual_string") return [];
  return node.segments.flatMap((seg: Node) => {
    const out: Array<[string, number]> = [];
    if (seg.isReversed)
      for (let i = seg.toIndex; i >= seg.fromIndex; i--)
        out.push([seg.nodeId, i]);
    else
      for (let i = seg.fromIndex; i <= seg.toIndex; i++)
        out.push([seg.nodeId, i]);
    return out.filter(([k]) => buffers.has(k));
  });
};

class SlotString implements EffectString {
  ledCount: number;
  bounds = bounds;
  constructor(
    readonly key: string,
    private slots: Array<[string, number]>,
  ) {
    this.ledCount = slots.length;
  }
  setPixel(i: number, r: number, g: number, b: number) {
    const slot = this.slots[i];
    if (!slot) return;
    bufferOf(slot[0]).set(
      [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v)))),
      slot[1] * 3,
    );
  }
  setAllPixels(r: number, g: number, b: number) {
    for (let i = 0; i < this.ledCount; i++) this.setPixel(i, r, g, b);
  }
  getPixel(i: number): [number, number, number] {
    const slot = this.slots[i];
    if (!slot) return [0, 0, 0];
    const buf = bufferOf(slot[0]);
    return [buf[slot[1] * 3], buf[slot[1] * 3 + 1], buf[slot[1] * 3 + 2]];
  }
  clear() {
    this.setAllPixels(0, 0, 0);
  }
  multiplyAll(by: number) {
    for (let i = 0; i < this.ledCount; i++) {
      const [r, g, b] = this.getPixel(i);
      this.setPixel(
        i,
        Math.floor(r * by),
        Math.floor(g * by),
        Math.floor(b * by),
      );
    }
  }
  getPosition(i: number): Point3 {
    const slot = this.slots[i];
    return (slot && positions.get(slot[0])?.[slot[1]]) ?? { x: 0, y: 0, z: 0 };
  }
  getNormalisedPosition(i: number): Point3 {
    return normaliseInBounds(this.getPosition(i), bounds);
  }
}

class Timing implements EffectTiming {
  effectFrame = 0;
  loopCount = 0;
  constructor(
    readonly duration: number,
    readonly seed: number,
  ) {
    makeAutoObservable(this);
  }
  get effectPlaybackRatio() {
    return Math.min(1, this.effectFrame / this.duration);
  }
  setFrame(f: number) {
    this.effectFrame = f;
  }
}

const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
};

const sequence = data.sequences.find((s) => s.key === sequenceKey);
if (!sequence) throw new Error(`No sequence ${sequenceKey}`);
const numFrames =
  secondsArg > 0
    ? Math.min(sequence.numFrames, Number(process.argv[secondsArg + 1]) * FPS)
    : sequence.numFrames;

// One mounted effect per (event, target node), in track order.
type Running = { timing: Timing; element: ReactElement };
const running = new Map<string, Running>();
const effects = new Map(stringEffects.map((e) => [e.id, e]));
const out = new Uint8Array(
  numFrames * strings.reduce((n, s) => n + s.ledCount * 3, 0),
);
let offset = 0;
// react-nil has one root, so every running effect renders under it, in order.
const renderAll = async () => {
  render(
    createElement(
      Fragment,
      null,
      ...[...running.values()].map((r) => r.element),
    ),
  );
  await settle();
};

for (let frame = 0; frame < numFrames; frame++) {
  for (const track of sequence.tracks)
    for (const event of track.events) {
      if (event.kind !== "string_effect") continue;
      const targets: string[] =
        event.appliesTo.kind === "all_nodes"
          ? data.nodes.filter((n) => n.kind === "string").map((n) => n.key)
          : event.appliesTo.nodeIds;
      const active = frame >= event.startFrame && frame < event.endFrame;
      for (const target of targets) {
        const id = `${event.id}:${target}`;
        const live = running.get(id);
        if (!active) {
          if (live) {
            running.delete(id);
            await renderAll();
          }
          continue;
        }
        if (live) {
          runInAction(() => live.timing.setFrame(frame - event.startFrame));
          await settle();
        } else {
          const effect = effects.get(event.effectDefinitionId);
          if (!effect) continue;
          const timing = new Timing(
            event.endFrame - event.startFrame,
            hashSeed(event.id),
          );
          const string = new SlotString(target, slotsOf(target));
          const element = createElement(
            EffectScopeContext.Provider,
            { key: id, value: { timing, target } },
            createElement(effect.Run, {
              string,
              rawProps: { ...effect.defaults, ...(event.props ?? {}) },
            }),
          );
          running.set(id, { timing, element });
          await renderAll();
        }
      }
    }
  for (const s of strings) {
    out.set(bufferOf(s.key), offset);
    offset += s.ledCount * 3;
  }
}

writeFileSync(outFile, out);
writeFileSync(
  `${outFile}.json`,
  JSON.stringify({
    fps: FPS,
    frames: numFrames,
    strings: strings.map((s) => ({ key: s.key, ledCount: s.ledCount })),
  }),
);
console.log(`${numFrames} frames → ${outFile}`);
process.exit(0);
