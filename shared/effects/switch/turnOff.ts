import { useEffect } from "react";
import { z } from "zod";
import { defineSwitchEffect } from "../defineEffect";

export const turnOff = defineSwitchEffect({
  id: "turnOff",
  name: "Turn Off",
  props: z.object({}),
  defaults: {},
  render: function TurnOff({ switch: switchNode }) {
    useEffect(() => {
      switchNode.turnOff().catch(console.error);
    }, [switchNode]);
    return null;
  },
});
