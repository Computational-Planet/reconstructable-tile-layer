import { Math as CMath, Cartesian3, Quaternion } from "cesium";

import type { QuaternionSpline } from "cesium";

export type RotItem = {
  plateId: string;
  age: number;
  rotation: {
    latitude: number;
    longitude: number;
    angle: number;
  };
  relatedId: string;
};

export function convertFileContentToJson(content: string) {
  const lines = content.trim().split("\n");
  const res: Record<string, RotItem[]> = {};

  lines.forEach((line) => {
    const [plateId, age, rotationLat, rotationLon, rotationAngle, relatedId] =
      line.trim().split(/\s+/);
    if (!plateId || typeof +age !== "number") return;

    if (!res[plateId]) {
      res[plateId] = [];
    }
    const data = {
      plateId: plateId,
      age: Number(age),
      rotation: {
        latitude: Number(rotationLat),
        longitude: Number(rotationLon),
        angle: Number(rotationAngle),
      },
      relatedId: relatedId,
    };
    const lastItem = res[plateId][res[plateId].length - 1];

    if (
      lastItem &&
      data.age === lastItem.age &&
      data.relatedId === lastItem.relatedId
    )
      return;

    if (lastItem?.age === data.age) {
      lastItem.age -= 0.01;
    }
    res[plateId].push(data);
  });

  return res;
}

export type RotSplineItem = {
  spline?: QuaternionSpline;
  items: RotItem[];
};

export function createQuaternionFromRotation(item: RotItem): Quaternion {
  return Quaternion.fromAxisAngle(
    Cartesian3.fromDegrees(item.rotation.longitude, item.rotation.latitude),
    CMath.toRadians(item.rotation.angle),
  );
}
