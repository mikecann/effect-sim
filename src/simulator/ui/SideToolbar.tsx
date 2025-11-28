import { ActionIcon, Paper, Stack, Tooltip } from "@mantine/core";
import { useSimulator } from "../SimulatorContext";

export default function SideToolbar() {
  const appModel = useSimulator().app;

  if (appModel.placingStringId) return null;

  return (
    <Paper
      shadow="md"
      radius="xl"
      withBorder
      p="xs"
      style={{
        position: "absolute",
        right: 16,
        top: 46,
        transform: "translateY(-50%)",
        zIndex: 1000,
        background: "rgba(30,30,30,0.85)",
        backdropFilter: "blur(4px)",
      }}
    >
      <Stack gap="xs" align="center">
        <Tooltip
          label={
            appModel.isMeasureMode
              ? "Disable measure tool"
              : "Enable measure tool"
          }
        >
          <ActionIcon
            aria-label="Measure tool"
            radius="xl"
            size="lg"
            variant={appModel.isMeasureMode ? "filled" : "light"}
            color={appModel.isMeasureMode ? "blue" : undefined}
            onClick={() => appModel.setIsMeasureMode(!appModel.isMeasureMode)}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>📏</span>
          </ActionIcon>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
