import { afterEach, describe, expect, it, vi } from "vitest";
import { blockOutsideWorld, reachOut } from "./outsideWorld";
import { SwitchNodeModel } from "./models/SwitchNodeModel";
import type { ProjectModel } from "./models/ProjectModel";
import type { NodeDocOfKind } from "./models/docs";

const plug = () =>
  new SwitchNodeModel(
    {
      key: "n1",
      projectId: "p1",
      kind: "switch",
      name: "Plug",
      ipAddress: "192.168.2.50",
    } as unknown as NodeDocOfKind<"switch">,
    {} as ProjectModel,
  );

afterEach(() => {
  blockOutsideWorld(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("outsideWorld", () => {
  it("runs the action when allowed", () => {
    expect(reachOut("x", () => "did it", "skipped")).toBe("did it");
  });

  it("returns the fallback, and says so once, when blocked", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    blockOutsideWorld("smoke");
    const act = vi.fn(() => "did it");
    expect(reachOut("x", act, "skipped")).toBe("skipped");
    expect(reachOut("x", act, "skipped")).toBe("skipped");
    expect(act).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("never calls a smart plug while blocked", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    blockOutsideWorld("dry-run");
    const node = plug();
    await node.turnOff();
    await node.turnOn();
    await node.toggle();
    await node.refreshStatus();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls the smart plug when allowed", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await plug().turnOn();
    expect(fetch).toHaveBeenCalledWith(
      "http://192.168.2.50/switch/smart_plug_v2/turn_on",
      { method: "POST" },
    );
  });
});
