import { Stack, Text, Button, Group, Badge } from "@mantine/core";
import { IconRefresh, IconPower } from "@tabler/icons-react";
import { useApiErrorHandler } from "../../common/errors";
import type { SwitchNodeModel } from "../../../shared/models/SwitchNodeModel";

export default function SwitchControlsSection({
  node,
}: {
  node: SwitchNodeModel;
}) {
  const onApiError = useApiErrorHandler();

  const statusText = node.isOn === null ? "Unknown" : node.isOn ? "On" : "Off";
  const statusColor = node.isOn === null ? "gray" : node.isOn ? "green" : "red";

  return (
    <Stack pt="xs" gap="md">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          Status
        </Text>
        <Badge color={statusColor} variant="light">
          {statusText}
        </Badge>
      </Group>

      <Group gap="xs">
        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          onClick={() => {
            node.refreshStatus().catch(onApiError);
          }}
        >
          Refresh
        </Button>
        <Button
          variant="light"
          color="green"
          leftSection={<IconPower size={16} />}
          onClick={() => {
            node.turnOn().catch(onApiError);
          }}
        >
          Turn On
        </Button>
        <Button
          variant="light"
          color="red"
          leftSection={<IconPower size={16} />}
          onClick={() => {
            node.turnOff().catch(onApiError);
          }}
        >
          Turn Off
        </Button>
        <Button
          variant="light"
          onClick={() => {
            node.toggle().catch(onApiError);
          }}
        >
          Toggle
        </Button>
      </Group>
    </Stack>
  );
}
