import { defineApp } from "convex/server";
import stateMachines from "@convex-dev/state-machines/convex.config.js";

const app = defineApp();

// State machines (convex/machines.ts): each machine's history.
app.use(stateMachines);

export default app;
