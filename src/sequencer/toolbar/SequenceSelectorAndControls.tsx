import { useState } from "react";
import { ActionIcon, Group, Select, Tooltip } from "@mantine/core";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import type { Id } from "../../../convex/_generated/dataModel";
import EditSequenceModal from "./EditSequenceModal";
import CreateSequenceModal from "./CreateSequenceModal";
import { useSequencerPanel } from "../SequencerContext";
import { useApp } from "../../common/AppContext";

export default function SequenceSelectorAndControls() {
  const sequencer = useSequencerPanel();
  const project = sequencer.app.project;

  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  if (!project) return null;
  const sequences = project.sequences;

  return (
    <Group gap="xs">
      <Select
        size="xs"
        data={sequences.map((s) => ({ label: s.name, value: s._id }))}
        value={sequencer.sequence?.sequence._id ?? null}
        onChange={(value) =>
          sequencer.setSelectedSequence(value as Id<"sequences"> | null)
        }
        placeholder="Select a sequence"
        checkIconPosition="right"
        searchable={false}
        nothingFoundMessage="No sequences"
        w={200}
      />
      <Tooltip label="Create sequence" withArrow>
        <ActionIcon
          size="sm"
          variant="subtle"
          aria-label="Create sequence"
          onClick={() => setCreateOpen(true)}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </Tooltip>
      {sequencer.sequence ? (
        <>
          <Tooltip label="Edit sequence" withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Edit sequence"
              onClick={() => setEditOpen(true)}
            >
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
          <EditSequenceModal
            opened={editOpen}
            onClose={() => setEditOpen(false)}
            sequence={sequencer.sequence.sequence}
            onDeleted={() => sequencer.setSelectedSequence(null)}
          />
        </>
      ) : null}
      <CreateSequenceModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(sequence) => sequencer.setSelectedSequence(sequence)}
      />
    </Group>
  );
}
