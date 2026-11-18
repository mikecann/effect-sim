import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { useFrameContext } from "../src/common/FixedFrameProvider";
import { useFrame } from "../src/common/utils/frames";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { logger } from "./utils/logger";

const SMOKE_SECONDS = 2;

/** In --smoke runs: once the project's data is in, runs ~2 s of frames, then exits 0. */
export const SmokeCheck = observer(({ app }: { app: HWIRAppModel }) => {
  const { fps } = useFrameContext();
  const frames = useRef(0);
  const dataLoaded = app.dataLoaded;

  useFrame(() => {
    if (!dataLoaded) return;
    frames.current++;
    if (frames.current < fps * SMOKE_SECONDS) return;
    logger.info(
      `Smoke test passed: ${frames.current} frames, ${app.strings.length} strings, ${app.isPlaylistMode ? `playlist '${app.playlist?.name ?? "none"}'` : "listen mode"}`,
    );
    process.exit(0);
  }, [dataLoaded]);

  return null;
});
