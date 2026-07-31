import type { QuaternionSpline } from "cesium";

/** One finite rotation record parsed from a GPlates `.rot` line. */
export type RotItem = {
  /** Moving plate identifier. */
  plateId: string;
  /** Geological age in millions of years ago (Ma). */
  age: number;
  /** Finite Euler rotation associated with the moving plate and age. */
  rotation: {
    /** Euler-pole latitude in degrees. */
    latitude: number;
    /** Euler-pole longitude in degrees. */
    longitude: number;
    /** Right-handed rotation angle in degrees. */
    angle: number;
  };
  /** Fixed plate identifier for this finite rotation. */
  relatedId: string;
};

/** Parsed records and their optional Cesium interpolation spline. */
export type RotSplineItem = {
  /** Quaternion interpolation spline when at least two records are available. */
  spline?: QuaternionSpline;
  /** Parsed finite rotations ordered as supplied by the source data. */
  items: RotItem[];
};
