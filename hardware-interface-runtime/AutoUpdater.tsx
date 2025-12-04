import { useEffect, useMemo, useRef, useState } from "react";
import { spawn } from "child_process";
import { GitUpdateChecker } from "./utils/GitUpdateChecker";
import { logger } from "./utils/logger";

interface AutoUpdaterProps {
  /**
   * Check interval in milliseconds (default: 5 minutes)
   */
  checkIntervalMs?: number;
  /**
   * Enable auto-updates (default: true, can be disabled via env var)
   */
  enabled?: boolean;
}

/**
 * Component that periodically checks for git updates and automatically restarts
 * the application when updates are available.
 *
 * Runs in the background using useEffect intervals.
 */
export const AutoUpdater = ({
  checkIntervalMs = 1 * 60 * 1000, // 1 minutes default
}: AutoUpdaterProps) => {
  useEffect(() => {
    logger.info(
      `Auto-updater enabled. Checking for updates every ${checkIntervalMs / 1000}s`,
    );


    let isChecking = false;
    let isUpdateInProgress = false;

    const checker = new GitUpdateChecker();

    // Initial validation
    const validateGitSetup = async () => {
      const isGitRepo = await checker.isGitRepository();
      if (!isGitRepo) {
        logger.warn("Not in a git repository, auto-updater will not function");
        return false;
      }

      logger.info("Git repository detected");
      return true;
    };

    const id = setInterval(() => {
      checker.checkForUpdates();

      // Perform update check
      const checkAndUpdate = async () => {
        if (isChecking || isUpdateInProgress) {
          logger.info("Update check or update already in progress, skipping");
          return;
        }

        isChecking = true;

        try {
          logger.info("Checking for updates...");
          const result = await checker.checkForUpdates();

          if (result.error) {
            logger.error("Update check failed:", result.error);
            return;
          }

          if (!result.hasUpdate) {
            logger.info("No updates available");
            return;
          }

          // Update available, check if safe to update
          const isClean = await checker.isWorkingDirectoryClean();
          if (!isClean) {
            logger.warn(
              "Working directory has uncommitted changes, skipping auto-update for safety",
            );
            logger.warn(
              "Please commit or stash changes to enable auto-updates",
            );
            return;
          }

          // Trigger update
          logger.success("Update available and safe to apply!");
          await triggerUpdate();
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          logger.error("Error during update check:", errorMsg);
        } finally {
          isChecking = false;
        }
      };

      // Trigger the update and restart process
      const triggerUpdate = async () => {
        if (isUpdateInProgress) {
          logger.warn("Update already in progress");
          return;
        }

        isUpdateInProgress = true;

        try {
          logger.info("========================================");
          logger.info("STARTING AUTO-UPDATE PROCESS");
          logger.info("========================================");

          // Spawn the update script as a detached process
          logger.info("Spawning update script...");

          const updateScript = "hardware-interface-runtime/updateAndRestart.ts";

          const child = spawn("bun", [updateScript], {
            detached: true,
            stdio: ["ignore", "inherit", "inherit"],
            shell: true,
          });

          // Unref so this process can exit
          child.unref();

          logger.info("Update script spawned successfully");
          logger.info("Shutting down current process...");

          // Give the spawn a moment to fully detach
          setTimeout(() => {
            logger.info("Goodbye! Restarting...");
            process.exit(0);
          }, 1000);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          logger.error("Failed to trigger update:", errorMsg);
          isUpdateInProgress = false;
        }
      };

      // Validate and start checking
      validateGitSetup().then((isValid) => {
        if (!isValid) return;

        // Do initial check after a short delay
        const initialCheckTimer = setTimeout(() => {
          checkAndUpdate();
        }, 10000); // Check 10 seconds after startup

        // Set up periodic checks
        const interval = setInterval(() => {
          checkAndUpdate();
        }, checkIntervalMs);

        return () => {
          clearTimeout(initialCheckTimer);
          clearInterval(interval);
        };
      });
    }, checkIntervalMs);

    return () => clearInterval(id);
  }, [checkIntervalMs]);

  // This component doesn't render anything
  return null;
};
