import { Menu } from "@mantine/core";
import { useSequence } from "../SequencerContext";
import { createTempId } from "../../../shared/models/types";
import { stringEffectDefinitionsArray } from "../../common/effects/stringEffectDefinitions";

export function TrackContextMenu() {
  const sequenceUI = useSequence();
  const context = sequenceUI.contextMenu;
  const sequence = sequenceUI.sequence;
  const defaultEffect = stringEffectDefinitionsArray[0];

  return (
    <Menu
      opened={context !== null}
      onClose={() => sequenceUI.closeContextMenu()}
      position="right-start"
      shadow="md"
      withinPortal
      closeOnItemClick
    >
      <Menu.Target>
        <div
          style={{
            position: "fixed",
            left: context ? context.clientX : -9999,
            top: context ? context.clientY : -9999,
            width: 1,
            height: 1,
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Add</Menu.Label>
        <Menu.Divider />
        <Menu.Item
          onClick={() => {
            if (!context || !defaultEffect) return;
            const track = sequence.tracks.find((t) => t.id === context.trackId);
            if (!track) return;

            const eventId = createTempId("sequences");
            try {
              sequence.addEvent(context.trackId, {
                id: eventId,
                kind: "string_effect",
                effectDefinitionId: defaultEffect.id,
                startFrame: context.frameAtClick,
                endFrame: Math.min(
                  sequence.numFrames,
                  context.frameAtClick + 10,
                ),
                appliesTo: { kind: "nodes", nodeIds: [] },
              });
            } catch (error) {
              console.error("Failed to add event:", error);
            } finally {
              sequenceUI.closeContextMenu();
            }
          }}
        >
          String Effect
        </Menu.Item>
        <Menu.Item
          onClick={() => {
            if (!context) return;
            const track = sequence.tracks.find((t) => t.id === context.trackId);
            if (!track) return;

            const eventId = createTempId("sequences");
            try {
              sequence.addEvent(context.trackId, {
                id: eventId,
                kind: "switch_effect",
                effectDefinitionId: "turnOnThenOff",
                startFrame: context.frameAtClick,
                endFrame: Math.min(
                  sequence.numFrames,
                  context.frameAtClick + 10,
                ),
                appliesTo: { kind: "nodes", nodeIds: [] },
              });
            } catch (error) {
              console.error("Failed to add event:", error);
            } finally {
              sequenceUI.closeContextMenu();
            }
          }}
        >
          Switch Control
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
