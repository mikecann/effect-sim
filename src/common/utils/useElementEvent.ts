import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Hook to add and remove element event listeners
 */
export function useElementEvent<K extends keyof HTMLElementEventMap>(
  elementRef: RefObject<HTMLElement | null>,
  event: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
  enabled = true,
) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) return;

    element.addEventListener(event, handler, options);

    return () => {
      element.removeEventListener(event, handler as EventListener, options);
    };
  }, [elementRef, event, handler, options, enabled]);
}

