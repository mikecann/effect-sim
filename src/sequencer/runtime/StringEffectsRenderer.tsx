import { useMemo } from "react";
import {
  EffectScopeContext,
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
}: {
  effect: SequenceRuntimeEffectModel;
  definition: StringEffect;
  string: EffectString;
}) {
  const scope = useMemo(
    () => ({ timing: effect, target: string.key }),
    [effect, string.key],
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
            />
          );
        });
      })}
    </>
  );
}
