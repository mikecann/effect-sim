export { StringEffectTrackEventModel } from "./StringEffectTrackEventModel";
export { SwitchEffectTrackEventModel } from "./SwitchEffectTrackEventModel";

import type { StringEffectTrackEventModel } from "./StringEffectTrackEventModel";
import type { SwitchEffectTrackEventModel } from "./SwitchEffectTrackEventModel";

export type AllTrackEventModels =
  | StringEffectTrackEventModel
  | SwitchEffectTrackEventModel;
