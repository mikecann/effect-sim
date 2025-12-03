import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { ProjectModel } from "../shared/models/ProjectModel";
import { HWIRAppModel } from "./models/HWIRAppModel";

export const useProjectModel = (model: HWIRAppModel) => {
  const projectDoc = useQuery(api.model.getProject, {
    projectId: model.startupSettings.projectId,
  });

  const projectData = useQuery(
    api.model.getDataForProject,
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
    if (!projectData) return;
    model.project.updateFromServerData(projectData);
  }, [model.project, projectData]);
};
