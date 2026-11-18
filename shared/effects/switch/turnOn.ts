import { useEffect } from "react";
import { z } from "zod";
import { defineSwitchEffect } from "../defineEffect";

export const turnOn = defineSwitchEffect({
  id: "turnOn",
  name: "Turn On",
  props: z.object({}),
  defaults: {},
  render: function TurnOn({ switch: switchNode }) {
    useEffect(() => {
      switchNode.turnOn().catch(console.error);
    }, [switchNode]);
    return null;
  },
});
