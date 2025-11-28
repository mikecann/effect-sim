import { makeAutoObservable } from "mobx";

export class PlayheadModel {
  constructor(public frame: number = 0) {
    makeAutoObservable(this);
  }

  setFrame(value: number) {
    this.frame = value;
  }

  stepForwards() {
    this.frame++;
  }

  stepBackwards() {
    this.frame--;
  }
}
