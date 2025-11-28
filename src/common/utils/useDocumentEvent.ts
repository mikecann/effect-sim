import { useEffect } from "react";

/**
 * Hook to add and remove document event listeners
 */
export function useDocumentEvent<K extends keyof DocumentEventMap>(
  event: K,
  handler: (event: DocumentEventMap[K]) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener(event, handler);

    return () => {
      document.removeEventListener(event, handler);
    };
  }, [event, handler, enabled]);
}

