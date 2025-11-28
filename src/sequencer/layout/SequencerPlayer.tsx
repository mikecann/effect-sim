import { useFrame } from "../../common/utils/frames";
import { useSequence } from "../SequencerContext";

export const SequencerPlayer = () => {
  const sequence = useSequence();

  useFrame(() => {
    if (!sequence.isPlaying) return;
    sequence.runtime.playhead.stepForwards();
    if (sequence.runtime.playhead.frame >= sequence.sequence.numFrames) {
      sequence.runtime.playhead.setFrame(0);
      sequence.runtime.incrementLoopCount();
    }
  }, [sequence, sequence.sequence.numFrames]);

  return null;
};
