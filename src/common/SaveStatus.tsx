import { Button, Group, Loader, Text, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useApp } from "./AppContext";

/** Whether the open project's edits are saved (ProjectSyncModel). */
export const SaveStatus = () => {
  const app = useApp();
  const status = app.sync?.status;
  if (!status) return null;

  if (status.kind === "loading")
    return (
      <Group gap={6} data-testid="save-status" data-status="loading">
        <Loader size={12} />
        <Text size="xs" c="dimmed">
          Loading…
        </Text>
      </Group>
    );

  if (status.kind === "saving")
    return (
      <Group gap={6} data-testid="save-status" data-status="saving">
        <Loader size={12} />
        <Text size="xs" c="dimmed">
          Saving…
        </Text>
      </Group>
    );

  if (status.kind === "saved")
    return (
      <Group gap={6} data-testid="save-status" data-status="saved">
        <IconCheck size={14} color="var(--mantine-color-green-5)" />
        <Text size="xs" c="dimmed">
          Saved
        </Text>
      </Group>
    );

  return (
    <Group gap={6} data-testid="save-status" data-status="error">
      <Tooltip label={status.message} withArrow multiline maw={320}>
        <Group gap={4}>
          <IconAlertTriangle size={14} color="var(--mantine-color-red-5)" />
          <Text size="xs" c="red.4">
            Not saved
          </Text>
        </Group>
      </Tooltip>
      {/* Retrying shows as "Saving…" straight away, so it can't be pressed twice. */}
      <Button size="compact-xs" variant="subtle" onClick={() => app.sync?.flush()}>
        Retry now
      </Button>
    </Group>
  );
};
