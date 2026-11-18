import { describe, expect, it } from "vitest";
import { act } from "react";
import { render } from "react-nil";
import { runInAction } from "mobx";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { NodeKey, PlaylistKey } from "../shared/models/docs";
import { ProjectModel } from "../shared/models/ProjectModel";
import { Signal } from "../shared/Signal";
import { FrameContext } from "../src/common/FixedFrameProvider";
import { LedDataStoreContext } from "../src/data/LedDataStoreContext";
import type { DisplaySettings } from "../convex/schema";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { Playback } from "./Playback";
import type { StringLink } from "./strings/StringLink";

const projectId = "p1" as Id<"projects">;
const STRING = "s1";
const LEDS = 4;
const RED = [255, 0, 0];
const GREEN = [0, 255, 0];

const base = { _creationTime: 0, projectId };

/** A sequence that sets the whole string to one colour. */
const solid = (key: string, color: number[]) =>
  ({
    ...base,
    _id: `id-${key}`,
    key,
    name: key,
    numFrames: 100,
    tracks: [
      {
        id: `t-${key}`,
        name: "t",
        events: [
          {
            id: `e-${key}`,
            kind: "string_effect",
            startFrame: 0,
            endFrame: 100,
            effectDefinitionId: "setColor",
            appliesTo: { kind: "nodes", nodeIds: [STRING] },
            props: { color },
          },
        ],
      },
    ],
  }) as unknown as Doc<"sequences">;

const playlist = (key: string, sequence: string) =>
  ({
    ...base,
    _id: `id-${key}`,
    key,
    name: key,
    sequenceIds: [sequence],
  }) as unknown as Doc<"playlists">;

const setup = () => {
  const project = new ProjectModel({
    _id: projectId,
    _creationTime: 0,
    name: "House",
    settings: { nightMode: true, lightsOnTop: true },
  });
  project.updateFromServerData({
    nodes: [
      {
        ...base,
        _id: "id-s1",
        key: STRING,
        kind: "string",
        name: "Roof",
        icon: { kind: "emoji", emoji: "x" },
        spacingMeters: 0.1,
        ledCount: LEDS,
        ipAddress: "10.0.0.1",
        port: 4048,
        brightness: 128,
        pathPoints: [],
        order: 0,
        parentId: null,
      } as unknown as Doc<"nodes">,
    ],
    sequences: [solid("red", RED), solid("green", GREEN)],
    playlists: [playlist("reds", "red"), playlist("greens", "green")],
  });

  const app = new HWIRAppModel({
    projectId,
    playlistId: "reds" as PlaylistKey,
  });
  app.setProject(project);
  app.setDataLoaded();

  // A string that takes every frame, keeping a copy of the last one.
  const sent: number[][] = [];
  app.links.set(
    STRING as NodeKey,
    {
      send: async (rgb: Uint8Array) => {
        sent.push([...rgb]);
        return "sent";
      },
    } as unknown as StringLink,
  );

  const signal = new Signal();
  const dataStore = app.dataStore;
  if (!dataStore) throw new Error("no data store");
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  render(
    <LedDataStoreContext.Provider value={dataStore}>
      <FrameContext.Provider value={{ signal, fps: 40, frameMs: 25 }}>
        <Playback app={app} />
      </FrameContext.Provider>
    </LedDataStoreContext.Provider>,
  );

  /** Changes the display like the remote does; resolves `shown` once HWIR would confirm. */
  const change = (settings: DisplaySettings) => {
    runInAction(() => app.setControl(settings));
    const state = { shown: false, lastAtShow: null as number[] | null };
    void app.whenShown(app.controlVersion).then(() => {
      state.shown = true;
      state.lastAtShow = sent[sent.length - 1] ?? null;
    });
    return state;
  };

  const tick = async () => {
    signal.dispatch();
    await settle();
  };

  return { app, sent, change, tick, signal };
};

/** Lets React commit and the effects' queued first frames run. */
const settle = () => act(async () => {});

const colorOf = (rgb: number[] | null) => (rgb ? rgb.slice(0, 3) : null);

const on = (id: string): DisplaySettings => ({
  isOn: true,
  brightness: 1,
  mode: { kind: "playlist", id },
});

/** Ticks until the change is confirmed (or gives up), like the frame loop. */
const untilShown = async (
  t: ReturnType<typeof setup>,
  state: { shown: boolean },
) => {
  for (let i = 0; i < 20 && !state.shown; i++) await t.tick();
  return state.shown;
};

describe("confirming a display change", () => {
  it("after a playlist change, confirms only with a frame the new playlist drew", async () => {
    const t = setup();
    const first = t.change(on("reds"));
    expect(await untilShown(t, first)).toBe(true);
    expect(colorOf(first.lastAtShow)).toEqual(RED);

    const next = t.change(on("greens"));
    // A frame before React has swapped the player still has red in it.
    t.signal.dispatch();
    await Promise.resolve();
    expect(next.shown).toBe(false);
    expect(await untilShown(t, next)).toBe(true);
    expect(colorOf(next.lastAtShow)).toEqual(GREEN);
  });

  it("confirms off with black, and on again only once the playlist has drawn", async () => {
    const t = setup();
    expect(await untilShown(t, t.change(on("reds")))).toBe(true);

    const off = t.change({ ...on("reds"), isOn: false });
    expect(await untilShown(t, off)).toBe(true);
    expect(off.lastAtShow).toEqual(Array(LEDS * 3).fill(0));

    const back = t.change(on("greens"));
    t.signal.dispatch();
    await Promise.resolve();
    expect(back.shown).toBe(false);
    expect(await untilShown(t, back)).toBe(true);
    expect(colorOf(back.lastAtShow)).toEqual(GREEN);
  });
});
