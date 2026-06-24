/** Loads optional GPlates reference polygon outlines as Cesium polylines. */
import { useEffect, useRef, type MutableRefObject } from "react";
import {
  ArcType,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  CustomDataSource,
  ShadowMode,
  type Viewer,
} from "cesium";

import { DEMO_ELLIPSOID_CONFIG } from "../cesium/createViewer";
import {
  getGplatesReferencePolygonSource,
  type GplatesReferencePolygonKey,
} from "../dataSources";

const REFERENCE_DATA_SOURCE_NAME = "gplates-reference-polygons";
const REFERENCE_LINE_ALPHA = 0.82;
const REFERENCE_LINE_WIDTH = 1.5;

type LonLatPosition = {
  lon: number;
  lat: number;
};

type ReferencePolygonLoadResult = {
  dataSource: CustomDataSource;
  polylineCount: number;
};

type UseReferencePolygonOverlayOptions = {
  referencePolygonColor: string;
  referencePolygonKey: GplatesReferencePolygonKey;
  setStatus: (value: string) => void;
  viewerRef: MutableRefObject<Viewer | null>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLonLatPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function normalizeRing(rawRing: unknown) {
  if (!Array.isArray(rawRing) || rawRing.length < 2) {
    return null;
  }

  const positions: LonLatPosition[] = [];
  for (const rawPosition of rawRing) {
    if (!isLonLatPosition(rawPosition)) {
      return null;
    }
    positions.push({ lon: rawPosition[0], lat: rawPosition[1] });
  }

  const first = positions[0];
  const last = positions[positions.length - 1];
  if (first.lon !== last.lon || first.lat !== last.lat) {
    positions.push({ ...first });
  }

  return positions;
}

function appendPolygonRings(
  rawPolygonCoordinates: unknown,
  rings: LonLatPosition[][],
) {
  if (!Array.isArray(rawPolygonCoordinates)) {
    return;
  }

  for (const rawRing of rawPolygonCoordinates) {
    const ring = normalizeRing(rawRing);
    if (ring) {
      rings.push(ring);
    }
  }
}

function extractGeometries(geoJson: unknown) {
  if (!isRecord(geoJson)) {
    return [];
  }

  if (geoJson.type === "FeatureCollection" && Array.isArray(geoJson.features)) {
    return geoJson.features
      .map((feature) =>
        isRecord(feature) && isRecord(feature.geometry)
          ? feature.geometry
          : null,
      )
      .filter((geometry): geometry is Record<string, unknown> =>
        Boolean(geometry),
      );
  }

  if (geoJson.type === "Feature" && isRecord(geoJson.geometry)) {
    return [geoJson.geometry];
  }

  return [geoJson];
}

function extractPolygonRings(geoJson: unknown) {
  const rings: LonLatPosition[][] = [];

  for (const geometry of extractGeometries(geoJson)) {
    if (!isRecord(geometry)) {
      continue;
    }

    if (geometry.type === "Polygon") {
      appendPolygonRings(geometry.coordinates, rings);
    }

    if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      for (const rawPolygonCoordinates of geometry.coordinates) {
        appendPolygonRings(rawPolygonCoordinates, rings);
      }
    }
  }

  return rings;
}

function createPolylinePositions(ring: LonLatPosition[]) {
  // GeoJSON altitude is ignored so reference outlines stay on the demo sphere.
  return ring.map(({ lon, lat }) =>
    Cartesian3.fromDegrees(
      lon,
      lat,
      0,
      DEMO_ELLIPSOID_CONFIG.ellipsoid,
    ),
  );
}

function createReferenceLineMaterial(color: string) {
  return new ColorMaterialProperty(
    Color.fromCssColorString(color).withAlpha(REFERENCE_LINE_ALPHA),
  );
}

function applyReferenceLineColor(
  dataSource: CustomDataSource,
  color: string,
) {
  for (const entity of dataSource.entities.values) {
    if (entity.polyline) {
      entity.polyline.material = createReferenceLineMaterial(color);
    }
  }
}

async function loadReferencePolygonDataSource(
  url: string,
  lineColor: string,
  signal: AbortSignal,
): Promise<ReferencePolygonLoadResult> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Unable to load GPlates reference polygons: ${response.status} ${response.statusText}`,
    );
  }

  const geoJson = (await response.json()) as unknown;
  if (signal.aborted) {
    throw new DOMException("Request aborted", "AbortError");
  }

  const dataSource = new CustomDataSource(REFERENCE_DATA_SOURCE_NAME);
  let polylineCount = 0;

  for (const ring of extractPolygonRings(geoJson)) {
    const positions = createPolylinePositions(ring);
    if (positions.length < 2) {
      continue;
    }

    dataSource.entities.add({
      polyline: {
        arcType: ArcType.GEODESIC,
        clampToGround: false,
        material: createReferenceLineMaterial(lineColor),
        positions,
        shadows: ShadowMode.DISABLED,
        width: REFERENCE_LINE_WIDTH,
      },
    });
    polylineCount += 1;
  }

  return { dataSource, polylineCount };
}

function removeReferenceDataSource(
  viewer: Viewer,
  dataSourceRef: MutableRefObject<CustomDataSource | null>,
) {
  const dataSource = dataSourceRef.current;
  if (!dataSource) {
    return;
  }

  viewer.dataSources.remove(dataSource, true);
  dataSourceRef.current = null;
  viewer.scene.requestRender();
}

export function useReferencePolygonOverlay({
  referencePolygonColor,
  referencePolygonKey,
  setStatus,
  viewerRef,
}: UseReferencePolygonOverlayOptions) {
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const referencePolygonColorRef = useRef(referencePolygonColor);
  const requestIdRef = useRef(0);

  useEffect(() => {
    referencePolygonColorRef.current = referencePolygonColor;

    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;
    if (!viewer || !dataSource) {
      return;
    }

    applyReferenceLineColor(dataSource, referencePolygonColor);
    viewer.scene.requestRender();
  }, [referencePolygonColor, viewerRef]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const source = getGplatesReferencePolygonSource(referencePolygonKey);
    const requestId = requestIdRef.current + 1;
    const abortController = new AbortController();
    requestIdRef.current = requestId;
    removeReferenceDataSource(viewer, dataSourceRef);

    if (!source?.url) {
      return () => {
        abortController.abort();
        requestIdRef.current += 1;
        removeReferenceDataSource(viewer, dataSourceRef);
      };
    }

    const sourceUrl = source.url;
    setStatus(`Loading GPlates reference polygons: ${source.label}...`);

    void (async () => {
      try {
        const result = await loadReferencePolygonDataSource(
          sourceUrl,
          referencePolygonColorRef.current,
          abortController.signal,
        );
        const isStale =
          abortController.signal.aborted || requestId !== requestIdRef.current;
        if (isStale) {
          return;
        }

        applyReferenceLineColor(
          result.dataSource,
          referencePolygonColorRef.current,
        );
        await viewer.dataSources.add(result.dataSource);
        if (
          abortController.signal.aborted ||
          requestId !== requestIdRef.current
        ) {
          viewer.dataSources.remove(result.dataSource, true);
          return;
        }

        dataSourceRef.current = result.dataSource;
        viewer.scene.requestRender();
        setStatus(
          `GPlates reference polygons loaded: ${source.label} (${result.polylineCount} lines).`,
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        console.error(error);
        setStatus(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      abortController.abort();
      requestIdRef.current += 1;
      removeReferenceDataSource(viewer, dataSourceRef);
    };
  }, [referencePolygonKey, setStatus, viewerRef]);
}
