import { useLedData } from "../src/data/LedDataStoreContext";
import { useFrame } from "../src/common/utils/frames";
import { HWIRAppModel } from "./models/HWIRAppModel";

export const HeadlessLedDataDispatcher = ({ app }: { app: HWIRAppModel }) => {
  const ledDataStore = useLedData();

  useFrame(() => {
    for (const [targetId, stringData] of ledDataStore.stringsMap) {
      const string = app.stringsMap.get(targetId);
      if (!string) continue;
      string.onData.dispatch(stringData.data);
    }
  });

  return null;
};
