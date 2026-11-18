import { useState } from "react";
import { Stack, Text, Button, Group, Badge, Tooltip } from "@mantine/core";
import { IconRefresh, IconPower } from "@tabler/icons-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useApiErrorHandler } from "../../common/errors";
import type { SwitchNodeModel } from "../../../shared/models/SwitchNodeModel";

type Action = "refresh" | "on" | "off" | "toggle";

const stateBadge = {
  unknown: { label: "Unknown", color: "gray" },
  switching: { label: "Switching…", color: "yellow" },
  on: { label: "On", color: "green" },
  off: { label: "Off", color: "red" },
  unreachable: { label: "Unreachable", color: "orange" },
  removed: { label: "Removed", color: "gray" },
} as const;

/**
 * The plug's state as everyone sees it (the switchState machine, which HWIR
 * and the editor report to), and buttons that switch it from here.
 */
export default function SwitchControlsSection({
  node,
}: {
  node: SwitchNodeModel;
}) {
  const onApiError = useApiErrorHandler();
  const [busy, setBusy] = useState<Action | null>(null);
  const switches = useQuery(api.switches.list, {
    projectId: node.project._id,
  });
  const state = switches?.find((s) => s.nodeKey === node.key)?.state;
  const badge = stateBadge[state?.kind ?? "unknown"];

  const run = async (action: Action, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(action);
    try {
      await work();
    } catch (error) {
      onApiError(error);
    } finally {
      setBusy(null);
    }
  };

  const button = (
    action: Action,
    label: string,
    work: () => Promise<void>,
    props: { color?: string; icon?: React.ReactNode } = {},
  ) => (
    <Button
      variant="light"
      color={props.color}
      leftSection={props.icon}
      loading={busy === action}
      disabled={busy !== null}
      onClick={() => run(action, work)}
    >
      {label}
    </Button>
  );

  return (
    <Stack pt="xs" gap="md">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          Status
        </Text>
        <Tooltip
          label={state?.kind === "unreachable" ? state.error : badge.label}
          withArrow
        >
          <Badge color={badge.color} variant="light">
            {switches === undefined ? "Loading…" : badge.label}
          </Badge>
        </Tooltip>
      </Group>

      <Group gap="xs">
        {button("refresh", "Refresh", () => node.refreshStatus(), {
          icon: <IconRefresh size={16} />,
        })}
        {button("on", "Turn On", () => node.turnOn(), {
          color: "green",
          icon: <IconPower size={16} />,
        })}
        {button("off", "Turn Off", () => node.turnOff(), {
          color: "red",
          icon: <IconPower size={16} />,
        })}
        {button("toggle", "Toggle", () => node.toggle())}
      </Group>
    </Stack>
  );
}
