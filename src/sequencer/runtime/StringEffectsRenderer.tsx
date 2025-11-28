import { EffectContext } from "../../common/effects/EffectProvider";
import { useLedData } from "../../data/LedDataStoreContext";
import type { StringLedDataApi } from "../../data/StringLedDataModel";
import { useSequenceRuntime } from "./SequenceRuntimeContext";

export function StringEffectsRenderer() {
  const runtime = useSequenceRuntime();
  const dataStore = useLedData();
  const effects = runtime.activeStringEffects;

  return (
    <>
      {effects.map((effect) => {
        const Component = effect.component as React.ComponentType<{
          string: StringLedDataApi;
          props?: Record<string, unknown>;
        }>;


        if (!Component) return null;

        const validatedProps = effect.validatedProps;
        const targetNodeIds = effect.targetNodeIds;

        return targetNodeIds.map((nodeId) => {
          const ledData = dataStore.stringsAndVirtualsMap.get(nodeId);
          if (!ledData) return null;
          return (
            <EffectContext
              key={`${effect.trackId}-${effect.eventId}-${nodeId}`}
              value={effect}
            >
              <Component string={ledData} props={validatedProps} />
            </EffectContext>
          );
        });
      })}
    </>
  );
}
