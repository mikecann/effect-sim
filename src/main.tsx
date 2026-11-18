import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "flexlayout-react/style/dark.css";
import "./index.css";
import App from "./App.tsx";
import { RouteProvider } from "./router.ts";
import { ConfirmationProvider } from "./common/confirmation/ConfirmationProvider";
import {
  createTheme,
  MantineProvider,
  v8CssVariablesResolver,
} from "@mantine/core";
import { AppProvider } from "./common/AppContext.tsx";
import { ProjectFrameProvider } from "./common/ProjectFixedFrameProvider";
import { AppSyncer } from "./common/models/AppSyncer.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Mantine 9 changed some defaults; keep the editor looking as it did on 8.
const theme = createTheme({
  defaultRadius: "sm",
  fontWeights: { medium: "500" },
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const MachinesPage = lazy(() => import("./MachinesPage.tsx"));

// The admin Machines page sits outside the editor, with none of its providers.
if (window.location.pathname === "/machines")
  createRoot(rootElement).render(
    <ConvexProvider client={convex}>
      <Suspense>
        <MachinesPage />
      </Suspense>
    </ConvexProvider>,
  );
else
  createRoot(rootElement).render(
    <StrictMode>
      <ConvexProvider client={convex}>
        <RouteProvider>
          <MantineProvider
            theme={theme}
            defaultColorScheme="dark"
            cssVariablesResolver={v8CssVariablesResolver}
          >
            <ConfirmationProvider>
              <AppProvider>
                <ProjectFrameProvider>
                  <AppSyncer>
                    <App />
                  </AppSyncer>
                </ProjectFrameProvider>
              </AppProvider>
            </ConfirmationProvider>
          </MantineProvider>
        </RouteProvider>
      </ConvexProvider>
    </StrictMode>,
  );
