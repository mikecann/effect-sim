import { describe, expect, it } from "vitest";
import type { SequenceModel } from "../../shared/models/sequencer/SequenceModel";
import {
  HeadlessPlayerModel,
  type PlayablePlaylist,
} from "./HeadlessPlayerModel";

const seq = (key: string, numFrames: number) =>
  ({ key, numFrames }) as unknown as SequenceModel;

/** A playlist whose sequences the test edits, as the project does live. */
const editable = (sequences: SequenceModel[]) => {
  const playlist = { sequences } as PlayablePlaylist & {
    sequences: SequenceModel[];
  };
  return playlist;
};

const position = (player: HeadlessPlayerModel) =>
  player.runtime
    ? `${player.runtime.sequence?.key}:${player.runtime.playhead.frame}`
    : "nothing";

const advance = (player: HeadlessPlayerModel, frames: number) => {
  for (let i = 0; i < frames; i++) player.advanceFrame();
  return position(player);
};

describe("HeadlessPlayerModel", () => {
  it("plays each sequence to its end, then the next, looping the playlist", () => {
    const player = new HeadlessPlayerModel(
      editable([seq("a", 2), seq("b", 3)]),
    );
    expect(advance(player, 1)).toBe("a:0");
    expect(advance(player, 1)).toBe("a:1");
    expect(advance(player, 1)).toBe("b:0");
    expect(advance(player, 3)).toBe("a:0");
  });

  it("loops a playlist of one in place, counting loops", () => {
    const player = new HeadlessPlayerModel(editable([seq("a", 2)]));
    advance(player, 2);
    const runtime = player.runtime;
    expect(advance(player, 1)).toBe("a:0");
    expect(player.runtime).toBe(runtime);
    expect(player.runtime?.loopCount).toBe(1);
  });

  it("starts playing when an empty playlist gets its first sequence", () => {
    const playlist = editable([]);
    const player = new HeadlessPlayerModel(playlist);
    expect(advance(player, 5)).toBe("nothing");
    playlist.sequences = [seq("a", 10)];
    expect(advance(player, 1)).toBe("a:0");
  });

  it("carries on with the same sequence when others are added or reordered", () => {
    const a = seq("a", 10);
    const b = seq("b", 10);
    const playlist = editable([a, b]);
    const player = new HeadlessPlayerModel(playlist);
    advance(player, 4);
    playlist.sequences = [seq("new", 5), b, a];
    expect(advance(player, 1)).toBe("a:4");
    // At a's end it goes on to what follows it now: back round to "new".
    expect(advance(player, 6)).toBe("new:0");
  });

  it("moves on from the same place when the playing sequence is removed", () => {
    const playlist = editable([seq("a", 10), seq("b", 10), seq("c", 10)]);
    const player = new HeadlessPlayerModel(playlist);
    advance(player, 12); // b:1
    playlist.sequences = [seq("a", 10), seq("c", 10)];
    expect(advance(player, 1)).toBe("c:0");
    playlist.sequences = [];
    expect(advance(player, 1)).toBe("nothing");
  });

  it("plays the same sequence twice in a row when the playlist lists it twice", () => {
    const a = seq("a", 2);
    const player = new HeadlessPlayerModel(editable([a, seq("b", 2), a]));
    expect(advance(player, 5)).toBe("a:0"); // a a b b a
    expect(advance(player, 2)).toBe("a:0"); // the second a, then the first again
  });

  it("follows a rebuilt playlist (a sequence mode recomputed) without restarting", () => {
    const a = seq("a", 10);
    const player = new HeadlessPlayerModel(editable([a]));
    advance(player, 3);
    player.setPlaylist(editable([a]));
    expect(advance(player, 1)).toBe("a:3");
  });
});
