import { useEffect } from "react";
import type { SwitchNodeModel } from "../../../../shared/models/SwitchNodeModel";

export function Toggle({
  switch: switchNode,
  props,
}: {
  switch: SwitchNodeModel;
  props?: Record<string, unknown>;
}) {
  useEffect(() => {
    switchNode.toggle().catch(console.error);
  }, [switchNode]);

  return null;
}
