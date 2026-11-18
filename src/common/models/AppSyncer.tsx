import { useApp } from "../AppContext";
import { useEffect, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { Loader, Box } from "@mantine/core";
import { observer } from "mobx-react-lite";
import { ProjectSyncer } from "./sync/ProjectSyncer";
import { usePersistedQuery } from "../hooks/usePersistedQuery";
import { EditorTokenModal } from "../auth/EditorTokenModal";

/** Loads the projects, and keeps the open one saved. */
export const AppSyncer = observer(({ children }: { children: ReactNode }) => {
  const app = useApp();
  const { data: projects } = usePersistedQuery(api.functions.listProjects);

  useEffect(() => {
    if (projects) app.setProjectsFromServer(projects);
  }, [app, projects]);

  if (!projects)
    return (
      <Box
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader size="lg" />
      </Box>
    );

  return (
    <>
      {app.project ? (
        <ProjectSyncer
          key={app.project._id}
          project={app.project}
          serverDoc={projects.find((p) => p._id === app.project?._id) ?? null}
        />
      ) : null}
      <EditorTokenModal />
      {children}
    </>
  );
});
