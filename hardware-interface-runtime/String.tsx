import { useEffect, useState } from "react";
import { HWStringModel } from "./models/HWStringModel";
import { createAndConnectWLEDDDP, WLEDDDPConnection } from "./models/WLED_DDP";
import { observer } from "mobx-react-lite";
import { logger } from "./utils/logger";

export const String = observer(({ model }: { model: HWStringModel }) => {
  const [connection, setConnection] = useState<WLEDDDPConnection | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    let _connection: WLEDDDPConnection | null = null;
    const host = model.string.ipAddress;
    const port = model.string.port;
    const name = model.string.name;
    const { app } = model;
    const key = model.string.key;
    app.setConnection(key, "connecting");

    createAndConnectWLEDDDP({
      host,
      port,
      signal: abortController.signal,
    })
      .then((conn) => {
        _connection = conn;
        setConnection(_connection);
        app.setConnection(key, "live");
      })
      .catch((e) => {
        app.setConnection(key, "offline");
        logger.error(`Error connecting to '${name}': ${e}`);
      });

    return () => {
      abortController.abort();
      _connection?.close().catch((e) => {
        logger.error(`Error closing connection to '${name}': ${e}`);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect only when the address changes: HWStringModel is rebuilt whenever any string changes, and a reconnect blanks the string.
  }, [model.string.ipAddress, model.string.port]);

  useEffect(() => {
    if (!connection) return;
    return model.onData.add((rgb) => {
      // console.log(
      //   `Sending '${rgb.length}' bytes data to '${model.string.name}'`,
      // );
      connection.send(rgb).catch((e) => {
        logger.error(
          `Error sending packet of ${rgb.length} bytes to '${model.string.name}': ${e}`,
        );
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the name is only for the error log; a rename shouldn't resubscribe.
  }, [connection, model.onData]);

  useEffect(() => {
    if (!connection) return;
    const brightness = model.string.brightness;
    const name = model.string.name;
    connection.setBrightness(brightness).catch((e) => {
      logger.error(
        `Error setting brightness to ${brightness} for '${name}': ${e}`,
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the name is only for the error log; a rename shouldn't resend the brightness.
  }, [model.string.brightness, connection]);

  return null;
});
