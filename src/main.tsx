import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "flexlayout-react/style/dark.css";
import "./index.css";
import App from "./App.tsx";
import { LedDataStoreProvider } from "./data/LedDataStoreProvider.tsx";
import { RouteProvider } from "./router.ts";
import { ConfirmationProvider } from "./common/confirmation/ConfirmationProvider";
import { MantineProvider } from "@mantine/core";
import { AppProvider } from "./common/AppContext.tsx";
import { FlexLayoutProvider } from "./common/FlexLayoutProvider";
import { FixedFrameProvider } from "./common/FixedFrameProvider";
import { AppSyncer } from "./common/models/AppSyncer.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <RouteProvider>
        <MantineProvider defaultColorScheme="dark">
          <ConfirmationProvider>
            <AppProvider>
              <FlexLayoutProvider storageKey="flexlayout:model:v1">
                <FixedFrameProvider>
                  <AppSyncer>
                    <App />
                  </AppSyncer>
                </FixedFrameProvider>
              </FlexLayoutProvider>
            </AppProvider>
          </ConfirmationProvider>
        </MantineProvider>
      </RouteProvider>
    </ConvexProvider>
  </StrictMode>,
);
