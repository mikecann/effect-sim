import { Stack, Text } from "@mantine/core";
import { useApp } from "../common/AppContext";
import { NodesInspector } from "./NodesInspector";
import { NodeInspector } from "./NodeInspector";
import { TrackInspectorWrapper } from "../sequencer/inspector/inspector/TrackInspectorWrapper";
import { EventInspectorWrapper } from "../sequencer/inspector/inspector/EventInspectorWrapper";
import { LoadingState } from "../sequencer/inspector/inspector/LoadingState";
import PlaylistInspector from "./playlist/PlaylistInspector";

export default function InspectorPanel() {
  const app = useApp();

  // Early return if nothing selected
  const selectedEntity = app.selectedEntity;
  if (!selectedEntity)
    return (
      <Stack gap="md" p="md" style={{ height: "100%" }}>
        <Text c="dimmed" size="sm" ta="center" py="xl">
          Select something to inspect it
        </Text>
      </Stack>
    );

  if (selectedEntity.kind === "event")
    return <EventInspectorWrapper event={selectedEntity.event} />;

  if (selectedEntity.kind === "track")
    return <TrackInspectorWrapper track={selectedEntity.track} />;

  // Single node selection
  if (selectedEntity.kind === "node")
    return <NodeInspector node={selectedEntity.node} />;

  // Virtual string selection (with optional segment selection)
  if (selectedEntity.kind === "virtual_string")
    return <NodeInspector node={selectedEntity.node} />;

  // Multiple nodes selection
  if (selectedEntity.kind === "nodes") {
    const nodes = selectedEntity.nodes;

    if (nodes.length === 0)
      return (
        <Stack gap="md" p="md" style={{ height: "100%" }}>
          <Text c="dimmed" size="sm" ta="center" py="xl">
            Select something to inspect it
          </Text>
        </Stack>
      );

    if (nodes.length === 1) return <NodeInspector node={nodes[0]} />;

    return <NodesInspector nodes={nodes} />;
  }

  // Playlist selection
  if (selectedEntity.kind === "playlist")
    return <PlaylistInspector playlist={selectedEntity.playlist} />;

  return null;
}
