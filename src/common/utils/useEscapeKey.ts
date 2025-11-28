import { useEffect } from "react";

/**
 * Custom hook that listens for the Escape key and calls the provided callback
 * @param callback Function to call when Escape key is pressed
 */
export function useEscapeKey(callback: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      callback();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [callback]);
}
