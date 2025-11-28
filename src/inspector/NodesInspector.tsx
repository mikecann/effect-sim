import { StringsInspector } from "./string/StringsInspector";
import type { StringNodeModel } from "../../shared/models/StringNodeModel";
import type { AllNodeModels } from "../../shared/models/types";

export function NodesInspector({ nodes }: { nodes: Array<AllNodeModels> }) {
  const stringNodes = nodes.filter(
    (node): node is StringNodeModel => node.kind === "string",
  );

  if (stringNodes.length !== nodes.length) return null;

  return <StringsInspector nodes={stringNodes} />;
}
