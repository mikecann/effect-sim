import { Button, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import NewProjectModal from "./NewProjectModal";
import OpenProjectModal from "./OpenProjectModal";
import { useApp } from "../AppContext";

export default function WelcomeModal() {
  const appModel = useApp();
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showOpenProjectModal, setShowOpenProjectModal] = useState(false);

  return (
    <>
      <Modal
        opened={true}
        onClose={() => {}}
        title="Welcome to Effect Sim"
        size="md"
        centered
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
      >
        <Stack gap="md">
          <Text size="sm">
            Effect Sim is a powerful tool for designing and sequencing Christmas
            light displays. Create beautiful animations, organize your light
            strings, and bring your holiday vision to life.
          </Text>
          <Text size="sm">
            To get started, create a new project or open an existing one.
          </Text>
          <Stack gap="sm">
            <Button size="md" onClick={() => setShowNewProjectModal(true)}>
              Create New Project
            </Button>
            <Button
              size="md"
              variant="light"
              onClick={() => setShowOpenProjectModal(true)}
            >
              Open Existing Project
            </Button>
          </Stack>
        </Stack>
      </Modal>
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
    </>
  );
}
