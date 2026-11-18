import {
  Badge,
  Group,
  Popover,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useApp } from "../AppContext";

const statusColors = {
  online: "green",
  stale: "yellow",
  offline: "red",
} as const;

const connectionColors = {
  live: "green",
  connecting: "blue",
  degraded: "yellow",
  offline: "red",
} as const;

const ago = (at: number) => {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return new Date(at).toLocaleString();
};

const Dot = ({ color }: { color: string }) => (
  <div
    style={{
      width: 8,
      height: 8,
      borderRadius: 4,
      background: `var(--mantine-color-${color}-6)`,
    }}
  />
);

/**
 * Whether the lights runtime (HWIR) is running for this project, from its
 * heartbeat (convex/hwir.ts): online, stale or offline, with its commit,
 * frame rate and each string's connection a click away.
 */
export function LightsStatus() {
  const app = useApp();
  const projectId = app.currentProjectId;
  const presence = useQuery(
    api.hwir.presence,
    projectId ? { projectId } : "skip",
  );
  if (!projectId) return null;

  const status = presence?.status ?? null;
  const color = status ? statusColors[status] : "gray";
  const label =
    presence === undefined
      ? "Lights: checking…"
      : status
        ? `Lights ${status}`
        : "Lights never ran";
  const nameOf = (key: string) => app.project?.findString(key)?.name ?? key;

  return (
    <Popover
      width={360}
      position="bottom-end"
      shadow="md"
      withArrow
      zIndex={2000}
    >
      <Popover.Target>
        <UnstyledButton
          data-testid="lights-status"
          data-status={status ?? "none"}
        >
          <Group gap={6}>
            <Dot color={color} />
            <Text size="xs" c="dimmed">
              {label}
            </Text>
          </Group>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        {presence ? (
          <Stack gap="xs" data-testid="lights-status-details">
            <Group justify="space-between">
              <Badge color={color}>{presence.status}</Badge>
              <Text size="xs" c="dimmed">
                Heard from {ago(presence.lastSeenAt)}
              </Text>
            </Group>
            <Text size="xs">
              Commit{" "}
              <Text span ff="monospace" size="xs">
                {presence.commit.slice(0, 10)}
              </Text>
              , {presence.fps.toFixed(1)} fps
            </Text>
            {presence.plug ? (
              <Text size="xs" c={presence.plug.ok ? undefined : "red"}>
                Mains plug {presence.plug.on ? "on" : "off"}
                {presence.plug.ok
                  ? ""
                  : `, failing: ${presence.plug.error ?? "no answer"}`}
              </Text>
            ) : null}
            <Table withRowBorders={false} verticalSpacing={2} fz="xs">
              <Table.Tbody>
                {presence.strings.map((s) => (
                  <Table.Tr key={s.key}>
                    <Table.Td>{nameOf(s.key)}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Dot color={connectionColors[s.connection]} />
                        {s.connection}
                      </Group>
                    </Table.Td>
                    <Table.Td c="dimmed">
                      {s.lastSeenAt ? ago(s.lastSeenAt) : "not seen"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            {presence === undefined
              ? "Checking…"
              : "The lights runtime hasn't sent a heartbeat for this project yet."}
          </Text>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
