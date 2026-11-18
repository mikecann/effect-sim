import { Button, Center } from "@mantine/core";
import { useSequencerPanel } from "../SequencerContext";
import { useApp } from "../../common/AppContext";
import { useEffect } from "react";
import { autorun } from "mobx";

export default function NoSequenceSelectedContent() {
  const project = useApp().getProject();
  const sequencer = useSequencerPanel();

  useEffect(
    () =>
      autorun(() => {
        if (sequencer.sequence) return;
        if (!project) return;
        if (project.sequences.length === 0) return;
        sequencer.selectFirstSequence();
      }),
    [project, sequencer],
  );

  return (
    <Center style={{ flex: 1, flexDirection: "column", gap: 8 }}>
      <Button
        onClick={() => {
          const newSequence = project.newSequence({
            name: "New Sequence",
            numFrames: 500,
          });
          project.addSequence(newSequence);
          sequencer.setSelectedSequenceId(newSequence.key);
        }}
      >
        Create Sequence
      </Button>
    </Center>
  );
}
