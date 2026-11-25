import type { NodeKey } from "../../shared/models/docs";

/**
 * Fades from one playlist sequence into the next instead of cutting. When
 * the player moves on it hands over the last frame the old sequence drew;
 * for the next `frames` frames the lights show that frame fading out under
 * the new sequence fading in. The old frame is held still while it fades,
 * as only one sequence runs at a time.
 */
export class Crossfade {
  private from = new Map<NodeKey, Uint8Array>();
  private frames = 0;
  private shown = 0;

  /** The old sequence's last frame, copied, as the player starts the next. */
  begin(strings: Iterable<{ key: NodeKey; data: Uint8Array }>, frames: number) {
    this.from.clear();
    if (frames <= 0) return;
    for (const { key, data } of strings) this.from.set(key, data.slice());
    this.frames = Math.round(frames);
    this.shown = 0;
  }

  get active(): boolean {
    return this.from.size > 0;
  }

  /**
   * One string's frame as it should go out, dimmed by `factor`, written into
   * `out`. A string the old frame didn't have just shows the new sequence.
   */
  mix(key: NodeKey, current: Uint8Array, factor: number, out: Uint8Array) {
    const from = this.from.get(key);
    // How far into the new sequence: 0 is all old, 1 all new. The first
    // frame sent is already a step in, so the fade never repeats the old one.
    const t = Math.min(1, (this.shown + 1) / (this.frames + 1));
    for (let i = 0; i < current.length; i++) {
      const old = from && from.length === current.length ? from[i] : current[i];
      out[i] = (old + (current[i] - old) * t) * factor;
    }
    return out;
  }

  /** A frame went out; the fade ends after its last one. */
  frameSent() {
    if (!this.active) return;
    this.shown++;
    if (this.shown >= this.frames) this.from.clear();
  }
}
