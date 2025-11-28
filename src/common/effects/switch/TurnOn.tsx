import { useEffect } from "react";
import type { SwitchNodeModel } from "../../../../shared/models/SwitchNodeModel";

export function TurnOn({
  switch: switchNode,
  props,
}: {
  switch: SwitchNodeModel;
  props?: Record<string, unknown>;
}) {
  useEffect(() => {
    switchNode.turnOn().catch(console.error);
  }, [switchNode]);

  return null;
}
