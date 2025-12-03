import { useEffect, useState, startTransition } from "react";
import { WLEDDdp } from "./wled-ddp";
import { HWStringModel } from "./models/HWStringModel";

export const String = ({ model }: { model: HWStringModel }) => {
  const [client, setClient] = useState<WLEDDdp | null>(null);

  useEffect(() => {
    const newClient = new WLEDDdp({
      host: model.string.ipAddress,
      port: model.string.port,
      ledCount: model.string.ledCount,
      autoTurnOn: true,
    });
    startTransition(() => {
      setClient(newClient);
    });
  }, [model.string.ipAddress, model.string.port, model.string.ledCount]);

  useEffect(() => {
    if (!client) return;
    console.log(
      `'${model.string.name}' brightness changed to ${model.string.brightness}`,
    );
    client.setBrightness(model.string.brightness);
  }, [client, model.string.brightness, model.string.name]);

  useEffect(() => {
    if (!client) return;
    client.connect();
    return () => {
      client.close();
    };
  }, [client]);

  useEffect(
    () =>
      model.onData.add((rgb) => {
        if (!client) return;
        console.log(
          `Sending '${rgb.length}' bytes data to '${model.string.name}'`,
        );
        client.send(rgb);
      }),
    [client, model],
  );

  return null;
};
