import { useMemo } from "react";
import { NodesTreeUIModel } from "./models/NodesTreeUIModel";
import { useApp } from "../common/AppContext";
import NodesTreePanel from "./NodesTreePanel";
import { NodesTreeContext } from "./NodesTreeContext";
import { ModelPersister } from "../common/persistence/ModelPersister";

export function NodesTreeProvider() {
  const app = useApp();
  const nodesTreeUIModel = useMemo(() => new NodesTreeUIModel(app), [app]);

  return (
    <NodesTreeContext.Provider value={nodesTreeUIModel}>
      <NodesTreePanel />
      {/* <ModelPersister model={nodesTreeUIModel} /> */}
    </NodesTreeContext.Provider>
  );
}
