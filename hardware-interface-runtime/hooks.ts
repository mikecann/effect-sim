import { RENDERED_PATTERN_KINDS } from "../shared/mapping/ledCodes";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { followPlug, PlugSwitcher, type PlugStatus } from "./display/plug";

type TokenMutation = FunctionReference<
  "mutation",
  "public",
  { token?: string }
>;

/** useMutation for HWIR's mutations: adds HWIR_TOKEN to every call. */
export const useHwirMutation = <M extends TokenMutation>(mutation: M) => {
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
  }, [model, model.project, projectDoc]);

  useEffect(() => {
    if (!model.project) return;
    if (!projectData) return;
    model.project.updateFromServerData(projectData);
    model.setDataLoaded();
  }, [model, model.project, projectData]);
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
  const plug = usePlugSwitcher(model);

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

  // Confirms once a frame with the new settings has gone out to the strings
  // (black when off), so the confirmation means the LEDs really show them.
  // The plug gets one try first; if that fails the LED side is confirmed
  // anyway and the plug keeps retrying in the background (display/plug.ts,
  // reported in the heartbeat), so the phone doesn't say the lights are
  // offline because of the plug.
  const requestedAt = control?.requestedAt ?? null;
  const appliedRequestedAt = useRef<number | null>(null);
  useEffect(() => {
    if (requestedAt === null) return;
    const s = control?.settings;
    if (!s) return;
    logger.info(
      `Remote: ${s.isOn ? "on" : "off"}, ${s.mode.kind} ${s.mode.id}, brightness ${s.brightness}`,
    );
    const version = model.controlVersion;
    void (async () => {
      if (plug.switcher) await plug.switchTo(s.isOn);
      await model.whenShown(version);
      try {
        await applied({ projectId, requestedAt });
      } catch (e) {
        logger.error(`Error confirming display change: ${e}`);
      } finally {
        appliedRequestedAt.current = requestedAt;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per request: control changes on every status update, and confirming it twice would be wrong.
  }, [requestedAt]);

  // On/off moved somewhere other than what the plug is being retried to (the
  // phone again, or following Home Assistant): stop retrying the old one.
  const isOn = control?.settings.isOn;
  useEffect(() => {
    const pending = plug.switcher?.pendingTarget ?? null;
    if (isOn === undefined || pending === null || pending === isOn) return;
    plug.switcher?.cancel();
  }, [isOn, plug]);

  usePlugFollower(model, control, plug, appliedRequestedAt);
};

/** After HWIR switches the plug, Home Assistant may lag this long. */
const PLUG_SETTLE_MS = 30_000;

type PlugHandle = ReturnType<typeof usePlugSwitcher>;

/**
 * The plug switcher (null without Home Assistant), and when HWIR last
 * switched it. If Home Assistant switches the plug while HWIR is retrying,
 * the display follows the plug (display.plugSwitched) instead of fighting it.
 */
const usePlugSwitcher = (model: HWIRAppModel) => {
  const { projectId } = model.startupSettings;
  const plugSwitched = useHwirMutation(api.display.plugSwitched);
  const [handle] = useState(() => {
    const switcher = plugConfigured
      ? new PlugSwitcher({
          switchPlug,
          readPlug,
          onChange: (status) => {
            if (status.kind === "ok")
              logger.info(`The lights' plug is ${status.on ? "on" : "off"}`);
            else
              logger.error(
                `Couldn't switch the lights' plug ${status.on ? "on" : "off"} (try ${status.tries}): ${status.error}${status.on ? "; not retrying ON, on/off will follow the plug" : "; retrying"}`,
              );
          },
          onExternal: (on) => {
            logger.info(
              `Home Assistant switched the lights' plug ${on ? "on" : "off"} while HWIR was retrying; following it`,
            );
            plugSwitched({ projectId, isOn: on }).catch((e) =>
              logger.error(`Error reporting the plug switch: ${e}`),
            );
          },
        })
      : null;
    const h = {
      switcher,
      lastSwitchAt: 0,
      switchTo: async (on: boolean) => {
        h.lastSwitchAt = Date.now();
        await switcher?.switchTo(on);
      },
      get busy() {
        return (
          Boolean(switcher?.busy) ||
          Date.now() - h.lastSwitchAt < PLUG_SETTLE_MS
        );
      },
    };
    return h;
  });
  useEffect(() => {
    model.setPlugStatus(() => handle.switcher?.status ?? null);
  }, [model, handle]);
  return handle;
};

/**
 * Every 10 s, in every display state (plug/followPlug): re-sends a
 * confirmation that was lost, and when the display is live and Home
 * Assistant switched the plug (sunset on, 10pm off), moves on/off to match.
 */
const usePlugFollower = (
  model: HWIRAppModel,
  control: FunctionReturnType<typeof api.display.get> | undefined,
  plug: PlugHandle,
  appliedRequestedAt: { current: number | null },
) => {
  const { projectId } = model.startupSettings;
  const plugSwitched = useHwirMutation(api.display.plugSwitched);
  const applied = useHwirMutation(api.display.applied);
  const latest = useRef(control);
  useEffect(() => {
    latest.current = control;
  }, [control]);

  useEffect(() => {
    if (!model.startupSettings.playlistId) return;
    const check = async () => {
      const c = latest.current;
      if (!c) return;
      const plugOn =
        plug.switcher && c.status === "live" && !plug.busy
          ? (await readPlug()).on
          : null;
      const action = followPlug({
        status: c.status,
        isOn: c.settings.isOn,
        requestedAt: c.requestedAt,
        plugOn,
        plugBusy: plug.busy,
        appliedRequestedAt: appliedRequestedAt.current,
      });
      if (action.kind === "confirm") {
        logger.info(`Confirming the display change again (it's ${c.status})`);
        await applied({ projectId, requestedAt: action.requestedAt });
      }
      if (action.kind === "report") {
        logger.info(
          `The lights' plug was switched ${action.isOn ? "on" : "off"} outside the app`,
        );
        await plugSwitched({ projectId, isOn: action.isOn });
      }
    };
    const timer = setInterval(() => {
      check().catch((e) =>
        logger.error(`Error checking the lights' plug: ${e}`),
      );
    }, 10_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one 10 s check for HWIR's life; it reads the latest control through a ref.
  }, []);
};

/**
 * Tells Convex HWIR is running, every 10 s (convex/hwirPresence.ts): the
 * commit it runs, the frame rate it really manages, each string's connection
 * and when it last answered, and the plug if it's set up.
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
        fps: Math.round((model.fpsMeter.fps(performance.now()) ?? 0) * 10) / 10,
        strings: project.strings.map((s) => {
          const state = model.links.get(s.key)?.state;
          const connection = state?.kind ?? "connecting";
          const lastSeenAt = state?.lastSeenAt ?? null;
          return lastSeenAt === null
            ? { key: s.key, connection }
            : { key: s.key, connection, lastSeenAt };
        }),
        plug: plugReport(model.plugStatus()),
        patterns: [...RENDERED_PATTERN_KINDS],
      }).catch((e) => logger.error(`Error sending heartbeat: ${e}`));
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [model, projectId, heartbeat]);
};

const plugReport = (status: PlugStatus | null) => {
  if (!status) return undefined;
  if (status.kind === "ok")
    return { ok: true, on: status.on, since: status.at };
  return {
    ok: false,
    on: status.on,
    since: status.since,
    error: status.error,
  };
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
