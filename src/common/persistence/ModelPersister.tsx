import { useEffect } from "react";
import { get, set, del } from "idb-keyval";
import { reaction } from "mobx";
import { ZodType } from "zod";

export interface PersistableModel<T> {
  persistableData: T;
  restoreFromPersistableData(data: T): void;
  get persistenceKey(): string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  persistenceSchema: ZodType<T, any, any>;
}

interface ModelPersisterProps<T> {
  model: PersistableModel<T>;
}

export const ModelPersister = <T,>({ model }: ModelPersisterProps<T>) => {
  useEffect(() => {
    const { persistenceKey, persistenceSchema } = model;
    // Load persisted data on mount
    let isMounted = true;
    const loadData = async () => {
      try {
        const rawData = await get(persistenceKey);
        if (isMounted && rawData) {
          const data = persistenceSchema.parse(rawData);
          model.restoreFromPersistableData(data);
        }
      } catch (e) {
        console.warn(
          `Failed to restore state for ${persistenceKey}, clearing persistence`,
          e,
        );
        await del(persistenceKey);
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [model]);

  useEffect(() => {
    const { persistenceKey } = model;
    // Persist data on change
    const dispose = reaction(
      () => JSON.stringify(model.persistableData),
      (json) => {
        const data = JSON.parse(json);
        set(persistenceKey, data).catch((e) => {
          console.error(`Failed to persist state for ${persistenceKey}`, e);
        });
      },
      { delay: 500 }, // Debounce persistence
    );
    return dispose;
  }, [model]);

  return null;
};
