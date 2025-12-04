import { useEffect } from "react";
import { get, set, del } from "idb-keyval";
import { autorun, reaction, toJS } from "mobx";
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
  // Load persisted data on mount
  // useEffect(() => {
  //   const { persistenceKey, persistenceSchema } = model;
  //   let isMounted = true;
  //   const loadData = async () => {
  //     try {
  //       const rawData = await get(persistenceKey);
  //       if (isMounted && rawData) {
  //         const data = persistenceSchema.parse(rawData);
  //         model.restoreFromPersistableData(data);
  //       }
  //     } catch (e) {
  //       console.warn(
  //         `Failed to restore state for ${persistenceKey}, clearing persistence`,
  //         e,
  //       );
  //       await del(persistenceKey);
  //     }
  //   };
  //   loadData();
  //   return () => {
  //     isMounted = false;
  //   };
  // }, [model]);

  // useEffect(() =>
  //   autorun(
  //     () => {
  //       const persistableData = JSON.parse(
  //         JSON.stringify(model.persistableData),
  //       );
  //       const key = model.persistenceKey;
  //       set(key, persistableData).catch((e) => {
  //         console.error(`Failed to persist state for ${key}`, e);
  //       });
  //     },
  //     { delay: 500 },
  //   ),
  // );

  return null;
};
