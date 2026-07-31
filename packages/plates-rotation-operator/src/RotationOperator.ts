import { Cartesian3, Ellipsoid, Quaternion, QuaternionSpline } from "cesium";

import type { AnchorPlateId } from "./getQuaternionAtAge.js";
import { convertFileContentToJson, createQuaternionFromRotation } from "./handleRot.js";
import {
  getInverseRotateMatrixAtAge,
  getRotateMatirxAtAge,
  rotatePointToModern,
} from "./rotate.js";
import type { RotItem, RotSplineItem } from "./types.js";

export type { RotItem, RotSplineItem } from "./types.js";

/** Configuration for a rotation operator instance. */
export type RotationOperatorOptions = {
  /** Plate treated as the fixed reference frame. Use `null` for no anchor. */
  anchorPlateId?: AnchorPlateId;
  /** Ellipsoid used to convert Euler poles to Cartesian axes. */
  referenceEllipsoid?: Ellipsoid;
};

function addRotationData(
  rotData: Map<string, RotSplineItem>,
  rotations: Record<string, RotItem[]>,
  createQuaternion: (item: RotItem) => Quaternion,
) {
  Object.entries(rotations).forEach(([key, value]) => {
    const items = [...value];
    if (items.length === 0) return;

    const times = items.map((item) => item.age);
    const points = items.map(createQuaternion);
    const spline =
      times.length > 1
        ? new QuaternionSpline({
            times,
            points,
          })
        : undefined;
    rotData.set(key, { spline, items });
  });
}

/**
 * Loads finite rotations and evaluates plate rotations at arbitrary ages.
 * Use `initializeFromText` for in-memory data or `init` for URL-based data.
 */
export class RotationOperator {
  /** Parsed rotation records keyed by moving plate ID. */
  rotData: Map<string, RotSplineItem> = new Map<string, RotSplineItem>();

  private _ready = false;
  private _anchorPlateId: AnchorPlateId;
  private _referenceEllipsoid: Ellipsoid;

  /** Creates an uninitialized operator with an optional anchor and ellipsoid. */
  constructor(options: RotationOperatorOptions = {}) {
    this._anchorPlateId = options.anchorPlateId === undefined ? "0" : options.anchorPlateId;
    this._referenceEllipsoid = options.referenceEllipsoid ?? Ellipsoid.default;
  }

  /** Plate ID currently treated as the fixed reference, or `null`. */
  get anchorPlateId() {
    return this._anchorPlateId;
  }

  /** Whether the latest initialization operation completed successfully. */
  get ready() {
    return this._ready;
  }

  /**
   * Fetches and initializes one or more rotation files. A network or parsing
   * exception leaves `ready` false, matching the legacy initialization contract.
   */
  async init(urls: string[]) {
    this._ready = false;
    await this.handleRot(urls);
    this._ready = true;
  }

  /** Initializes the operator directly from GPlates rotation text. */
  async initializeFromText(content: string) {
    this._ready = false;
    this.loadRotationText(content);
    this._ready = true;
  }

  /**
   * Parses and adds rotation text without changing the readiness flag. This
   * lower-level method is useful when composing multiple in-memory sources.
   */
  loadRotationText(content: string) {
    const rotations = convertFileContentToJson(content);
    addRotationData(this.rotData, rotations, (item) => this.createQuaternionFromRotation(item));
  }

  /** Fetches rotation files and adds their combined content to `rotData`. */
  async handleRot(urls: string[]) {
    const contents = await Promise.all(urls.map(async (rotUrl) => (await fetch(rotUrl)).text()));
    const rotations = convertFileContentToJson(contents.join("\n"));
    addRotationData(this.rotData, rotations, (item) => this.createQuaternionFromRotation(item));
  }

  /** Converts one parsed finite rotation to a quaternion. */
  createQuaternionFromRotation(item: RotItem): Quaternion {
    return createQuaternionFromRotation(item, this._referenceEllipsoid);
  }

  /** Returns the plate's forward rotation matrix at `age`. */
  async getRotateMatrix(plateId: string, age: number) {
    return getRotateMatirxAtAge(plateId, this.rotData, age, this._anchorPlateId);
  }

  /** Returns the plate's inverse rotation matrix at `age`. */
  async getInverseRotateMatrix(plateId: string, age: number) {
    return getInverseRotateMatrixAtAge(plateId, this.rotData, age, this._anchorPlateId);
  }

  /** Rotates a reconstructed Cartesian point into its modern position. */
  async rotatePointToModern(point: Cartesian3, plateId: string, age: number) {
    return rotatePointToModern(point, plateId, this.rotData, age, this._anchorPlateId);
  }
}
