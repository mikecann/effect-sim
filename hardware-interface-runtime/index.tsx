import { render } from "react-nil";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { App } from "./App";
import { runSetupCLI } from "./cli";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { ensure } from "../shared/ensure";
import { logger } from "./utils/logger";
import { convexWritesAllowed, runMode } from "./runMode";
import { reachOut } from "../shared/outsideWorld";
import { getFunctionName } from "convex/server";

logger.info(`Hardware Interface Runtime Starting (${runMode})...`);

if (runMode === "smoke") {
  const fail = (why: string) => {
    logger.error(`Smoke test failed: ${why}`);
    process.exit(1);
  };
  process.on("unhandledRejection", (e) => fail(`unhandled rejection: ${e}`));
  process.on("uncaughtException", (e) => fail(`uncaught exception: ${e}`));
  const timeoutMs = Number(process.env.HWIR_SMOKE_TIMEOUT_MS ?? 60_000);
  setTimeout(() => fail(`timed out after ${timeoutMs / 1000}s`), timeoutMs);
}

// Under the supervisor: if it dies without stopping us, stop too, so launchd
// never ends up with two runtimes driving the lights.
// The supervisor passes its pid, so a child that was orphaned before it got
// here can't mistake its new parent for the supervisor.
if (process.env.HWIR_SUPERVISED === "1") {
  const supervisorPid = Number(process.env.HWIR_SUPERVISOR_PID);
  const orphaned = () => process.ppid !== supervisorPid;
  if (orphaned()) process.exit(0);
  setInterval(() => {
    if (orphaned()) process.exit(0);
  }, 2000).unref();
}

const convexUrl = ensure(
  process.env.VITE_CONVEX_URL,
  `missing VITE_CONVEX_URL environment variable`,
);

const { projectId, playlistId } = await runSetupCLI(convexUrl);
const convex = new ConvexReactClient(convexUrl);

// Every write to Convex goes through the outside-world guard, so dry runs
// read production data but never change it. The one exception is a dry run
// against a local backend with --local-convex-writes (runMode.ts), to test
// the heartbeat and mapping acks without touching the lights.
const mutation = convex.mutation.bind(convex);
if (!convexWritesAllowed(convexUrl))
  convex.mutation = ((ref, ...rest) =>
    reachOut(
      `calling mutation ${getFunctionName(ref)}`,
      () => mutation(ref, ...rest),
      Promise.resolve(null),
    )) as typeof convex.mutation;
const action = convex.action.bind(convex);
convex.action = ((ref, ...rest) =>
  reachOut(
    `calling action ${getFunctionName(ref)}`,
    () => action(ref, ...rest),
    Promise.resolve(null),
  )) as typeof convex.action;
const model = new HWIRAppModel({ projectId, playlistId });

// Mount the component so hooks run in Bun
render(
  <ConvexProvider client={convex}>
    <App app={model} />
  </ConvexProvider>,
);
