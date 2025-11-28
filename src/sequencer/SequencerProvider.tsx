import { useEffect, useMemo } from "react";
import { SequencerPanelUIModel } from "./models/SequencerPanelUIModel";
import { useApp } from "../common/AppContext";
import SequencerPanel from "./SequencerPanel";
import { SequencerContext } from "./SequencerContext";
import { ModelPersister } from "../common/persistence/ModelPersister";

export function SequencerProvider() {
  const app = useApp();
  const sequencer = useMemo(() => new SequencerPanelUIModel(app), [app]);

  useEffect(() => {
    app.addSequencer(sequencer);
    return () => {
      app.removeSequencer(sequencer);
    };
  }, [app, sequencer]);

  return (
    <SequencerContext.Provider value={sequencer}>
      <SequencerPanel />
      <ModelPersister model={sequencer} />
    </SequencerContext.Provider>
  );
}
