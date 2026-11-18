import { useEffect } from "react";
import { useApp } from "../AppContext";

export const HardwareInterfaceRuntimeAutoconnector = () => {
  const app = useApp();
  const runtime = app.hardwareInterfaceRuntime;

  useEffect(() => {
    // If autoconnect is disabled, we don't do anything automatically.
    if (!runtime.shouldAutoConnect) return;

    // If we are already connected or connecting, we don't need to trigger anything.
    if (
      runtime.status === "open" ||
      runtime.status === "connecting" ||
      runtime.status === "reconnecting"
    )
      return;

    // Otherwise, we are disconnected (idle, closed).
    // Since autoconnect is on, we should try to connect.
    // We add a small delay to prevent tight loops if connection fails immediately,
    // and to give the system a breather between retries.
    const timer = setTimeout(() => {
      runtime.connect();
    }, 2000);

    return () => clearTimeout(timer);
  }, [runtime.shouldAutoConnect, runtime.status, runtime]);

  return null;
};
