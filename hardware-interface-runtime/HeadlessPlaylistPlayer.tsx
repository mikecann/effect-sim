import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { PlaylistModel } from "../shared/models/PlaylistModel";
import { SequenceRuntime } from "../src/sequencer/runtime/SequenceRuntime";
import { useFrame } from "../src/common/utils/frames";
import { HeadlessPlayerModel } from "./models/HeadlessPlayerModel";
import type { HWIRAppModel } from "./models/HWIRAppModel";
import { RenderStamp } from "./RenderStamp";

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

    useFrame(() => {
      player.advanceFrame();
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
