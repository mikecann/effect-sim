import { makeAutoObservable } from "mobx";
import type { SequenceUIModel } from "./SequenceUIModel";

export type PanState = {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

export class PanningUIModel {
  panState: PanState;
  hasPanned = false;

  constructor(
    public readonly sequenceUI: SequenceUIModel,
    panState: PanState,
  ) {
    this.panState = panState;
    makeAutoObservable(this);
  }

  handleMouseMove(container: HTMLDivElement, event: MouseEvent) {
    const deltaX = event.clientX - this.panState.startX;
    const deltaY = event.clientY - this.panState.startY;

    if (!this.hasPanned) {
      if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) return;
      this.hasPanned = true;
      this.sequenceUI.setCursor("grabbing");
    }

    if (!this.hasPanned) return;

    const nextScrollLeft = this.panState.scrollLeft - deltaX;
    const nextScrollTop = this.panState.scrollTop - deltaY;

    container.scrollLeft = Math.max(0, nextScrollLeft);
    container.scrollTop = Math.max(0, nextScrollTop);
  }

  handleMouseUp() {
    this.sequenceUI.setPanning(null);
    this.sequenceUI.setCursor("default");

    if (this.hasPanned)
      window.setTimeout(() => {
        if (this.sequenceUI.panning === null)
          this.sequenceUI.setHasPanned(false);
      }, 0);
    else this.sequenceUI.setHasPanned(false);
  }

  stop() {
    this.sequenceUI.setPanning(null);
    this.sequenceUI.setCursor("default");
    this.sequenceUI.setHasPanned(false);
  }
}

