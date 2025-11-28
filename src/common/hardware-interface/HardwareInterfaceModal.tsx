import {
  Modal,
  Stack,
  Text,
  Button,
  Group,
  Code,
  Badge,
  Switch,
} from "@mantine/core";
import { observer } from "mobx-react-lite";
import { useApp } from "../AppContext";

interface HardwareInterfaceModalProps {
  opened: boolean;
  onClose: () => void;
}

export const HardwareInterfaceModal = ({
  opened,
  onClose,
}: HardwareInterfaceModalProps) => {
  const app = useApp();
  const status = app.hardwareInterfaceRuntime.status;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Hardware Interface"
      size="md"
    >
      <Stack>
        <Text size="sm">
          The Hardware Interface connects the simulator to the physical LED
          controller runtime (Bun server) via WebSocket. This allows real-time
          streaming of LED data from the simulator to your hardware.
        </Text>

        <Group justify="space-between" align="center">
          <Text fw={500} size="sm">
            Status
          </Text>
          <Badge
            color={
              status === "open"
                ? "green"
                : status === "connecting" || status === "reconnecting"
                  ? "yellow"
                  : "red"
            }
          >
            {status.toUpperCase()}
          </Badge>
        </Group>

        <Group justify="space-between" align="center">
          <Text fw={500} size="sm">
            WebSocket URL
          </Text>
          <Code>{app.hardwareInterfaceRuntime.wsUrl}</Code>
        </Group>

        {app.hardwareInterfaceRuntime.lastError && (
          <Group justify="space-between" align="start">
            <Text fw={500} size="sm" c="red">
              Last Error
            </Text>
            <Code color="red" style={{ maxWidth: "60%" }}>
              {app.hardwareInterfaceRuntime.lastError}
            </Code>
          </Group>
        )}

        <Group justify="space-between" align="center">
          <Text fw={500} size="sm">
            Autoconnect
          </Text>
          <Switch
            checked={app.hardwareInterfaceRuntime.autoconnect}
            onChange={(e) =>
              app.hardwareInterfaceRuntime.setAutoconnect(
                e.currentTarget.checked,
              )
            }
          />
        </Group>

        <Group justify="flex-end" mt="md">
          {status === "open" ? (
            <Button
              color="red"
              onClick={() => app.hardwareInterfaceRuntime.disconnect()}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={() => app.hardwareInterfaceRuntime.connect()}
              loading={status === "connecting" || status === "reconnecting"}
              disabled={status === "connecting" || status === "reconnecting"}
            >
              Connect
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};
