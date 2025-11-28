import { useEffect } from "react";
import type { SwitchNodeModel } from "../../../../shared/models/SwitchNodeModel";

export function TurnOnThenOff({
  switch: switchNode,
  props,
}: {
  switch: SwitchNodeModel;
  props?: Record<string, unknown>;
}) {
  useEffect(() => {
    switchNode.turnOn().catch(console.error);

    return () => {
      switchNode.turnOff().catch(console.error);
    };
  }, [switchNode]);

  return null;
}
