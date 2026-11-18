import { useLedData } from "../src/data/LedDataStoreContext";
import { useFrame } from "../src/common/utils/frames";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";

const scale = (
  data: Uint8Array,
  factor: number,
  buffers: Map<string, Uint8Array>,
  key: string,
) => {
  let out = buffers.get(key);
  if (!out || out.length !== data.length) {
    out = new Uint8Array(data.length);
    buffers.set(key, out);
  }
  for (let i = 0; i < data.length; i++) out[i] = data[i] * factor;
  return out;
};

/** Each frame, sends what the effects drew to every string, dimmed by the display's brightness. */
export const HeadlessLedDataDispatcher = observer(
  ({ app }: { app: HWIRAppModel }) => {
    const ledDataStore = useLedData();
    // One reusable buffer per string for dimmed frames, so dimming doesn't
    // allocate every frame.
    const [scaled] = useState(() => new Map<string, Uint8Array>());

    // The display settings this tree was rendered with: once the effect has
    // run, the player for them is mounted, so the next frame shows them.
    const version = app.controlVersion;
    const renderedVersion = useRef(-1);
    useEffect(() => {
      renderedVersion.current = version;
    }, [version]);

    useFrame(() => {
      // Off is brightness 0: keep sending black frames, as WLED goes back to
      // its own effect a few seconds after DDP data stops.
      const factor = app.isOn ? app.brightness : 0;
      for (const [key, stringData] of ledDataStore.stringsMap) {
        const link = app.links.get(key);
        if (!link) continue;
        void link.send(
          factor >= 1
            ? stringData.data
            : scale(stringData.data, factor, scaled, key),
        );
      }
      app.frameShown(renderedVersion.current);
    });

    return null;
  },
);
