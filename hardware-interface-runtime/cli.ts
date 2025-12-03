import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Doc, Id } from "../convex/_generated/dataModel";
import { Command } from "commander";
import prompts from "prompts";
import { iife } from "../shared/misc";

export const runSetupCLI = async (convexUrl: string) => {
  // CLI setup
  const program = new Command();
  program.option("-p, --project <id>", "Project ID").parse(process.argv);
  program.option("-pl, --playlist <id>", "Playlist ID").parse(process.argv);

  const options = program.opts();
  const client = new ConvexHttpClient(convexUrl);

  const projectId: Id<"projects"> = await iife(async () => {
    if (options.project) return options.project as Id<"projects">;
    const projects = await client.query(api.model.listProjects, {});
    if (projects.length === 0) {
      console.error("No projects found.");
      process.exit(1);
    }
    const response = await prompts({
      type: "select",
      name: "projectId",
      message: "Select a project to run",
      choices: projects.map((p) => ({ title: p.name, value: p._id })),
    });
    return response.projectId as Id<"projects">;
  });

  const playlistId = await iife(async () => {
    if (options.playlist) return options.playlist as Id<"playlists">;
    const playlists = await client.query(api.model.listPlaylistsForProject, {
      projectId: projectId as Id<"projects">,
    });
    if (playlists.length === 0) {
      console.error("No playlists found.");
      process.exit(1);
    }
    const response = await prompts({
      type: "select",
      name: "playlistId",
      message: "Select a playlist to play (or None to listen)",
      choices: [
        { title: "None (Listen Mode)", value: null },
        ...playlists.map((p) => ({ title: p.name, value: p._id })),
      ],
    });
    return response.playlistId as Id<"playlists">;
  });

  return {
    projectId,
    playlistId,
  };
};
