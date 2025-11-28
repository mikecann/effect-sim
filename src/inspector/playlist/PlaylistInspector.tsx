import { Accordion, Stack, Text } from "@mantine/core";
import { IconSettings, IconList, IconPlayerPlay } from "@tabler/icons-react";
import PlaylistSettingsSection from "./PlaylistSettingsSection";
import { PlaylistPlayerModel } from "./PlaylistPlayerModel";
import { PlaylistPlayer } from "./PlaylistPlayer";
import { PlaylistPlayerControls } from "./PlaylistPlayerControls";
import { PlaylistSequencesSection } from "./PlaylistSequencesSection";
import { PlaylistPlayerComponent } from "./PlaylistPlayerComponent";
import { PlaylistModel } from "../../../shared/models/PlaylistModel";
import { useMemo, useEffect } from "react";

export default function PlaylistInspector({
  playlist,
}: {
  playlist: PlaylistModel;
}) {
  const playerModel = useMemo(
    () => new PlaylistPlayerModel(playlist),
    [playlist],
  );

  return (
    <>
      {/* Render SequenceRuntime when playing */}
      {playlist.sequences.length > 0 && (
        <>
          <PlaylistPlayerComponent model={playerModel} />
          <PlaylistPlayer model={playerModel} />
        </>
      )}

      <Accordion
        multiple
        defaultValue={["playback", "settings", "sequences"]}
        variant="contained"
        styles={{
          panel: {
            backgroundColor: "var(--color-tabset-background)",
          },
          control: {
            paddingTop: 0,
            paddingBottom: 0,
            minHeight: "unset",
          },
          label: {
            fontSize: 14,
          },
        }}
      >
        <Accordion.Item value="settings">
          <Accordion.Control icon={<IconSettings size={16} />}>
            Settings
          </Accordion.Control>
          <Accordion.Panel>
            <PlaylistSettingsSection playlist={playlist} />
          </Accordion.Panel>
        </Accordion.Item>

        {playlist.sequences.length > 0 && (
          <Accordion.Item value="playback">
            <Accordion.Control icon={<IconPlayerPlay size={16} />}>
              Playback
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <PlaylistPlayerControls model={playerModel} />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        <Accordion.Item value="sequences">
          <Accordion.Control icon={<IconList size={16} />}>
            Manage Sequences
          </Accordion.Control>
          <Accordion.Panel>
            <PlaylistSequencesSection
              playlist={playlist}
              playerModel={playerModel}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </>
  );
}
