import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import { useApp } from "../../common/AppContext";
import { calculateRemainingDistance } from "./helpers";

/** What placing a string is doing, its keys, and the ask before throwing a path away. */
export function PlacementStatus() {
  const app = useApp();
  const tool = app.placingTool;
  if (!tool) return null;
  const string = app.project?.findString(tool.stringKey);
  if (!string) return null;

  const remaining = calculateRemainingDistance(
    tool.points,
    string.ledCount,
    string.spacingMeters,
  );
  const count = tool.points.length;

  return (
    <Paper
      shadow="md"
      radius="md"
      withBorder
      p="sm"
      data-testid="placement-status"
      style={{ position: "absolute", left: 16, bottom: 16, zIndex: 1000 }}
    >
      {tool.confirmingDiscard ? (
        <Stack gap="xs">
          <Text size="sm">
            Throw away the {count} {count === 1 ? "point" : "points"} placed for{" "}
            {string.name}?
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              onClick={() => app.sendTool({ kind: "KEEP_PLACING" })}
            >
              Keep placing
            </Button>
            <Button
              size="xs"
              color="red"
              onClick={() => app.sendTool({ kind: "DISCARD_PLACING" })}
            >
              Discard
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Placing {string.name}: {count} {count === 1 ? "point" : "points"},{" "}
            {remaining.toFixed(2)} m of string left
          </Text>
          <Text size="xs" c="dimmed">
            Click the house to add a point. Enter finishes, Backspace removes
            the last point, Esc cancels.
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              disabled={count < 2}
              onClick={() => app.sendTool({ kind: "FINISH_PLACING" })}
            >
              Finish
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={count === 0}
              onClick={() => app.sendTool({ kind: "UNDO_POINT" })}
            >
              Undo point
            </Button>
          </Group>
        </Stack>
      )}
    </Paper>
  );
}
