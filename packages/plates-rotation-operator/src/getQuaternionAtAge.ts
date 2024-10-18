import { Quaternion } from "cesium";

import type { RotSplineItem } from "./handleRot";

export function getQuaternionAtAge(
  plateId: string,
  rotSplineData: Map<string, RotSplineItem>,
  age: number,
): Quaternion | null {
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
    return getQuaternionAtAge(relatedId, rotSplineData, age);
  }

  const rotationQuaternion = spline.evaluate(time);
  const relatedQuaternion = getQuaternionAtAge(relatedId, rotSplineData, age);
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
