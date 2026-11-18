import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useApp } from "../common/AppContext";

/** The open project's newest mapping session, live; undefined while loading. */
export const useLatestSession = () => {
  const projectId = useApp().currentProjectId;
  return useQuery(api.mapping.latest, projectId ? { projectId } : "skip");
};

/** A session's camera views (photos and 2D points), live. */
export const useViews = (sessionId: Id<"mappingSessions"> | null) =>
  useQuery(api.mapping.views, sessionId ? { sessionId } : "skip");

export type CameraView = NonNullable<ReturnType<typeof useViews>>[number];

/** One view of a session, by name; undefined while loading or if it's gone. */
export const useView = (
  sessionId: Id<"mappingSessions"> | null,
  name: string | null,
) => useViews(sessionId)?.find((view) => view.name === name);
