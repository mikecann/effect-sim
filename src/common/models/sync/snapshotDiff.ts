import { omit } from "../../../../shared/misc";
import { Id, TableNames, Doc } from "../../../../convex/_generated/dataModel";
import { Operation } from "../../../../convex/model";

// Generic function to diff two arrays of documents for a single table
export const diffTable = <T extends TableNames>(
  prevModels: Array<Doc<T>>,
  currModels: Array<Doc<T>>,
): Operation[] => {
  const operations: Operation[] = [];

  // Create maps for O(1) lookup
  const prevModelsMap = new Map<string, Doc<T>>();
  for (const model of prevModels) prevModelsMap.set(model._id as string, model);

  const currModelsMap = new Map<string, Doc<T>>();
  for (const model of currModels) currModelsMap.set(model._id as string, model);

  // Removals
  for (const model of prevModels)
    if (!currModelsMap.has(model._id as string))
      operations.push({
        kind: "delete",
        id: model._id as Id<T>,
      });

  // Inserts and Changes
  for (const model of currModels) {
    const prevModel = prevModelsMap.get(model._id as string);

    if (prevModel) {
      // Change
      if (JSON.stringify(prevModel) !== JSON.stringify(model))
        operations.push({
          kind: "patch",
          id: model._id as Id<T>,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          values: omit(model as any, "_id", "_creationTime"),
        });
    } else
      // Insert
      operations.push({
        kind: "insert",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        values: omit(model as any, "_id", "_creationTime"),
        tempId: model._id as Id<T>,
      });
  }

  return operations;
};
