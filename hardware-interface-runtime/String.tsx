import { useEffect, useState, startTransition } from "react";
import { WLEDDdp } from "./wled-ddp";
import { onFrameDataSignal } from "./ClientDataSocket";
import type { Doc } from "../convex/_generated/dataModel";
import { NodeDocOfKind } from "../convex/schema";


export const String = ({ string }: { string: NodeDocOfKind<"string"> }) => {
  const [client, setClient] = useState<WLEDDdp | null>(null);

  useEffect(() => {
    const newClient = new WLEDDdp({
      host: string.ipAddress,
      port: string.port,
      ledCount: string.ledCount,
      autoTurnOn: true,
    });
    startTransition(() => {
      setClient(newClient);
    });
  }, [string.ipAddress, string.port, string.ledCount]);

  useEffect(() => {
    if (!client) return;
    console.log(`'${string.name}' brightness changed to ${string.brightness}`);
    client.setBrightness(string.brightness);
  }, [client, string.brightness, string.name]);

  useEffect(() => {
    if (!client) return;
    client.connect();
    return () => {
      client.close();
    };
  }, [client]);

  useEffect(
    () =>
      onFrameDataSignal.add(({ forStringId, rgb }) => {
        if (forStringId != string._id) return;
        if (!client) return;
        client.send(rgb);
      }),
    [client, string._id],
  );

  return null;
};
