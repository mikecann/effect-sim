import { useMutation } from "convex/react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Image,
  Paper,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useApp } from "../common/AppContext";
import type { MappingTool } from "../common/models/editorTool";
import { collectSurfaceMeshes } from "../simulator/placing/raycast";
import { projectViews, viewCoverage, type AlignedView } from "./projectLeds";
import type { CameraView } from "./useMappingData";
import type { Runner } from "./useRunner";

type SessionId = Id<"mappingSessions">;

/** Picking pairs on one view's photo, solving its camera, or lining it up by hand. */
function AlignControls({
  view,
  tool,
}: {
  view: CameraView;
  tool: MappingTool;
}) {
  const app = useApp();
  const mapping = app.mapping;
  const aspect = view.imageWidth / view.imageHeight;
  const alignment = mapping.alignmentOf(view.name);
  const next = tool.pairs.length + 1;

  return (
    <Stack gap="xs">
      <Text size="xs" fw={500}>
        Photo opacity
      </Text>
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={mapping.opacity}
        onChange={(v) => mapping.setOpacity(v)}
        label={(v) => `${Math.round(v * 100)}%`}
      />
      <Switch
        size="xs"
        label="Show the LEDs the camera found"
        checked={mapping.showCapturedDots}
        onChange={(e) => mapping.setShowCapturedDots(e.currentTarget.checked)}
      />
      <SegmentedControl
        size="xs"
        value={mapping.alignMode}
        onChange={(v) =>
          mapping.setAlignMode(v === "byHand" ? "byHand" : "points")
        }
        data={[
          { value: "points", label: "Match points" },
          { value: "byHand", label: "By hand" },
        ]}
      />
      {mapping.alignMode === "points" ? (
        <>
          <Text size="xs" c="dimmed">
            Click a point on the photo, then the same point on the house. Four
            pairs is the least; six or more spread over the house works best.
          </Text>
          <Group gap="xs">
            {tool.step.kind === "view" ? (
              <Button
                size="xs"
                onClick={() => app.sendTool({ kind: "PICK_PAIRS" })}
              >
                Pick pairs
              </Button>
            ) : (
              <Button
                size="xs"
                variant="default"
                onClick={() => app.sendTool({ kind: "STOP_PICKING" })}
              >
                Stop picking
              </Button>
            )}
            <Button
              size="xs"
              disabled={tool.pairs.length < 4}
              onClick={() => mapping.solve(view.name, tool.pairs, aspect)}
            >
              Solve camera ({tool.pairs.length})
            </Button>
            <Button
              size="xs"
              variant="subtle"
              disabled={tool.pairs.length === 0}
              onClick={() => app.sendTool({ kind: "CLEAR_PAIRS" })}
            >
              Clear
            </Button>
          </Group>
          <Text size="xs" c="dimmed" data-testid="pick-hint">
            {tool.step.kind === "pickPhoto"
              ? `Click point ${next} on the photo.`
              : tool.step.kind === "pickMesh"
                ? `Now click point ${next} on the house (move the camera if you need to).`
                : ""}
          </Text>
          {tool.pairs.map((pair, i) => (
            <Group key={i} gap="xs" justify="space-between">
              <Text size="xs">
                {i + 1}: photo {pair.image.u.toFixed(3)},{" "}
                {pair.image.v.toFixed(3)}
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => app.sendTool({ kind: "REMOVE_PAIR", index: i })}
              >
                Remove
              </Button>
            </Group>
          ))}
        </>
      ) : (
        <>
          <Text size="xs" c="dimmed">
            Move the camera and set the photo's field of view until the house
            lines up with the photo, then keep that view.
          </Text>
          <Text size="xs" fw={500}>
            Field of view
          </Text>
          <Slider
            min={15}
            max={100}
            step={0.5}
            value={mapping.handFovDeg}
            onChange={(v) => mapping.setHandFov(v)}
            label={(v) => `${v}°`}
          />
          <Button size="xs" onClick={() => mapping.useView(view.name, aspect)}>
            Use this view
          </Button>
        </>
      )}
      {mapping.solveError ? (
        <Alert color="red" variant="light">
          {mapping.solveError}
        </Alert>
      ) : null}
      {alignment ? (
        <Switch
          size="xs"
          label="Lock the 3D view to this photo's camera"
          checked={mapping.cameraLocked}
          onChange={(e) => mapping.setCameraLocked(e.currentTarget.checked)}
        />
      ) : null}
      <Button
        size="xs"
        variant="default"
        onClick={() => app.sendTool({ kind: "SELECT" })}
      >
        Hide photo
      </Button>
    </Stack>
  );
}

/** One camera view: what it covers, whether it's lined up, and its controls when open. */
function ViewCard({
  sessionId,
  view,
}: {
  sessionId: SessionId;
  view: CameraView;
}) {
  const app = useApp();
  const tool =
    app.tool.kind === "mapping" &&
    app.tool.sessionKey === sessionId &&
    app.tool.viewName === view.name
      ? app.tool
      : null;
  const alignment = app.mapping.alignmentOf(view.name);
  const coverage = viewCoverage(view).filter((c) => c.seen > 0);
  const seen = coverage.reduce((n, c) => n + c.seen, 0);
  const nameOf = (key: string) => app.project?.findString(key)?.name ?? key;

  return (
    <Paper withBorder p="xs" radius="sm" data-testid={`view-${view.name}`}>
      <Stack gap={6}>
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {view.name}
          </Text>
          {alignment ? (
            <Badge color="green" size="sm" data-testid="view-aligned">
              {alignment.rmsError === null
                ? "Lined up by hand"
                : `Lined up, ${(alignment.rmsError * 100).toFixed(2)}% off`}
            </Badge>
          ) : (
            <Badge color="gray" size="sm">
              Not lined up
            </Badge>
          )}
        </Group>
        {view.photoUrl ? (
          <Image
            src={view.photoUrl}
            radius="sm"
            h={90}
            fit="contain"
            alt={`The ${view.name} view's photo`}
          />
        ) : null}
        <Text size="xs">
          Saw {seen} LEDs on {coverage.length} strings:{" "}
          {coverage
            .map((c) => `${nameOf(c.nodeKey)} ${c.seen}/${c.total}`)
            .join(", ")}
        </Text>
        {tool ? (
          <AlignControls view={view} tool={tool} />
        ) : (
          <Button
            size="xs"
            variant="light"
            onClick={() =>
              app.sendTool({
                kind: "START_MAPPING",
                sessionKey: sessionId,
                viewName: view.name,
              })
            }
          >
            {alignment ? "Show and adjust" : "Line up with the house"}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

/** The session's camera views, lined up one by one, then projected together. */
export function ViewsSection({
  sessionId,
  views,
  runner,
}: {
  sessionId: SessionId;
  views: CameraView[];
  runner: Runner;
}) {
  const app = useApp();
  const mapping = app.mapping;
  const solved = useMutation(api.mapping.solved);
  const aligned: AlignedView[] = views.flatMap((view) => {
    const alignment = mapping.alignmentOf(view.name);
    return alignment
      ? [{ name: view.name, pose: alignment.pose, strings: view.strings }]
      : [];
  });

  const project = () =>
    runner.run("project", async () => {
      const proposed = projectViews({
        views: aligned,
        ledCountOf: (key) => app.project?.findString(key)?.ledCount ?? null,
        meshes: collectSurfaceMeshes(app.gardenModel),
      });
      if (proposed.length === 0)
        throw new Error("None of the photos' LEDs landed on the house.");
      mapping.setSources(new Map(proposed.map((p) => [p.nodeKey, p.sources])));
      if (app.tool.kind === "mapping") app.sendTool({ kind: "SELECT" });
      return await solved({
        sessionId,
        proposed: proposed.map((p) => ({
          nodeKey: p.nodeKey,
          ledPositions: p.positions,
        })),
      });
    });

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Line each view's photo up with the house, then project them all. Where
        two views saw an LED, the surer one counts.
      </Text>
      {views.map((view) => (
        <ViewCard key={view.name} sessionId={sessionId} view={view} />
      ))}
      <Button
        disabled={aligned.length === 0 || runner.busy !== null}
        loading={runner.busy === "project"}
        onClick={() => void project()}
      >
        Project LEDs from {aligned.length} of {views.length} views
      </Button>
    </Stack>
  );
}
