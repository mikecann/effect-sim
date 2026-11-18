import { Button, Group, Paper, Text } from "@mantine/core";
import { useApp } from "../../common/AppContext";

/** Says what to click while a virtual string segment's range is being picked. */
export function RangePickStatus() {
  const app = useApp();
  const tool = app.tool.kind === "pickingRange" ? app.tool : null;
  if (!tool) return null;
  const first = tool.first;
  const string = first ? app.project?.findString(first.stringKey) : null;
  return (
    <Paper
      shadow="md"
      radius="md"
      withBorder
      p="sm"
      data-testid="range-pick-status"
      style={{ position: "absolute", left: 16, bottom: 16, zIndex: 1000 }}
    >
      <Group gap="sm">
        <Text size="sm">
          {first
            ? `From ${string?.name ?? "a string"} LED ${first.index}: now click the segment's last LED on the same string.`
            : "Click the segment's first LED on the house."}
        </Text>
        <Button
          size="xs"
          variant="default"
          onClick={() => app.sendTool({ kind: "SELECT" })}
        >
          Cancel
        </Button>
      </Group>
    </Paper>
  );
}
