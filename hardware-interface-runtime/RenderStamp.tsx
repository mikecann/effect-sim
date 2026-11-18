import { useFrame } from "../src/common/utils/frames";
import type { HWIRAppModel } from "./models/HWIRAppModel";

/**
 * Says the LED data now holds this version's frame. It mounts in the same
 * render as the runtime's effects and stamps on frame ticks, by which time
 * the effects that mounted with it have drawn, so the dispatcher never
 * confirms a change while sending what the old player drew.
 */
export const RenderStamp = ({
  app,
  version,
}: {
  app: HWIRAppModel;
  version: number;
}) => {
  useFrame(() => app.markRendered(version), [version]);
  return null;
};
