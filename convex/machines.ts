import {
  defineMachines,
  deliveryArgs,
  type Machines,
} from "@convex-dev/state-machines";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { displayControl } from "./displayControl";
import { hwirPresence } from "./hwirPresence";
import { mappingSession } from "./mappingSession";
import { switchState } from "./switchState";
import schema from "./schema";

// Every state machine in effect-sim (@convex-dev/state-machines, vendored in
// vendor/). Functions that move a machine use this catalog's builders, whose
// db can't write a machine's state directly. Public mutations use them through
// convex/auth.ts, which checks the caller's token first.
export const machines: Machines<typeof schema> = defineMachines(
  schema,
  [displayControl, hwirPresence, mappingSession, switchState],
  {
    mutation,
    internalMutation,
    internalQuery,
    deliver: internal.machines.deliver,
    component: components.stateMachines,
  },
);

export { displayControl, hwirPresence, mappingSession, switchState };

// Timers fire through this.
export const deliver = machines.internalMutation({
  args: deliveryArgs,
  handler: machines.deliver,
});
