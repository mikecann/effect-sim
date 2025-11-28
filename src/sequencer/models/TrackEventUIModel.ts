import { makeAutoObservable } from "mobx";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";
import type { SequenceTrackUIModel } from "./SequenceTrackUIModel";
import type { EventDragPreviewState } from "./SequenceUIModel";
import { stringEffectDefinitions } from "../../common/effects/stringEffectDefinitions";
import { switchEffectDefinitions } from "../../common/effects/switchEffectDefinitions";
import { MIN_CLIP_LENGTH_FRAMES } from "../sequencer";
import { eventsOverlap } from "../tracks/eventBar/eventBarHelpers";

export type DragContext = {
  kind: "move" | "left" | "right";
  eventId: string;
  startX: number;
  origStart: number;
  origLen: number;
  lastClientX?: number;
  lastClientY?: number;
  lastFrameWidth?: number;
  isAltPressed?: boolean;
};

export type DragUpdateParams = {
  clientX: number;
  frameWidth: number;
  clientY?: number;
  isAltPressed?: boolean;
};

export class TrackEventUIModel {
  dragState: DragContext | null = null;

  constructor(
    public readonly trackUI: SequenceTrackUIModel,
    public readonly event: AllTrackEventModels,
  ) {
    makeAutoObservable(this);
  }

  get id() {
    return this.event.id;
  }

  get startFrame() {
    return this.event.startFrame;
  }

  get endFrame() {
    return this.event.endFrame;
  }

  get kind() {
    return this.event.kind;
  }

  get label() {
    if (this.event.kind === "string_effect") {
      const effectDef = Object.values(stringEffectDefinitions).find(
        (def) => def.id === this.event.effectDefinitionId,
      );
      return effectDef?.name ?? this.event.effectDefinitionId;
    } else if (this.event.kind === "switch_effect") {
      const effectDef = Object.values(switchEffectDefinitions).find(
        (def) => def.id === this.event.effectDefinitionId,
      );
      return effectDef?.name ?? this.event.effectDefinitionId;
    }
    return "Unknown";
  }

  get displayStartFrame() {
    const preview = this.dragPreview;
    // In copy mode, keep the original event in place
    if (preview && !preview.isCopy) return preview.startFrame;
    return this.startFrame;
  }

  get displayEndFrame() {
    const preview = this.dragPreview;
    // In copy mode, keep the original event in place
    if (preview && !preview.isCopy) return preview.endFrame;
    return this.endFrame;
  }

  get isSelected() {
    const app = this.trackUI.sequenceUI.app;
    return (
      app.selectedEntity?.kind === "event" &&
      app.selectedEntity.event.id === this.event.id
    );
  }

  get isDraggedToOtherTrack() {
    const dragPreview = this.dragPreview;
    if (!this.dragState || !dragPreview || dragPreview.eventId !== this.id)
      return false;

    return (
      !dragPreview.isCopy &&
      ((dragPreview.targetTrackId !== null &&
        dragPreview.targetTrackId !== this.trackUI.track.id) ||
        (dragPreview.ghostTrackIndex !== undefined &&
          dragPreview.ghostTracksCount !== undefined))
    );
  }

  get isOverlapped(): boolean {
    const draggingEvent = this.sequenceUI.draggingEvent;
    if (!draggingEvent) return false;
    const dragPreview: EventDragPreviewState | null = draggingEvent.dragPreview;
    if (!dragPreview || dragPreview.eventId === this.id) return false;

    return dragPreview.overlappedEventIds.includes(this.id);
  }

  get isPartiallyOutOfBounds() {
    const numFrames = this.trackUI.sequenceUI.sequence.numFrames;
    return this.startFrame < numFrames && this.endFrame > numFrames;
  }

  get isCompletelyOutOfBounds() {
    const numFrames = this.trackUI.sequenceUI.sequence.numFrames;
    return this.startFrame >= numFrames;
  }

  get isDragging() {
    return this.dragState !== null;
  }

  get pxLeft() {
    return this.displayStartFrame * this.trackUI.frameWidth;
  }

  get pxWidth() {
    return (
      (this.displayEndFrame - this.displayStartFrame) * this.trackUI.frameWidth
    );
  }

  private get sequenceUI() {
    return this.trackUI.sequenceUI;
  }

  startDrag(kind: "move" | "left" | "right", startX: number) {
    this.dragState = {
      kind,
      eventId: this.id,
      startX,
      origStart: this.startFrame,
      origLen: this.endFrame - this.startFrame,
    };
  }

  updateDrag(params: DragUpdateParams) {
    const ctx = this.dragState;
    if (!ctx || ctx.eventId !== this.id) return;

    const { clientX, frameWidth, clientY, isAltPressed } = params;

    // Store last mouse position and state for computed preview
    ctx.lastClientX = clientX;
    ctx.lastClientY = clientY;
    ctx.lastFrameWidth = frameWidth;
    ctx.isAltPressed = isAltPressed ?? false;
  }

  get dragPreview(): EventDragPreviewState | null {
    const ctx = this.dragState;
    if (!ctx || ctx.eventId !== this.id) return null;

    const { lastClientX, lastClientY, lastFrameWidth, isAltPressed } = ctx;

    // Need mouse position to compute preview
    if (lastClientX === undefined || lastFrameWidth === undefined) return null;

    const dx = lastClientX - ctx.startX;
    const dFrames = Math.round(dx / lastFrameWidth);
    const maxEndFrame = this.sequenceUI.sequence.numFrames;

    let newStart = ctx.origStart;
    let newEnd = ctx.origStart + ctx.origLen;

    if (ctx.kind === "move") {
      const desiredStart = ctx.origStart + dFrames;
      const desiredEnd = desiredStart + ctx.origLen;

      newStart = Math.max(0, desiredStart);
      newEnd = desiredEnd;

      if (maxEndFrame !== undefined) newEnd = Math.min(newEnd, maxEndFrame);
      if (desiredStart < 0) newEnd = Math.min(newEnd, ctx.origLen);

      if (newEnd - newStart < MIN_CLIP_LENGTH_FRAMES) {
        newEnd = newStart + MIN_CLIP_LENGTH_FRAMES;
        if (maxEndFrame !== undefined && newEnd > maxEndFrame) {
          newEnd = maxEndFrame;
          newStart = Math.max(0, newEnd - MIN_CLIP_LENGTH_FRAMES);
        }
      }
    } else if (ctx.kind === "left") {
      newStart = Math.max(0, ctx.origStart + dFrames);
      let newLen = Math.max(
        MIN_CLIP_LENGTH_FRAMES,
        ctx.origLen + (ctx.origStart - newStart),
      );
      if (maxEndFrame !== undefined) {
        const maxLen = maxEndFrame - newStart;
        newLen = Math.min(newLen, maxLen);
      }
      newEnd = newStart + newLen;
    } else if (ctx.kind === "right") {
      let newLen = Math.max(MIN_CLIP_LENGTH_FRAMES, ctx.origLen + dFrames);
      if (maxEndFrame !== undefined) {
        const maxLen = maxEndFrame - ctx.origStart;
        newLen = Math.min(newLen, maxLen);
      }
      newStart = ctx.origStart;
      newEnd = ctx.origStart + newLen;
    }

    // Determine target track
    let targetTrackId = this.trackUI.id;
    if (ctx.kind === "move" && lastClientY !== undefined) {
      const foundId = this.sequenceUI.getTargetTrackId(lastClientY);
      if (foundId) targetTrackId = foundId;
    }

    // Ghost tracks
    let ghostTrackInfo = null;
    if (ctx.kind === "move" && lastClientY !== undefined)
      ghostTrackInfo = this.sequenceUI.getGhostTrackInfo(lastClientY);

    // Calculate overlaps
    const overlappedEventIds: string[] = [];
    if (!ghostTrackInfo && targetTrackId) {
      const targetTrack = this.sequenceUI.sequence.tracks.find(
        (t) => t.id === targetTrackId,
      );
      if (targetTrack)
        for (const otherEvent of targetTrack.events) {
          if (otherEvent.id === this.id) continue;
          if (
            eventsOverlap(
              newStart,
              newEnd,
              otherEvent.startFrame,
              otherEvent.endFrame,
            )
          )
            overlappedEventIds.push(otherEvent.id);
        }
    }

    const isCopy = isAltPressed ?? false;
    const isCrossTrackDrag = targetTrackId !== this.trackUI.id;

    const previewTargetTrackId = ghostTrackInfo
      ? null
      : isCopy
        ? targetTrackId
        : isCrossTrackDrag
          ? targetTrackId
          : null;

    return {
      eventId: this.id,
      sourceTrackId: this.trackUI.id,
      targetTrackId: previewTargetTrackId,
      startFrame: newStart,
      endFrame: newEnd,
      overlappedEventIds,
      ghostTrackIndex: ghostTrackInfo?.ghostTrackIndex,
      ghostTracksCount: ghostTrackInfo?.ghostTracksCount,
      isCopy,
    };
  }

  endDrag() {
    const preview = this.dragPreview;
    const ctx = this.dragState;

    if (!preview || !ctx || preview.eventId !== this.id) {
      this.dragState = null;
      return;
    }

    const trackId = this.trackUI.id;
    const ghostTrackIndex = preview.ghostTrackIndex;
    const ghostTracksCount = preview.ghostTracksCount ?? 0;

    if (ghostTrackIndex !== undefined && ghostTracksCount > 0) {
      const isCopy = preview.isCopy ?? false;
      const generateId = (prefix: string) =>
        `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Create new tracks logic
      const newTracks = Array.from({ length: ghostTracksCount }).map((_, i) => {
        const newTrackId = generateId("track");
        const isTargetTrack = i === ghostTrackIndex;

        const eventData = { ...this.event.data };

        return {
          id: newTrackId,
          name: `Track ${this.sequenceUI.sequence.tracks.length + i + 1}`,
          events: isTargetTrack
            ? [
                {
                  ...eventData,
                  id: isCopy ? generateId("event") : eventData.id,
                  startFrame: preview.startFrame,
                  endFrame: preview.endFrame,
                },
              ]
            : [],
        } as const;
      });

      if (!isCopy) this.sequenceUI.sequence.removeEvent(trackId, this.id);
      for (const newTrack of newTracks)
        this.sequenceUI.sequence.addTrack(newTrack);
    } else {
      const targetTrackId = preview.targetTrackId ?? trackId;
      const isCopy = preview.isCopy ?? false;

      // Calculate changes
      const positionChanged =
        preview.startFrame !== this.startFrame ||
        preview.endFrame !== this.endFrame;
      const trackChanged = targetTrackId !== trackId;

      if (positionChanged || trackChanged || isCopy) {
        // Remove overlapped
        if (!isCopy)
          for (const overlappedId of preview.overlappedEventIds)
            this.sequenceUI.sequence.removeEvent(targetTrackId, overlappedId);

        if (isCopy) {
          const generateId = (prefix: string) =>
            `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const newEventId = generateId("event");

          this.sequenceUI.sequence.addEvent(targetTrackId, {
            ...this.event.data,
            id: newEventId,
            startFrame: preview.startFrame,
            endFrame: preview.endFrame,
          });
        } else if (trackChanged)
          this.sequenceUI.sequence.moveEvent(trackId, targetTrackId, this.id, {
            startFrame: preview.startFrame,
            endFrame: preview.endFrame,
          });
        else
          this.sequenceUI.sequence.updateEvent(trackId, this.id, {
            startFrame: preview.startFrame,
            endFrame: preview.endFrame,
          });
      }
    }

    this.dragState = null;
  }
}
