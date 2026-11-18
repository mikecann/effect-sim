import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { MappingPattern } from "../../convex/schema";
import { useFrame } from "../../src/common/utils/frames";
import { HWIRAppModel } from "../models/HWIRAppModel";
import { useHwirMutation } from "../hooks";
import { logger } from "../utils/logger";
import { MappingFrames } from "./mappingFrames";
import { MappingAcker } from "./MappingAcker";

const OFF: MappingPattern = { kind: "off" };

/**
 * Mapping mode: lights the pattern the session asks for (its `request`) and
 * acks each seq (mapping.shown) once a frame with it has gone out over UDP to
 * every live string, so the camera knows when to take its photo. Strings
 * that aren't live don't hold the ack up; they're logged as having missed it,
 * and the heartbeat says which strings are offline.
 */
export const MappingDisplay = observer(
  ({
    app,
    sessionId,
  }: {
    app: HWIRAppModel;
    sessionId: Id<"mappingSessions">;
  }) => {
    const session = useQuery(api.mapping.get, { sessionId });
    const shown = useHwirMutation(api.mapping.shown);
    const [frames] = useState(() => new MappingFrames());
    const [acker] = useState(() => new MappingAcker());

    const capturing =
      session?.state.kind === "capturing" ? session.state : null;
    const request = useRef(capturing?.request ?? null);
    useEffect(() => {
      request.current = capturing?.request ?? null;
      if (capturing?.shownSeq != null) acker.alreadyShown(capturing.shownSeq);
    }, [capturing, acker]);

    // As in HeadlessLedDataDispatcher: frames say which settings they showed,
    // so the display change into mapping is confirmed once one has gone out.
    const version = app.controlVersion;
    const renderedVersion = useRef(-1);
    useEffect(() => {
      renderedVersion.current = version;
    }, [version]);

    useFrame(() => {
      const req = request.current;
      const strings = app.strings;
      const level = app.isOn ? app.brightness : 0;
      const buffers = frames.get(strings, req?.pattern ?? OFF, level);
      const sends = strings.map(async (string) => {
        const link = app.links.get(string.key);
        const rgb = buffers.get(string.key);
        return {
          key: string.key,
          outcome:
            link && rgb ? await link.send(rgb) : ("unreachable" as const),
        };
      });
      app.frameShown(renderedVersion.current);
      if (!req) return;
      const seq = req.seq;
      void Promise.all(sends).then((results) => {
        const ack = acker.frameSent(seq, results);
        if (!ack) return;
        const missed = ack.missed.length
          ? `, missed by ${ack.missed.length} string(s) that aren't live: ${ack.missed
              .map((key) => app.strings.find((s) => s.key === key)?.name ?? key)
              .join(", ")}`
          : "";
        logger.info(
          `Mapping: pattern ${seq} (${req.pattern.kind}) is showing${missed}`,
        );
        shown({ sessionId, seq }).catch((e) => {
          acker.forget(seq);
          logger.error(`Error acking mapping pattern ${seq}: ${e}`);
        });
      });
    });

    return null;
  },
);
