import { createContext, useContext } from "react";
import { LedDataStoreModel } from "./LedDataStoreModel";

export const LedDataStoreContext = createContext<LedDataStoreModel | null>(
  null,
);

export function useLedData(): LedDataStoreModel {
  const context = useContext(LedDataStoreContext);
  if (!context)
    throw new Error("useLedData must be used within an LedDataStoreProvider");
  return context;
}

