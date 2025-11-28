/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { AppModel, type SelectedEntity } from "./models/AppModel";
import { useConvex } from "convex/react";

const AppContext = createContext<AppModel | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Initialize AppModel from localStorage
  const appModel = useMemo(() => {
    const stored = localStorage.getItem("effect-sim:current-project-id");
    const currentProjectId = stored ? (stored as Id<"projects">) : null;
    const model = new AppModel();
    if (currentProjectId) model.setCurrentProjectId(currentProjectId);
    return model;
  }, []);

  return <AppContext.Provider value={appModel}>{children}</AppContext.Provider>;
}

export function useApp(): AppModel {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
