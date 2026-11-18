import { makeAutoObservable, observableRef } from "mobx";
import { solvePose, type CameraPose } from "./solvePose";
import type { LedSource } from "./projectLeds";
import type { PointPair } from "../common/models/editorTool";

/** What the simulator lends the mapping tools: its camera, as the photo's. */
export type MappingView = {
  /** The view's camera as a photo camera of this aspect. */
  readPose(aspect: number): CameraPose;
};

export type AlignMode = "points" | "byHand";

/** A phone or camera's field of view is well inside this; outside it the pairs don't match. */
const PLAUSIBLE_FOV_DEG = { min: 5, max: 120 };
/** Points landing further off than this (as a share of the photo's height) mean a pair is wrong. */
const MAX_RMS_ERROR = 0.03;

/** Why a solved camera can't be right, or null. */
const findFitProblem = (fovDeg: number, rmsError: number): string | null => {
  if (fovDeg < PLAUSIBLE_FOV_DEG.min || fovDeg > PLAUSIBLE_FOV_DEG.max)
    return `That fit needs a ${fovDeg.toFixed(0)}° field of view, which no camera has: some pairs don't match. Check them, or remove the odd one out.`;
  if (rmsError > MAX_RMS_ERROR)
    return `The pairs don't agree: points land ${(rmsError * 100).toFixed(1)}% of the photo's height from where they were picked. Check them, or remove the odd one out.`;
  return null;
};

/** One view's camera, once lined up. */
export type ViewAlignment = {
  pose: CameraPose;
  /** How far the solved camera's points land from the picked ones, in photo heights; null when taken from the view by hand. */
  rmsError: number | null;
};

/**
 * Lining a mapping session's photos up with the house: how a photo is shown,
 * the camera found for each view, and what each proposed LED was based on.
 * The tool itself (which view, picking points) is the editor's tool state
 * (editorTool.ts).
 */
export class MappingUIModel {
  /** How strongly the photo shows over the view, 0..1. */
  opacity = 0.6;
  alignMode: AlignMode = "points";
  /** Whether the found LEDs' dots show on the photo. */
  showCapturedDots = true;
  /** Each view's camera, by view name, once solved or taken from the 3D view. */
  alignments = new Map<string, ViewAlignment>();
  /** The 3D view follows the open photo's camera (else it moves freely). */
  cameraLocked = false;
  solveError: string | null = null;
  /** The photo camera's vertical field of view while lining up by hand. */
  handFovDeg = 45;
  /** Per string, how each proposed LED got its position (for colouring the review). */
  sources = new Map<string, LedSource[]>();
  view: MappingView | null = null;

  constructor() {
    makeAutoObservable(this, {
      alignments: observableRef,
      view: observableRef,
      sources: observableRef,
    });
  }

  setOpacity(value: number) {
    this.opacity = value;
  }

  setAlignMode(mode: AlignMode) {
    this.alignMode = mode;
    if (mode === "byHand") this.cameraLocked = false;
  }

  setShowCapturedDots(value: boolean) {
    this.showCapturedDots = value;
  }

  setView(view: MappingView | null) {
    this.view = view;
  }

  alignmentOf(viewName: string): ViewAlignment | null {
    return this.alignments.get(viewName) ?? null;
  }

  private align(viewName: string, alignment: ViewAlignment) {
    this.alignments = new Map(this.alignments).set(viewName, alignment);
    this.solveError = null;
  }

  setHandFov(fovDeg: number) {
    this.handFovDeg = fovDeg;
  }

  setCameraLocked(value: boolean) {
    this.cameraLocked = value;
  }

  /** Fits a view's camera to the pairs picked on its photo, starting from the 3D view. */
  solve(viewName: string, pairs: PointPair[], aspect: number) {
    try {
      const result = solvePose(pairs, {
        aspect,
        initial: this.view?.readPose(aspect),
      });
      const problem = findFitProblem(result.pose.fovDeg, result.rmsError);
      if (problem) {
        this.solveError = problem;
        return;
      }
      this.align(viewName, { pose: result.pose, rmsError: result.rmsError });
      this.handFovDeg = result.pose.fovDeg;
      this.cameraLocked = true;
    } catch (error) {
      this.solveError = error instanceof Error ? error.message : String(error);
    }
  }

  /** Takes the 3D view as it is now as the photo's camera (lining up by hand). */
  useView(viewName: string, aspect: number) {
    if (!this.view) return;
    this.align(viewName, { pose: this.view.readPose(aspect), rmsError: null });
  }

  setSources(sources: Map<string, LedSource[]>) {
    this.sources = sources;
  }

  /** A new session: nothing carries over. */
  reset() {
    this.alignments = new Map();
    this.cameraLocked = false;
    this.solveError = null;
    this.sources = new Map();
  }
}
