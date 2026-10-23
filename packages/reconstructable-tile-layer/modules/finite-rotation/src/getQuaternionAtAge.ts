import { Quaternion } from "cesium";

import type { RotSplineItem } from "./types.js";

/** Plate ID used as the fixed reference frame, or `null` for no anchor. */
export type AnchorPlateId = string | null;

function normalizePlateIdForComparison(plateId: string) {
  const trimmed = plateId.trim();
  if (/^[+-]?\d+$/.test(trimmed)) {
    return String(Number(trimmed));
  }

  return trimmed;
}

function isAnchorPlateId(plateId: string, anchorPlateId: AnchorPlateId) {
  return (
    anchorPlateId !== null &&
    normalizePlateIdForComparison(plateId) === normalizePlateIdForComparison(anchorPlateId)
  );
}

function createIdentityQuaternion() {
  return new Quaternion(0, 0, 0, 1);
}

/**
 * Evaluates the cumulative plate rotation at `age`, following related plate
 * IDs until the configured anchor or the end of the available chain.
 */
export function getQuaternionAtAge(
  plateId: string,
  rotSplineData: Map<string, RotSplineItem>,
  age: number,
  anchorPlateId: AnchorPlateId = "0",
): Quaternion | null {
  if (isAnchorPlateId(plateId, anchorPlateId)) {
    return createIdentityQuaternion();
  }

  const rotSplineItem = rotSplineData.get(plateId);

  if (!rotSplineItem) {
    return null;
  }
  const times = rotSplineItem.items.map((item) => item.age);
  const { items, spline } = rotSplineItem;

  let time = age;
  const length = times.length;
  if (time < times[0]) {
    time = times[0];
  } else if (age > times[length - 1]) {
    time = times[length - 1];
  }

  let item = items[0],
    index = 0;
  while (++index < items.length && time > item.age) {
    item = items[index];
  }

  const relatedId = item.relatedId;
  if (!spline) {
    return getQuaternionAtAge(relatedId, rotSplineData, age, anchorPlateId);
  }

  const rotationQuaternion = spline.evaluate(time);
  const relatedQuaternion = getQuaternionAtAge(relatedId, rotSplineData, age, anchorPlateId);
  if (relatedQuaternion) {
    return quaternionMultiply(relatedQuaternion, rotationQuaternion);
  } else {
    return rotationQuaternion;
  }
}

function quaternionMultiply(q1: Quaternion, q2: Quaternion): Quaternion {
  const result = new Quaternion();
  Quaternion.multiply(q1, q2, result);
  return result;
}
