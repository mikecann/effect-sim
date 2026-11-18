import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import type { StringNodeModel } from "../shared/models/StringNodeModel";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { StringLink } from "./strings/StringLink";

/** Keeps one WLED link per string, remade only when its address changes. */
export const String = observer(
  ({ app, string }: { app: HWIRAppModel; string: StringNodeModel }) => {
    // The link reads these when it needs them, so a rename or brightness
    // change doesn't reconnect.
    const latest = useRef(string);
    useEffect(() => {
      latest.current = string;
    });

    const { key, ipAddress, port, brightness } = string;

    useEffect(() => {
      const link = new StringLink({
        host: ipAddress,
        port,
        name: () => latest.current.name,
        brightness: () => latest.current.brightness,
      });
      app.links.set(key, link);
      return () => {
        if (app.links.get(key) === link) app.links.delete(key);
        link.close();
      };
    }, [app, key, ipAddress, port]);

    const firstBrightness = useRef(true);
    useEffect(() => {
      // The link sets it itself when it first connects.
      if (firstBrightness.current) {
        firstBrightness.current = false;
        return;
      }
      app.links.get(key)?.brightnessChanged();
    }, [app, key, brightness]);

    return null;
  },
);
