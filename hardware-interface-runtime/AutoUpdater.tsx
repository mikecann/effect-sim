import { useEffect } from "react";
import { spawn } from "child_process";
import { GitUpdateChecker } from "./utils/GitUpdateChecker";
import { logger } from "./utils/logger";
import { HWIRAppModel } from "./models/HWIRAppModel";

/**
 * Component that periodically checks for git updates and automatically restarts
 * the application when updates are available.
 */
export const AutoUpdater = ({
  app,
  checkIntervalMs = 1 * 60 * 1000, // 1 minute default
}: {
  app: HWIRAppModel;
  checkIntervalMs?: number;
}) => {
  const projectId = app.project?._id;
  const playlistId = app.playlist?._id;

  useEffect(() => {
    if (!projectId) return;

    logger.info(
      `Auto-updater enabled. Checking for updates every ${checkIntervalMs / 1000}s`,
    );

    let isChecking = false;
    const checker = new GitUpdateChecker();

    const checkAndUpdate = async () => {
      if (isChecking) {
        logger.info("Update check already in progress, skipping");
        return;
      }

      isChecking = true;

      try {
        const isGitRepo = await checker.isGitRepository();
        if (!isGitRepo) {
          logger.warn("Not in a git repository, skipping update check");
          return;
        }

        const result = await checker.checkForUpdates();

        if (result.error) {
          logger.error("Update check failed:", result.error);
          return;
        }

        if (!result.hasUpdate) return;

        // Update available, check if safe to update
        const isClean = await checker.isWorkingDirectoryClean();
        if (!isClean) {
          logger.warn(
            "Working directory has uncommitted changes, skipping auto-update",
          );
          return;
        }

        // Trigger update
        logger.success("Update available and safe to apply!");
        await triggerUpdate();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error("Error during update check:", errorMsg);
      } finally {
        isChecking = false;
      }
    };

    const triggerUpdate = async () => {
      logger.info("========================================");
      logger.info("STARTING AUTO-UPDATE PROCESS");
      logger.info("========================================");

      const updateScript = "hardware-interface-runtime/updateAndRestart.ts";
      const scriptArgs = [
        updateScript,
        "--project",
        projectId,
        "--playlist",
        playlistId ?? "null",
      ];

      logger.info(`Running update script with args: ${scriptArgs.join(" ")}`);

      await new Promise<void>((resolve) => {
        const child = spawn("bun", scriptArgs, { stdio: "inherit" });
        child.on("exit", (code) => {
          logger.info(`Update script exited with code ${code ?? "unknown"}`);
          resolve();
        });
      });

      logger.info("Update complete, exiting so supervisor can restart cleanly...");
      process.exit(0);
    };

    // Initial check after 10 seconds
    const initialTimer = setTimeout(checkAndUpdate, 10_000);

    // Periodic checks
    const interval = setInterval(checkAndUpdate, checkIntervalMs);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [checkIntervalMs, projectId, playlistId]);

  return null;
};
