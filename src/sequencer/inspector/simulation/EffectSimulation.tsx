import { useMemo } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { EffectComponent } from "../../../common/effects/stringEffectDefinitions";
import { FakeEffectProvider } from "./FakeEffectProvider";
import { LedBoxes } from "./LedBoxes";
import { createFakeStringNode } from "./utils";

type EffectSimulationProps = {
  EffectComponent: EffectComponent;
  props?: Record<string, unknown>;
};

// TODO: Effect simulation needs rework - no longer has its own LED data store
export function EffectSimulation({
  EffectComponent,
  props = {},
}: EffectSimulationProps) {
  const fakeStringId = useMemo(() => "simulation" as Id<"nodes">, []);
  const fakeString = useMemo(() => createFakeStringNode(), []);

  return (
    <FakeEffectProvider>
      {/* @ts-expect-error - EffectComponent accepts props but type definition doesn't include it */}
      <EffectComponent string={fakeString} props={props} />
      <LedBoxes fakeStringId={fakeStringId} />
    </FakeEffectProvider>
  );
}
