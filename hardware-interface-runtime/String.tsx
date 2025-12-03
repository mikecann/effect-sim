import { useEffect, useState } from "react";
import { HWStringModel } from "./models/HWStringModel";
import { reaction } from "mobx";
import { createAndConnectWLEDDDP, WLEDDDPConnection } from "./models/WLED_DDP";

export const String = ({ model }: { model: HWStringModel }) => {
  const [connection, setConnection] = useState<WLEDDDPConnection | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    let _connection: WLEDDDPConnection | null = null;
    const host = model.string.ipAddress;
    const port = model.string.port;
    const name = model.string.name;

    createAndConnectWLEDDDP({
      host,
      port,
      signal: abortController.signal,
    })
      .then((conn) => {
        _connection = conn;
        setConnection(_connection);
      })
      .catch((e) => {
        console.error(`Error connecting to '${name}': ${e}`);
      });

    return () => {
      abortController.abort();
      _connection?.close().catch((e) => {
        console.error(`Error closing connection to '${name}': ${e}`);
      });
    };
  }, [model.string.ipAddress, model.string.port]);

  useEffect(() => {
    if (!connection) return;

    const unlistenToData = model.onData.add((rgb) => {
      console.log(
        `Sending '${rgb.length}' bytes data to '${model.string.name}'`,
      );
      connection.send(rgb).catch((e) => {
        console.error(
          `Error sending packet of ${rgb.length} bytes to '${model.string.name}': ${e}`,
        );
      });
    });

    const unlistenToBrightness = reaction(
      () => model.string.brightness,
      (brightness) => {
        connection.setBrightness(brightness).catch((e) => {
          console.error(
            `Error setting brightness to ${brightness} for '${model.string.name}': ${e}`,
          );
        });
      },
    );

    return () => {
      unlistenToData();
      unlistenToBrightness();
    };
  }, [connection]);

  return null;
};
