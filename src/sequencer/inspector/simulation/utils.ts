import type { NodeDoc } from "../../../../shared/nodeTree";

type StringNodeDoc = NodeDoc & { kind: "string" };
import type { Id } from "../../../../convex/_generated/dataModel";

export const SIMULATED_LED_COUNT = 100;

export function createFakeStringNode(): StringNodeDoc {
  return {
    _id: "simulation" as Id<"nodes">,
    _creationTime: Date.now(),
    kind: "string",
    name: "Simulation",
    icon: { kind: "emoji", emoji: "💡" },
    spacingMeters: 0.1,
    ledCount: SIMULATED_LED_COUNT,
    ipAddress: "0.0.0.0",
    port: 0,
    brightness: 1,
    pathPoints: [],
    order: 0,
    parentId: null,
    projectId: "simulation" as Id<"projects">,
  };
}
