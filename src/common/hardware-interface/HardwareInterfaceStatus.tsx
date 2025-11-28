import { Tooltip, Indicator, ActionIcon, Box } from "@mantine/core";
import { IconPlugConnected, IconPlugX } from "@tabler/icons-react";
import { observer } from "mobx-react-lite";
import { useApp } from "../AppContext";
import { useState } from "react";
import { HardwareInterfaceModal } from "./HardwareInterfaceModal";

export const HardwareInterfaceStatus = () => {
  const { hardwareInterfaceRuntime } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const status = hardwareInterfaceRuntime.status;

  const isConnected = status === "open";
  const isConnecting = status === "connecting" || status === "reconnecting";

  const color = isConnected ? "green" : isConnecting ? "yellow" : "red";
  const label = isConnected
    ? "Hardware Connected"
    : isConnecting
      ? "Hardware Connecting..."
      : "Hardware Disconnected";

  return (
    <>
      <Tooltip label={label} withArrow position="bottom">
        <ActionIcon
          variant="subtle"
          color={color}
          onClick={() => setModalOpen(true)}
          size="md"
        >
          {isConnected ? (
            <IconPlugConnected size={20} />
          ) : (
            <IconPlugX size={20} />
          )}
        </ActionIcon>
      </Tooltip>

      <HardwareInterfaceModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
};
