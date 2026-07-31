import {
  BoundingSphere,
  Cartographic,
  Cartesian3,
  type ImageryProvider,
  Rectangle,
  type Viewer,
} from "cesium";

import type {
  ViewFineTileLoadOptions,
  ViewFineTileLoadResult,
  ViewFineTileLoadSkipReason,
} from "./types.js";

const DEFAULT_VIEW_TARGET_TILE_SCREEN_SIZE = 256;
const DEFAULT_VIEW_MAX_RAW_TILE_COUNT = 128;
const DEFAULT_VIEW_MAX_LEVEL = 18;
const RECTANGLE_SAMPLE_EPSILON = 1e-10;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeInteger(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function createFineTileLoadResult(
  level: number,
  loadedCount: number,
  taskCount: number,
  skippedReason?: ViewFineTileLoadSkipReason,
): ViewFineTileLoadResult {
  return {
    level,
    loadedCount,
    taskCount,
    skippedReason,
  };
}

export function resolveFineTileViewRectangle(
  viewer: Viewer,
  provider: ImageryProvider,
  options: ViewFineTileLoadOptions,
) {
  return (
    options.viewRectangle ?? viewer.camera.computeViewRectangle(provider.tilingScheme.ellipsoid)
  );
}

function getFineViewLevelBounds(provider: ImageryProvider, options: ViewFineTileLoadOptions) {
  const providerMaxLevel = provider.maximumLevel ?? DEFAULT_VIEW_MAX_LEVEL;
  const minLevel = Math.max(0, normalizeInteger(options.minLevel ?? 0, 0));
  const configuredMaxLevel = normalizeInteger(
    options.maxLevel ?? providerMaxLevel,
    DEFAULT_VIEW_MAX_LEVEL,
  );
  const maxLevel = Math.max(minLevel, configuredMaxLevel);

  return { minLevel, maxLevel };
}

export function clampFineViewLevel(
  level: number,
  provider: ImageryProvider,
  options: ViewFineTileLoadOptions,
) {
  const { minLevel, maxLevel } = getFineViewLevelBounds(provider, options);
  return clampNumber(normalizeInteger(level, minLevel), minLevel, maxLevel);
}

/** Selects the imagery level whose tile size best matches the current view. */
export function resolveFineViewLevel(
  viewer: Viewer,
  provider: ImageryProvider,
  viewRectangle: Rectangle,
  options: ViewFineTileLoadOptions,
) {
  const { minLevel, maxLevel } = getFineViewLevelBounds(provider, options);
  const targetTileScreenSize = Math.max(
    1,
    options.targetTileScreenSize ?? DEFAULT_VIEW_TARGET_TILE_SCREEN_SIZE,
  );
  const maxRawViewTileCount = Math.max(
    1,
    normalizeInteger(
      options.maxRawViewTileCount ?? DEFAULT_VIEW_MAX_RAW_TILE_COUNT,
      DEFAULT_VIEW_MAX_RAW_TILE_COUNT,
    ),
  );
  const metersPerPixel = estimateViewMetersPerPixel(viewer, provider, viewRectangle);

  let resolvedLevel = minLevel;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let level = minLevel; level <= maxLevel; level++) {
    const tileMeters = estimateTileLongSideMetersAtLevel(provider, viewRectangle, level);
    if (!Number.isFinite(tileMeters) || tileMeters <= 0) {
      continue;
    }

    const tileScreenSize = tileMeters / metersPerPixel;
    const score = Math.abs(Math.log(tileScreenSize / targetTileScreenSize));
    if (score < bestScore) {
      bestScore = score;
      resolvedLevel = level;
    }
  }

  while (
    resolvedLevel > minLevel &&
    estimateRawViewTileCount(provider, viewRectangle, resolvedLevel) > maxRawViewTileCount
  ) {
    resolvedLevel--;
  }

  return resolvedLevel;
}

function estimateViewMetersPerPixel(
  viewer: Viewer,
  provider: ImageryProvider,
  viewRectangle: Rectangle,
) {
  const canvas = viewer.scene.canvas;
  const canvasWidth = Math.max(1, canvas.clientWidth || canvas.width || 1);
  const canvasHeight = Math.max(1, canvas.clientHeight || canvas.height || 1);
  const center = Rectangle.center(viewRectangle);
  const ellipsoid = provider.tilingScheme.ellipsoid;
  const widthMeters = measureLongitudeSpanMeters(
    ellipsoid,
    center.longitude,
    center.latitude,
    Rectangle.computeWidth(viewRectangle),
  );
  const heightMeters = measureLatitudeSpanMeters(
    ellipsoid,
    center.longitude,
    viewRectangle.south,
    viewRectangle.north,
  );
  const metersPerPixel = Math.max(widthMeters / canvasWidth, heightMeters / canvasHeight);

  if (Number.isFinite(metersPerPixel) && metersPerPixel > 0) {
    return metersPerPixel;
  }

  const cameraHeight = Math.max(0, viewer.camera.positionCartographic.height);
  return Math.max(1, cameraHeight / Math.max(canvasWidth, canvasHeight));
}

function estimateTileLongSideMetersAtLevel(
  provider: ImageryProvider,
  viewRectangle: Rectangle,
  level: number,
) {
  const tilingScheme = provider.tilingScheme;
  const tilingRectangle = tilingScheme.rectangle;
  const viewCenter = Rectangle.center(viewRectangle);
  const center = new Cartographic(
    clampNumber(
      viewCenter.longitude,
      tilingRectangle.west + RECTANGLE_SAMPLE_EPSILON,
      tilingRectangle.east - RECTANGLE_SAMPLE_EPSILON,
    ),
    clampNumber(
      viewCenter.latitude,
      tilingRectangle.south + RECTANGLE_SAMPLE_EPSILON,
      tilingRectangle.north - RECTANGLE_SAMPLE_EPSILON,
    ),
  );
  const tileXY = tilingScheme.positionToTileXY(center, level) as
    | { x: number; y: number }
    | undefined;
  if (!tileXY) {
    return 0;
  }

  const tileRectangle = tilingScheme.tileXYToRectangle(tileXY.x, tileXY.y, level);
  const tileCenter = Rectangle.center(tileRectangle);
  const ellipsoid = tilingScheme.ellipsoid;
  const widthMeters = measureLongitudeSpanMeters(
    ellipsoid,
    tileCenter.longitude,
    tileCenter.latitude,
    Rectangle.computeWidth(tileRectangle),
  );
  const heightMeters = measureLatitudeSpanMeters(
    ellipsoid,
    tileCenter.longitude,
    tileRectangle.south,
    tileRectangle.north,
  );

  return Math.max(widthMeters, heightMeters);
}

function estimateRawViewTileCount(
  provider: ImageryProvider,
  viewRectangle: Rectangle,
  level: number,
) {
  const tilingScheme = provider.tilingScheme;
  const tilingRectangle = tilingScheme.rectangle;
  const xTileCount = tilingScheme.getNumberOfXTilesAtLevel(level);
  const yTileCount = tilingScheme.getNumberOfYTilesAtLevel(level);
  const maxTileCount = xTileCount * yTileCount;
  const north = clampNumber(
    viewRectangle.north,
    tilingRectangle.south + RECTANGLE_SAMPLE_EPSILON,
    tilingRectangle.north - RECTANGLE_SAMPLE_EPSILON,
  );
  const south = clampNumber(
    viewRectangle.south,
    tilingRectangle.south + RECTANGLE_SAMPLE_EPSILON,
    tilingRectangle.north - RECTANGLE_SAMPLE_EPSILON,
  );
  if (north <= south) {
    return maxTileCount;
  }

  let totalTileCount = 0;
  getLongitudeSegments(provider, viewRectangle).forEach((segment) => {
    const west = clampNumber(
      segment.west + RECTANGLE_SAMPLE_EPSILON,
      tilingRectangle.west + RECTANGLE_SAMPLE_EPSILON,
      tilingRectangle.east - RECTANGLE_SAMPLE_EPSILON,
    );
    const east = clampNumber(
      segment.east - RECTANGLE_SAMPLE_EPSILON,
      tilingRectangle.west + RECTANGLE_SAMPLE_EPSILON,
      tilingRectangle.east - RECTANGLE_SAMPLE_EPSILON,
    );
    if (east < west) {
      return;
    }

    const northwest = tilingScheme.positionToTileXY(new Cartographic(west, north), level) as
      | { x: number; y: number }
      | undefined;
    const southeast = tilingScheme.positionToTileXY(new Cartographic(east, south), level) as
      | { x: number; y: number }
      | undefined;
    if (!northwest || !southeast) {
      return;
    }

    totalTileCount +=
      (Math.abs(southeast.x - northwest.x) + 1) * (Math.abs(southeast.y - northwest.y) + 1);
  });

  if (totalTileCount > 0) {
    return Math.min(maxTileCount, totalTileCount);
  }

  const tilingWidth = Rectangle.computeWidth(tilingRectangle);
  const tilingHeight = Rectangle.computeHeight(tilingRectangle);
  const viewWidth = Math.min(Rectangle.computeWidth(viewRectangle), tilingWidth);
  const viewHeight = Math.min(Rectangle.computeHeight(viewRectangle), tilingHeight);
  const estimatedX = Math.ceil(viewWidth / (tilingWidth / xTileCount));
  const estimatedY = Math.ceil(viewHeight / (tilingHeight / yTileCount));
  return Math.min(maxTileCount, Math.max(1, estimatedX * estimatedY));
}

function getLongitudeSegments(provider: ImageryProvider, viewRectangle: Rectangle) {
  const tilingRectangle = provider.tilingScheme.rectangle;
  const tilingWidth = Rectangle.computeWidth(tilingRectangle);
  if (Rectangle.computeWidth(viewRectangle) >= tilingWidth - 1e-9) {
    return [
      {
        west: tilingRectangle.west,
        east: tilingRectangle.east,
      },
    ];
  }

  if (viewRectangle.west <= viewRectangle.east) {
    return [
      {
        west: Math.max(viewRectangle.west, tilingRectangle.west),
        east: Math.min(viewRectangle.east, tilingRectangle.east),
      },
    ];
  }

  return [
    {
      west: Math.max(viewRectangle.west, tilingRectangle.west),
      east: tilingRectangle.east,
    },
    {
      west: tilingRectangle.west,
      east: Math.min(viewRectangle.east, tilingRectangle.east),
    },
  ];
}

function measureLongitudeSpanMeters(
  ellipsoid: ImageryProvider["tilingScheme"]["ellipsoid"],
  centerLongitude: number,
  latitude: number,
  longitudeWidth: number,
) {
  const width = Math.min(Math.abs(longitudeWidth), Math.PI * 2);
  if (width >= Math.PI * 2 - 1e-9) {
    return Math.PI * 2 * ellipsoid.maximumRadius * Math.abs(Math.cos(latitude));
  }

  const halfWidth = width / 2;
  return Cartesian3.distance(
    Cartesian3.fromRadians(centerLongitude - halfWidth, latitude, 0, ellipsoid),
    Cartesian3.fromRadians(centerLongitude + halfWidth, latitude, 0, ellipsoid),
  );
}

function measureLatitudeSpanMeters(
  ellipsoid: ImageryProvider["tilingScheme"]["ellipsoid"],
  centerLongitude: number,
  south: number,
  north: number,
) {
  return Cartesian3.distance(
    Cartesian3.fromRadians(centerLongitude, south, 0, ellipsoid),
    Cartesian3.fromRadians(centerLongitude, north, 0, ellipsoid),
  );
}

export function createViewBoundingSphereFromRectangle(
  provider: ImageryProvider,
  viewRectangle: Rectangle,
) {
  const ellipsoid = provider.tilingScheme.ellipsoid;
  const centerCartographic = Rectangle.center(viewRectangle);
  const center = Cartesian3.fromRadians(
    centerCartographic.longitude,
    centerCartographic.latitude,
    0,
    ellipsoid,
  );
  const samplePositions = Rectangle.subsample(viewRectangle, ellipsoid);
  const radius = samplePositions.reduce(
    (maxDistance, position) => Math.max(maxDistance, Cartesian3.distance(center, position)),
    0,
  );

  return new BoundingSphere(center, radius);
}
