import { StringEffectsRenderer } from "./StringEffectsRenderer";
import { SwitchEffectsRenderer } from "./SwitchEffectsRenderer";
import { SequenceRuntimeModel } from "./SequenceRuntimeModel";
import { SequenceRuntimeContext } from "./SequenceRuntimeContext";

export function SequenceRuntime({ model }: { model: SequenceRuntimeModel }) {
  return (
    <SequenceRuntimeContext value={model}>
      <StringEffectsRenderer />
      <SwitchEffectsRenderer />
    </SequenceRuntimeContext>
  );
}
