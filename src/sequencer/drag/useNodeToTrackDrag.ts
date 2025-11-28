import { useState, useCallback, useEffect } from "react";
import type {
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import type { Id } from "../../../convex/_generated/dataModel";
import type { NodeDoc } from "../../../shared/nodeTree";

export type NodeDragData = {
  type: "node";
  nodeIds: Id<"nodes">[];
  nodeKinds: Set<NodeDoc["kind"]>;
};

export type TrackDropData = {
  type: "track";
  trackId: string;
};

export function useNodeToTrackDrag() {
  const [draggedNodes, setDraggedNodes] = useState<NodeDragData | null>(null);
  const [overTrackId, setOverTrackId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Listen for drag events from NodesTree
  useEffect(() => {
    const handleNodeDragOverTrack = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { nodeData, trackData, position } = customEvent.detail;
      setDraggedNodes(nodeData);
      setOverTrackId(trackData.trackId);
      setDragPosition(position);
    };

    const handleNodeDragMove = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { position } = customEvent.detail;
      if (position && draggedNodes) setDragPosition(position);
    };

    window.addEventListener(
      "node-drag-over-track",
      handleNodeDragOverTrack as EventListener,
    );
    window.addEventListener(
      "node-drag-move",
      handleNodeDragMove as EventListener,
    );
    return () => {
      window.removeEventListener(
        "node-drag-over-track",
        handleNodeDragOverTrack as EventListener,
      );
      window.removeEventListener(
        "node-drag-move",
        handleNodeDragMove as EventListener,
      );
    };
  }, [draggedNodes]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "node") setDraggedNodes(data as NodeDragData);
  }, []);

  const handleDragMove = useCallback(
    (event: { activatorEvent?: MouseEvent }) => {
      // Update drag position for ghost track
      if (event.activatorEvent instanceof MouseEvent)
        setDragPosition({
          x: event.activatorEvent.clientX,
          y: event.activatorEvent.clientY,
        });
    },
    [],
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const over = event.over;
    if (over) {
      const data = event.over?.data.current;
      if (data?.type === "track")
        setOverTrackId((data as TrackDropData).trackId);
      else setOverTrackId(null);
    } else setOverTrackId(null);

    // Update drag position for ghost track
    if (event.activatorEvent instanceof MouseEvent)
      setDragPosition({
        x: event.activatorEvent.clientX,
        y: event.activatorEvent.clientY,
      });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    // Also listen for drag end from NodesTree
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    if (activeData?.type === "node" && overData?.type === "track") {
      // This is handled by NodeToTrackDropHandler via useDndMonitor
    }
    setDraggedNodes(null);
    setOverTrackId(null);
    setDragPosition(null);
  }, []);

  const handleDragCancel = useCallback(() => {
    setDraggedNodes(null);
    setOverTrackId(null);
    setDragPosition(null);
  }, []);

  return {
    draggedNodes,
    overTrackId,
    dragPosition,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}
