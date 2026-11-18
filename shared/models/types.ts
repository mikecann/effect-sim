import { StringNodeModel } from "./StringNodeModel";
import { SwitchNodeModel } from "./SwitchNodeModel";
import { VirtualStringNodeModel } from "./VirtualStringNodeModel";
import { FolderNodeModel } from "./FolderNodeModel";
import type { NodeKey } from "./docs";

export type AllNodeModels =
  | StringNodeModel
  | FolderNodeModel
  | SwitchNodeModel
  | VirtualStringNodeModel;

export const createId = () =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

export type Icon = {
  kind: "emoji";
  emoji: string;
};
export type PathPoint = {
  position: {
    x: number;
    y: number;
    z: number;
  };
};
export type Segment = {
  nodeId: NodeKey;
  fromIndex: number;
  toIndex: number;
  isReversed?: boolean;
};
