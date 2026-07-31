import earcut from "earcut";
import type { ClipMaskDebugStats, ClipPolygon, TileClipArea, TileXYZ } from "./types.js";

const GEOMETRY_DEBUG_LOG_LIMIT = 40;
let geometryDebugLogCount = 0;

export function createTileClipAreaFromFlatPolygon(polygonVertices: Array<number>): TileClipArea {
  return {
    polygons: [
      {
        exterior: closeMaskRing(polygonVertices),
      },
    ],
  };
}

export function createClipMaskDebugStats(): ClipMaskDebugStats {
  return {
    collectDeviation: isDeepTimeGeoDebugEnabled(),
    polygonCount: 0,
    interiorRingCount: 0,
    skippedPolygonCount: 0,
    triangleCount: 0,
    maxTriangleDeviation: 0,
    highDeviationPolygonCount: 0,
  };
}

export function createClipMaskVertices(clipAreas: TileClipArea[], debugStats?: ClipMaskDebugStats) {
  const maskVertices: number[] = [];
  clipAreas.forEach((clipArea) => {
    clipArea.polygons.forEach((polygon) => {
      appendPolygonMaskVertices(polygon, maskVertices, debugStats);
    });
  });
  return new Float32Array(maskVertices);
}

function appendPolygonMaskVertices(
  polygon: ClipPolygon,
  maskVertices: number[],
  debugStats?: ClipMaskDebugStats,
) {
  if (debugStats) {
    debugStats.polygonCount++;
    debugStats.interiorRingCount += polygon.interiors?.length ?? 0;
  }

  const exterior = orientEarcutRing(prepareEarcutRing(polygon.exterior), "exterior");
  if (!exterior) {
    if (debugStats) {
      debugStats.skippedPolygonCount++;
    }
    return;
  }

  const flatVertices = [...exterior];
  const holeIndices: number[] = [];
  polygon.interiors?.forEach((interior) => {
    const ring = orientEarcutRing(prepareEarcutRing(interior), "interior");
    if (!ring) {
      return;
    }
    holeIndices.push(flatVertices.length / 2);
    flatVertices.push(...ring);
  });

  const indices = earcut(flatVertices, holeIndices, 2);
  if (debugStats) {
    debugStats.triangleCount += indices.length / 3;
    if (debugStats.collectDeviation) {
      const deviation = getEarcutAreaDeviation(flatVertices, holeIndices, indices);
      debugStats.maxTriangleDeviation = Math.max(debugStats.maxTriangleDeviation, deviation);
      if (deviation > 0.01) {
        debugStats.highDeviationPolygonCount++;
      }
    }
  }

  indices.forEach((vertexIndex: number) => {
    const index = vertexIndex * 2;
    maskVertices.push(flatVertices[index], flatVertices[index + 1]);
  });
}

export function logClipMaskDebug(
  tile: TileXYZ,
  clipAreas: TileClipArea[],
  maskVertices: Float32Array,
  debugStats?: ClipMaskDebugStats,
) {
  if (
    !isDeepTimeGeoDebugEnabled() ||
    !debugStats ||
    geometryDebugLogCount >= GEOMETRY_DEBUG_LOG_LIMIT
  ) {
    return;
  }

  const shouldLog =
    maskVertices.length === 0 ||
    debugStats.maxTriangleDeviation > 0.01 ||
    geometryDebugLogCount < 5;
  if (!shouldLog) {
    return;
  }

  geometryDebugLogCount++;
  // eslint-disable-next-line no-console -- Output is explicitly enabled by a debug flag.
  console.debug("[DeepTimeGeo] GPU mask tile", {
    tile,
    clipAreaCount: clipAreas.length,
    polygonCount: debugStats.polygonCount,
    interiorRingCount: debugStats.interiorRingCount,
    skippedPolygonCount: debugStats.skippedPolygonCount,
    triangleCount: debugStats.triangleCount,
    maskVertexCount: maskVertices.length / 2,
    maxTriangleDeviation: debugStats.maxTriangleDeviation,
    highDeviationPolygonCount: debugStats.highDeviationPolygonCount,
  });
}

function prepareEarcutRing(ring: Array<number>) {
  const openRing: number[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const x = ring[i];
    const y = ring[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const previousX = openRing[openRing.length - 2];
    const previousY = openRing[openRing.length - 1];
    if (
      previousX !== undefined &&
      Math.abs(previousX - x) < 1e-9 &&
      Math.abs(previousY - y) < 1e-9
    ) {
      continue;
    }

    openRing.push(x, y);
  }

  if (openRing.length >= 4) {
    const firstX = openRing[0];
    const firstY = openRing[1];
    const lastX = openRing[openRing.length - 2];
    const lastY = openRing[openRing.length - 1];
    if (Math.abs(firstX - lastX) < 1e-9 && Math.abs(firstY - lastY) < 1e-9) {
      openRing.splice(openRing.length - 2, 2);
    }
  }

  if (openRing.length < 6 || Math.abs(openRingArea(openRing)) < 1e-12) {
    return null;
  }

  return openRing;
}

function orientEarcutRing(ring: number[] | null, ringRole: "exterior" | "interior") {
  if (!ring) {
    return null;
  }

  const area = openRingArea(ring);
  const shouldReverse = ringRole === "exterior" ? area > 0 : area < 0;
  return shouldReverse ? reverseFlatRing(ring) : ring;
}

function reverseFlatRing(ring: Array<number>) {
  const reversed: number[] = [];
  for (let i = ring.length - 2; i >= 0; i -= 2) {
    reversed.push(ring[i], ring[i + 1]);
  }
  return reversed;
}

function closeMaskRing(ring: Array<number>) {
  if (ring.length < 4) {
    return ring;
  }

  const closed = [...ring];
  const firstX = closed[0];
  const firstY = closed[1];
  const lastX = closed[closed.length - 2];
  const lastY = closed[closed.length - 1];
  if (Math.abs(firstX - lastX) > 1e-9 || Math.abs(firstY - lastY) > 1e-9) {
    closed.push(firstX, firstY);
  }
  return closed;
}

function openRingArea(ring: Array<number>) {
  let area = 0;
  const pointCount = Math.floor(ring.length / 2);
  for (let i = 0; i < pointCount; i++) {
    const next = (i + 1) % pointCount;
    area += ring[i * 2] * ring[next * 2 + 1] - ring[next * 2] * ring[i * 2 + 1];
  }
  return area / 2;
}

function getEarcutAreaDeviation(
  vertices: Array<number>,
  holeIndices: Array<number>,
  triangleIndices: Array<number>,
) {
  const polygonArea = getPreparedPolygonArea(vertices, holeIndices);
  if (polygonArea <= 0) {
    return 0;
  }

  return Math.abs(getTriangleIndicesArea(vertices, triangleIndices) - polygonArea) / polygonArea;
}

function getPreparedPolygonArea(vertices: Array<number>, holeIndices: Array<number>) {
  const holeStarts = holeIndices.map((index) => index * 2);
  const ringEnds = [...holeStarts, vertices.length];
  let area = Math.abs(openRingAreaRange(vertices, 0, ringEnds[0]));

  holeStarts.forEach((start, index) => {
    area -= Math.abs(openRingAreaRange(vertices, start, ringEnds[index + 1]));
  });

  return area;
}

function openRingAreaRange(ring: Array<number>, startIndex: number, endIndex: number) {
  let area = 0;
  const pointCount = Math.floor((endIndex - startIndex) / 2);
  for (let i = 0; i < pointCount; i++) {
    const next = (i + 1) % pointCount;
    const currentIndex = startIndex + i * 2;
    const nextIndex = startIndex + next * 2;
    area += ring[currentIndex] * ring[nextIndex + 1] - ring[nextIndex] * ring[currentIndex + 1];
  }
  return area / 2;
}

function getTriangleIndicesArea(vertices: Array<number>, triangleIndices: Array<number>) {
  let area = 0;
  for (let i = 0; i + 2 < triangleIndices.length; i += 3) {
    const a = triangleIndices[i] * 2;
    const b = triangleIndices[i + 1] * 2;
    const c = triangleIndices[i + 2] * 2;
    area += Math.abs(
      (vertices[a] * (vertices[b + 1] - vertices[c + 1]) +
        vertices[b] * (vertices[c + 1] - vertices[a + 1]) +
        vertices[c] * (vertices[a + 1] - vertices[b + 1])) /
        2,
    );
  }
  return area;
}

function isDeepTimeGeoDebugEnabled() {
  return typeof localStorage !== "undefined" && localStorage.getItem("deepTimeGeoDebug") === "1";
}
