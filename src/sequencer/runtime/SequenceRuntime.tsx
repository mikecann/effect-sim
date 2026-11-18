import { useEffect } from "react";
import { observer } from "mobx-react-observer";
import { StringEffectsRenderer } from "./StringEffectsRenderer";
import { SwitchEffectsRenderer } from "./SwitchEffectsRenderer";
import { SequenceRuntimeModel } from "./SequenceRuntimeModel";
import { SequenceRuntimeContext } from "./SequenceRuntimeContext";

export const SequenceRuntime = observer(
  ({ model }: { model: SequenceRuntimeModel }) => {
    const frame = model.playhead.frame;
    const sequence = model.sequence;

    useEffect(() => {
      model.updateActiveEffects();
    }, [model, frame, sequence]);

    return (
      <SequenceRuntimeContext value={model}>
        <StringEffectsRenderer />
        <SwitchEffectsRenderer />
      </SequenceRuntimeContext>
    );
  },
);
