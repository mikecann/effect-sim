import { SequenceRuntime } from "../../sequencer/runtime/SequenceRuntime";
import { PlaylistPlayerModel } from "./PlaylistPlayerModel";

export function PlaylistPlayer({ model }: { model: PlaylistPlayerModel }) {
  const currentSequence = model.currentSequence;

  // Render SequenceRuntime when playing
  if (!model.isPlaying || !currentSequence) return null;

  return <SequenceRuntime model={model.runtime} />;
}
