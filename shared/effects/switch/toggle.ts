import { useEffect } from "react";
import { z } from "zod";
import { defineSwitchEffect } from "../defineEffect";

export const toggle = defineSwitchEffect({
  id: "toggle",
  name: "Toggle",
  props: z.object({}),
  defaults: {},
  render: function Toggle({ switch: switchNode }) {
    useEffect(() => {
      switchNode.toggle().catch(console.error);
    }, [switchNode]);
    return null;
  },
});
