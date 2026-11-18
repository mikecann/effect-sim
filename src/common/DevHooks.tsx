import { useEffect } from "react";
import { useApp } from "./AppContext";
import { useLedData } from "../data/LedDataStoreContext";
import { useThree, type RootState } from "@react-three/fiber";

declare global {
  interface Window {
    /** The editor's models, for scripted checks in dev (headless browser runs). */
    __effectSim?: {
      app: ReturnType<typeof useApp>;
      ledData: ReturnType<typeof useLedData>;
    };
    /** The simulator's three.js state (camera, scene, raycaster), in dev. */
    __effectSimCanvas?: () => RootState;
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

/** In dev, puts the simulator's three.js state on window.__effectSimCanvas. */
export function DevCanvasHooks() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__effectSimCanvas = get;
    return () => {
      delete window.__effectSimCanvas;
    };
  }, [get]);
  return null;
}
