import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { PlaylistModel } from "../shared/models/PlaylistModel";
import { SequenceRuntime } from "../src/sequencer/runtime/SequenceRuntime";
import { useFrame } from "../src/common/utils/frames";
import { HeadlessPlayerModel } from "./models/HeadlessPlayerModel";
import type { HWIRAppModel } from "./models/HWIRAppModel";
import { RenderStamp } from "./RenderStamp";
import { useLedData } from "../src/data/LedDataStoreContext";
import { DEFAULT_FRAMERATE } from "../src/common/projects/projectConstants";

/** How long one sequence fades into the next, so a change isn't a hard cut. */
const CROSSFADE_SECONDS = 1;

/**
 * Plays the display's playlist (or single sequence). Edits to the playlist
 * and its sequences are picked up as it plays (HeadlessPlayerModel); a new
 * mode from the remote remounts it (App's key) to start from the top.
 */
export const HeadlessPlaylistPlayer = observer(
  ({
    app,
    playlist,
    version,
  }: {
    app: HWIRAppModel;
    playlist: PlaylistModel;
    /** The display control version this player plays (HWIRAppModel.controlVersion). */
    version: number;
  }) => {
    // Started at once, so the first render already has the runtime and its
    // effects: an unstarted player must never stamp an empty frame.
    const [player] = useState(() => {
      const p = new HeadlessPlayerModel(playlist);
      p.advanceFrame();
      return p;
    });

    useEffect(() => {
      player.setPlaylist(playlist);
    }, [player, playlist]);

    const ledData = useLedData();
    useFrame(() => {
      const before = player.runtime;
      player.advanceFrame();
      // Moved on to another sequence: the LEDs still hold the old one's last
      // frame (the new one's effects haven't drawn yet), so fade from that.
      if (before && player.runtime && player.runtime !== before) {
        const fps =
          app.project?.settings.defaultFramerate ?? DEFAULT_FRAMERATE;
        app.crossfade.begin(ledData.strings, CROSSFADE_SECONDS * fps);
      }
    });

    // An empty playlist: nothing to draw, so there's nothing to wait for.
    if (!player.runtime) return <RenderStamp app={app} version={version} />;
    return (
      <>
        <SequenceRuntime model={player.runtime} />
        {/* After the runtime, so its effects (mounted with it) have drawn. */}
        <RenderStamp app={app} version={version} />
      </>
    );
  },
);
