import { useQuery } from "convex/react";
import { get, set } from "idb-keyval";
import { useEffect, useState } from "react";
import {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
  getFunctionName,
} from "convex/server";

export function usePersistedQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgs<Query>
) {
  const convexData = useQuery(query, ...args);
  const [localData, setLocalData] = useState<
    FunctionReturnType<Query> | undefined
  >(undefined);

  // Create a stable key for the arguments
  const argsKey = JSON.stringify(args);
  const functionName = getFunctionName(query);
  const storageKey = `convex-cache:${functionName}:${argsKey}`;

  // We need to track the current key to reset local data when args change
  const [currentKey, setCurrentKey] = useState(storageKey);

  const isKeyChange = currentKey !== storageKey;
  if (isKeyChange) {
    // Reset local data immediately when key changes
    setLocalData(undefined);
    setCurrentKey(storageKey);
  }

  useEffect(() => {
    let isMounted = true;
    // Load local data
    get(storageKey).then((val) => {
      if (isMounted && val !== undefined) setLocalData(val);
    });
    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (convexData !== undefined) set(storageKey, convexData);
  }, [convexData, storageKey]);

  // If we have convex data, use it. Otherwise use local data.
  // Ensure we don't return stale local data during a key change.
  const effectiveLocalData = isKeyChange ? undefined : localData;
  const data = convexData === undefined ? effectiveLocalData : convexData;

  // We are stale if we don't have confirmed convex data yet.
  const isStale = convexData === undefined;

  return { data, isStale };
}
