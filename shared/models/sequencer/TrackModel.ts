import { makeAutoObservable } from "mobx";
import type { Track, TrackEvent } from "../../../convex/schema";
import { StringEffectTrackEventModel } from "./StringEffectTrackEventModel";
import { SwitchEffectTrackEventModel } from "./SwitchEffectTrackEventModel";
import type { AllTrackEventModels } from "./index";
import type { SequenceModel } from "./SequenceModel";

export type TrackData = Track;

export class TrackModel {
  constructor(
    public data: TrackData,
    public readonly sequence: SequenceModel,
  ) {
    makeAutoObservable(this);
  }

  get id() {
    return this.data.id;
  }

  get name() {
    return this.data.name;
  }

  get index() {
    return this.sequence.doc.tracks.findIndex((t) => t.id === this.id);
  }

  get events(): AllTrackEventModels[] {
    return this.data.events.map((event) => {
      if (event.kind === "string_effect")
        return new StringEffectTrackEventModel(event, this);
      else return new SwitchEffectTrackEventModel(event, this);
    });
  }

  setName(name: string) {
    this.data.name = name;
  }

  addEvent(event: TrackEvent) {
    this.data.events.push(event);
  }

  removeEvent(eventId: string) {
    const index = this.data.events.findIndex((e) => e.id === eventId);
    if (index >= 0) this.data.events.splice(index, 1);
  }

  findEvent(eventId: string): AllTrackEventModels | null {
    const event = this.data.events.find((e) => e.id === eventId);
    if (!event) return null;
    if (event.kind === "string_effect")
      return new StringEffectTrackEventModel(event, this);
    else return new SwitchEffectTrackEventModel(event, this);
  }

  remove() {
    this.sequence.removeTrack(this.id);
  }
}
