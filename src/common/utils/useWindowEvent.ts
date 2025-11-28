import { useEffect } from "react";

/**
 * Hook to add and remove window event listeners
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  event: K,
  handler: (event: WindowEventMap[K]) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener(event, handler);

    return () => {
      window.removeEventListener(event, handler);
    };
  }, [event, handler, enabled]);
}

