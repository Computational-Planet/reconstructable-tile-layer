import { Cartesian3, Ellipsoid, Quaternion, QuaternionSpline } from "cesium";
import {
  loadFiniteRotationRecords,
  type FiniteRotationRecords,
  type GplatesReadOptions,
  type GplatesSource,
} from "../../gplates-source/src/index.js";

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
 * Use `initializeFromRecords` for parsed data, `initializeFromText` for ROT text,
 * or `init` for URLs, local files and byte buffers.
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
  async init(sources: readonly GplatesSource[], options: GplatesReadOptions = {}) {
    this._ready = false;
    await this.handleRot(sources, options);
    this._ready = true;
  }

  /** Initializes the operator directly from GPlates rotation text. */
  async initializeFromText(content: string) {
    this._ready = false;
    this.loadRotationText(content);
    this._ready = true;
  }

  /** Initializes from records already read by rtl-gplates-source. */
  async initializeFromRecords(rotations: FiniteRotationRecords) {
    this._ready = false;
    addRotationData(this.rotData, rotations, (item) => this.createQuaternionFromRotation(item));
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

  /** Reads rotation sources and adds their combined records to `rotData`. */
  async handleRot(sources: readonly GplatesSource[], options: GplatesReadOptions = {}) {
    // 文件格式、解压和网络读取由源数据包处理；这里仅建立旋转插值结构。
    const rotations = await loadFiniteRotationRecords(sources, options);
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

  /** Returns the composed finite-rotation matrix used to place one plate at `age`. */
  async getPlateRotationMatrix(plateId: string, age: number) {
    return this.getRotateMatrix(plateId, age);
  }

  /** Returns the plate's inverse rotation matrix at `age`. */
  async getInverseRotateMatrix(plateId: string, age: number) {
    return getInverseRotateMatrixAtAge(plateId, this.rotData, age, this._anchorPlateId);
  }

  /** Returns the inverse matrix used to query a reconstructed view in the modern frame. */
  async getInversePlateRotationMatrix(plateId: string, age: number) {
    return this.getInverseRotateMatrix(plateId, age);
  }

  /** Rotates a reconstructed Cartesian point into its modern position. */
  async rotatePointToModern(point: Cartesian3, plateId: string, age: number) {
    return rotatePointToModern(point, plateId, this.rotData, age, this._anchorPlateId);
  }
}
