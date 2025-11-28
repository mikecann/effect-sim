import type { TrackEventUIModel } from "../../models/TrackEventUIModel";
import { EVENT_BAR_STYLES } from "./EventBarStyles";
import { Tooltip, Avatar } from "@mantine/core";
import type { StringNodeModel } from "../../../../shared/models/StringNodeModel";
import type { SwitchNodeModel } from "../../../../shared/models/SwitchNodeModel";
import { useApp } from "../../../common/AppContext";
import { EventIcon } from "./icons/EventIcon";

interface EventBarLabelProps {
  event: TrackEventUIModel;
}

export function EventBarLabel({ event: eventUI }: EventBarLabelProps) {
  const event = eventUI.event;
  const isCompletelyOutOfBounds = eventUI.isCompletelyOutOfBounds;
  const labelText = eventUI.label;

  const isAllNodes = event.appliesTo.kind === "all_nodes";
  const project = useApp().getProject();

  // Get nodes to display (filter to only string/switch nodes)
  const displayNodes =
    event.appliesTo.kind === "all_nodes"
      ? [
          ...project.getNodesByKind("string"),
          ...project.getNodesByKind("switch"),
        ]
      : event.appliesTo.kind === "nodes" && event.appliesTo.nodeIds.length > 0
        ? project
            .findNodes(event.appliesTo.nodeIds)
            .filter(
              (node): node is StringNodeModel | SwitchNodeModel =>
                node.kind === "string" || node.kind === "switch",
            )
        : [];

  // Get node names for tooltip
  const nodeNames = displayNodes.map((node) => node.name).filter(Boolean);

  const iconTooltipLabel =
    event.kind === "string_effect" ? "String Effect" : "Switch Effect";

  const textColor = isCompletelyOutOfBounds
    ? "var(--mantine-color-gray-4)"
    : "white";

  return (
    <div style={EVENT_BAR_STYLES.label(isCompletelyOutOfBounds)}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 8px",
          width: "100%",
        }}
      >
        <Tooltip label={iconTooltipLabel} withArrow>
          <EventIcon event={event} color={textColor} size={14} />
        </Tooltip>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {labelText}
        </span>
        {displayNodes.length > 0 ? (
          <Tooltip
            label={
              isAllNodes
                ? `Applies to all nodes (${displayNodes.length})`
                : nodeNames.length > 0
                  ? nodeNames.join(", ")
                  : `${displayNodes.length} node${displayNodes.length === 1 ? "" : "s"}`
            }
            withArrow
          >
            <Avatar.Group spacing="sm" style={{ flexShrink: 0 }}>
              {displayNodes.slice(0, 5).map((node) => {
                const emoji =
                  node.icon?.kind === "emoji" ? node.icon.emoji : "❓";
                return (
                  <Avatar
                    key={node._id}
                    size="sm"
                    radius="xl"
                    style={{
                      backgroundColor: "transparent",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>
                  </Avatar>
                );
              })}
              {displayNodes.length > 5 ? (
                <Avatar
                  size="sm"
                  radius="xl"
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    color: textColor,
                    fontSize: 10,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  +{displayNodes.length - 5}
                </Avatar>
              ) : null}
            </Avatar.Group>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}
