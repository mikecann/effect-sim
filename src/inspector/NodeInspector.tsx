import { StringInspector } from "./string/StringInspector";
import { VirtualStringInspector } from "./virtualString/VirtualStringInspector";
import { FolderInspector } from "./folder/FolderInspector";
import { SwitchInspector } from "./switch/SwitchInspector";
import { exhaustiveCheck } from "../../shared/misc";
import type { AllNodeModels } from "../../shared/models/types";
import type { StringNodeModel } from "../../shared/models/StringNodeModel";
import type { VirtualStringNodeModel } from "../../shared/models/VirtualStringNodeModel";
import type { FolderNodeModel } from "../../shared/models/FolderNodeModel";
import type { SwitchNodeModel } from "../../shared/models/SwitchNodeModel";

export function NodeInspector({ node }: { node: AllNodeModels }) {
  if (node.kind === "string")
    return <StringInspector node={node as StringNodeModel} />;

  if (node.kind === "virtual_string")
    return <VirtualStringInspector node={node as VirtualStringNodeModel} />;

  if (node.kind === "folder")
    return <FolderInspector node={node as FolderNodeModel} />;

  if (node.kind === "switch")
    return <SwitchInspector node={node as SwitchNodeModel} />;

  exhaustiveCheck(node);
  return null;
}
