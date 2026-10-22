import {
  Cartesian2,
  GeographicTilingScheme,
  Math as CesiumMath,
  Rectangle,
  type Cartographic,
} from "cesium";

/** Geographic tiles over a raster extent, including poles and the antimeridian. */
export class RasterTilingScheme extends GeographicTilingScheme {
  override tileXYToRectangle(x: number, y: number, level: number, result?: Rectangle): Rectangle {
    const tile = super.tileXYToRectangle(x, y, level, result);
    const extent = this.rectangle;
    // 外圈直接复用范围端点，避免 north - height 再次把精确的 -π/2 算成近似值。
    if (x === 0) tile.west = extent.west;
    if (x === this.getNumberOfXTilesAtLevel(level) - 1) tile.east = extent.east;
    if (y === 0) tile.north = extent.north;
    if (y === this.getNumberOfYTilesAtLevel(level) - 1) tile.south = extent.south;
    // 跨日期变更线的范围会生成 >π 的内部经度；RectangleGeometry 要求合法的环绕表示。
    tile.west = CesiumMath.negativePiToPi(tile.west);
    tile.east = CesiumMath.negativePiToPi(tile.east);
    return tile;
  }

  override positionToTileXY(
    position: Cartographic,
    level: number,
    result?: Cartesian2,
  ): Cartesian2 {
    const extent = this.rectangle;
    if (extent.east >= extent.west) return super.positionToTileXY(position, level, result);

    // 与环绕后的瓦片范围保持一致：只有位于西界另一侧的经度才需要加 2π。
    const longitude =
      position.longitude < extent.west
        ? position.longitude + CesiumMath.TWO_PI
        : position.longitude;
    const east = extent.east + CesiumMath.TWO_PI;
    // 使用同一条连续经度区间判断覆盖范围，也适用于西界为负经度的宽幅栅格。
    if (
      !(
        (longitude >= extent.west ||
          CesiumMath.equalsEpsilon(longitude, extent.west, CesiumMath.EPSILON14)) &&
        (longitude <= east || CesiumMath.equalsEpsilon(longitude, east, CesiumMath.EPSILON14)) &&
        position.latitude >= extent.south &&
        position.latitude <= extent.north
      )
    )
      return super.positionToTileXY(position, level, result);
    const columns = this.getNumberOfXTilesAtLevel(level);
    const rows = this.getNumberOfYTilesAtLevel(level);
    const x = Math.floor(((longitude - extent.west) / extent.width) * columns);
    const y = Math.floor(((extent.north - position.latitude) / extent.height) * rows);
    return Cartesian2.fromElements(
      Math.max(0, Math.min(columns - 1, x)),
      Math.max(0, Math.min(rows - 1, y)),
      result,
    );
  }
}
