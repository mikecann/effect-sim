import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { ProjectModel } from "../../../shared/models/ProjectModel";
import { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import { SequenceRuntimeModel } from "./SequenceRuntimeModel";

const projectId = "p1" as Id<"projects">;
const projectDoc: Doc<"projects"> = {
  _id: projectId,
  _creationTime: 0,
  name: "House",
  settings: { nightMode: true, lightsOnTop: true },
};

const event = (
  id: string,
  kind: "string_effect" | "switch_effect",
  startFrame: number,
  endFrame: number,
) => ({
  id,
  kind,
  startFrame,
  endFrame,
  effectDefinitionId: kind === "string_effect" ? "setColor" : "turnOn",
  appliesTo: { kind: "all_nodes" as const },
});

const runtimeFor = () => {
  const project = new ProjectModel(projectDoc);
  const sequence = new SequenceModel(
    {
      key: "s1",
      projectId,
      name: "Show",
      numFrames: 100,
      tracks: [
        {
          id: "t1",
          name: "Track",
          events: [
            event("lightsEarly", "string_effect", 0, 10),
            event("plugEarly", "switch_effect", 0, 10),
            event("lightsNow", "string_effect", 40, 60),
            event("plugNow", "switch_effect", 40, 60),
          ],
        },
      ],
    },
    project,
  );
  return new SequenceRuntimeModel(sequence);
};

const active = (runtime: SequenceRuntimeModel) =>
  runtime.activeEffects.map((e) => e.eventId);

describe("jumping the playhead", () => {
  it("replays string events that already ended, but never switch events", () => {
    const runtime = runtimeFor();
    runtime.jumpTo(50);
    expect(active(runtime)).toEqual(["lightsEarly", "lightsNow", "plugNow"]);
    expect(runtime.playhead.jumps).toBe(1);
  });

  it("drops the ended events again on the next frame", () => {
    const runtime = runtimeFor();
    runtime.jumpTo(50);
    runtime.playhead.setFrame(51);
    runtime.updateActiveEffects();
    expect(active(runtime)).toEqual(["lightsNow", "plugNow"]);
  });

  it("treats one frame on as a step, not a jump", () => {
    const runtime = runtimeFor();
    runtime.jumpTo(1);
    expect(runtime.playhead.jumps).toBe(0);
  });
});
