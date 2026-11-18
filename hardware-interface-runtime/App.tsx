import { observer } from "mobx-react-lite";
import { ClientDataSocket } from "./ClientDataSocket";
import { String } from "./String";
import { LedDataStoreContext } from "../src/data/LedDataStoreContext";
import { Playback } from "./Playback";
import { HwirFrameProvider } from "./frames/HwirFrameProvider";
import {
  useDisplayControl,
  useHeartbeat,
  useProjectModel,
  useSwitchReporter,
} from "./hooks";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { DEFAULT_FRAMERATE } from "../src/common/projects/projectConstants";
import { runMode } from "./runMode";
import { SmokeCheck } from "./SmokeCheck";
import { MappingDisplay } from "./mapping/MappingDisplay";

export const App = observer(({ app }: { app: HWIRAppModel }) => {
  useProjectModel(app);
  useDisplayControl(app);
  useHeartbeat(app);
  useSwitchReporter(app);

  if (!app.dataStore) return null;
  if (!app.project) return null;

  const fps = app.project.settings.defaultFramerate ?? DEFAULT_FRAMERATE;
  const mappingSessionId = app.mappingSessionId;

  return (
    <LedDataStoreContext.Provider value={app.dataStore}>
      <HwirFrameProvider fps={fps} meter={app.fpsMeter}>
        {runMode === "smoke" ? <SmokeCheck app={app} /> : null}
        {app.strings.map((string) => (
          <String key={string.key} app={app} string={string} />
        ))}

        {app.isPlaylistMode ? (
          mappingSessionId ? (
            // Camera mapping: the session's patterns instead of the playlist.
            <MappingDisplay
              key={mappingSessionId}
              app={app}
              sessionId={mappingSessionId}
            />
          ) : (
            <Playback app={app} />
          )
        ) : runMode === "smoke" ? null : (
          <ClientDataSocket app={app} />
        )}
      </HwirFrameProvider>
    </LedDataStoreContext.Provider>
  );
});
