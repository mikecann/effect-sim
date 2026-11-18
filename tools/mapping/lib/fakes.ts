import type { MappingPattern } from "../../../convex/schema";
import type { Camera, FrameRequest } from "./cameras";
import type { MappedString } from "./manifest";
import type { PyWorker } from "./python";
import { litMask, type Scene } from "./scene";
import type { MappingSessionDriver } from "./session";

// Stand-ins for the synthetic test and for trying the tool without the house:
// a session whose "HWIR" acks every pattern after a delay, and a camera that
// renders the scene with whatever the lights are showing.

/** What the (fake) lights are showing; the synthetic camera photographs it. */
export interface Lights {
  showing(): MappingPattern;
}

/** A mapping session kept in memory, with a fake HWIR acking each pattern. */
export class FakeSession implements MappingSessionDriver, Lights {
  readonly sessionId = "fake-session";
  private seq = 0;
  private current: MappingPattern = { kind: "off" };

  constructor(private readonly ackDelayMs = 5) {}

  async show(pattern: MappingPattern) {
    const seq = ++this.seq;
    await new Promise((r) => setTimeout(r, this.ackDelayMs));
    this.current = pattern;
    return { seq };
  }

  showing() {
    return this.current;
  }
}

/** Renders the scene as the lights show it (py/mapping_cv.py `render`). */
export class SyntheticCamera implements Camera {
  readonly kind = "synthetic";
  private shots = 0;
  private autoExposure = false;
  private lastPattern: MappingPattern = { kind: "off" };
  /** Frame names that come back as the previous pattern once (a slow light). */
  readonly staleOnce = new Set<string>();

  constructor(
    private readonly scenePath: string,
    private readonly scene: Scene,
    private readonly strings: MappedString[],
    private readonly lights: Lights,
    private readonly py: PyWorker,
  ) {}

  async open() {
    return { width: this.scene.width, height: this.scene.height };
  }
  async lock() {
    this.autoExposure = false;
    return { exposure: "locked", focus: "locked", whiteBalance: "locked" };
  }
  async auto() {
    this.autoExposure = true;
    return {};
  }

  async snap(path: string, frame: FrameRequest) {
    let pattern = this.lights.showing();
    if (this.staleOnce.delete(frame.name)) pattern = this.lastPattern;
    else this.lastPattern = pattern;
    await this.py.call("render", {
      scene: this.scenePath,
      lit: litMask(this.scene, this.strings, pattern),
      out: path,
      seed: ++this.shots,
      reference: this.autoExposure,
    });
  }

  async close() {}
}
