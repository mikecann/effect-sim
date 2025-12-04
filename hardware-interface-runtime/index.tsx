/* eslint-disable react-refresh/only-export-components */
import { render } from "react-nil";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { App } from "./App";
import { polyfillRAF } from "./polyfill";
import { runSetupCLI } from "./cli";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { ensure } from "../shared/ensure";

polyfillRAF();

const convexUrl = ensure(
  process.env.CONVEX_URL,
  `missing CONVEX_URL environment variable`,
); // || `https://aromatic-cardinal-985.convex.cloud`;

const { projectId, playlistId } = await runSetupCLI(convexUrl);
const convex = new ConvexReactClient(convexUrl);
const model = new HWIRAppModel({ projectId, playlistId });

// Mount the component so hooks run in Bun
render(
  <ConvexProvider client={convex}>
    <App app={model} />
  </ConvexProvider>,
);
