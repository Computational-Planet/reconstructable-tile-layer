import { RasterError } from "./errors.js";
import type {
  RasterBandMetadata,
  RasterBounds,
  RasterMetadata,
  RasterTransform,
  RasterReadOptions,
} from "./types.js";

/** EPSG:3857 uses this radius even when the display globe is a reconstruction sphere. */
export const WEB_MERCATOR_RADIUS = 6378137;
const DEGREES = 180 / Math.PI;
// 仅用于显示边界：1e-8 度约为毫米量级，不改写原始 bounds、像元变换或采样坐标。
const POLE_EPSILON_DEGREES = 1e-8;

/** Maps pixel edges, not pixel centers. Add 0.5 to a column/row to locate its sample. */
export function pixelToNative(transform: RasterTransform, column: number, row: number) {
  return [
    transform[0] + column * transform[1] + row * transform[2],
    transform[3] + column * transform[4] + row * transform[5],
  ] as const;
}

export function nativeToPixel(transform: RasterTransform, x: number, y: number) {
  const determinant = transform[1] * transform[5] - transform[2] * transform[4];
  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new RasterError("invalid-metadata", "Raster transform is not invertible.");
  }
  const dx = x - transform[0];
  const dy = y - transform[3];
  return [
    (dx * transform[5] - dy * transform[2]) / determinant,
    (dy * transform[1] - dx * transform[4]) / determinant,
  ] as const;
}

export function geographicToNative(epsg: number, longitude: number, latitude: number) {
  if (epsg === 4326) return [longitude, latitude] as const;
  if (epsg === 3857) {
    return [
      (longitude / DEGREES) * WEB_MERCATOR_RADIUS,
      Math.log(Math.tan(Math.PI / 4 + latitude / DEGREES / 2)) * WEB_MERCATOR_RADIUS,
    ] as const;
  }
  throw new RasterError("unsupported-crs", `EPSG:${epsg} needs reprojection before display.`);
}

export function getGeographicBounds(metadata: RasterMetadata): RasterBounds {
  const [west, south, east, north] = metadata.bounds;
  if (metadata.crs.epsg === 4326) return displayBounds([west, south, east, north]);
  if (metadata.crs.epsg === 3857) {
    return displayBounds([
      (west / WEB_MERCATOR_RADIUS) * DEGREES,
      (2 * Math.atan(Math.exp(south / WEB_MERCATOR_RADIUS)) - Math.PI / 2) * DEGREES,
      (east / WEB_MERCATOR_RADIUS) * DEGREES,
      (2 * Math.atan(Math.exp(north / WEB_MERCATOR_RADIUS)) - Math.PI / 2) * DEGREES,
    ]);
  }
  throw new RasterError(
    "unsupported-crs",
    `EPSG:${metadata.crs.epsg} needs reprojection before display.`,
  );
}

function displayBounds([west, south, east, north]: RasterBounds): RasterBounds {
  if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south)
    throw new RasterError("invalid-metadata", "Raster bounds must be finite and ordered.");
  const global = east - west >= 360 - 1e-7;
  const start = global ? -180 : ((((west + 180) % 360) + 360) % 360) - 180;
  const end = global ? 180 : start + (east - west);
  south = displayLatitude(south);
  north = displayLatitude(north);
  if (south >= north)
    throw new RasterError(
      "invalid-metadata",
      "Raster bounds have no latitude extent after normalization.",
    );
  return [start, south, end, north];
}

function displayLatitude(latitude: number): number {
  // Cesium 用严格相等识别极点；仅截断越界值无法处理 -89.99999999999997 这样的舍入误差。
  if (Math.abs(latitude + 90) <= POLE_EPSILON_DEGREES) return -90;
  if (Math.abs(latitude - 90) <= POLE_EPSILON_DEGREES) return 90;
  return Math.max(-90, Math.min(90, latitude));
}

/** Binary search keeps the original ascending/descending coordinate order intact. */
function nearest(axis: readonly number[], value: number): number {
  const direction = axis[axis.length - 1] > axis[0] ? 1 : -1;
  let low = 0;
  let high = axis.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (axis[middle] * direction < value * direction) low = middle + 1;
    else high = middle;
  }
  return low > 0 && Math.abs(axis[low - 1] - value) <= Math.abs(axis[low] - value) ? low - 1 : low;
}

function longitudeIndex(axis: readonly number[], value: number, periodic: boolean): number {
  const middle = (axis[0] + axis[axis.length - 1]) / 2;
  const target = value + 360 * Math.round((middle - value) / 360);
  let index = nearest(axis, target);
  let distance = Math.abs(axis[index] - target);
  if (periodic) {
    for (const shifted of [target - 360, target + 360]) {
      const candidate = nearest(axis, shifted);
      if (Math.abs(axis[candidate] - shifted) < distance) {
        index = candidate;
        distance = Math.abs(axis[candidate] - shifted);
      }
    }
  }
  return index;
}

/** Sample a geographic image at pixel centers without replacing the original grid. */
export function planGeographicRead(
  metadata: RasterMetadata,
  bounds: RasterBounds,
  width: number,
  height: number,
): RasterReadOptions {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new RangeError("Invalid output size.");
  const [west, south, suppliedEast, north] = bounds;
  const east = suppliedEast < west ? suppliedEast + 360 : suppliedEast;
  const { coordinates, transform } = metadata;
  if (
    !coordinates &&
    (!transform ||
      transform[1] <= 0 ||
      transform[5] >= 0 ||
      transform[2] !== 0 ||
      transform[4] !== 0)
  )
    throw new RasterError(
      "unsupported-grid",
      "Display needs rectilinear coordinates or a north-up transform.",
    );
  const columns = new Array<number>(width);
  const rows = new Array<number>(height);
  for (let column = 0; column < width; column++) {
    let longitude = west + ((east - west) * (column + 0.5)) / width;
    if (coordinates)
      columns[column] = longitudeIndex(coordinates.x, longitude, coordinates.periodicX);
    else {
      if (metadata.crs.epsg === 4326) {
        longitude +=
          360 * Math.round(((metadata.bounds[0] + metadata.bounds[2]) / 2 - longitude) / 360);
        if (metadata.bounds[2] - metadata.bounds[0] >= 360 - 1e-7)
          longitude = metadata.bounds[0] + ((((longitude - metadata.bounds[0]) % 360) + 360) % 360);
      }
      const x = geographicToNative(metadata.crs.epsg, longitude, 0)[0];
      columns[column] = Math.max(
        0,
        Math.min(metadata.width - 1, Math.floor((x - transform![0]) / transform![1])),
      );
    }
  }
  for (let row = 0; row < height; row++) {
    const latitude = north + ((south - north) * (row + 0.5)) / height;
    if (coordinates) rows[row] = nearest(coordinates.y, latitude);
    else {
      const y = geographicToNative(metadata.crs.epsg, 0, latitude)[1];
      rows[row] = Math.max(
        0,
        Math.min(metadata.height - 1, Math.floor((y - transform![3]) / transform![5])),
      );
    }
  }
  return {
    // 导出可能有很多列；逐项归约避免展开参数触发 JavaScript 调用栈上限。
    window: [
      columns.reduce((a, b) => Math.min(a, b), Infinity),
      rows.reduce((a, b) => Math.min(a, b), Infinity),
      columns.reduce((a, b) => Math.max(a, b), -Infinity) + 1,
      rows.reduce((a, b) => Math.max(a, b), -Infinity) + 1,
    ],
    width,
    height,
    sampleColumns: columns,
    sampleRows: rows,
  };
}

/** Missing values are recognized in stored units, before CF scaling. */
export function isNoData(value: number, band: RasterBandMetadata): boolean {
  return (
    !Number.isFinite(value) ||
    band.noData.some((missing) => value === missing) ||
    !!(band.validRange && (value < band.validRange[0] || value > band.validRange[1]))
  );
}

export function toPhysicalValue(value: number, band: RasterBandMetadata): number {
  return isNoData(value, band) ? NaN : value * band.scale + band.offset;
}
