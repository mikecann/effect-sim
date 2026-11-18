import { observer } from "mobx-react-lite";
import { HeadlessPlaylistPlayer } from "./HeadlessPlaylistPlayer";
import { HeadlessLedDataDispatcher } from "./HeadlessLedDataDispatcher";
import type { HWIRAppModel } from "./models/HWIRAppModel";

/** Plays the display's mode and sends it to the strings (playlist mode, not mapping). */
export const Playback = observer(({ app }: { app: HWIRAppModel }) => (
  <>
    {/* Off: nothing plays, and the dispatcher sends black. The key starts
        the player over when the remote changes mode. */}
    {app.isOn && app.playlist ? (
      <HeadlessPlaylistPlayer
        key={app.modeKey}
        app={app}
        playlist={app.playlist}
        version={app.controlVersion}
      />
    ) : null}
    <HeadlessLedDataDispatcher app={app} />
  </>
));
