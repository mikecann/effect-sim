import { Notifications } from "@mantine/notifications";
import { LedDataDispatcher } from "./data/LedDataDispatcher";
import { SimulatorProvider } from "./simulator/SimulatorProvider.tsx";
import type { TabNode } from "flexlayout-react";
import { Layout } from "flexlayout-react";
import MenuBar from "./common/MenuBar";
import InspectorPanel from "./inspector/InspectorPanel.tsx";
import PlaylistsPanel from "./playlists/PlaylistsPanel";
import { useApp } from "./common/AppContext.tsx";
import WelcomeModal from "./common/projects/WelcomeModal";
import { LedDataStoreProvider } from "./data/LedDataStoreProvider.tsx";
import { HardwareInterfaceRuntimeAutoconnector } from "./common/hardware-interface/HardwareInterfaceRuntimeAutoconnector.tsx";
import { StringSegmentRangeInstantIndicator } from "./inspector/virtualString/StringSegmentRangeInstantIndicator.tsx";
import SequencerPanel from "./sequencer/SequencerPanel.tsx";
import NodesTreePanel from "./nodesTree/NodesTreePanel.tsx";

export default function App() {
  const app = useApp();

  if (!app.project)
    return (
      <>
        <WelcomeModal />
      </>
    );

  return (
    <>
      <LedDataStoreProvider>
        <div
          style={{
            height: "100dvh",
            width: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <MenuBar />
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <Layout
              model={app.flex.model}
              onModelChange={(model) => app.flex.setModel(model)}
              factory={(node: TabNode) => {
                const component = node.getComponent();
                if (component === "simulator") return <SimulatorProvider />;
                if (component === "nodes") {
                  const model = app.findNodesTreeById(node.getId());
                  if (!model) return null;
                  return <NodesTreePanel model={model} />;
                }
                if (component === "playlists") return <PlaylistsPanel />;
                if (component === "inspector") return <InspectorPanel />;
                if (component === "sequencer") {
                  const model = app.findSequencerById(node.getId());
                  if (!model) return null;
                  return <SequencerPanel sequencer={model} />;
                }

                return null;
              }}
              onAction={(action) => action}
            />
          </div>
        </div>
        <Notifications />
        <LedDataDispatcher />

        {import.meta.env.VITE_IS_DEV_MODE ? (
          <StringSegmentRangeInstantIndicator />
        ) : null}

        <HardwareInterfaceRuntimeAutoconnector />
      </LedDataStoreProvider>
    </>
  );
}
