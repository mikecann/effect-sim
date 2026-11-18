import { useEffect, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import type { NodeDragData, TrackDropData } from "./useNodeToTrackDrag";
import { useSequence } from "../SequencerContext";
import { createId } from "../../../shared/models/types";
import { stringEffects } from "../../../shared/effects/registry";

export function NodeToTrackDropHandler() {
  const sequence = useSequence();

  const processDrop = useCallback(
    (
      nodeData: NodeDragData,
      trackData: TrackDropData,
      position: { x: number; y: number } | null,
    ) => {
      // Check if all nodes are the same kind
      const nodeKinds = Array.from(nodeData.nodeKinds);
      if (nodeKinds.length > 1) {
        notifications.show({
          title: "Cannot add nodes",
          message: "Cannot add nodes of different types to the sequencer track",
          color: "red",
        });
        return;
      }

      const nodeKind = nodeKinds[0];
      if (!nodeKind) return;

      // Don't allow folders
      if (nodeKind === "folder") {
        notifications.show({
          title: "Cannot add folder",
          message: "Folders cannot be added to sequencer tracks",
          color: "red",
        });
        return;
      }

      // Calculate frame position from the drop position
      let frameAtClick = 0;
      if (position) {
        // Try to find the timeline container to calculate frame position
        const timelineContainer = document.querySelector(
          "[data-timeline-container]",
        ) as HTMLElement;
        if (timelineContainer) {
          const rect = timelineContainer.getBoundingClientRect();
          const scrollLeft = timelineContainer.scrollLeft || 0;
          const xWithinContainer = position.x - rect.left + scrollLeft;
          const frameWidth = parseFloat(
            timelineContainer.dataset.frameWidth || "8",
          );
          frameAtClick = Math.max(
            0,
            Math.min(
              sequence.sequence.numFrames,
              Math.round(xWithinContainer / frameWidth),
            ),
          );
        }
      }
      const defaultDuration = 10;
      const endFrame = Math.min(
        sequence.sequence.numFrames,
        frameAtClick + defaultDuration,
      );

      // Determine event kind and default effect based on node kind
      let eventKind: "string_effect" | "switch_effect";
      let defaultEffectId: string;

      if (nodeKind === "string") {
        eventKind = "string_effect";
        defaultEffectId = stringEffects[0].id;
      } else if (nodeKind === "switch") {
        eventKind = "switch_effect";
        defaultEffectId = "turnOn";
      } else return;

      // Create appliesTo based on number of nodes
      const appliesTo = {
        kind: "nodes" as const,
        nodeIds: nodeData.nodeIds,
      };

      // Create the event
      const eventId = createId();
      try {
        sequence.sequence.addEvent(trackData.trackId, {
          id: eventId,
          kind: eventKind,
          effectDefinitionId: defaultEffectId,
          startFrame: frameAtClick,
          endFrame,
          appliesTo,
        });
      } catch (error) {
        console.error("Failed to add event:", error);
        notifications.show({
          title: "Error",
          message: "Failed to add event to track",
          color: "red",
        });
      }
    },
    [sequence],
  );

  // Listen for drag end events from NodesTree
  useEffect(() => {
    const handleNodeDragEndTrack = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { nodeData, trackData, position } = customEvent.detail;

      // Process the drop
      processDrop(nodeData, trackData, position);
    };

    window.addEventListener(
      "node-drag-end-track",
      handleNodeDragEndTrack as EventListener,
    );
    return () => {
      window.removeEventListener(
        "node-drag-end-track",
        handleNodeDragEndTrack as EventListener,
      );
    };
  }, [processDrop]);

  return null;
}
