/* eslint-disable react-refresh/only-export-components */
import { render } from "react-nil";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { Command } from "commander";
import prompts from "prompts";
import { App } from "./App";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

// CLI setup
const program = new Command();
program.option("-p, --project <id>", "Project ID").parse(process.argv);

const options = program.opts();
let projectId = options.project;

if (!projectId) {
  const client = new ConvexHttpClient(convexUrl);
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

  projectId = response.projectId;
}

if (!projectId) {
  console.log("No project selected.");
  process.exit(0);
}

const convex = new ConvexReactClient(convexUrl);

// Mount the component so hooks run in Bun
render(
  <ConvexProvider client={convex}>
    <App projectId={projectId as Id<"projects">} />
  </ConvexProvider>,
);
