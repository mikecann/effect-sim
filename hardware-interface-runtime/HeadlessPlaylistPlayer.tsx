import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { PlaylistModel } from "../shared/models/PlaylistModel";
import { SequenceRuntime } from "../src/sequencer/runtime/SequenceRuntime";
import { useFrame } from "../src/common/utils/frames";
import { HeadlessPlayerModel } from "./models/HeadlessPlayerModel";

/**
 * Plays the display's playlist (or single sequence). Edits to the playlist
 * and its sequences are picked up as it plays (HeadlessPlayerModel); a new
 * mode from the remote remounts it (App's key) to start from the top.
 */
export const HeadlessPlaylistPlayer = observer(
  ({ playlist }: { playlist: PlaylistModel }) => {
    const [player] = useState(() => new HeadlessPlayerModel(playlist));

    useEffect(() => {
      player.setPlaylist(playlist);
    }, [player, playlist]);

    useFrame(() => {
      player.advanceFrame();
    });

    if (!player.runtime) return null;
    return <SequenceRuntime model={player.runtime} />;
  },
);
