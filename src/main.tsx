import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "flexlayout-react/style/dark.css";
import "./index.css";
import App from "./App.tsx";
import { RouteProvider } from "./router.ts";
import { ConfirmationProvider } from "./common/confirmation/ConfirmationProvider";
import {
  createTheme,
  InputWrapper,
  MantineProvider,
  v8CssVariablesResolver,
} from "@mantine/core";
import { AppProvider } from "./common/AppContext.tsx";
import { ProjectFrameProvider } from "./common/ProjectFixedFrameProvider";
import { AppSyncer } from "./common/models/AppSyncer.tsx";
import { EditorGate } from "./common/auth/EditorGate.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Mantine 9 changed some defaults; keep the editor looking as it did on 8.
const theme = createTheme({
  defaultRadius: "sm",
  components: {
    InputWrapper: InputWrapper.extend({
      styles: { label: { fontWeight: 500 } },
    }),
  },
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
      <ConvexAuthProvider
        client={convex}
        api={{
          refreshSession: api.editors.refreshSession,
          signOut: api.editors.signOut,
        }}
      >
        <RouteProvider>
          <MantineProvider
            theme={theme}
            defaultColorScheme="dark"
            cssVariablesResolver={v8CssVariablesResolver}
          >
            <EditorGate>
              <ConfirmationProvider>
                <AppProvider>
                  <ProjectFrameProvider>
                    <AppSyncer>
                      <App />
                    </AppSyncer>
                  </ProjectFrameProvider>
                </AppProvider>
              </ConfirmationProvider>
            </EditorGate>
          </MantineProvider>
        </RouteProvider>
      </ConvexAuthProvider>
    </StrictMode>,
  );
