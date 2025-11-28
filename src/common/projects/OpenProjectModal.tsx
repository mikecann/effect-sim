import { Button, Modal, Stack, Text } from "@mantine/core";
import type { Id } from "../../../convex/_generated/dataModel";
import { useApp } from "../AppContext";

export default function OpenProjectModal({
  opened,
  onClose,
  onSelected,
}: {
  opened: boolean;
  onClose: () => void;
  onSelected: (id: Id<"projects">) => void;
}) {
  const app = useApp();

  return (
    <Modal opened={opened} onClose={onClose} title="Open Project" size="sm">
      <Stack gap="xs">
        {app.projects ? (
          app.projects.length === 0 ? (
            <Text size="sm" c="dimmed">
              No projects found. Create a new project to get started.
            </Text>
          ) : (
            app.projects.map((project) => (
              <Button
                key={project._id}
                variant="light"
                fullWidth
                onClick={() => {
                  onSelected(project._id);
                  onClose();
                }}
              >
                {project.name}
              </Button>
            ))
          )
        ) : (
          <Text size="sm" c="dimmed">
            Loading projects...
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
