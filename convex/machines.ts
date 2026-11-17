import {
  defineMachines,
  deliveryArgs,
  type Machines,
} from "@convex-dev/state-machines";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { displayControl } from "./displayControl";
import schema from "./schema";

// Every state machine in effect-sim (@convex-dev/state-machines, vendored in
// vendor/). Functions that move a machine use this catalog's builders, whose
// db can't write a machine's state directly. The editor's own functions
// (functions.ts) stay on Convex's builders.
export const machines: Machines<typeof schema> = defineMachines(
  schema,
  [displayControl],
  {
    mutation,
    internalMutation,
    internalQuery,
    deliver: internal.machines.deliver,
    component: components.stateMachines,
  },
);

export { displayControl };

// Timers fire through this.
export const deliver = machines.internalMutation({
  args: deliveryArgs,
  handler: machines.deliver,
});
