import { Math as CMath, Cartesian3, Ellipsoid, Quaternion } from "cesium";

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
    const dataLine = line.split("!")[0]?.trim();
    if (!dataLine) return;

    const [plateId, age, rotationLat, rotationLon, rotationAngle, relatedId] =
      dataLine.split(/\s+/);
    const parsedAge = Number(age);
    const parsedLatitude = Number(rotationLat);
    const parsedLongitude = Number(rotationLon);
    const parsedAngle = Number(rotationAngle);
    if (
      !plateId ||
      !relatedId ||
      !Number.isFinite(parsedAge) ||
      !Number.isFinite(parsedLatitude) ||
      !Number.isFinite(parsedLongitude) ||
      !Number.isFinite(parsedAngle)
    )
      return;

    if (!res[plateId]) {
      res[plateId] = [];
    }
    const data = {
      plateId: plateId,
      age: parsedAge,
      rotation: {
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        angle: parsedAngle,
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

export function createQuaternionFromRotation(
  item: RotItem,
  referenceEllipsoid: Ellipsoid = Ellipsoid.default,
): Quaternion {
  return Quaternion.fromAxisAngle(
    Cartesian3.fromDegrees(
      item.rotation.longitude,
      item.rotation.latitude,
      0,
      referenceEllipsoid,
    ),
    CMath.toRadians(item.rotation.angle),
  );
}
