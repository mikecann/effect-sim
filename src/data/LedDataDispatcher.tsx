import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useApp } from "../common/AppContext";
import { useLedData } from "./LedDataStoreContext";

export const LedDataDispatcher = observer(() => {
  const ledDataStore = useLedData();
  const app = useApp();

  // Start throttled render loop to send frames to bun server (~30-60fps)
  useEffect(() => {
    let id: number | null = null;
    let exited = false;
    let lastSentTs = Date.now();

    const loop = () => {
      if (exited) return;
      const now = Date.now();
      const since = now - lastSentTs;
      id = window.requestAnimationFrame(loop);

      // ~60fps max
      if (since < 16) return;

      // Send all targets when socket is open
      if (app.hardwareInterfaceRuntime.status === "open")
        for (const [targetId, stringData] of ledDataStore.stringsMap)
          app.hardwareInterfaceRuntime.sendFrame(targetId, stringData.data);

      lastSentTs = now;
    };

    id = window.requestAnimationFrame(loop);

    return () => {
      if (id) cancelAnimationFrame(id);
      exited = true;
    };
  }, [ledDataStore, app.hardwareInterfaceRuntime]);

  return null;
});
