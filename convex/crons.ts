import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Photos from discarded mapping sessions, and uploads no session took.
crons.daily(
  "clean up mapping photos",
  { hourUTC: 4, minuteUTC: 17 },
  internal.mapping.cleanUpPhotos,
  {},
);

export default crons;
