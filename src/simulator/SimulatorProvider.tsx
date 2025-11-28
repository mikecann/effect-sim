import { useEffect, useMemo } from "react";
import { SimulatorModel } from "./models/SimulatorModel";
import { useApp } from "../common/AppContext";
import SimulatorPanel from "./SimulatorPanel";
import { SimulatorContext } from "./SimulatorContext";

export function SimulatorProvider() {
  const app = useApp();
  const simulator = useMemo(() => new SimulatorModel(app), [app]);

  useEffect(() => {
    app.addSimulator(simulator);
    return () => {
      app.removeSimulator(simulator);
    };
  }, [app, simulator]);

  return (
    <SimulatorContext.Provider value={simulator}>
      <SimulatorPanel />
    </SimulatorContext.Provider>
  );
}
