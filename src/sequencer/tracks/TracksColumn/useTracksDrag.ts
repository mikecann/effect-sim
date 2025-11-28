import { useState } from "react";
import type {
  DragStartEvent,
  DragEndEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import type { Track } from "../../../../convex/schema";

export function useTracksDrag({
  tracks,
  onReorder,
}: {
  tracks: Track[];
  onReorder: (args: { trackId: string; targetIndex: number }) => void;
}) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const handleDragStart = ({ active: { id: activeId } }: DragStartEvent) => {
    setActiveId(activeId);
    document.body.style.setProperty("cursor", "grabbing");
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    document.body.style.setProperty("cursor", "");

    if (!over) return;
    if (active.id === over.id) return;

    const targetTrackId = String(over.id);
    const targetIndex = tracks.findIndex((track) => track.id === targetTrackId);

    if (targetIndex === -1) return;

    onReorder({
      trackId: String(active.id),
      targetIndex,
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    document.body.style.setProperty("cursor", "");
  };

  return {
    activeId,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}

