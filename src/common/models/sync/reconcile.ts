import { runInAction } from "mobx";

export function reconcileArray<
  M extends { _id: string; doc: unknown },
  D extends { _id: string },
>(
  currentModels: M[],
  newDocs: D[],
  createModel: (doc: D) => M,
  canReuseModel: (model: M, doc: D) => boolean = () => true,
) {
  runInAction(() => {
    const newIds = new Set(newDocs.map((d) => d._id));

    // 1. Update existing and Add new
    // We iterate newDocs to preserve server order if we were rebuilding,
    // but for in-place mutation, we might just append new ones and update existing ones.
    // If order matters (and newDocs dictates order), we might need to sort currentModels.
    // For now, let's just handle Add/Update/Remove.

    // Remove deleted
    for (let i = currentModels.length - 1; i >= 0; i--)
      if (!newIds.has(currentModels[i]._id)) currentModels.splice(i, 1);

    // Update or Add
    // We can't easily "insert at index" without more complex diffing if we want to preserve local state order vs server order.
    // But for "nodes", order is determined by "order" field, not array index.
    // So appending new items is fine.

    for (const doc of newDocs) {
      const existingModel = currentModels.find((m) => m._id === doc._id);

      if (existingModel)
        if (canReuseModel(existingModel, doc))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (existingModel as any).doc = doc;
        else {
          // Replace model if cannot reuse (e.g. type changed)
          const index = currentModels.indexOf(existingModel);
          currentModels[index] = createModel(doc);
        }
      else
        // New item
        currentModels.push(createModel(doc));
    }
  });
}
