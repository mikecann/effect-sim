import { makeAutoObservable } from "mobx";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import type { TrackEvent } from "../../../convex/schema";
import { ProjectModel } from "../ProjectModel";
import { TrackModel, TrackData } from "./TrackModel";
import { createId } from "../types";

export class SequenceModel {
  constructor(
    public doc: Doc<"sequences">,
    public readonly project?: ProjectModel,
  ) {
    makeAutoObservable(this);
  }

  get _id() {
    return this.doc._id;
  }

  get _creationTime() {
    return this.doc._creationTime;
  }

  get name() {
    return this.doc.name;
  }

  get numFrames() {
    return this.doc.numFrames;
  }

  get tracks() {
    return this.doc.tracks.map((track) => new TrackModel(track, this));
  }

  get projectId() {
    return this.doc.projectId;
  }

  setName(name: string) {
    this.doc.name = name;
  }

  setNumFrames(numFrames: number) {
    this.doc.numFrames = numFrames;
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
    if (name !== undefined) this.doc.name = name;
    if (numFrames !== undefined) this.doc.numFrames = numFrames;
    if (tracks !== undefined) this.doc.tracks = tracks;
  }

  remove() {
    if (!this.project) return;
    this.project.removeSequence(this);
  }

  addTrack(track?: TrackData) {
    this.doc.tracks.push(
      track ?? {
        id: createId(),
        name: `Track ${this.tracks.length + 1}`,
        events: [],
      },
    );
  }

  removeTrack(trackId: string) {
    const index = this.doc.tracks.findIndex((t) => t.id === trackId);
    if (index >= 0) this.doc.tracks.splice(index, 1);
  }

  renameTrack(trackId: string, name: string) {
    const trimmedName = name.trim();
    if (trimmedName.length === 0)
      throw new Error(
        `New track name for trackId '${trackId}' in sequence '${this._id}' is empty after trimming`,
      );

    const track = this.doc.tracks.find((t) => t.id === trackId);
    if (!track)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this._id}'`,
      );

    track.name = trimmedName;
  }

  duplicateTrack(trackId: string): string {
    const originalTrackIndex = this.doc.tracks.findIndex(
      (t) => t.id === trackId,
    );
    if (originalTrackIndex === -1)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this._id}'`,
      );

    const originalTrack = this.doc.tracks[originalTrackIndex];

    const generateId = (prefix: string) =>
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const duplicateEvents = originalTrack.events.map((event) => ({
      ...event,
      id: generateId("event"),
    }));

    const baseName = `${originalTrack.name} Copy`;
    let duplicateName = baseName;
    let suffix = 2;
    while (this.doc.tracks.some((track) => track.name === duplicateName)) {
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

    this.doc.tracks.splice(originalTrackIndex + 1, 0, duplicateTrack);
    return newTrackId;
  }

  reorderTrack(trackId: string, targetIndex: number) {
    const currentIndex = this.doc.tracks.findIndex((t) => t.id === trackId);
    if (currentIndex === -1)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this._id}'`,
      );

    if (currentIndex === targetIndex) return;

    const [movedTrack] = this.doc.tracks.splice(currentIndex, 1);
    this.doc.tracks.splice(targetIndex, 0, movedTrack);
  }

  addEvent(trackId: string, event: TrackEvent) {
    const track = this.doc.tracks.find((t) => t.id === trackId);
    if (!track)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this._id}'`,
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
        | { kind: "nodes"; nodeIds: Array<Id<"nodes">> }
        | { kind: "all_nodes" };
      props?: unknown;
    },
  ) {
    const track = this.doc.tracks.find((t) => t.id === trackId);
    if (!track)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this._id}'`,
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
    const track = this.doc.tracks.find((t) => t.id === trackId);
    if (!track)
      throw new Error(
        `Track with id '${trackId}' could not be found in sequence '${this._id}'`,
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
    const sourceTrack = this.doc.tracks.find((t) => t.id === sourceTrackId);
    if (!sourceTrack)
      throw new Error(
        `Source track with id '${sourceTrackId}' could not be found in sequence '${this._id}'`,
      );

    const eventIndex = sourceTrack.events.findIndex((e) => e.id === eventId);
    if (eventIndex === -1)
      throw new Error(
        `Event with id '${eventId}' could not be found in track '${sourceTrackId}'`,
      );

    const event = sourceTrack.events[eventIndex];

    const targetTrack = this.doc.tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack)
      throw new Error(
        `Target track with id '${targetTrackId}' could not be found in sequence '${this._id}'`,
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
