import { useEffect, useState, startTransition } from "react";
import { WLED_DDPModel } from "./models/WLED_DDPModel";
import { HWStringModel } from "./models/HWStringModel";
import { autorun, reaction } from "mobx";

export const String = ({ model }: { model: HWStringModel }) => {
  useEffect(() => {
    const client = new WLED_DDPModel(model.string.ipAddress, model.string.port);
    model.setClient(client);

    client.connect().catch(() => {
      console.error(`Error connecting to '${model.string.name}'`);
    });

    const unlistenToData = model.onData.add((rgb) => {
      if (client.status != "connected") return;
      console.log(
        `Sending '${rgb.length}' bytes data to '${model.string.name}'`,
      );
      client.send(rgb).catch(() => {
        console.error(
          `Error sending packet of ${rgb.length} bytes to '${model.string.name}'`,
        );
      });
    });

    const unlistenToBrightness = reaction(
      () => model.string.brightness,
      (brightness) => {
        if (client.status != "connected") return;
        client.setBrightness(brightness).catch(() => {
          console.error(
            `Error setting brightness to ${brightness} for '${model.string.name}'`,
          );
        });
      },
    );

    return () => {
      unlistenToData();
      unlistenToBrightness();
      client.close().catch(() => {
        console.error(`Error closing connection to '${model.string.name}'`);
      });
    };
  }, [model.string.ipAddress, model.string.port]);

  useEffect(() => {
    if (model.client?.status != "connected") return;
    model.client
      .setBrightness(model.string.brightness)
      .then(() => {
        console.log(
          `'${model.string.name}' brightness changed to ${model.string.brightness}`,
        );
      })
      .catch(() => {
        console.error(
          `Error setting brightness to ${model.string.brightness} for '${model.string.name}'`,
        );
      });
  }, [model.string.brightness, model.client?.status]);

  return null;
};
