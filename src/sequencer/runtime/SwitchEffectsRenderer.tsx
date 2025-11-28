import { EffectContext } from "../../common/effects/EffectProvider";
import { useSequenceRuntime } from "./SequenceRuntimeContext";
import type { SwitchEffectComponent } from "../../common/effects/switchEffectDefinitions";
import type { SwitchNodeModel } from "../../../shared/models/SwitchNodeModel";

export function SwitchEffectsRenderer() {
  const runtime = useSequenceRuntime();
  const effects = runtime.activeSwitchEffects;
  const nodesMap = runtime.switchNodesMap;

  return (
    <>
      {effects.map((effect) => {
        const Component = effect.component as SwitchEffectComponent;
        if (!Component) return null;

        const validatedProps = effect.validatedProps;
        const targetNodeIds = effect.targetNodeIds;

        console.log("RENDER");

        return targetNodeIds.map((nodeId) => {
          const node = nodesMap.get(nodeId);
          if (!node) return null;
          return (
            <EffectContext
              key={`${effect.trackId}-${effect.eventId}-${nodeId}`}
              value={effect}
            >
              <Component
                switch={node as SwitchNodeModel}
                props={validatedProps}
              />
            </EffectContext>
          );
        });
      })}
    </>
  );
}
