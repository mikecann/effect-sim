import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { ProjectModel } from "../shared/models/ProjectModel";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { logger } from "./utils/logger";
import { plugConfigured, readPlug, switchPlug } from "./homeAssistant";
import { hwirToken } from "./token";
import { readCommit } from "./utils/commit";
import { HEARTBEAT_INTERVAL_MS } from "../convex/hwirPresence";
import { DEFAULT_FRAMERATE } from "../src/common/projects/projectConstants";

type TokenMutation = FunctionReference<"mutation", "public", { token?: string }>;

/** useMutation for HWIR's mutations: adds HWIR_TOKEN to every call. */
const useHwirMutation = <M extends TokenMutation>(mutation: M) => {
  const run = useMutation(mutation);
  return useCallback(
    (args: Omit<FunctionArgs<M>, "token">) =>
      run(
        ...([{ ...args, token: hwirToken }] as unknown as OptionalRestArgs<M>),
      ),
    [run],
  );
};

export const useProjectModel = (model: HWIRAppModel) => {
  const projectDoc = useQuery(api.functions.getProject, {
    projectId: model.startupSettings.projectId,
  });

  const projectData = useQuery(
    api.functions.getDataForProject,
    projectDoc
      ? {
          projectId: projectDoc?._id,
        }
      : "skip",
  );

  // A new model only when the project itself changes; its fields follow below.
  useEffect(() => {
    if (!projectDoc?._id) return;
    model.setProject(new ProjectModel(projectDoc));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id: a new projectDoc for the same project only updates its fields (next effect).
  }, [projectDoc?._id]);

  useEffect(() => {
    if (!model.project) return;
    if (!projectDoc) return;
    model.project.updateSettings(projectDoc.settings);
    model.project.setName(projectDoc.name);
  }, [model.project, projectDoc]);

  useEffect(() => {
    if (!model.project) return;
    if (!projectData) return;
    model.project.updateFromServerData(projectData);
  }, [model.project, projectData]);
};

/**
 * Follows the phone remote's settings (convex/display.ts) and confirms each
 * change once it's applied, which moves the displayControl machine to `live`.
 * Only in playlist mode: in listen mode the editor drives the lights.
 */
export const useDisplayControl = (model: HWIRAppModel) => {
  const { projectId, playlistId } = model.startupSettings;
  const control = useQuery(
    api.display.get,
    playlistId ? { projectId } : "skip",
  );
  const boot = useHwirMutation(api.display.boot);
  const applied = useHwirMutation(api.display.applied);

  // First run for this project: record what the startup flags play, so the
  // remote has something to change.
  useEffect(() => {
    if (control !== null || !playlistId) return;
    boot({
      projectId,
      settings: {
        isOn: true,
        brightness: 1,
        mode: { kind: "playlist", id: playlistId },
      },
    }).catch((e) => logger.error(`Error creating display controls: ${e}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once, when the query first says there's no row; the ids and boot are fixed for HWIR's life.
  }, [control === null]);

  useEffect(() => {
    if (control === undefined) return;
    model.setControl(control?.settings ?? null);
  }, [model, control]);

  // Runs after the render that applied the new settings, so the confirmation
  // means the lights really are playing them. The plug is switched first: if
  // that fails there's no confirmation, and the phone says it's offline.
  const requestedAt = control?.requestedAt ?? null;
  const lastPlugSwitchAt = useRef(0);
  useEffect(() => {
    if (requestedAt === null) return;
    const s = control?.settings;
    if (!s) return;
    logger.info(
      `Remote: ${s.isOn ? "on" : "off"}, ${s.mode.kind} ${s.mode.id}, brightness ${s.brightness}`,
    );
    void (async () => {
      try {
        if (plugConfigured) {
          lastPlugSwitchAt.current = Date.now();
          await switchPlug(s.isOn);
        }
        await applied({ projectId, requestedAt });
      } catch (e) {
        logger.error(`Error applying display change: ${e}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per request: control changes on every status update, and confirming it twice would be wrong.
  }, [requestedAt]);

  usePlugFollower(model, control, lastPlugSwitchAt);
};

/**
 * Home Assistant switches the plug too (sunset on, 10pm off), so every 10 s
 * check it and move on/off to match when they disagree. Skipped for 30 s
 * after HWIR switched the plug itself, while Home Assistant catches up.
 */
const usePlugFollower = (
  model: HWIRAppModel,
  control: FunctionReturnType<typeof api.display.get> | undefined,
  lastPlugSwitchAt: { current: number },
) => {
  const { projectId } = model.startupSettings;
  const plugSwitched = useHwirMutation(api.display.plugSwitched);
  const latest = useRef(control);
  useEffect(() => {
    latest.current = control;
  }, [control]);

  useEffect(() => {
    if (!plugConfigured || !model.startupSettings.playlistId) return;
    const check = async () => {
      const c = latest.current;
      if (!c || c.status !== "live") return;
      if (Date.now() - lastPlugSwitchAt.current < 30_000) return;
      const plugOn = await readPlug();
      if (plugOn === null || plugOn === c.settings.isOn) return;
      logger.info(
        `The lights' plug was switched ${plugOn ? "on" : "off"} outside the app`,
      );
      await plugSwitched({ projectId, isOn: plugOn });
    };
    const timer = setInterval(() => {
      check().catch((e) =>
        logger.error(`Error checking the lights' plug: ${e}`),
      );
    }, 10_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one 10 s poll for HWIR's life; it reads the latest control through a ref.
  }, []);
};

/**
 * Tells Convex HWIR is running, every 10 s (convex/hwirPresence.ts): the
 * commit it runs, its frame rate and each string's connection.
 */
export const useHeartbeat = (model: HWIRAppModel) => {
  const heartbeat = useHwirMutation(api.hwir.heartbeat);
  const { projectId } = model.startupSettings;

  useEffect(() => {
    const commit = readCommit();
    const beat = () => {
      const project = model.project;
      if (!project) return;
      heartbeat({
        projectId,
        commit,
        fps: project.settings.defaultFramerate ?? DEFAULT_FRAMERATE,
        strings: project.strings.map((s) => ({
          key: s.key,
          connection: model.connections.get(s.key) ?? "connecting",
        })),
      }).catch((e) => logger.error(`Error sending heartbeat: ${e}`));
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [model, projectId, heartbeat]);
};

/**
 * When a sequence switches a plug, HWIR reports it to the switchState machine
 * (convex/switches.ts), so the editor and phone see the plug's state.
 */
export const useSwitchReporter = (model: HWIRAppModel) => {
  const switching = useHwirMutation(api.switches.switching);
  const turned = useHwirMutation(api.switches.turned);
  const failed = useHwirMutation(api.switches.failed);
  const project = model.project;
  const { projectId } = model.startupSettings;

  useEffect(() => {
    if (!project) return;
    const report = (p: Promise<unknown>) =>
      p.catch((e) => logger.error(`Error reporting a switch: ${e}`));
    project.setSwitchReporter({
      switching: (nodeKey, on) => report(switching({ projectId, nodeKey, on })),
      turned: (nodeKey, on) => report(turned({ projectId, nodeKey, on })),
      failed: (nodeKey, error) => report(failed({ projectId, nodeKey, error })),
    });
    return () => project.setSwitchReporter(null);
  }, [project, projectId, switching, turned, failed]);
};
