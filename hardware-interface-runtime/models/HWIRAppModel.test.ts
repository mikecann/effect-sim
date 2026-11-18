import { describe, expect, it } from "vitest";
import { HWIRAppModel } from "./HWIRAppModel";

const settings = {
  isOn: true,
  brightness: 1,
  mode: { kind: "playlist" as const, id: "p" },
};

const resolved = async (p: Promise<void>) => {
  let done = false;
  void p.then(() => (done = true));
  // whenShown resolves synchronously from frameShown; two microtasks let
  // the .then above run.
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

describe("HWIRAppModel confirming display changes", () => {
  it("waits for a frame rendered with the new settings, after the data is in", async () => {
    const app = new HWIRAppModel({
      projectId: "p" as never,
      playlistId: null,
    });
    app.setControl(settings);
    const version = app.controlVersion;
    const shown = app.whenShown(version);

    app.frameShown(version); // data hasn't loaded: not a real frame
    expect(await resolved(shown)).toBe(false);
    app.setDataLoaded();
    app.frameShown(version - 1); // a frame from before the change
    expect(await resolved(shown)).toBe(false);
    app.frameShown(version);
    expect(await resolved(shown)).toBe(true);
    // Already shown: resolves at once.
    expect(await resolved(app.whenShown(version))).toBe(true);
  });
});
