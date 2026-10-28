import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Rectangle,
  SceneTransforms,
  type Viewer,
} from "cesium";

export type MapSelectionMode = "area" | "point";
export interface MapSelection {
  rectangle: Rectangle;
  point?: Cartographic;
}

/** A point query uses a tiny geographic box, independent of camera height and zoom. */
export function rectangleAroundPoint(point: Cartographic): Rectangle {
  if (
    !Number.isFinite(point.longitude) ||
    !Number.isFinite(point.latitude) ||
    Math.abs(point.latitude) > Math.PI / 2
  )
    throw new RangeError("Select a valid geographic point.");
  const halfSize = CesiumMath.toRadians(0.0001);
  // 经度保留跨反经线的窄范围，纬度在两极截断，避免零面积或越界四至。
  return new Rectangle(
    CesiumMath.negativePiToPi(point.longitude - halfSize),
    Math.max(-Math.PI / 2, point.latitude - halfSize),
    CesiumMath.negativePiToPi(point.longitude + halfSize),
    Math.min(Math.PI / 2, point.latitude + halfSize),
  );
}

/** Preserve each sampled row's longitude continuity, including selections wider than 180°. */
export function rectangleFromSelectionRows(rows: Cartographic[][]): Rectangle {
  if (!rows.length || rows.some((row) => row.length < 2))
    throw new Error("Select a nonempty map area.");
  const unwrap = (row: Cartographic[]) => {
    let previous = row[0].longitude;
    return row.map((point, index) => {
      const longitude =
        index === 0 ? previous : previous + CesiumMath.negativePiToPi(point.longitude - previous);
      previous = longitude;
      return longitude;
    });
  };
  const middle = Math.floor(rows.length / 2);
  const reference = unwrap(rows[middle])[Math.floor(rows[middle].length / 2)];
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  for (const row of rows) {
    const longitudes = unwrap(row);
    const center = longitudes[Math.floor(longitudes.length / 2)];
    const shift = Math.round((reference - center) / CesiumMath.TWO_PI) * CesiumMath.TWO_PI;
    west = Math.min(west, ...longitudes.map((lon) => lon + shift));
    east = Math.max(east, ...longitudes.map((lon) => lon + shift));
    south = Math.min(south, ...row.map((point) => point.latitude));
    north = Math.max(north, ...row.map((point) => point.latitude));
  }
  if (north - south < 1e-10 || east - west < 1e-10) throw new Error("Select a larger map area.");
  if (east - west >= CesiumMath.TWO_PI - 1e-8)
    return new Rectangle(-Math.PI, south, Math.PI, north);
  return new Rectangle(
    CesiumMath.negativePiToPi(west),
    south,
    CesiumMath.negativePiToPi(east),
    north,
  );
}

/** Temporary pointer overlay owns only selection interaction and restores camera controls. */
export function selectMapRegion(
  viewer: Viewer,
  signal: AbortSignal,
  mode: MapSelectionMode,
): Promise<MapSelection> {
  signal.throwIfAborted();
  const canvas = viewer.scene.canvas;
  const container = canvas.parentElement;
  if (!container) return Promise.reject(new Error("The map is not ready."));
  const controller = viewer.scene.screenSpaceCameraController;
  const previousInputs = controller.enableInputs;
  viewer.camera.cancelFlight();
  controller.enableInputs = false;
  const overlay = document.createElement("div");
  overlay.className = "legend-selection-overlay";
  overlay.setAttribute(
    "aria-label",
    mode === "point"
      ? "Click to select a legend point. Escape cancels."
      : "Drag to select a legend area. Escape cancels.",
  );
  const box = document.createElement("div");
  box.className = "legend-selection-box";
  box.hidden = true;
  overlay.append(box);
  container.append(overlay);
  return new Promise((resolve, reject) => {
    let start: Cartesian2 | undefined;
    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return new Cartesian2(
        Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      );
    };
    const cleanup = () => {
      overlay.remove();
      if (!viewer.isDestroyed()) controller.enableInputs = previousInputs;
      signal.removeEventListener("abort", abort);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException("Selection cancelled.", "AbortError"));
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    overlay.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      start = point(event);
      overlay.setPointerCapture(event.pointerId);
    };
    overlay.onpointermove = (event) => {
      if (!start || mode === "point") return;
      const end = point(event);
      box.hidden = false;
      Object.assign(box.style, {
        left: `${Math.min(start.x, end.x)}px`,
        top: `${Math.min(start.y, end.y)}px`,
        width: `${Math.abs(end.x - start.x)}px`,
        height: `${Math.abs(end.y - start.y)}px`,
      });
    };
    overlay.onpointercancel = cancel;
    overlay.onpointerup = (event) => {
      if (!start || event.button !== 0) return;
      try {
        const end = point(event);
        if (mode === "point") {
          if (Cartesian2.distance(start, end) > 8)
            throw new Error("Click a point on the globe without dragging.");
          const position = viewer.camera.pickEllipsoid(end, viewer.scene.globe.ellipsoid);
          if (!position) throw new Error("Click a point on the globe.");
          const selected = viewer.scene.globe.ellipsoid.cartesianToCartographic(position);
          const rectangle = rectangleAroundPoint(selected);
          cleanup();
          resolve({ rectangle, point: selected });
          return;
        }
        if (Math.abs(start.x - end.x) < 8 || Math.abs(start.y - end.y) < 8)
          throw new Error("Drag a rectangle at least 8 pixels wide and high.");
        const left = Math.min(start.x, end.x),
          top = Math.min(start.y, end.y);
        const width = Math.abs(start.x - end.x),
          height = Math.abs(start.y - end.y);
        const rows: Cartographic[][] = [];
        // 对屏幕框内的网格采样，保留反经线两侧的经度连续性及曲面上的纬度极值。
        for (let y = 0; y <= 24; y++) {
          const row: Cartographic[] = [];
          for (let x = 0; x <= 24; x++) {
            const position = viewer.camera.pickEllipsoid(
              new Cartesian2(left + (width * x) / 24, top + (height * y) / 24),
              viewer.scene.globe.ellipsoid,
            );
            if (!position)
              throw new Error("Keep the selection on the globe. Zoom in or use a 2D view.");
            row.push(viewer.scene.globe.ellipsoid.cartesianToCartographic(position));
          }
          rows.push(row);
        }
        const rectangle = rectangleFromSelectionRows(rows);
        // 极点可能落在采样网格之间；若极点实际可见且在框内，四至必须包含全部经度。
        for (const latitude of [-Math.PI / 2, Math.PI / 2]) {
          const pole = Cartesian3.fromRadians(0, latitude, 0, viewer.scene.globe.ellipsoid);
          const screen = SceneTransforms.worldToWindowCoordinates(viewer.scene, pole);
          if (
            !screen ||
            screen.x < left ||
            screen.x > left + width ||
            screen.y < top ||
            screen.y > top + height
          )
            continue;
          const visible = viewer.camera.pickEllipsoid(screen, viewer.scene.globe.ellipsoid);
          if (
            !visible ||
            Cartesian3.distance(visible, pole) > viewer.scene.globe.ellipsoid.maximumRadius * 1e-5
          )
            continue;
          rectangle.west = -Math.PI;
          rectangle.east = Math.PI;
          if (latitude > 0) rectangle.north = latitude;
          else rectangle.south = latitude;
        }
        cleanup();
        resolve({ rectangle });
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
  });
}
