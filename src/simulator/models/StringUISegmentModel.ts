import { makeAutoObservable } from "mobx";
import * as THREE from "three";
import type { StringUIModel } from "./StringUIModel";

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export class StringUISegmentModel {
  constructor(
    public readonly parent: StringUIModel,
    public readonly segmentIndex: number,
    public readonly start: Point3D,
    public readonly end: Point3D,
    public readonly startLedIndex: number,
    public readonly ledCount: number,
  ) {
    makeAutoObservable(this, {
      parent: false,
    });
  }

  get length(): number {
    const dx = this.end.x - this.start.x;
    const dy = this.end.y - this.start.y;
    const dz = this.end.z - this.start.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  get startVector(): THREE.Vector3 {
    return new THREE.Vector3(this.start.x, this.start.y, this.start.z);
  }

  get endVector(): THREE.Vector3 {
    return new THREE.Vector3(this.end.x, this.end.y, this.end.z);
  }

  get direction(): THREE.Vector3 {
    return new THREE.Vector3().subVectors(this.endVector, this.startVector);
  }

  get normalizedDirection(): THREE.Vector3 {
    return this.direction.clone().normalize();
  }

  get midpoint(): THREE.Vector3 {
    return new THREE.Vector3()
      .addVectors(this.startVector, this.endVector)
      .multiplyScalar(0.5);
  }

  get rotation(): THREE.Quaternion {
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const forward = this.normalizedDirection;
    rotation.setFromUnitVectors(up, forward);
    return rotation;
  }

  get ledPositions(): THREE.Vector3[] {
    const length = this.length;
    if (length < 0.001) return [];

    const positions: THREE.Vector3[] = [];
    const start = this.startVector;
    const direction = this.normalizedDirection;
    const spacing = this.parent.string.spacingMeters;

    for (let distance = 0; distance <= length; distance += spacing) {
      const position = start
        .clone()
        .add(direction.clone().multiplyScalar(distance));
      positions.push(position);
    }

    // Ensure at least one LED at start
    if (positions.length === 0 && length > 0) positions.push(start.clone());

    // Add end LED if far enough from last position
    if (positions.length > 0) {
      const lastPos = positions[positions.length - 1];
      const endVec = this.endVector;
      if (lastPos.distanceTo(endVec) > spacing * 0.5)
        positions.push(endVec.clone());
    }

    // Limit to allocated LED count
    return positions.slice(0, this.ledCount);
  }

  get hasValidGeometry(): boolean {
    return this.length >= 0.001;
  }
}
