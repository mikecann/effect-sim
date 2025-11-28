import { ActionIcon, Group, Paper, Text, Tooltip } from "@mantine/core";
import { useSimulator } from "../SimulatorContext";

export default function MeasureStatus() {
  const appModel = useSimulator().app;
  if (!appModel.isMeasureMode) return null;
  return (
    <Paper
      shadow="md"
      radius="xl"
      withBorder
      p="xs"
      style={{ position: "absolute", right: 16, bottom: 16, zIndex: 1000 }}
    >
      <Group gap="sm">
        <Text size="sm">Measure mode</Text>
        <Tooltip label="Exit measure mode">
          <ActionIcon
            variant="light"
            radius="xl"
            onClick={() => appModel.setIsMeasureMode(false)}
          >
            ✕
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  );
}
