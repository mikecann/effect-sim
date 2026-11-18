import { useEffect } from "react";
import { z } from "zod";
import { defineSwitchEffect } from "../defineEffect";

export const turnOffThenOn = defineSwitchEffect({
  id: "turnOffThenOn",
  name: "Turn Off Then On",
  props: z.object({}),
  defaults: {},
  render: function TurnOffThenOn({ switch: switchNode }) {
    useEffect(() => {
      switchNode.turnOff().catch(console.error);

      return () => {
        switchNode.turnOn().catch(console.error);
      };
    }, [switchNode]);
    return null;
  },
});
