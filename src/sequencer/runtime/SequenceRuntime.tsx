import { useEffect, useLayoutEffect } from "react";
import { observer } from "mobx-react-observer";
import { reaction } from "mobx";
import { StringEffectsRenderer } from "./StringEffectsRenderer";
import { SwitchEffectsRenderer } from "./SwitchEffectsRenderer";
import { SequenceRuntimeModel } from "./SequenceRuntimeModel";
import { SequenceRuntimeContext } from "./SequenceRuntimeContext";
import { useLedData } from "../../data/LedDataStoreContext";

export const SequenceRuntime = observer(
  ({ model }: { model: SequenceRuntimeModel }) => {
    const frame = model.playhead.frame;
    const sequence = model.sequence;
    const jumps = model.playhead.jumps;
    const ledData = useLedData();

    // A jump (scrubbing) starts the effects over: clear the LEDs and remount
    // them, so they replay together from their events' starts onto clean
    // strings, frame by frame as playing would (useEffectFrame,
    // FrameCatchUp). A layout effect, so the clearing happens before the
    // remounted effects run. Events that ended before the frame jumped to
    // aren't replayed.
    useLayoutEffect(() => {
      if (jumps === 0) return;
      for (const string of ledData.strings) string.clear();
    }, [jumps, ledData]);

    useEffect(() => {
      model.updateActiveEffects();
    }, [model, frame, sequence]);

    // Also as soon as the playhead moves, not a render later, so an event's
    // effect mounts on the frame it starts and runs its first frame there.
    useEffect(
      () =>
        reaction(
          () => model.playhead.frame,
          () => model.updateActiveEffects(),
        ),
      [model],
    );

    return (
      <SequenceRuntimeContext value={model}>
        {/* Keyed by jumps: a jump remounts every string effect. */}
        <StringEffectsRenderer key={jumps} />
        <SwitchEffectsRenderer />
      </SequenceRuntimeContext>
    );
  },
);
