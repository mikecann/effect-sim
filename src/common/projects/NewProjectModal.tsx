import { useMemo } from "react";
import { Button, Modal, Stack, TextInput } from "@mantine/core";
import type { Id } from "../../../convex/_generated/dataModel";
import { ProjectModel } from "../../../shared/models/ProjectModel";
import { createTempId } from "../../../shared/models/types";
import { useApp } from "../AppContext";

export default function NewProjectModal({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (id: Id<"projects">) => void;
}) {
  const app = useApp();

  const project = useMemo(
    () =>
      new ProjectModel({
        name: "My Project",
        _id: createTempId("projects"),
        _creationTime: 0,
        settings: {
          nightMode: false,
          lightsOnTop: false,
        },
      }),
    [],
  );

  const save = () => {
    app.addProject(project);
    onClose();
    onCreated(project._id);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Project"
      size="sm"
    >
      <Stack gap="sm">
        <TextInput
          label="Project Name"
          value={project.name}
          autoFocus
          onChange={(e) => project.setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && project.name.trim()) {
              e.preventDefault();
              save();
            }
          }}
        />
        <Button disabled={!project.name.trim()} onClick={save}>
          Create Project
        </Button>
      </Stack>
    </Modal>
  );
}
