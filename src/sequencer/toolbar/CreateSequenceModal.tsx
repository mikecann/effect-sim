import { useMemo } from "react";
import { Button, Modal, Stack, TextInput, NumberInput } from "@mantine/core";
import { useApp } from "../../common/AppContext";
import { useAdaptiveStep } from "../../common/hooks/useAdaptiveStep";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";

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
    () => project.newSequence({ name: "New Sequence", numFrames: 500 }),
    [project],
  );

  const step = useAdaptiveStep(newSequence.numFrames);

  // It has its key already, so it's added at once and saves in the
  // background (the menu bar's save status shows it).
  const save = () => {
    if (!newSequence.name.trim()) return;
    project.addSequence(newSequence);
    onCreated(newSequence);
    onClose();
  };

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
              save();
            }
          }}
        />
        <NumberInput
          label="Number of Frames"
          value={newSequence.numFrames}
          step={step}
          onChange={(value) => newSequence.setNumFrames(value as number)}
          min={1}
          max={10000}
        />
        <Button disabled={!newSequence.name.trim()} onClick={save}>
          Create
        </Button>
      </Stack>
    </Modal>
  );
}
