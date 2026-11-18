import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { ProjectModel } from "../shared/models/ProjectModel";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { logger } from "./utils/logger";
import { plugConfigured, readPlug, switchPlug } from "./homeAssistant";
import { isLive, runMode } from "./runMode";

// Home Assistant is the real plug, so only a live run touches it.
const plugEnabled = plugConfigured && isLive;

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

  useEffect(() => {
    if (!projectDoc?._id) return;
    model.setProject(new ProjectModel(projectDoc));
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
    model.setDataLoaded();
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
  const boot = useMutation(api.display.boot);
  const applied = useMutation(api.display.applied);

  // First run for this project: record what the startup flags play, so the
  // remote has something to change.
  useEffect(() => {
    if (control !== null || !playlistId) return;
    if (!isLive) return;
    boot({
      projectId,
      settings: {
        isOn: true,
        brightness: 1,
        mode: { kind: "playlist", id: playlistId },
      },
    }).catch((e) => logger.error(`Error creating display controls: ${e}`));
  }, [control === null]);

  useEffect(() => {
    if (control === undefined) return;
    model.setControl(control?.settings ?? null);
  }, [control]);

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
    if (!isLive) {
      logger.info(`${runMode}: not switching the plug or confirming`);
      return;
    }
    void (async () => {
      try {
        if (plugEnabled) {
          lastPlugSwitchAt.current = Date.now();
          await switchPlug(s.isOn);
        }
        await applied({ projectId, requestedAt });
      } catch (e) {
        logger.error(`Error applying display change: ${e}`);
      }
    })();
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
  const plugSwitched = useMutation(api.display.plugSwitched);
  const latest = useRef(control);
  useEffect(() => {
    latest.current = control;
  }, [control]);

  useEffect(() => {
    if (!plugEnabled || !model.startupSettings.playlistId) return;
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
  }, []);
};
