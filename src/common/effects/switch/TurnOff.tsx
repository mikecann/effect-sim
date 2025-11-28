import { useEffect } from "react";
import type { SwitchNodeModel } from "../../../../shared/models/SwitchNodeModel";

export function TurnOff({
  switch: switchNode,
  props,
}: {
  switch: SwitchNodeModel;
  props?: Record<string, unknown>;
}) {
  useEffect(() => {
    switchNode.turnOff().catch(console.error);
  }, [switchNode]);

  return null;
}
