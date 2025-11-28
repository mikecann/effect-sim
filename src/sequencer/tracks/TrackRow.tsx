import type { SequenceTrackUIModel } from "../models/SequenceTrackUIModel";
import { EventBar } from "./eventBar/EventBar";
import { ROW_HEIGHT } from "../sequencer";
import { useSequence } from "../SequencerContext";
import { useApp } from "../../common/AppContext";
import { DraggingEventPreview } from "./eventBar/DraggingEventPreview";

export default function TrackRow({ track }: { track: SequenceTrackUIModel }) {
  const appModel = useApp();
  const sequence = useSequence();

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: track.y,
        right: 0,
        height: ROW_HEIGHT,
      }}
      onMouseDown={(e) => {
        // Don't interfere with event dragging
        const target = e.target as HTMLElement;
        if (target.closest('[data-role="event"]')) return;
        if (sequence.isDragging) return;

        // Allow the event to bubble up to parent for panning
        // Don't stop propagation so parent TimelineViewport can handle it
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-role="event"]')) return;

        // Select track when clicking empty spot
        appModel.setSelectedEntity({
          kind: "track",
          track: track.track,
          sequence: sequence.sequence,
        });
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        if (target.closest('[data-role="event"]')) return;
        if (sequence.hasPanned) return;

        track.openContextMenu(
          e.clientX,
          e.clientY,
          e.currentTarget.getBoundingClientRect(),
        );
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderBottom: "1px solid var(--mantine-color-dark-5)",
        }}
      />

      {track.events.map((e) => (
        <EventBar key={e.id} event={e} />
      ))}

      <DraggingEventPreview track={track} />
    </div>
  );
}
