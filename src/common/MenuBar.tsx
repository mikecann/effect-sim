import { ActionIcon, Divider, Group, Menu, Text } from "@mantine/core";
import {
  IconEdit,
  IconExternalLink,
  IconChevronRight,
} from "@tabler/icons-react";
import { useFlexLayout } from "./FlexLayoutProvider";
import { notifications } from "@mantine/notifications";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { iife } from "../../shared/misc";
import { getConvexDeploymentName } from "./utils/convex";
import { useApp } from "./AppContext";
import { useState, useEffect } from "react";
import NewProjectModal from "./projects/NewProjectModal";
import OpenProjectModal from "./projects/OpenProjectModal";
import WelcomeModal from "./projects/WelcomeModal";
import ProjectSettingsModal from "./projects/ProjectSettingsModal";
import { HardwareInterfaceStatus } from "./hardware-interface/HardwareInterfaceStatus";

export default function MenuBar() {
  const { showInspector, showSequencer, showPlaylists, resetLayout, model } =
    useFlexLayout();
  const appModel = useApp();
  const project = appModel.project;

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showOpenProjectModal, setShowOpenProjectModal] = useState(false);
  const [showProjectSettingsModal, setShowProjectSettingsModal] =
    useState(false);

  // const xx = useQuery(api.experiments3.listQueryFluentExtended, {});
  // console.log("XXXXX", xx ? xx.map((x) => x._id) : []);

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

            {project && (
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
                <Menu.Item onClick={resetLayout}>Reset Layout</Menu.Item>
                <Menu.Item
                  onClick={() => {
                    const json = model.toJson();
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
                <Menu.Item onClick={showInspector}>Show Inspector</Menu.Item>
                <Menu.Item onClick={showSequencer}>Show Sequencer</Menu.Item>
                <Menu.Item onClick={showPlaylists}>Show Playlists</Menu.Item>
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
                    if (project)
                      project.updateSettings({
                        nightMode: !project.settings.nightMode,
                      });
                  }}
                >
                  {project?.settings.nightMode ? "✓ " : ""}Night Mode
                </Menu.Item>
                <Menu.Item
                  onClick={() => {
                    if (project)
                      project.updateSettings({
                        lightsOnTop: !project.settings.lightsOnTop,
                      });
                  }}
                >
                  {project?.settings.lightsOnTop ? "✓ " : ""}Lights On Top
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
                        project?.updateSettings({ cameraControl: "orbit" })
                      }
                    >
                      {(project?.settings.cameraControl === "orbit" ||
                        !project?.settings.cameraControl) &&
                        "✓ "}
                      Orbit
                    </Menu.Item>
                    <Menu.Item
                      onClick={() =>
                        project?.updateSettings({ cameraControl: "fly" })
                      }
                    >
                      {project?.settings.cameraControl === "fly" && "✓ "}Fly
                    </Menu.Item>
                    <Menu.Item
                      onClick={() =>
                        project?.updateSettings({
                          cameraControl: "first_person",
                        })
                      }
                    >
                      {project?.settings.cameraControl === "first_person" &&
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
              {project ? project.name : "No project selected"}
            </Text>
            {project && appModel.currentProjectId ? (
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

          <Group gap="xs">
            <HardwareInterfaceStatus />
          </Group>
        </Group>
      </div>

      <NewProjectModal
        opened={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreated={(id) => appModel.setCurrentProjectId(id)}
      />

      <OpenProjectModal
        opened={showOpenProjectModal}
        onClose={() => setShowOpenProjectModal(false)}
        onSelected={(id) => appModel.setCurrentProjectId(id)}
      />

      <ProjectSettingsModal
        opened={showProjectSettingsModal}
        onClose={() => setShowProjectSettingsModal(false)}
      />
    </>
  );
}
