import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { reaction } from "mobx";
import { api } from "../../../../convex/_generated/api";
import type { ProjectModel } from "../../../../shared/models/ProjectModel";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { useApp } from "../../AppContext";
import { usePersistedQuery } from "../../hooks/usePersistedQuery";
import { useEditorMutation } from "../../auth/useEditorMutation";
import { ProjectSyncModel } from "./ProjectSyncModel";
import { useSwitchReporter } from "./useSwitchReporter";

/**
 * Keeps the open project saved (ProjectSyncModel): feeds it the server's rows,
 * sends its batches with the editor token, says what the server refused, and
 * sends the last edits when the page closes.
 */
export const ProjectSyncer = ({
  project,
  serverDoc,
}: {
  project: ProjectModel;
  /** The project's own row, as the server has it. */
  serverDoc: Doc<"projects"> | null;
}) => {
  const app = useApp();
  const sync = useEditorMutation(api.editor.sync);
  const [model] = useState(
    () =>
      new ProjectSyncModel(project, (changes) =>
        sync({ projectId: project._id, changes }),
      ),
  );
  useSwitchReporter(project);

  const { data, isStale } = usePersistedQuery(
    api.functions.getDataForProject,
    { projectId: project._id },
  );

  useEffect(() => {
    model.start();
    app.setSync(model);
    return () => {
      model.flush();
      model.dispose();
      app.setSync(null);
    };
  }, [app, model]);

  useEffect(() => {
    if (data && serverDoc) model.applyServerData(data, serverDoc, !isStale);
  }, [model, data, isStale, serverDoc]);

  // What the server refused, once per batch.
  useEffect(
    () =>
      reaction(
        () => model.lastProblems,
        (problems) => {
          for (const problem of problems)
            notifications.show({
              color: "orange",
              title: "A change wasn't saved",
              message: problem.reason,
            });
        },
      ),
    [model],
  );

  // Closing or hiding the page sends what's left straight away, and a close
  // with edits still unsaved asks first.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") model.flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!model.hasUnsavedChanges()) return;
      model.flush();
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [model]);

  return null;
};
