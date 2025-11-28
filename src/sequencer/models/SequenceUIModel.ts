import { makeAutoObservable, reaction } from "mobx";
import type { AppModel } from "../../common/models/AppModel";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import { SequenceRuntimeModel } from "../runtime/SequenceRuntimeModel";
import { Id } from "../../../convex/_generated/dataModel";
import { ensure } from "../../../shared/ensure";
import { SequencerPanelUIModel } from "./SequencerPanelUIModel";
import { SequenceTrackUIModel } from "./SequenceTrackUIModel";
import type { TrackEventUIModel } from "./TrackEventUIModel";
import { GhostTrackUIModel } from "./GhostTrackUIModel";
import { PanningUIModel } from "./PanningUIModel";
import { isKeyboardEventFromEditable } from "../../common/utils/keyboard";
import { ROW_HEIGHT } from "../sequencer";

export type GhostTrackInfo = {
  ghostTrackIndex: number;
  ghostTracksCount: number;
} | null;

export type EventDragPreviewState = {
  eventId: string;
  sourceTrackId: string;
  targetTrackId: string | null;
  startFrame: number;
  endFrame: number;
  overlappedEventIds: string[]; // Events that will be deleted if drag completes
  ghostTrackIndex?: number; // Index of ghost track being dragged over (0-based, relative to last track)
  ghostTracksCount?: number; // Number of ghost tracks to show
  isCopy?: boolean; // True if Alt key is held (copy instead of move)
} | null;

export type ContextMenuState = {
  trackId: string;
  clientX: number;
  clientY: number;
  frameAtClick: number;
} | null;

export const MIN_FRAME_WIDTH = 1;
export const MAX_FRAME_WIDTH = 50;
export const DEFAULT_FRAME_WIDTH = 8;

export class SequenceUIModel {
  runtime: SequenceRuntimeModel;
  isPlaying = false;
  frameWidth = DEFAULT_FRAME_WIDTH;
  contextMenu: ContextMenuState = null;
  panning: PanningUIModel | null = null;
  hasPanned = false;
  cursor: "default" | "grabbing" = "default";
  containerRef: React.RefObject<HTMLDivElement | null> | null = null;

  constructor(
    public readonly panel: SequencerPanelUIModel,
    public sequence: SequenceModel,
  ) {
    this.runtime = new SequenceRuntimeModel(sequence);
    makeAutoObservable(this, { containerRef: false });
  }

  setContainerRef(ref: React.RefObject<HTMLDivElement | null>) {
    this.containerRef = ref;
  }

  getTargetTrackId(clientY: number): string | null {
    const container = this.containerRef?.current;
    if (!container) return null;

    const containerRect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    const yRelativeToContainer = clientY - containerRect.top + scrollTop;
    const yInTracksArea = yRelativeToContainer - ROW_HEIGHT;

    if (yInTracksArea < 0) return null;

    const trackIndex = Math.floor(yInTracksArea / ROW_HEIGHT);
    if (trackIndex < 0 || trackIndex >= this.sequence.tracks.length)
      return null;

    return this.sequence.tracks[trackIndex].id;
  }

  getGhostTrackInfo(clientY: number): GhostTrackInfo {
    const container = this.containerRef?.current;
    if (!container) return null;

    const containerRect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    const yRelativeToContainer = clientY - containerRect.top + scrollTop;
    const yInTracksArea = yRelativeToContainer - ROW_HEIGHT;

    if (yInTracksArea < 0) return null;

    const trackIndex = Math.floor(yInTracksArea / ROW_HEIGHT);

    // If dragging over an existing track, no ghost tracks needed
    if (trackIndex >= 0 && trackIndex < this.sequence.tracks.length)
      return null;

    const lastTrackIndex = this.sequence.tracks.length - 1;
    const tracksBelow = trackIndex - lastTrackIndex;

    if (tracksBelow <= 0) return null;

    const ghostTrackIndex = tracksBelow - 1;
    const ghostTracksCount = ghostTrackIndex + 1;

    return { ghostTrackIndex, ghostTracksCount };
  }

  get app() {
    return this.panel.app;
  }

  get tracks() {
    return this.sequence.tracks.map(
      (track) => new SequenceTrackUIModel(this, track),
    );
  }

  get dragPreview() {
    return this.draggingEvent?.dragPreview ?? null;
  }

  get ghostTracks() {
    const count = this.dragPreview?.ghostTracksCount ?? 0;
    return Array.from(
      { length: count },
      (_, i) => new GhostTrackUIModel(this, i),
    );
  }

  get selectedTrack() {
    return this.app.selectedEntity?.kind === "track"
      ? this.app.selectedEntity.track
      : null;
  }

  get selectedEvent() {
    return this.app.selectedEntity?.kind === "event"
      ? this.app.selectedEntity.event
      : null;
  }

  get selectedEventId() {
    return this.selectedEvent?.id ?? null;
  }

  get sequenceNumFrames() {
    return this.sequence.numFrames;
  }

  get isPanning() {
    return this.panning !== null;
  }

  get draggingEvent(): TrackEventUIModel | null {
    for (const track of this.tracks) {
      const event = track.events.find((e) => e.dragState !== null);
      if (event) return event;
    }
    return null;
  }

  get isDragging() {
    return this.draggingEvent !== null;
  }

  setFrameWidth(value: number) {
    this.frameWidth = value;
  }

  setIsPlaying(value: boolean | ((prev: boolean) => boolean)) {
    if (typeof value === "function") this.isPlaying = value(this.isPlaying);
    else this.isPlaying = value;
  }

  setContextMenu(context: ContextMenuState) {
    this.contextMenu = context;
  }

  closeContextMenu() {
    this.contextMenu = null;
  }

  setPanning(panning: PanningUIModel | null) {
    this.panning = panning;
  }

  setHasPanned(value: boolean) {
    this.hasPanned = value;
  }

  setCursor(value: "default" | "grabbing") {
    this.cursor = value;
  }

  startPanning(container: HTMLDivElement, event: React.MouseEvent) {
    this.setPanning(
      new PanningUIModel(this, {
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
      }),
    );
    this.setHasPanned(false);
    this.setCursor("default");
    event.preventDefault();
  }

  handleMouseMove(container: HTMLDivElement, event: MouseEvent) {
    this.panning?.handleMouseMove(container, event);
  }

  handleMouseUp() {
    this.panning?.handleMouseUp();
  }

  stopPanning() {
    this.panning?.stop();
  }

  handleKeyDown(event: KeyboardEvent) {
    // Toggle playback with spacebar (but not when typing in inputs)
    if (event.code === "Space") {
      if (isKeyboardEventFromEditable(event)) return;
      event.preventDefault(); // Prevent page scrolling
      this.setIsPlaying((prev) => !prev);
      return;
    }

    // Delete selected event with Delete key (but not when typing in inputs)
    if (event.key === "Delete") {
      if (isKeyboardEventFromEditable(event)) return;
      const selectedEventId = this.selectedEventId;
      if (!selectedEventId) return;

      // Find the track that contains the selected event
      const trackWithEvent = this.sequence.tracks.find((track) =>
        track.events.some((event) => event.id === selectedEventId),
      );

      if (trackWithEvent) {
        this.sequence.removeEvent(trackWithEvent.id, selectedEventId);
        this.app.setSelectedEntity(null);
      }
    }
  }

  handleWheel(container: HTMLElement, event: WheelEvent) {
    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const scrollLeft = container.scrollLeft;
    const mouseFrame = (mouseX + scrollLeft) / this.frameWidth;
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newFrameWidth = Math.max(
      MIN_FRAME_WIDTH,
      Math.min(MAX_FRAME_WIDTH, this.frameWidth * zoomFactor),
    );
    if (newFrameWidth === this.frameWidth) return;
    this.setFrameWidth(newFrameWidth);
    requestAnimationFrame(() => {
      const newScrollLeft = mouseFrame * newFrameWidth - mouseX;
      container.scrollLeft = Math.max(0, newScrollLeft);
    });
  }
}
