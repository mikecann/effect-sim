import { createContext, useContext } from "react";
import { SimulatorModel } from "./models/SimulatorModel";

export const SimulatorContext = createContext<SimulatorModel | null>(null);

export function useSimulator(): SimulatorModel {
  const ctx = useContext(SimulatorContext);
  if (!ctx)
    throw new Error("useSimulator must be used within SimulatorProvider");
  return ctx;
}
