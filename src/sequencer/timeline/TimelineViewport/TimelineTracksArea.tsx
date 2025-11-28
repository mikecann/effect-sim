import TrackRow from "../../tracks/TrackRow";
import { ROW_HEIGHT } from "../../sequencer";
import { InactiveArea } from "./InactiveArea";
import { PlayheadIndicator } from "../PlayheadIndicator";
import { GhostTrack } from "../../drag/GhostTrack";
import { GhostTrackGhostEvent } from "./GhostTrackGhostEvent";
import { useSequence } from "../../SequencerContext";

export function TimelineTracksArea() {
  const sequenceUI = useSequence();
  const ghostTracksCount = sequenceUI.ghostTracks.length;

  return (
    <div
      style={{
        position: "absolute",
        inset: `${ROW_HEIGHT}px 0 0 0`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: sequenceUI.sequenceNumFrames * sequenceUI.frameWidth,
          height:
            (sequenceUI.sequence.tracks.length + ghostTracksCount) * ROW_HEIGHT,
        }}
      >
        {sequenceUI.tracks.map((track) => (
          <TrackRow key={track.id} track={track} />
        ))}

        {/* Render ghost tracks when dragging below last track */}
        {sequenceUI.ghostTracks.map((ghostTrack) => (
          <div
            key={`ghost-${ghostTrack.index}`}
            style={{ position: "relative" }}
          >
            <GhostTrack ghostTrack={ghostTrack} />
            <GhostTrackGhostEvent ghostTrack={ghostTrack} />
          </div>
        ))}

        <InactiveArea />

        <PlayheadIndicator />
      </div>
    </div>
  );
}
