import type { ReactNode } from "react";
import { useState } from "react";
import { useApp } from "../common/AppContext";
import { LedDataStoreModel } from "./LedDataStoreModel";
import { LedDataStoreContext } from "./LedDataStoreContext";

export function LedDataStoreProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const project = app.getProject();

  const [model] = useState(() => new LedDataStoreModel(project));

  return (
    <LedDataStoreContext.Provider value={model}>
      {children}
    </LedDataStoreContext.Provider>
  );
}
