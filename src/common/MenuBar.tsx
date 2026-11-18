import { ActionIcon, Divider, Group, Menu, Text } from "@mantine/core";
import {
  IconEdit,
  IconExternalLink,
  IconChevronRight,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { iife } from "../../shared/misc";
import { getConvexDeploymentName } from "./utils/convex";
import { useApp } from "./AppContext";
import { useState, useEffect } from "react";
import NewProjectModal from "./projects/NewProjectModal";
import OpenProjectModal from "./projects/OpenProjectModal";
import ProjectSettingsModal from "./projects/ProjectSettingsModal";
import { HardwareInterfaceStatus } from "./hardware-interface/HardwareInterfaceStatus";
import { SaveStatus } from "./SaveStatus";
import { LightsStatus } from "./hardware-interface/LightsStatus";

export default function MenuBar() {
  const app = useApp();

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showOpenProjectModal, setShowOpenProjectModal] = useState(false);
  const [showProjectSettingsModal, setShowProjectSettingsModal] =
    useState(false);

  return (
    <>
      <div
        style={{
          height: 34,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(6px)",
        }}
      >
        <Group
          justify="space-between"
          style={{ width: "100%", position: "relative" }}
          gap="md"
        >
          <Group gap="md">
            <Text fw={600} size="sm">
              🌈 Effect Sim
            </Text>

            <Menu shadow="md" width={160}>
              <Menu.Target>
                <Text size="sm" style={{ cursor: "pointer" }}>
                  File
                </Text>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => setShowNewProjectModal(true)}>
                  New Project
                </Menu.Item>
                <Menu.Item onClick={() => setShowOpenProjectModal(true)}>
                  Open Project
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            {app.project && (
              <Menu shadow="md" width={160}>
                <Menu.Target>
                  <Text size="sm" style={{ cursor: "pointer" }}>
                    Edit
                  </Text>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => setShowProjectSettingsModal(true)}>
                    Project Settings
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}

            <Menu shadow="md" width={160}>
              <Menu.Target>
                <Text size="sm" style={{ cursor: "pointer" }}>
                  View
                </Text>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => app.layout.resetLayout()}>
                  Reset Layout
                </Menu.Item>
                <Menu.Item
                  // eslint-disable-next-line mikecann-lint/click-shows-progress -- the copy is instant and the notification shows at once.
                  onClick={() => {
                    const json = app.layout.model.toJson();
                    navigator.clipboard.writeText(JSON.stringify(json));
                    notifications.show({
                      title: "Layout copied to clipboard",
                      message: "The layout has been copied to your clipboard",
                      color: "green",
                    });
                  }}
                >
                  Copy Layout
                </Menu.Item>
                <Divider my="sm" />
                <Menu.Item onClick={() => app.layout.showInspector()}>
                  Show Inspector
                </Menu.Item>
                <Menu.Item onClick={() => app.layout.showSequencer()}>
                  Show Sequencer
                </Menu.Item>
                <Menu.Item onClick={() => app.layout.showPlaylists()}>
                  Show Playlists
                </Menu.Item>
                <Menu.Item onClick={() => app.layout.showMapping()}>
                  Show Mapping
                </Menu.Item>
                <Divider my="sm" />
                <Menu.Item
                  leftSection={<IconExternalLink size={16} />}
                  component="a"
                  href={iife(() => {
                    const deployment = getConvexDeploymentName();
                    return deployment
                      ? `https://dashboard.convex.dev/d/${deployment}`
                      : "https://dashboard.convex.dev";
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Convex
                </Menu.Item>
                <Divider my="sm" />
                <Menu.Item
                  onClick={() => {
                    if (app.project)
                      app.project.updateSettings({
                        nightMode: !app.project.settings.nightMode,
                      });
                  }}
                >
                  {app.project?.settings.nightMode ? "✓ " : ""}Night Mode
                </Menu.Item>
                <Menu.Item
                  onClick={() => {
                    if (app.project)
                      app.project.updateSettings({
                        lightsOnTop: !app.project.settings.lightsOnTop,
                      });
                  }}
                >
                  {app.project?.settings.lightsOnTop ? "✓ " : ""}Lights On Top
                </Menu.Item>
                <Divider my="sm" />
                <Menu trigger="hover" position="right-start">
                  <Menu.Target>
                    <Menu.Item rightSection={<IconChevronRight size={14} />}>
                      Camera Controls
                    </Menu.Item>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      onClick={() =>
                        app.project?.updateSettings({ cameraControl: "orbit" })
                      }
                    >
                      {(app.project?.settings.cameraControl === "orbit" ||
                        !app.project?.settings.cameraControl) &&
                        "✓ "}
                      Orbit
                    </Menu.Item>
                    <Menu.Item
                      onClick={() =>
                        app.project?.updateSettings({ cameraControl: "fly" })
                      }
                    >
                      {app.project?.settings.cameraControl === "fly" && "✓ "}Fly
                    </Menu.Item>
                    <Menu.Item
                      onClick={() =>
                        app.project?.updateSettings({
                          cameraControl: "first_person",
                        })
                      }
                    >
                      {app.project?.settings.cameraControl === "first_person" &&
                        "✓ "}
                      First Person
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Menu.Dropdown>
            </Menu>
          </Group>

          <Group
            gap="xs"
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            <Text fw={500} size="sm" c="dimmed">
              {app.project ? app.project.name : "No project selected"}
            </Text>
            {app.project && app.currentProjectId ? (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => setShowProjectSettingsModal(true)}
              >
                <IconEdit size={14} />
              </ActionIcon>
            ) : null}
          </Group>

          <Group gap="md">
            <SaveStatus />
            <LightsStatus />
            <HardwareInterfaceStatus />
          </Group>
        </Group>
      </div>

      <NewProjectModal
        opened={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreated={(id) => app.setCurrentProjectId(id)}
      />

      <OpenProjectModal
        opened={showOpenProjectModal}
        onClose={() => setShowOpenProjectModal(false)}
        onSelected={(id) => app.setCurrentProjectId(id)}
      />

      <ProjectSettingsModal
        opened={showProjectSettingsModal}
        onClose={() => setShowProjectSettingsModal(false)}
      />
    </>
  );
}
