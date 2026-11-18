import { useMemo } from "react";
import {
  EffectScopeContext,
  FrameCatchUp,
  type EffectString,
} from "../../../shared/effects/api";
import type { StringEffect } from "../../../shared/effects/defineEffect";
import { useLedData } from "../../data/LedDataStoreContext";
import { useSequenceRuntime } from "./SequenceRuntimeContext";
import type { SequenceRuntimeEffectModel } from "./SequenceRuntimeEffectModel";

/** One event's effect running on one string. */
function StringEffectInstance({
  effect,
  definition,
  string,
  catchUp,
}: {
  effect: SequenceRuntimeEffectModel;
  definition: StringEffect;
  string: EffectString;
  catchUp: FrameCatchUp;
}) {
  const scope = useMemo(
    () => ({ timing: effect, target: string.key, catchUp }),
    [effect, string.key, catchUp],
  );
  const Run = definition.Run;
  return (
    <EffectScopeContext value={scope}>
      <Run string={string} rawProps={effect.rawProps} />
    </EffectScopeContext>
  );
}

export function StringEffectsRenderer() {
  const runtime = useSequenceRuntime();
  const strings = useLedData().stringsAndVirtualsMap;
  const catchUp = useMemo(
    () => new FrameCatchUp(() => runtime.playhead.frame),
    [runtime],
  );

  return (
    <>
      {runtime.activeStringEffects.map((effect) => {
        const definition = effect.stringEffect;
        if (!definition) return null;
        return effect.targetNodeIds.map((nodeId) => {
          const string = strings.get(nodeId);
          if (!string) return null;
          return (
            <StringEffectInstance
              key={`${effect.trackId}-${effect.eventId}-${nodeId}`}
              effect={effect}
              definition={definition}
              string={string}
              catchUp={catchUp}
            />
          );
        });
      })}
    </>
  );
}
