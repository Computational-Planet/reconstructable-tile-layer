import { Cartesian3, type Ellipsoid } from "cesium";

export type GraticuleLine = {
  axis: "longitude" | "latitude";
  degrees: number;
  positions: Cartesian3[];
};

const GRID_INTERVAL = 30;
const SAMPLE_INTERVAL = 1;

export function getGraticuleHeight(ellipsoid: Ellipsoid) {
  // 抬高量覆盖 1° 折线弦高，避免线段中点落入球体；随实际球体半径缩放。
  return ellipsoid.maximumRadius * 0.0002;
}

export function createGraticuleLines(ellipsoid: Ellipsoid): GraticuleLine[] {
  const lines: GraticuleLine[] = [];
  const height = getGraticuleHeight(ellipsoid);
  for (let longitude = -180; longitude < 180; longitude += GRID_INTERVAL) {
    const positions: Cartesian3[] = [];
    for (let latitude = -90; latitude <= 90; latitude += SAMPLE_INTERVAL) {
      positions.push(Cartesian3.fromDegrees(longitude, latitude, height, ellipsoid));
    }
    lines.push({ axis: "longitude", degrees: longitude, positions });
  }

  // 极点由经线汇聚表示；不生成退化的 ±90° 纬线，也不重复 ±180° 经线。
  for (let latitude = -90 + GRID_INTERVAL; latitude < 90; latitude += GRID_INTERVAL) {
    const positions: Cartesian3[] = [];
    for (let longitude = -180; longitude <= 180; longitude += SAMPLE_INTERVAL) {
      positions.push(Cartesian3.fromDegrees(longitude, latitude, height, ellipsoid));
    }
    lines.push({ axis: "latitude", degrees: latitude, positions });
  }
  return lines;
}

export function formatGraticuleLabel(axis: GraticuleLine["axis"], degrees: number) {
  if (degrees === 0 || Math.abs(degrees) === 180) return `${Math.abs(degrees)}°`;
  const direction = axis === "latitude" ? (degrees > 0 ? "N" : "S") : degrees > 0 ? "E" : "W";
  return `${Math.abs(degrees)}°${direction}`;
}
