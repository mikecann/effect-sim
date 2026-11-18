import { observer } from "mobx-react-lite";
import { ClientDataSocket } from "./ClientDataSocket";
import { String } from "./String";
import { LedDataStoreContext } from "../src/data/LedDataStoreContext";
import { HeadlessPlaylistPlayer } from "./HeadlessPlaylistPlayer";
import { HeadlessLedDataDispatcher } from "./HeadlessLedDataDispatcher";
import { FrameProvider } from "../src/common/FixedFrameProvider";
import { useDisplayControl, useProjectModel } from "./hooks";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { DEFAULT_FRAMERATE } from "../src/common/projects/projectConstants";
import { runMode } from "./runMode";
import { SmokeCheck } from "./SmokeCheck";

export const App = observer(({ app }: { app: HWIRAppModel }) => {
  useProjectModel(app);
  useDisplayControl(app);

  if (!app.dataStore) return null;
  if (!app.project) return null;

  const project = app.project;

  const fps = project?.settings.defaultFramerate ?? DEFAULT_FRAMERATE;

  return (
    <LedDataStoreContext.Provider value={app.dataStore}>
      <FrameProvider fps={fps}>
        {runMode === "smoke" ? <SmokeCheck app={app} /> : null}
        {app.strings.map((string) => (
          <String key={string.string._id} model={string} />
        ))}

        {app.isPlaylistMode ? (
          <>
            {/* Off: nothing plays, and the dispatcher sends black. The key
                starts the player over when the remote changes mode. */}
            {app.isOn && app.playlist ? (
              <HeadlessPlaylistPlayer
                key={app.modeKey}
                playlist={app.playlist}
              />
            ) : null}
            <HeadlessLedDataDispatcher app={app} />
          </>
        ) : runMode === "smoke" ? null : (
          <ClientDataSocket app={app} />
        )}
      </FrameProvider>
    </LedDataStoreContext.Provider>
  );
});
