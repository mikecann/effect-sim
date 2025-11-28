declare module "react-nil" {
  import type * as React from "react";

  export type HostContainer = unknown;

  export function render(element: React.ReactNode): HostContainer;
  export function createPortal(
    element: React.ReactNode,
    container: HostContainer,
  ): React.JSX.Element;
  export function flushSync<R>(fn: () => R): R;
}
