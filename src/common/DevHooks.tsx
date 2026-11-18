import { useEffect } from "react";
import { useApp } from "./AppContext";
import { useLedData } from "../data/LedDataStoreContext";

declare global {
  interface Window {
    /** The editor's models, for scripted checks in dev (headless browser runs). */
    __effectSim?: {
      app: ReturnType<typeof useApp>;
      ledData: ReturnType<typeof useLedData>;
    };
  }
}

/** In dev, puts the editor's models on window.__effectSim for scripted checks. */
export function DevHooks() {
  const app = useApp();
  const ledData = useLedData();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__effectSim = { app, ledData };
    return () => {
      delete window.__effectSim;
    };
  }, [app, ledData]);
  return null;
}
