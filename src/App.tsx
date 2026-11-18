import { Notifications } from "@mantine/notifications";
import { LedDataDispatcher } from "./data/LedDataDispatcher";
import { DevHooks } from "./common/DevHooks";
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
import SimulatorPanel from "./simulator/SimulatorPanel.tsx";
import MappingPanel from "./mapping/MappingPanel.tsx";

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
              model={app.layout.model}
              onModelChange={(model) => app.layout.setModel(model)}
              factory={(node: TabNode) => {
                const component = node.getComponent();
                if (component === "simulator")
                  return <SimulatorPanel id={node.getId()} />;
                if (component === "nodes")
                  return <NodesTreePanel id={node.getId()} />;
                if (component === "playlists") return <PlaylistsPanel />;
                if (component === "inspector") return <InspectorPanel />;
                if (component === "mapping") return <MappingPanel />;
                if (component === "sequencer")
                  return <SequencerPanel id={node.getId()} />;

                return null;
              }}
              onAction={(action) => action}
            />
          </div>
        </div>
        <Notifications />
        <LedDataDispatcher />
        <DevHooks />

        {import.meta.env.VITE_IS_DEV_MODE ? (
          <StringSegmentRangeInstantIndicator />
        ) : null}

        <HardwareInterfaceRuntimeAutoconnector />
      </LedDataStoreProvider>
    </>
  );
}
