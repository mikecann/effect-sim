import { StringNodeModel } from "./StringNodeModel";
import { SwitchNodeModel } from "./SwitchNodeModel";
import { VirtualStringNodeModel } from "./VirtualStringNodeModel";
import { FolderNodeModel } from "./FolderNodeModel";
import { Id, TableNames } from "../../convex/_generated/dataModel";

export type AllNodeModels =
  | StringNodeModel
  | FolderNodeModel
  | SwitchNodeModel
  | VirtualStringNodeModel;

export const createTempId = <T extends TableNames>(tableName: T): Id<T> => {
  return `temp_${tableName}_${Date.now()}` as Id<T>;
};

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
  nodeId: Id<"nodes">;
  fromIndex: number;
  toIndex: number;
};
