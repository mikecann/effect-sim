import type { PlaylistKey } from "../shared/models/docs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { Command } from "commander";
import prompts from "prompts";
import { iife } from "../shared/misc";
import { logger } from "./utils/logger";

export const runSetupCLI = async (convexUrl: string) => {
  const program = new Command();
  program
    .option("-p, --project <id>", "Project ID")
    .option("-l, --playlist <id>", "Playlist ID (or 'null' for listen mode)")
    .option("--dry-run", "Run without sending UDP, mutations or Home Assistant")
    .option("--smoke", "Boot, run ~2 s of frames without side effects, exit")
    .option(
      "--local-convex-writes",
      "With --dry-run and a local backend: let Convex mutations through",
    )
    .parse(process.argv);

  const options = program.opts();
  const client = new ConvexHttpClient(convexUrl);

  const projectId: Id<"projects"> = await iife(async () => {
    if (options.project) return options.project as Id<"projects">;
    if (options.smoke) {
      logger.error("--smoke needs --project");
      process.exit(1);
    }
    const projects = await client.query(api.functions.listProjects, {});
    if (projects.length === 0) {
      logger.error("No projects found.");
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
    if (options.playlist === "null") return null;
    if (options.playlist) return options.playlist as PlaylistKey;
    if (options.smoke) return null;
    const playlists = await client.query(
      api.functions.listPlaylistsForProject,
      {
        projectId: projectId as Id<"projects">,
      },
    );
    if (playlists.length === 0) {
      logger.error("No playlists found.");
      process.exit(1);
    }

    const response = await prompts({
      type: "select",
      name: "playlistId",
      message: "Select a playlist to play (or None to listen)",
      choices: [
        { title: "None (Listen Mode)", value: null },
        ...playlists.map((p) => ({ title: p.name, value: p.key })),
      ],
    });
    return response.playlistId as PlaylistKey;
  });

  return { projectId, playlistId };
};
