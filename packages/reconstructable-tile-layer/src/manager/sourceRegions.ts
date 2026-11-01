import {
  BoundingSphere,
  Cartesian3,
  Ellipsoid,
  Math as CesiumMath,
  Rectangle,
  type TilingScheme,
} from "cesium";
import type { TileXYL } from "../quadtree.js";

/** Remove identical or contained non-wrapping rectangles without expanding their coverage. */
export function uniqueSourceRectangles(rectangles: Rectangle[]): Rectangle[] {
  const unique = [
    ...new Map(rectangles.map((r) => [`${r.west}:${r.south}:${r.east}:${r.north}`, r])).values(),
  ];
  return unique.filter(
    (inner, i) =>
      !unique.some(
        (outer, j) =>
          i !== j &&
          outer.west <= inner.west &&
          outer.south <= inner.south &&
          outer.east >= inner.east &&
          outer.north >= inner.north,
      ),
  );
}

/** Both inputs must be split at the dateline before intersection. */
export function intersectSourceRectangles(
  rectangles: Rectangle[],
  limits: Rectangle[],
): Rectangle[] {
  const intersections: Rectangle[] = [];
  for (const rectangle of rectangles) {
    for (const limit of limits) {
      const west = Math.max(rectangle.west, limit.west);
      const south = Math.max(rectangle.south, limit.south);
      const east = Math.min(rectangle.east, limit.east);
      const north = Math.min(rectangle.north, limit.north);
      if (west < east && south < north) intersections.push(new Rectangle(west, south, east, north));
    }
  }
  return uniqueSourceRectangles(intersections);
}

/** Packs same-level source tiles into rectangles without filling unselected gaps. */
export function sourceTileRectangles(
  tiles: Iterable<TileXYL>,
  tilingScheme: TilingScheme,
  level: number,
): Rectangle[] {
  const rows = new Map<number, Set<number>>();
  for (const { x, y } of tiles) {
    let row = rows.get(y);
    if (!row) rows.set(y, (row = new Set()));
    row.add(x);
  }
  type TileRange = { west: number; east: number; north: number; south: number };
  const ranges: TileRange[] = [];
  let previous = new Map<string, TileRange>();
  for (const [y, columns] of [...rows].sort(([a], [b]) => a - b)) {
    const xs = [...columns].sort((a, b) => a - b);
    const current = new Map<string, TileRange>();
    for (let i = 0; i < xs.length; i++) {
      const west = xs[i];
      while (i + 1 < xs.length && xs[i + 1] === xs[i] + 1) i++;
      const east = xs[i];
      const key = `${west}:${east}`;
      const above = previous.get(key);
      // 只合并连续行中完全相同的列段，不能用大外包框把 NONE 瓦片或孔洞重新纳入。
      if (above && above.south === y - 1) {
        above.south = y;
        current.set(key, above);
      } else {
        const range = { west, east, north: y, south: y };
        ranges.push(range);
        current.set(key, range);
      }
    }
    previous = current;
  }
  return ranges.flatMap(({ west, east, north, south }) => {
    // 使用 provider 的真实瓦片边界；WebMercator 的纬度不能按等间隔推算。
    const northwest = tilingScheme.tileXYToRectangle(west, north, level);
    const southeast = tilingScheme.tileXYToRectangle(east, south, level);
    return splitGeographicRectangle(
      new Rectangle(northwest.west, southeast.south, southeast.east, northwest.north),
    );
  });
}

/** Split a geographic rectangle at the dateline; each result has west <= east. */
export function splitGeographicRectangle(rectangle: Rectangle): Rectangle[] {
  if (rectangle.west <= rectangle.east) return [Rectangle.clone(rectangle)];
  return [
    new Rectangle(rectangle.west, rectangle.south, Math.PI, rectangle.north),
    new Rectangle(-Math.PI, rectangle.south, rectangle.east, rectangle.north),
  ].filter((part) => part.width > 1e-12);
}

/** Conservative surface extents of a Cartesian sphere, including poles and the dateline. */
export function boundingSphereToGeographicRectangles(
  sphere: BoundingSphere,
  ellipsoid: Ellipsoid,
): Rectangle[] {
  if (
    ![sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius].every(Number.isFinite) ||
    sphere.radius < 0
  )
    throw new RangeError("Supply a finite bounding sphere with a nonnegative radius.");

  // 把椭球缩放成单位球；按最短半径放大查询球，保证四至不会漏掉球内的地表点。
  const center = Cartesian3.divideComponents(sphere.center, ellipsoid.radii, new Cartesian3());
  const distance = Cartesian3.magnitude(center);
  const radius = sphere.radius / ellipsoid.minimumRadius;
  if (distance < 1e-12) return radius >= 1 ? [Rectangle.clone(Rectangle.MAX_VALUE)] : [];
  const cosine = (distance * distance + 1 - radius * radius) / (2 * distance);
  if (cosine > 1 + 1e-12) return [];
  if (cosine <= -1) return [Rectangle.clone(Rectangle.MAX_VALUE)];
  const angle = Math.acos(CesiumMath.clamp(cosine, -1, 1));
  if (angle < 1e-12) return [];
  const latitude = Math.asin(CesiumMath.clamp(center.z / distance, -1, 1));
  const south = Math.max(-Math.PI / 2, latitude - angle);
  const north = Math.min(Math.PI / 2, latitude + angle);
  const geodeticLatitudes = (value: number) => [
    Math.atan2(Math.sin(value) / ellipsoid.radii.z, Math.cos(value) / ellipsoid.radii.x),
    Math.atan2(Math.sin(value) / ellipsoid.radii.z, Math.cos(value) / ellipsoid.radii.y),
  ];
  const southGeodetic = Math.min(...geodeticLatitudes(south));
  const northGeodetic = Math.max(...geodeticLatitudes(north));
  if (south <= -Math.PI / 2 || north >= Math.PI / 2)
    return [new Rectangle(-Math.PI, southGeodetic, Math.PI, northGeodetic)];

  const longitude = Math.atan2(center.y, center.x);
  const delta = Math.asin(CesiumMath.clamp(Math.sin(angle) / Math.cos(latitude), -1, 1));
  const geodeticLongitude = (value: number) =>
    Math.atan2(Math.sin(value) / ellipsoid.radii.y, Math.cos(value) / ellipsoid.radii.x);
  return splitGeographicRectangle(
    new Rectangle(
      geodeticLongitude(longitude - delta),
      southGeodetic,
      geodeticLongitude(longitude + delta),
      northGeodetic,
    ),
  );
}
