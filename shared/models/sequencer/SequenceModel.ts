import { makeAutoObservable } from "mobx";
import type { TrackEvent } from "../../../convex/schema";
import type { NodeKey, SequenceDoc } from "../docs";
import { ProjectModel } from "../ProjectModel";
import { TrackModel, TrackData } from "./TrackModel";
import { createId } from "../types";
import { exposeDocFields, WithAutoSetters } from "../modelUtils";

export interface SequenceModel extends WithAutoSetters<SequenceDoc> {}

export class SequenceModel {
  constructor(
    public doc: SequenceDoc,
    public readonly project: ProjectModel,
  ) {
    makeAutoObservable(this);
    exposeDocFields(this);
  }

  get trackModels() {
    return this.tracks.map((track) => new TrackModel(track, this));
  }

  update({
    name,
    numFrames,
    tracks,
  }: {
    name?: string;
    numFrames?: number;
    tracks?: TrackData[];
  }) {
    if (name !== undefined) this.setName(name);
    if (numFrames !== undefined) this.setNumFrames(numFrames);
    if (tracks !== undefined) this.setTracks(tracks);
  }

  remove() {
    if (!this.project) return;
    this.project.removeSequence(this);
  }

  addTrack(track?: TrackData) {
    this.tracks.push(
      track ?? {
        id: createId(),
        name: `Track ${this.trackModels.length + 1}`,
        events: [],
      },
    );
  }

  removeTrack(trackId: string) {
    const index = this.tracks.findIndex((t) => t.id === trackId);
    if (index >= 0) this.tracks.splice(index, 1);
  }

  renameTrack(trackId: string, name: string) {
    const trimmedName = name.trim();
    if (trimmedName.length === 0)
      throw new Error(
        `New track name for trackId '${trackId}' in sequence '${this.key}' is empty after trimming`,
      );

    const track = this.tracks.find((t) => t.id === trackId);
    if (!track)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this.key}'`,
      );

    track.name = trimmedName;
  }

  duplicateTrack(trackId: string): string {
    const tracks = this.tracks;
    const originalTrackIndex = tracks.findIndex((t) => t.id === trackId);
    if (originalTrackIndex === -1)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this.key}'`,
      );

    const originalTrack = tracks[originalTrackIndex];

    const generateId = (prefix: string) =>
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const duplicateEvents = originalTrack.events.map((event) => ({
      ...event,
      id: generateId("event"),
    }));

    const baseName = `${originalTrack.name} Copy`;
    let duplicateName = baseName;
    let suffix = 2;
    while (tracks.some((track) => track.name === duplicateName)) {
      duplicateName = `${baseName} ${suffix}`;
      suffix += 1;
    }

    const newTrackId = generateId("track");
    const duplicateTrack = {
      ...originalTrack,
      id: newTrackId,
      name: duplicateName,
      events: duplicateEvents,
    };

    tracks.splice(originalTrackIndex + 1, 0, duplicateTrack);
    return newTrackId;
  }

  reorderTrack(trackId: string, targetIndex: number) {
    const tracks = this.tracks;
    const currentIndex = tracks.findIndex((t) => t.id === trackId);
    if (currentIndex === -1)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this.key}'`,
      );

    if (currentIndex === targetIndex) return;

    const [movedTrack] = tracks.splice(currentIndex, 1);
    tracks.splice(targetIndex, 0, movedTrack);
  }

  addEvent(trackId: string, event: TrackEvent) {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this.key}'`,
      );

    track.events.push(event);
  }

  updateEvent(
    trackId: string,
    eventId: string,
    updates: {
      startFrame?: number;
      endFrame?: number;
      effectDefinitionId?: string;
      kind?: "string_effect" | "switch_effect";
      appliesTo?:
        | { kind: "nodes"; nodeIds: Array<NodeKey> }
        | { kind: "all_nodes" };
      props?: unknown;
    },
  ) {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this.key}'`,
      );

    const event = track.events.find((e) => e.id === eventId);
    if (!event)
      throw new Error(
        `Event with id '${eventId}' could not be found in track '${trackId}'`,
      );

    if (updates.startFrame !== undefined) event.startFrame = updates.startFrame;
    if (updates.endFrame !== undefined) event.endFrame = updates.endFrame;
    if (updates.effectDefinitionId !== undefined)
      event.effectDefinitionId = updates.effectDefinitionId;
    if (updates.kind !== undefined) event.kind = updates.kind;
    if (updates.appliesTo !== undefined) event.appliesTo = updates.appliesTo;
    if (updates.props !== undefined) event.props = updates.props;
  }

  removeEvent(trackId: string, eventId: string) {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this.key}'`,
      );

    const index = track.events.findIndex((e) => e.id === eventId);
    if (index >= 0) track.events.splice(index, 1);
  }

  moveEvent(
    sourceTrackId: string,
    targetTrackId: string,
    eventId: string,
    updates: {
      startFrame?: number;
      endFrame?: number;
    },
  ) {
    const tracks = this.tracks;
    const sourceTrack = tracks.find((t) => t.id === sourceTrackId);
    if (!sourceTrack)
      throw new Error(
        `Source track with id '${sourceTrackId}' could not be found in sequence '${this.key}'`,
      );

    const eventIndex = sourceTrack.events.findIndex((e) => e.id === eventId);
    if (eventIndex === -1)
      throw new Error(
        `Event with id '${eventId}' could not be found in track '${sourceTrackId}'`,
      );

    const event = sourceTrack.events[eventIndex];

    const targetTrack = tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack)
      throw new Error(
        `Target track with id '${targetTrackId}' could not be found in sequence '${this.key}'`,
      );

    // Remove from source
    sourceTrack.events.splice(eventIndex, 1);

    // Add to target with updates
    const updatedEvent = {
      ...event,
      startFrame: updates.startFrame ?? event.startFrame,
      endFrame: updates.endFrame ?? event.endFrame,
    };
    targetTrack.events.push(updatedEvent);
  }
}
