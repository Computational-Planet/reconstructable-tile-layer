import {
  Cartesian3,
  Ellipsoid,
  Math as CesiumMath,
  Matrix3,
  PolygonHierarchy,
  Quaternion,
} from "cesium";

import { getQuaternionAtAge, type AnchorPlateId } from "./getQuaternionAtAge.js";

import type { RotItem, RotSplineItem } from "./types.js";

/** Rotates one Cartesian point around an axis by an angle in degrees. */
export function rotateCartensianPoint(
  originPosition: Cartesian3,
  rotatePosition: Cartesian3,
  angle: number,
): Cartesian3 {
  const rotate = CesiumMath.toRadians(angle);

  const quat = Quaternion.fromAxisAngle(rotatePosition, rotate);
  const rot_mat3 = Matrix3.fromQuaternion(quat);

  return Matrix3.multiplyByVector(rot_mat3, originPosition, new Cartesian3());
}

function rotatePositionsWithQuaternion(
  positions: Cartesian3[],
  quaternion: Quaternion,
): Cartesian3[] {
  const rotationMatrix = Matrix3.fromQuaternion(quaternion);
  const result = positions.map((position) =>
    Matrix3.multiplyByVector(rotationMatrix, position, new Cartesian3()),
  );

  return result;
}

/** Rotates Cartesian points from the modern frame to their position at `age`. */
export async function rotatePoints(
  points: Cartesian3[],
  plateId: string,
  rotData: Map<string, RotSplineItem>,
  age: number,
  anchorPlateId: AnchorPlateId = "0",
) {
  const quat = getQuaternionAtAge(plateId, rotData, age, anchorPlateId);
  if (!quat) {
    return null;
  }

  return rotatePositionsWithQuaternion(points, quat);
}

/** Returns a plate's forward rotation matrix at `age`. */
export async function getRotateMatirxAtAge(
  plateId: string,
  rotData: Map<string, RotSplineItem>,
  age: number,
  anchorPlateId: AnchorPlateId = "0",
) {
  const quat = getQuaternionAtAge(plateId, rotData, age, anchorPlateId);
  if (!quat) {
    return undefined;
  }
  const rotationMatrix = Matrix3.fromQuaternion(quat);
  return rotationMatrix;
}

/** Returns a plate's inverse rotation matrix at `age`. */
export async function getInverseRotateMatrixAtAge(
  plateId: string,
  rotData: Map<string, RotSplineItem>,
  age: number,
  anchorPlateId: AnchorPlateId = "0",
) {
  const rotationMatrix = await getRotateMatirxAtAge(plateId, rotData, age, anchorPlateId);
  if (!rotationMatrix) {
    return undefined;
  }

  // A rotation matrix is orthogonal, so its inverse is its transpose.
  return Matrix3.transpose(rotationMatrix, new Matrix3());
}

/** Rotates a reconstructed Cartesian point into its modern position. */
export async function rotatePointToModern(
  point: Cartesian3,
  plateId: string,
  rotData: Map<string, RotSplineItem>,
  age: number,
  anchorPlateId: AnchorPlateId = "0",
) {
  const inverseRotationMatrix = await getInverseRotateMatrixAtAge(
    plateId,
    rotData,
    age,
    anchorPlateId,
  );
  if (!inverseRotationMatrix) {
    return null;
  }

  return Matrix3.multiplyByVector(inverseRotationMatrix, point, new Cartesian3());
}

/** Rotates positions using the finite-rotation interval selected for `age`. */
export function getPositionsAtAge(
  positions: Cartesian3[],
  intervals: RotItem[],
  age: number,
  referenceEllipsoid: Ellipsoid = Ellipsoid.default,
) {
  const intervalIndex = intervals.findIndex(
    (item, index) => item.age >= age && (intervals[index - 1]?.age ?? 0) <= age,
  );
  const rotation = intervals[intervalIndex]?.rotation ?? intervals[0].rotation;

  const angle = rotation.angle;
  const rotatePosition = Cartesian3.fromDegrees(
    rotation.longitude,
    rotation.latitude,
    0,
    referenceEllipsoid,
  );
  const newPositions = positions.map((cartesian3) =>
    rotateCartensianPoint(cartesian3, rotatePosition, angle),
  );
  return new PolygonHierarchy(newPositions);
}
