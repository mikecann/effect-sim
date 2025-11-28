import { Button, Center } from "@mantine/core";
import { useSequencerPanel } from "../SequencerContext";
import { useApp } from "../../common/AppContext";
import { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import { createTempId } from "../../../shared/models/types";
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
    [],
  );

  return (
    <Center style={{ flex: 1, flexDirection: "column", gap: 8 }}>
      <Button
        onClick={() => {
          const newSequence = new SequenceModel({
            name: "New Sequence",
            numFrames: 500,
            tracks: [],
            projectId: project._id,
            _creationTime: 0,
            _id: createTempId("sequences"),
          });
          project.addSequence(newSequence);
          sequencer.setSelectedSequence(newSequence);
        }}
      >
        Create Sequence
      </Button>
    </Center>
  );
}
