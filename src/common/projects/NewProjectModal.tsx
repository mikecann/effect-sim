import { useMutation } from "convex/react";
import { useState } from "react";
import { Button, Modal, Stack, TextInput } from "@mantine/core";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { useApiErrorHandler } from "../errors";

export default function NewProjectModal({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (id: Id<"projects">) => void;
}) {
  const [name, setName] = useState("My Project");
  const [isSaving, setIsSaving] = useState(false);
  const onApiError = useApiErrorHandler();
  const createProject = useMutation(api.editor.createProject);

  const save = async () => {
    if (isSaving || !name.trim()) return;
    setIsSaving(true);
    try {
      onCreated(await createProject({ name: name.trim() }));
      onClose();
    } catch (error) {
      onApiError(error);
    } finally {
      setIsSaving(false);
    }
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
          value={name}
          autoFocus
          disabled={isSaving}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
        <Button
          loading={isSaving}
          disabled={!name.trim() || isSaving}
          onClick={save}
        >
          Create Project
        </Button>
      </Stack>
    </Modal>
  );
}
