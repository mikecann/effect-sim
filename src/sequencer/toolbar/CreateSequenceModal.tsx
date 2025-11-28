import { useMemo } from "react";
import { Button, Modal, Stack, TextInput, NumberInput } from "@mantine/core";
import type { Id } from "../../../convex/_generated/dataModel";
import { useApp } from "../../common/AppContext";
import { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import { createTempId } from "../../../shared/models/types";

export default function CreateSequenceModal({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (sequence: SequenceModel) => void;
}) {
  const project = useApp().getProject();

  const newSequence = useMemo(
    () =>
      new SequenceModel({
        name: "New Sequence",
        numFrames: 500,
        tracks: [],
        projectId: project._id,
        _creationTime: 0,
        _id: createTempId("sequences"),
      }),
    [project],
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Create Sequence" size="sm">
      <Stack gap="sm">
        <TextInput
          label="Name"
          value={newSequence.name}
          autoFocus
          onChange={(e) => newSequence.setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newSequence.name.trim()) {
              e.preventDefault();
              project.addSequence(newSequence);
              onCreated(newSequence);
              onClose();
            }
          }}
        />
        <NumberInput
          label="Number of Frames"
          value={newSequence.numFrames}
          onChange={(value) => newSequence.setNumFrames(value as number)}
          min={1}
          max={10000}
        />
        <Button
          disabled={!newSequence.name.trim()}
          onClick={() => {
            if (!newSequence.name.trim()) return;
            project.addSequence(newSequence);
            onCreated(newSequence);
            onClose();
          }}
        >
          Create
        </Button>
      </Stack>
    </Modal>
  );
}
