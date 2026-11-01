import { Cartesian3, Ellipsoid, Math as CMath, Quaternion } from "cesium";

import type { RotItem } from "./types.js";

export type { RotItem, RotSplineItem } from "./types.js";

export { parseFiniteRotationText as convertFileContentToJson } from "../../gplates-source/src/index.js";

/** Converts one finite rotation record to a Cesium quaternion. */
export function createQuaternionFromRotation(
  item: RotItem,
  referenceEllipsoid: Ellipsoid = Ellipsoid.default,
): Quaternion {
  return Quaternion.fromAxisAngle(
    Cartesian3.fromDegrees(item.rotation.longitude, item.rotation.latitude, 0, referenceEllipsoid),
    CMath.toRadians(item.rotation.angle),
  );
}
