import { render } from "react-nil";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { App } from "./App";
import { polyfillRAF } from "./polyfill";
import { runSetupCLI } from "./cli";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { ensure } from "../shared/ensure";
import { logger } from "./utils/logger";
import { runMode } from "./runMode";

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
if (process.env.HWIR_SUPERVISED === "1") {
  const supervisorPid = process.ppid;
  setInterval(() => {
    if (process.ppid !== supervisorPid) process.exit(0);
  }, 2000).unref();
}

polyfillRAF();

const convexUrl = ensure(
  process.env.VITE_CONVEX_URL,
  `missing VITE_CONVEX_URL environment variable`,
);

const { projectId, playlistId } = await runSetupCLI(convexUrl);
const convex = new ConvexReactClient(convexUrl);
const model = new HWIRAppModel({ projectId, playlistId });

// Mount the component so hooks run in Bun
render(
  <ConvexProvider client={convex}>
    <App app={model} />
  </ConvexProvider>,
);
