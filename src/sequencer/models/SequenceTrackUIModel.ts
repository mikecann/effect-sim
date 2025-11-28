import { makeAutoObservable } from "mobx";
import type { SequenceUIModel } from "./SequenceUIModel";
import type { TrackModel } from "../../../shared/models/sequencer/TrackModel";
import { TrackEventUIModel } from "./TrackEventUIModel";
import { ROW_HEIGHT } from "../sequencer";

export class SequenceTrackUIModel {
  constructor(
    public readonly sequenceUI: SequenceUIModel,
    public readonly track: TrackModel,
  ) {
    makeAutoObservable(this);
  }

  get id() {
    return this.track.id;
  }

  get name() {
    return this.track.name;
  }

  get index() {
    return this.track.index;
  }

  get y() {
    return this.index * ROW_HEIGHT;
  }

  get frameWidth() {
    return this.sequenceUI.frameWidth;
  }

  get sequenceNumFrames() {
    return this.sequenceUI.sequenceNumFrames;
  }

  get events(): TrackEventUIModel[] {
    return this.track.events.map((event) => new TrackEventUIModel(this, event));
  }

  get showDragPreview() {
    return (
      this.sequenceUI.dragPreview !== null &&
      this.sequenceUI.dragPreview.targetTrackId === this.id
    );
  }

  get draggedEventUI(): TrackEventUIModel | null {
    return this.showDragPreview ? this.sequenceUI.draggingEvent : null;
  }

  openContextMenu(clientX: number, clientY: number, trackRect: DOMRect) {
    if (this.sequenceUI.isDragging) return;
    const container = this.sequenceUI.containerRef?.current;
    if (!container) return;
    const xWithinTrack = clientX - trackRect.left + container.scrollLeft;
    const frameAtClick = Math.max(
      0,
      Math.min(
        this.sequenceNumFrames,
        Math.round(xWithinTrack / this.frameWidth),
      ),
    );
    this.sequenceUI.setContextMenu({
      trackId: this.id,
      clientX,
      clientY,
      frameAtClick,
    });
  }
}
