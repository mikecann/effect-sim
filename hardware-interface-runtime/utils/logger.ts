/**
 * Logger utility for HWIR with timestamps and file logging
 * Includes simple log rotation to prevent unbounded growth
 */

import {
  appendFileSync,
  statSync,
  renameSync,
  unlinkSync,
  fstatSync,
  ftruncateSync,
} from "fs";

const LOG_FILE = "hwir-debug.log";
const LOG_FILE_OLD = "hwir-debug.old.log";
const MAX_LOG_SIZE = 1024 * 1024; // 1MB max before rotation
const MAX_CONSOLE_LOG_SIZE = 10 * 1024 * 1024;

/**
 * Under launchd, stdout and stderr go to logs/hwir.log and logs/hwir.error.log,
 * which launchd never rotates (they once reached 5 GB). We can't rename a file
 * we only hold by descriptor, so we empty it instead. launchd opens them for
 * appending, so later writes start again from the top.
 */
const capConsoleLogFile = (fd: number) => {
  try {
    const stats = fstatSync(fd);
    // A terminal or pipe isn't a file, so interactive runs are left alone
    if (stats.isFile() && stats.size > MAX_CONSOLE_LOG_SIZE)
      ftruncateSync(fd, 0);
  } catch {
    // Not fatal, the log just keeps growing
  }
};

let checkCounter = 0;
const CHECK_INTERVAL = 50; // Check size every 50 writes

const rotateIfNeeded = () => {
  // Only check periodically to avoid stat() on every write
  checkCounter++;
  if (checkCounter < CHECK_INTERVAL) return;
  checkCounter = 0;

  capConsoleLogFile(1);
  capConsoleLogFile(2);

  try {
    const stats = statSync(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      // Delete old backup if exists, then rename current to .old
      try {
        unlinkSync(LOG_FILE_OLD);
      } catch {
        // ignore if doesn't exist
      }
      renameSync(LOG_FILE, LOG_FILE_OLD);
    }
  } catch {
    // File doesn't exist yet, that's fine
  }
};

const timestamp = () => new Date().toISOString();

const writeToFile = (level: string, message: string, args: unknown[]) => {
  try {
    rotateIfNeeded();
    const argsStr = args.length > 0 ? " " + args.map(String).join(" ") : "";
    const line = `[${timestamp()}] [${level}] ${message}${argsStr}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {
    // Silently fail if we can't write to log
  }
};

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`[${timestamp()}] [INFO]`, message, ...args);
    writeToFile("INFO", message, args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[${timestamp()}] [WARN]`, message, ...args);
    writeToFile("WARN", message, args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[${timestamp()}] [ERROR]`, message, ...args);
    writeToFile("ERROR", message, args);
  },
  success: (message: string, ...args: unknown[]) => {
    console.log(`[${timestamp()}] [SUCCESS]`, message, ...args);
    writeToFile("SUCCESS", message, args);
  },
};
