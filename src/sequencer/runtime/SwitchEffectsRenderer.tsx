import { useSequenceRuntime } from "./SequenceRuntimeContext";

export function SwitchEffectsRenderer() {
  const runtime = useSequenceRuntime();
  const nodes = runtime.switchNodesMap;

  return (
    <>
      {runtime.activeSwitchEffects.map((effect) => {
        const definition = effect.switchEffect;
        if (!definition) return null;
        const Run = definition.Run;
        return effect.targetNodeIds.map((nodeId) => {
          const node = nodes.get(nodeId);
          if (!node) return null;
          return (
            <Run
              key={`${effect.trackId}-${effect.eventId}-${nodeId}`}
              switch={node}
              rawProps={effect.rawProps}
            />
          );
        });
      })}
    </>
  );
}
