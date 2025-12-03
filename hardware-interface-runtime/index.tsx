/* eslint-disable react-refresh/only-export-components */
import { render } from "react-nil";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { App } from "./App";
import { polyfillRAF } from "./polyfill";
import { runSetupCLI } from "./cli";
import { HWIRAppModel } from "./models/HWIRAppModel";

polyfillRAF();

const convexUrl = import.meta.env.VITE_CONVEX_URL as string; //  `https://aromatic-cardinal-985.convex.cloud`

const { projectId, playlistId } = await runSetupCLI(convexUrl);
const convex = new ConvexReactClient(convexUrl);
const model = new HWIRAppModel({ projectId, playlistId });

// Mount the component so hooks run in Bun
render(
  <ConvexProvider client={convex}>
    <App app={model} />
  </ConvexProvider>,
);
