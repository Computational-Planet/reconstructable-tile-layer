import type { QuaternionSpline } from "cesium";

import type { FiniteRotationRecord } from "../../gplates-source/src/index.js";

/** Compatibility name for the source package's engine-independent record. */
export type RotItem = FiniteRotationRecord;

/** Parsed records and their optional Cesium interpolation spline. */
export type RotSplineItem = {
  /** Quaternion interpolation spline when at least two records are available. */
  spline?: QuaternionSpline;
  /** Parsed finite rotations ordered as supplied by the source data. */
  items: RotItem[];
};
