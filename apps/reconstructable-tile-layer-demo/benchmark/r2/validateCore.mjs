import {
  GeographicTilingScheme,
  Math as CesiumMath,
  Rectangle,
  RectangleGeometry,
} from "cesium";
import { subdivideRenderRectangle } from "../../../../packages/reconstructable-tile-layer/dist/es/renderRectangleSubdivision.js";

export function validateCoreAssumptions() {
  const tilingScheme = new GeographicTilingScheme();
  const maximumExtent = Math.PI / 4;
  const checks = [];

  for (const level of [0, 1, 2]) {
    const rectangle = tilingScheme.tileXYToRectangle(0, 0, level);
    const parts = subdivideRenderRectangle(rectangle, {
      mode: "max-angular-extent",
      radians: maximumExtent,
    });
    const expectedPartCount = level === 0 ? 16 : level === 1 ? 4 : 1;
    checks.push(check(`level-${level}-part-count`, parts.length, expectedPartCount));
    for (const [partIndex, part] of parts.entries()) {
      checks.push(
        check(
          `level-${level}-part-${partIndex}-extent`,
          Rectangle.computeWidth(part.rectangle) <= maximumExtent + CesiumMath.EPSILON10 &&
            Rectangle.computeHeight(part.rectangle) <= maximumExtent + CesiumMath.EPSILON10,
          true,
        ),
      );
    }

    const originalTriangles = triangleCount(rectangle);
    const splitTriangles = parts.reduce(
      (sum, part) => sum + triangleCount(part.rectangle),
      0,
    );
    checks.push(
      check(
        `level-${level}-aggregate-triangle-count`,
        splitTriangles,
        originalTriangles,
      ),
    );
  }

  checks.push(
    check(
      "global-level-4-rgba8-estimate",
      4_852 * 256 * 256 * 4,
      1_271_922_688,
    ),
  );
  const failures = checks.filter((item) => !item.passed);
  if (failures.length > 0) {
    throw new Error(`R2 core validation failed: ${JSON.stringify(failures)}`);
  }
  return checks;
}

function triangleCount(rectangle) {
  const geometry = RectangleGeometry.createGeometry(
    new RectangleGeometry({ rectangle }),
  );
  return (geometry?.indices?.length ?? 0) / 3;
}

function check(name, observed, expected) {
  return { name, observed, expected, passed: observed === expected };
}
