import { useMutation } from "convex/react";
import { Alert, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { api } from "../../convex/_generated/api";
import { useApp } from "../common/AppContext";
import { confidenceColors } from "./confidence";
import { useLatestSession, useViews } from "./useMappingData";
import { useRunner } from "./useRunner";
import { ViewsSection } from "./ViewsSection";

const stateLabels = {
  capturing: { label: "Capturing", color: "blue" },
  solving: { label: "Lining up", color: "yellow" },
  review: { label: "In review", color: "orange" },
  applied: { label: "Applied", color: "green" },
  discarded: { label: "Discarded", color: "gray" },
} as const;

function Legend() {
  const items = [
    { color: confidenceColors.sure, label: "Sure" },
    { color: confidenceColors.unsure, label: "Unsure" },
    { color: confidenceColors.filled, label: "Filled from neighbours" },
  ];
  return (
    <Group gap="sm">
      {items.map((item) => (
        <Group key={item.label} gap={4}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: item.color,
            }}
          />
          <Text size="xs">{item.label}</Text>
        </Group>
      ))}
    </Group>
  );
}

/** Camera mapping: start a session, line its photo up, review and apply. */
export default function MappingPanel() {
  const app = useApp();
  const projectId = app.currentProjectId;
  const session = useLatestSession();
  const views = useViews(session?.id ?? null);
  const runner = useRunner();
  const start = useMutation(api.mapping.start);
  const discard = useMutation(api.mapping.discard);
  const realign = useMutation(api.mapping.realign);
  const apply = useMutation(api.mapping.apply);
  const rollback = useMutation(api.mapping.rollback);

  if (!projectId) return null;
  if (session === undefined)
    return (
      <Text p="md" size="sm" c="dimmed">
        Loading…
      </Text>
    );

  const state = session?.state ?? null;
  const isActive =
    state?.kind === "capturing" ||
    state?.kind === "solving" ||
    state?.kind === "review";
  const busy = runner.busy !== null;
  const button = (
    name: string,
    label: string,
    action: () => Promise<unknown>,
    color?: string,
  ) => (
    <Button
      key={name}
      size="xs"
      color={color}
      variant={color ? "light" : "filled"}
      disabled={busy}
      loading={runner.busy === name}
      onClick={() => void runner.run(name, action)}
    >
      {label}
    </Button>
  );

  return (
    <Stack gap="md" p="md" data-testid="mapping-panel">
      <Group justify="space-between">
        <Text fw={600}>Camera mapping</Text>
        {state ? (
          <Badge
            color={stateLabels[state.kind].color}
            data-testid="mapping-state"
          >
            {stateLabels[state.kind].label}
          </Badge>
        ) : null}
      </Group>

      {isActive ? null : (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Starting a session puts the lights into mapping mode, so the camera
            tool can light patterns and photograph them.
          </Text>
          {state?.kind === "applied" ? (
            <Text size="sm">
              The last session's positions are on the strings (applied{" "}
              {new Date(state.appliedAt).toLocaleString()}).
            </Text>
          ) : null}
          {state?.kind === "discarded" ? (
            <Text size="sm">The last session ended: {state.reason}</Text>
          ) : null}
          <Group gap="xs">
            {button("start", "Start mapping", async () => {
              app.mapping.reset();
              return await start({ projectId });
            })}
            {session && state?.kind === "applied"
              ? button(
                  "rollback",
                  "Roll back",
                  () => rollback({ sessionId: session.id }),
                  "red",
                )
              : null}
          </Group>
        </Stack>
      )}

      {session && state?.kind === "capturing" ? (
        <Stack gap="xs">
          <Text size="sm">
            Waiting for the camera tool. The lights show pattern{" "}
            {state.request.seq} ({state.request.pattern.kind});{" "}
            {state.shownSeq === state.request.seq
              ? "it's showing."
              : "the lights haven't confirmed it yet."}
          </Text>
          {views && views.length > 0 ? (
            <Text size="sm">
              Views in so far: {views.map((v) => v.name).join(", ")}.
            </Text>
          ) : null}
        </Stack>
      ) : null}

      {session && state?.kind === "solving" ? (
        views && views.length > 0 ? (
          <ViewsSection sessionId={session.id} views={views} runner={runner} />
        ) : (
          <Text size="sm">Waiting for the camera tool's views.</Text>
        )
      ) : null}

      {session && state?.kind === "review" ? (
        <Stack gap="xs">
          <Text size="sm" data-testid="review-summary">
            {state.proposed.length} strings have proposed positions, shown on
            the house by how sure the camera was.
          </Text>
          <Legend />
          <Group gap="xs">
            {button("apply", "Apply", () => apply({ sessionId: session.id }))}
            {button(
              "realign",
              "Line up again",
              () => realign({ sessionId: session.id }),
              "gray",
            )}
          </Group>
        </Stack>
      ) : null}

      {session && isActive ? (
        <Group gap="xs">
          {button(
            "discard",
            "Discard session",
            async () => {
              const result = await discard({ sessionId: session.id });
              if (app.tool.kind === "mapping") app.sendTool({ kind: "SELECT" });
              return result;
            },
            "red",
          )}
        </Group>
      ) : null}

      {runner.error ? (
        <Alert color="red" variant="light" data-testid="mapping-error">
          {runner.error}
        </Alert>
      ) : null}
    </Stack>
  );
}
