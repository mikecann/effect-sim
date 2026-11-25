import { useLedData } from "../src/data/LedDataStoreContext";
import { useFrame } from "../src/common/utils/frames";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";

const bufferFor = (
  buffers: Map<string, Uint8Array>,
  key: string,
  length: number,
) => {
  let out = buffers.get(key);
  if (!out || out.length !== length) {
    out = new Uint8Array(length);
    buffers.set(key, out);
  }
  return out;
};

/**
 * Each frame, sends what the effects drew to every string, dimmed by the
 * display's brightness and mixed with the last sequence while one fades
 * into the next (app.crossfade).
 */
export const HeadlessLedDataDispatcher = observer(
  ({ app }: { app: HWIRAppModel }) => {
    const ledDataStore = useLedData();
    // One reusable buffer per string for dimmed or mixed frames, so they
    // don't allocate every frame.
    const [scaled] = useState(() => new Map<string, Uint8Array>());

    // The display settings this tree was rendered with. When nothing plays
    // (off, or no playlist) the dispatcher's own black frame is the render;
    // otherwise only a frame the player has stamped (RenderStamp) counts.
    const version = app.controlVersion;
    const selfRendered = !(app.isOn && app.playlist);
    const rendered = useRef({ version: -1, selfRendered: true });
    useEffect(() => {
      rendered.current = { version, selfRendered };
    }, [version, selfRendered]);

    useFrame(() => {
      // Off is brightness 0: keep sending black frames, as WLED goes back to
      // its own effect a few seconds after DDP data stops.
      const factor = app.isOn ? app.brightness : 0;
      const fade = app.crossfade;
      for (const [key, stringData] of ledDataStore.stringsMap) {
        const link = app.links.get(key);
        if (!link) continue;
        const data = stringData.data;
        void link.send(
          factor >= 1 && !fade.active
            ? data
            : fade.mix(key, data, factor, bufferFor(scaled, key, data.length)),
        );
      }
      fade.frameSent();
      const r = rendered.current;
      app.frameShown(r.selfRendered ? r.version : app.lastRendered());
    });

    return null;
  },
);
