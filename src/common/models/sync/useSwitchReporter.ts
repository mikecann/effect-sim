import { useEffect } from "react";
import { api } from "../../../../convex/_generated/api";
import type { ProjectModel } from "../../../../shared/models/ProjectModel";
import { useEditorMutation } from "../../auth/useEditorMutation";

/**
 * When the editor switches a plug (the switch inspector, or a sequence
 * playing in the editor), it tells the switchState machine, so every client
 * sees the plug's state (convex/switches.ts).
 */
export const useSwitchReporter = (project: ProjectModel) => {
  const switching = useEditorMutation(api.switches.switching);
  const turned = useEditorMutation(api.switches.turned);
  const failed = useEditorMutation(api.switches.failed);

  useEffect(() => {
    const projectId = project._id;
    const report = (p: Promise<unknown>) =>
      p.catch((e) => console.error("Couldn't report a switch:", e));
    project.setSwitchReporter({
      switching: (nodeKey, on) => report(switching({ projectId, nodeKey, on })),
      turned: (nodeKey, on) => report(turned({ projectId, nodeKey, on })),
      failed: (nodeKey, error) => report(failed({ projectId, nodeKey, error })),
    });
    return () => project.setSwitchReporter(null);
  }, [project, switching, turned, failed]);
};
