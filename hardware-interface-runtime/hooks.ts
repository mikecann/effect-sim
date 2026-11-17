import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { ProjectModel } from "../shared/models/ProjectModel";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { logger } from "./utils/logger";

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
  // means the lights really are playing them.
  const requestedAt = control?.requestedAt ?? null;
  useEffect(() => {
    if (requestedAt === null) return;
    const s = control?.settings;
    logger.info(
      `Remote: ${s?.isOn ? "on" : "off"}, ${s?.mode.kind} ${s?.mode.id}, brightness ${s?.brightness}`,
    );
    applied({ projectId, requestedAt }).catch((e) =>
      logger.error(`Error confirming display change: ${e}`),
    );
  }, [requestedAt]);
};
