import { ProjectModel } from "../../../shared/models/ProjectModel";
import { api } from "../../../convex/_generated/api";
import { TableSyncer } from "./TableSyncer";
import { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import { PlaylistModel } from "../../../shared/models/PlaylistModel";
import { usePersistedQuery } from "../hooks/usePersistedQuery";

export const ProjectSyncer = ({ project }: { project: ProjectModel }) => {
  const { data: nodes, isStale: isNodesStale } = usePersistedQuery(
    api.model.listNodesForProject,
    {
      projectId: project._id,
    },
  );

  const { data: sequences, isStale: isSequencesStale } = usePersistedQuery(
    api.model.listSequencesForProject,
    {
      projectId: project._id,
    },
  );

  const { data: playlists, isStale: isPlaylistsStale } = usePersistedQuery(
    api.model.listPlaylistsForProject,
    {
      projectId: project._id,
    },
  );

  return (
    <>
      <TableSyncer
        table="nodes"
        models={project.nodes}
        serverValues={nodes}
        createModel={(doc) => project.createNodeModel(doc)}
        isStale={isNodesStale}
      />
      <TableSyncer
        table="sequences"
        models={project.sequences}
        serverValues={sequences}
        createModel={(doc) => new SequenceModel(doc, project)}
        isStale={isSequencesStale}
      />
      <TableSyncer
        table="playlists"
        models={project.playlists}
        serverValues={playlists}
        createModel={(doc) => new PlaylistModel(doc, project)}
        isStale={isPlaylistsStale}
      />
    </>
  );
};
