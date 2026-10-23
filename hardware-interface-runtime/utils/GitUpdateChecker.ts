import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";

const execAsync = promisify(exec);

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentCommit?: string;
  remoteCommit?: string;
  error?: string;
}

/**
 * Checks if there are updates available from git remote
 */
export class GitUpdateChecker {
  private checkInProgress = false;

  /**
   * Check if updates are available from remote
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (this.checkInProgress) {
      logger.warn("Update check already in progress, skipping");
      return { hasUpdate: false };
    }

    this.checkInProgress = true;

    try {
      // Get current branch
      const branch = await this.getCurrentBranch();
      if (!branch)
        return {
          hasUpdate: false,
          error: "Could not determine current branch",
        };

      // Fetch latest from remote (timeout after 30 seconds)
      try {
        await this.execWithTimeout("git fetch origin", 30000);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error("Failed to fetch from remote:", errorMsg);
        return { hasUpdate: false, error: `Git fetch failed: ${errorMsg}` };
      }

      // Get local commit
      const currentCommit = await this.getCommitHash("HEAD");
      if (!currentCommit)
        return { hasUpdate: false, error: "Could not get current commit" };

      // Get remote commit
      const remoteCommit = await this.getCommitHash(`origin/${branch}`);
      if (!remoteCommit)
        return {
          hasUpdate: false,
          error: "Could not get remote commit",
          currentCommit,
        };

      // Check if we're behind
      const hasUpdate = currentCommit !== remoteCommit;

      // Only log when there's something to do: this runs every minute, and
      // "no updates" lines added ~100 MB a year to launchd's log.
      if (hasUpdate)
        logger.success(
          `Update available! Current: ${currentCommit.slice(0, 7)}, Remote: ${remoteCommit.slice(0, 7)}`,
        );

      return {
        hasUpdate,
        currentCommit,
        remoteCommit,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Error checking for updates:", errorMsg);
      return { hasUpdate: false, error: errorMsg };
    } finally {
      this.checkInProgress = false;
    }
  }

  /**
   * Get the current git branch
   */
  private async getCurrentBranch(): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD");
      return stdout.trim();
    } catch (error) {
      logger.error("Failed to get current branch:", error);
      return null;
    }
  }

  /**
   * Get commit hash for a ref
   */
  private async getCommitHash(ref: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`git rev-parse ${ref}`);
      return stdout.trim();
    } catch (error) {
      logger.error(`Failed to get commit hash for ${ref}:`, error);
      return null;
    }
  }

  /**
   * Execute a command with timeout
   */
  private async execWithTimeout(
    command: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);

      execAsync(command)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Check if we're in a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await execAsync("git rev-parse --git-dir");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if working directory is clean (no uncommitted changes)
   */
  async isWorkingDirectoryClean(): Promise<boolean> {
    try {
      const { stdout } = await execAsync("git status --porcelain");
      return stdout.trim() === "";
    } catch {
      return false;
    }
  }
}
