import { useEffect } from "react";
import { z } from "zod";
import { defineSwitchEffect } from "../defineEffect";

export const turnOnThenOff = defineSwitchEffect({
  id: "turnOnThenOff",
  name: "Turn On Then Off",
  props: z.object({}),
  defaults: {},
  render: function TurnOnThenOff({ switch: switchNode }) {
    useEffect(() => {
      switchNode.turnOn().catch(console.error);

      return () => {
        switchNode.turnOff().catch(console.error);
      };
    }, [switchNode]);
    return null;
  },
});
