import { useEffect, useState } from "react";
import { HWStringModel } from "./models/HWStringModel";
import { reaction } from "mobx";
import { createAndConnectWLEDDDP, WLEDDDPConnection } from "./models/WLED_DDP";

export const String = ({ model }: { model: HWStringModel }) => {
  const [connection, setConnection] = useState<WLEDDDPConnection | null>(null);

  useEffect(() => {
    let hasExited = false;
    let _connection: WLEDDDPConnection | null = null;

    createAndConnectWLEDDDP({
      host: model.string.ipAddress,
      port: model.string.port,
    })
      .then((conn) => {
        _connection = conn;
        if (hasExited) {
          _connection?.close().catch(() => {
            console.error(
              `Error closing stale connection to '${model.string.name}'`,
            );
          });
          return;
        }
        setConnection(_connection);
      })
      .catch((e) => {
        console.error(`Error connecting to '${model.string.name}': ${e}`);
      });

    return () => {
      hasExited = true;
      _connection?.close().catch((e) => {
        console.error(
          `Error closing connection to '${model.string.name}': ${e}`,
        );
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
