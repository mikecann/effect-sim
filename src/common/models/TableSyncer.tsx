import { useMutation } from "convex/react";
import { TableNames, Id, Doc } from "../../../convex/_generated/dataModel";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useApiErrorHandler } from "../errors";
import { reaction, runInAction, toJS } from "mobx";
import { diffTable } from "./sync/snapshotDiff";
import { reconcileArray } from "./sync/reconcile";
import { equals } from "ramda";

interface SyncableModel<TTableName extends TableNames> {
  _id: Id<TTableName>;
  doc: Doc<TTableName>;
}

const syncDebounceMs = 500;

export const TableSyncer = <TTableName extends TableNames>({
  table,
  models,
  serverValues,
  createModel,
  isStale = false,
}: {
  table: TTableName;
  models: SyncableModel<TTableName>[];
  serverValues?: Doc<TTableName>[];
  createModel?: (doc: Doc<TTableName>) => SyncableModel<TTableName>;
  isStale?: boolean;
}) => {
  const applyOperations = useMutation(api.model.applyOperations);
  const onApiError = useApiErrorHandler();

  const lastServerSnapshotRef = useRef<Array<Doc<TTableName>>>([]);

  const [lastLocalSnapshot, setLastLocalSnapshot] = useState<Array<
    Doc<TTableName>
  > | null>(null);

  const lastLocalSnapshotRef = useRef(lastLocalSnapshot);
  useEffect(() => {
    lastLocalSnapshotRef.current = lastLocalSnapshot;
  });

  // Reconcile with server values if provided
  useEffect(() => {
    if (!serverValues || !createModel) return;

    // If server values are same as last known snapshot, ignore
    // (Use deep comparison or just check if we already processed this update)
    if (equals(serverValues, lastServerSnapshotRef.current)) return;

    // Reconcile
    console.log(`reconciling table ${table} from server`);
    reconcileArray(models, serverValues, createModel);

    // Update our tracking refs to avoid echoing back changes
    // We set lastServerSnapshot to the new server values
    lastServerSnapshotRef.current = serverValues;

    // Note: The MobX reaction will fire because we updated models.
    // That reaction sets lastLocalSnapshot.
    // The debounce effect sees diff(lastServer, lastLocal).
    // If models == serverValues, diff is 0.
    // So no echo.
  }, [serverValues, models, createModel, table]);

  const sync = async (localSnapshot: Doc<TTableName>[]) => {
    if (isStale) return;

    const diff = diffTable(lastServerSnapshotRef.current, localSnapshot);
    console.log(`table ${table} diff`, diff);
    if (diff.length === 0) return;

    // Capture what we're about to sync - this is our new "server state" once it succeeds
    const snapshotBeingSynced = toJS(localSnapshot);

    try {
      const response = await applyOperations({
        operations: diff,
        table,
      });

      console.log(`table ${table} result`, response);

      // Update model IDs from temp to real IDs inside an action
      runInAction(() => {
        for (const insert of response.inserts) {
          const model = models.find((m) => m._id === insert.tempId);
          if (!model) continue;
          console.log(
            `table ${table} model ${model._id} updated to ${insert._id}`,
          );
          model.doc._id = insert._id as Id<TTableName>;
        }
      });

      // Update server snapshot to what we actually synced (with real IDs substituted)
      lastServerSnapshotRef.current = snapshotBeingSynced.map((doc) => {
        const insert = response.inserts.find((i) => i.tempId === doc._id);
        if (insert) return { ...doc, _id: insert._id } as Doc<TTableName>;
        return doc;
      });
    } catch (error) {
      onApiError(error);
    }
  };

  useEffect(() => {
    // Initialize lastServerSnapshotRef with current server values on mount/change
    // This ensures we start with the correct "clean" state
    if (serverValues) lastServerSnapshotRef.current = serverValues;
    else lastServerSnapshotRef.current = models.map((m) => toJS(m.doc));

    const dispose = reaction(
      () => JSON.stringify(models.map((m) => m.doc)),
      (snapshotJson) => {
        const snapshot = JSON.parse(snapshotJson) as Doc<TTableName>[];
        console.log(`new table '${table}' snapshot`, snapshot);
        setLastLocalSnapshot(snapshot);
      },
    );
    return () => {
      dispose();
      if (lastLocalSnapshotRef.current) sync(lastLocalSnapshotRef.current);
    };
  }, [table, models]); // We don't depend on serverValues here to avoid re-running reaction logic inappropriately

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!lastLocalSnapshotRef.current) return;

      const diff = diffTable(
        lastServerSnapshotRef.current,
        lastLocalSnapshotRef.current,
      );

      if (diff.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!lastLocalSnapshot) return;

    const id = setTimeout(() => {
      sync(lastLocalSnapshot);
    }, syncDebounceMs);

    return () => clearTimeout(id);
  }, [lastLocalSnapshot, applyOperations, models, onApiError, table, isStale]);

  return null;
};
