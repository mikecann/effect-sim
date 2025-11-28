import { Modal, Stack, TextInput } from "@mantine/core";
import type { Id } from "../../../convex/_generated/dataModel";
import { useApp } from "../AppContext";

export default function EditProjectModal({
  opened,
  onClose,
  projectId,
}: {
  opened: boolean;
  onClose: () => void;
  projectId: Id<"projects"> | null;
}) {
  const project = useApp().getProject();

  return (
    <Modal opened={opened} onClose={onClose} title="Edit Project" size="sm">
      <Stack gap="sm">
        <TextInput
          label="Project Name"
          value={project.name}
          autoFocus
          onChange={(e) => project.setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onClose();
            }
          }}
        />
      </Stack>
    </Modal>
  );
}
