import { observer } from "mobx-react-lite";
import { ClientDataSocket } from "./ClientDataSocket";
import { String } from "./String";
import { LedDataStoreContext } from "../src/data/LedDataStoreContext";
import { HeadlessPlaylistPlayer } from "./HeadlessPlaylistPlayer";
import { HeadlessLedDataDispatcher } from "./HeadlessLedDataDispatcher";
import { FixedFrameProvider } from "../src/common/FixedFrameProvider";
import { useProjectModel } from "./hooks";
import { HWIRAppModel } from "./models/HWIRAppModel";

export const App = observer(({ app }: { app: HWIRAppModel }) => {
  useProjectModel(app);

  if (!app.dataStore) return null;
  if (!app.project) return null;

  return (
    <LedDataStoreContext.Provider value={app.dataStore}>
      <FixedFrameProvider>
        {app.strings.map((string) => (
          <String key={string.string._id} model={string} />
        ))}

        {app.playlist ? (
          <>
            <HeadlessPlaylistPlayer playlist={app.playlist} />
            <HeadlessLedDataDispatcher app={app} />
          </>
        ) : (
          <ClientDataSocket app={app} />
        )}
      </FixedFrameProvider>
    </LedDataStoreContext.Provider>
  );
});
