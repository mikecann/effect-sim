import type { MappingPattern } from "../../../convex/schema";
import { isLit } from "../../../shared/mapping/ledCodes";
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

/**
 * Replays a real night for the block fill: each photo is one of `bases` (real
 * nearly dark frames, in turn, with whatever twinkled when they were taken)
 * plus, for each LED the pattern lights that `truth` places, that spot's
 * light from a real all-on frame. LEDs `truth` doesn't place stay dark, as if
 * hidden from this view.
 */
export class ReplayCamera implements Camera {
  readonly kind = "replay";
  private shots = 0;

  constructor(
    private readonly opts: {
      bases: string[];
      allOn: string;
      dark: string;
      truth: Map<string, ({ u: number; v: number } | null)[]>;
      /** Radius of each LED's light, px. */
      radius: number;
    },
    private readonly lights: Lights,
    private readonly py: PyWorker,
  ) {}

  async open() {
    return {};
  }
  async lock() {
    return {};
  }
  async auto() {
    return {};
  }

  async snap(path: string) {
    const pattern = this.lights.showing();
    const points = [...this.opts.truth].flatMap(([key, pts]) =>
      pts.flatMap((p, i) =>
        p && isLit(pattern, key, i, null) ? [{ u: p.u, v: p.v }] : [],
      ),
    );
    const { bases } = this.opts;
    await this.py.call("compose", {
      base: bases[this.shots++ % bases.length],
      source: this.opts.allOn,
      sourceDark: this.opts.dark,
      points,
      radius: this.opts.radius,
      out: path,
    });
  }

  async close() {}
}
