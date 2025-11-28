import { useEffect, useState, useRef, startTransition } from "react";
import {
  Button,
  Group,
  Modal,
  Stack,
  TextInput,
  NumberInput,
} from "@mantine/core";
import { useConfirmation } from "../../common/confirmation/ConfirmationProvider";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";

export default function EditSequenceModal({
  opened,
  onClose,
  sequence,
  onDeleted,
}: {
  opened: boolean;
  onClose: () => void;
  sequence: SequenceModel;
  onDeleted: () => void;
}) {
  const { confirm } = useConfirmation();
  return (
    <Modal opened={opened} onClose={onClose} title="Edit Sequence" size="sm">
      <Stack gap="sm">
        <TextInput
          label="Name"
          value={sequence.name}
          onChange={(e) => sequence.setName(e.currentTarget.value)}
        />
        <NumberInput
          label="Number of Frames"
          value={sequence.numFrames}
          onChange={(value) => sequence.setNumFrames(value as number)}
          min={1}
          max={10000}
        />
        <Group justify="space-between">
          <Button
            color="red"
            variant="light"
            onClick={async () => {
              const confirmed = await confirm({
                title: "Delete sequence?",
                content: `Are you sure you want to delete "${sequence.name}"? This cannot be undone.`,
                confirmButton: "Delete",
                confirmButtonColor: "red",
              });
              if (!confirmed) return;
              sequence.remove();
              onDeleted();
              onClose();
            }}
          >
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
