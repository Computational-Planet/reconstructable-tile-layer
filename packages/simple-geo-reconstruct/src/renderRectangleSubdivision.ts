import { Ellipsoid, Math as CesiumMath, Rectangle, RectangleGeometry, type Geometry } from "cesium";

/** Controls optional geographic subdivision of one rendered rectangle. */
export type RenderRectangleSubdivision =
  | {
      /** Keeps each source tile as one geographic rectangle. */
      mode: "none";
    }
  | {
      /** Splits each axis so no part exceeds the configured angular extent. */
      mode: "max-angular-extent";
      /** Maximum longitude or latitude span per part, in radians. */
      radians: number;
    };

/** Low-level stages reported by the optional benchmark observer. */
export type SimpleGeoReconstructBenchmarkStage = "task-gen" | "geometry-creation";

/** Optional timing observer used for diagnostics and controlled benchmarks. */
export type SimpleGeoReconstructBenchmarkObserver = {
  /** Records one completed stage interval in milliseconds. */
  onStageOperation(
    stage: SimpleGeoReconstructBenchmarkStage,
    startTimeMs: number,
    endTimeMs: number,
  ): void;
};

/** One geographic sub-rectangle and its texture-coordinate extent. */
export type RenderRectanglePart = {
  /** Geographic extent of this part. */
  rectangle: Rectangle;
  /** Minimum horizontal texture coordinate in the parent image. */
  uMinimum: number;
  /** Maximum horizontal texture coordinate in the parent image. */
  uMaximum: number;
  /** Minimum vertical texture coordinate in the parent image. */
  vMinimum: number;
  /** Maximum vertical texture coordinate in the parent image. */
  vMaximum: number;
};

/** Splits a rectangle into texture-aligned parts using the requested policy. */
export function subdivideRenderRectangle(
  rectangle: Rectangle,
  subdivision: RenderRectangleSubdivision,
): RenderRectanglePart[] {
  if (subdivision.mode === "none") {
    return [createPart(rectangle, 0, 1, 0, 1)];
  }

  if (!Number.isFinite(subdivision.radians) || subdivision.radians <= 0) {
    throw new Error("Render rectangle angular extent must be positive.");
  }

  const longitudeSpan = Rectangle.computeWidth(rectangle);
  const latitudeSpan = Rectangle.computeHeight(rectangle);
  const columnCount = Math.max(1, Math.ceil(longitudeSpan / subdivision.radians));
  const rowCount = Math.max(1, Math.ceil(latitudeSpan / subdivision.radians));
  const parts: RenderRectanglePart[] = [];

  for (let row = 0; row < rowCount; row++) {
    const vMinimum = row / rowCount;
    const vMaximum = (row + 1) / rowCount;
    for (let column = 0; column < columnCount; column++) {
      const uMinimum = column / columnCount;
      const uMaximum = (column + 1) / columnCount;
      const west = normalizeLongitude(rectangle.west + longitudeSpan * uMinimum);
      const east = normalizeLongitude(rectangle.west + longitudeSpan * uMaximum);
      const south = rectangle.south + latitudeSpan * vMinimum;
      const north = rectangle.south + latitudeSpan * vMaximum;
      parts.push(
        createPart(new Rectangle(west, south, east, north), uMinimum, uMaximum, vMinimum, vMaximum),
      );
    }
  }

  return parts;
}

type MeasuredRectangleGeometryOptions = {
  ellipsoid: Ellipsoid;
  part: RenderRectanglePart;
  observer?: SimpleGeoReconstructBenchmarkObserver;
};

/**
 * Cesium calls the static factory synchronously when Primitive asynchronous is
 * false. Wrapping that factory captures the actual tessellation cost and lets
 * each sub-rectangle sample the corresponding area of the parent image.
 */
export class MeasuredRectangleGeometry extends RectangleGeometry {
  private readonly benchmarkPart: RenderRectanglePart;
  private readonly benchmarkObserver?: SimpleGeoReconstructBenchmarkObserver;

  constructor(options: MeasuredRectangleGeometryOptions) {
    super({ ellipsoid: options.ellipsoid, rectangle: options.part.rectangle });
    this.benchmarkPart = options.part;
    this.benchmarkObserver = options.observer;
  }

  static createGeometry(rectangleGeometry: MeasuredRectangleGeometry): Geometry | undefined {
    const startTimeMs = now();
    const geometry = RectangleGeometry.createGeometry(rectangleGeometry);
    const textureCoordinates = geometry?.attributes.st?.values;
    const part = rectangleGeometry.benchmarkPart;
    const needsTextureRemap =
      part.uMinimum !== 0 || part.uMaximum !== 1 || part.vMinimum !== 0 || part.vMaximum !== 1;
    if (textureCoordinates && needsTextureRemap) {
      for (let index = 0; index < textureCoordinates.length; index += 2) {
        textureCoordinates[index] =
          part.uMinimum + textureCoordinates[index] * (part.uMaximum - part.uMinimum);
        textureCoordinates[index + 1] =
          part.vMinimum + textureCoordinates[index + 1] * (part.vMaximum - part.vMinimum);
      }
    }
    rectangleGeometry.benchmarkObserver?.onStageOperation("geometry-creation", startTimeMs, now());
    return geometry;
  }
}

function createPart(
  rectangle: Rectangle,
  uMinimum: number,
  uMaximum: number,
  vMinimum: number,
  vMaximum: number,
): RenderRectanglePart {
  return { rectangle, uMinimum, uMaximum, vMinimum, vMaximum };
}

function normalizeLongitude(longitude: number) {
  return CesiumMath.negativePiToPi(longitude);
}

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}
