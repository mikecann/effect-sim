import { createContext, useContext } from "react";
import { NodesTreeUIModel } from "./models/NodesTreeUIModel";

export const NodesTreeContext = createContext<NodesTreeUIModel | null>(null);

export function useNodesTree(): NodesTreeUIModel {
  const ctx = useContext(NodesTreeContext);
  if (!ctx)
    throw new Error("useNodesTree must be used within NodesTreeProvider");
  return ctx;
}
