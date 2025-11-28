import { Notifications } from "@mantine/notifications";
import { LedDataDispatcher } from "./data/LedDataDispatcher";
import { SimulatorProvider } from "./simulator/SimulatorProvider.tsx";
import type { TabNode } from "flexlayout-react";
import { Layout } from "flexlayout-react";
import { useFlexLayout } from "./common/FlexLayoutProvider";
import MenuBar from "./common/MenuBar";
import InspectorPanel from "./inspector/InspectorPanel.tsx";
import { SequencerProvider } from "./sequencer/SequencerProvider";
import { NodesTreeProvider } from "./nodesTree/NodesTreeProvider.tsx";
import PlaylistsPanel from "./playlists/PlaylistsPanel";
import { useApp } from "./common/AppContext.tsx";
import WelcomeModal from "./common/projects/WelcomeModal";
import { LedDataStoreProvider } from "./data/LedDataStoreProvider.tsx";
import { HardwareInterfaceRuntimeAutoconnector } from "./common/hardware-interface/HardwareInterfaceRuntimeAutoconnector.tsx";
import { AppModelPersister } from "./common/models/AppModelPersister.tsx";

export default function App() {
  const { model, onModelChange } = useFlexLayout();
  const project = useApp().project;

  if (!project)
    return (
      <>
        <WelcomeModal />
        <AppModelPersister />
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
              model={model}
              onModelChange={onModelChange}
              factory={(node: TabNode) => {
                const component = node.getComponent();
                if (component === "simulator") return <SimulatorProvider />;
                if (component === "nodes") return <NodesTreeProvider />;
                if (component === "playlists") return <PlaylistsPanel />;
                if (component === "inspector") return <InspectorPanel />;
                if (component === "sequencer") return <SequencerProvider />;
                return null;
              }}
              onAction={(action) => action}
            />
          </div>
        </div>
        <Notifications />
        <LedDataDispatcher />
        <HardwareInterfaceRuntimeAutoconnector />
        <AppModelPersister />
      </LedDataStoreProvider>
    </>
  );
}
