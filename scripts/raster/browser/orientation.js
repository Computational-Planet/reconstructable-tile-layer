import {
  GeographicTilingScheme,
  ImageryProvider,
  Rectangle,
  WebMercatorTilingScheme,
} from "cesium";
import { WebGLTileProcessor } from "../../../packages/reconstructable-tile-layer/dist/es/processor.js";
import { RasterImageryProvider } from "../../../packages/rtl-raster-imagery-provider/dist/index.js";
import { openNetCDFSource } from "../../../packages/rtl-raster-source/dist/netcdf/index.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const file = async (name) => new File([await (await fetch(`/reference/${name}`)).blob()], name);
const samples = [
  [13, 11],
  [72, 69],
  [193, 117],
  [221, 224],
];
const pixel = (canvas, x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
const close = (actual, expected, label) => {
  assert(
    actual.every((value, i) => Math.abs(value - expected[i]) <= 2),
    `${label}: actual ${actual}, expected ${expected}`,
  );
};

function gradient() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  const image = context.createImageData(256, 256);
  // 红色独立编码东西位置，绿色独立编码南北位置，避免对称图像掩盖翻转。
  for (let row = 0; row < 256; row++)
    for (let column = 0; column < 256; column++) {
      image.data.set([column, row, 80, 255], 4 * (row * 256 + column));
    }
  context.putImageData(image, 0, 0);
  return canvas;
}

async function renderContracts(results) {
  const canvas = gradient();
  const image = new Image();
  image.src = canvas.toDataURL();
  await image.decode();
  const bitmap = await createImageBitmap(canvas, { imageOrientation: "flipY" });
  // 真正执行 Cesium 的常规在线影像解码路径，数据 URL 使测试不依赖外网。
  const cesiumImage = await ImageryProvider.loadImage(undefined, canvas.toDataURL());
  try {
    for (const legacyCanvasPool of [false, true]) {
      const processor = new WebGLTileProcessor({
        outputType: "canvas",
        legacyCanvasPool,
        poolSize: 1,
        slotCount: 1,
        vertexRowNum: 257,
      });
      try {
        for (const mercator of [false, true]) {
          const tilingScheme = mercator
            ? new WebMercatorTilingScheme()
            : new GeographicTilingScheme({
                rectangle: Rectangle.fromDegrees(-140, -70, 130, 80),
                numberOfLevelZeroTilesX: 1,
                numberOfLevelZeroTilesY: 1,
              });
          for (const [kind, input] of [
            ["canvas", canvas],
            ["html-image", image],
            ["flipped-bitmap", bitmap],
            ["cesium-loadImage", cesiumImage],
          ]) {
            const label = `${legacyCanvasPool ? "legacy" : "single"}/${mercator ? "3857" : "4326"}/${kind}`;
            const provider = { tilingScheme, requestImage: () => Promise.resolve(input) };
            const result = await processor.processSourceTileImage(1, 0, 2, provider);
            assert(result, `${label}: missing output`);
            const bounds = tilingScheme.tileXYToRectangle(1, 0, 2);
            const yMercator = (latitude) => Math.log(Math.tan(Math.PI / 4 + latitude / 2));
            const expected = (x, y) => {
              if (!mercator) return [x, y, 80, 255];
              const latitude = bounds.north + ((bounds.south - bounds.north) * (y + 0.5)) / 256;
              const topFraction =
                (yMercator(bounds.north) - yMercator(latitude)) /
                (yMercator(bounds.north) - yMercator(bounds.south));
              return [x, Math.max(0, Math.min(255, Math.round(topFraction * 256 - 0.5))), 80, 255];
            };
            for (const [x, y] of samples)
              close(pixel(result.source, x, y), expected(x, y), `${label} at ${x},${y}`);
            result.release();
            const masked = await processor.processMaskedSourceTileImage(
              1,
              0,
              2,
              [{ polygons: [{ exterior: [0, 0.5, 1, 0.5, 1, 1, 0, 1, 0, 0.5] }] }],
              provider,
            );
            assert(masked, `${label}: missing masked output`);
            const gl = processor.canvas.getContext("webgl");
            assert(gl.getError() === gl.NO_ERROR, `${label}: WebGL error after mask draw`);
            for (const [x, y] of samples)
              close(
                pixel(masked.source, x, y),
                y < 128 ? expected(x, y) : [0, 0, 0, 0],
                `${label} north-half mask at ${x},${y}`,
              );
            masked.release();
            results.push({ name: label, samples: samples.length, northHalfMask: true });
          }
        }
      } finally {
        processor.destroy();
      }
    }
  } finally {
    bitmap.close();
    cesiumImage.close?.();
  }
}

async function checkRealProvider(provider, label, results, sourceOracle) {
  const processor = new WebGLTileProcessor({ outputType: "canvas", slotCount: 1 });
  let checkedPixels = 0;
  let checkedSourceLocations = 0;
  try {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const image = await provider.requestImage(x, y, 2);
        const before = image.getContext("2d").getImageData(0, 0, 256, 256).data;
        const asset = await processor.processSourceTileImage(x, y, 2, provider);
        assert(asset, `${label}: missing L2 ${x}/${y}`);
        const after = asset.source.getContext("2d").getImageData(0, 0, 256, 256).data;
        for (let index = 0; index < before.length; index += 4 * 17) {
          close(
            [...after.slice(index, index + 4)],
            [...before.slice(index, index + 4)],
            `${label} L2 ${x}/${y} pixel ${index / 4}`,
          );
          checkedPixels++;
        }
        if (sourceOracle) {
          for (const [column, row] of samples) {
            // 独立按全球 L2 的经纬度和原坐标求最近像元，不复用 planGeographicRead。
            const longitude = -180 + (x + (column + 0.5) / 256) * 90;
            const latitude = 90 - (y + (row + 0.5) / 256) * 45;
            const { coordinates, width, values } = sourceOracle;
            const nearest = (axis, point) =>
              axis.reduce(
                (best, value, i) =>
                  Math.abs(value - point) < Math.abs(axis[best] - point) ? i : best,
                0,
              );
            const value =
              values[nearest(coordinates.y, latitude) * width + nearest(coordinates.x, longitude)];
            const gray = Math.round(Math.max(0, Math.min(1, (value + 8000) / 14000)) * 255);
            close(
              pixel(image, column, row),
              [gray, gray, gray, 255],
              `${label} geographic sample ${longitude},${latitude}`,
            );
            checkedSourceLocations++;
          }
        }
        asset.release();
      }
    results.push({ name: label, tiles: 16, checkedPixels, checkedSourceLocations });
  } finally {
    processor.destroy();
  }
}

window.runOrientationTests = async () => {
  const results = [];
  await renderContracts(results);
  const dataset = await openNetCDFSource(await file("paleodem.nc"));
  const source = await dataset.selectSlice({ variable: "z", indices: {} });
  const provider = await RasterImageryProvider.fromSource(source, {
    style: { kind: "single-band", band: 0, domain: [-8000, 6000] },
  });
  try {
    const values = (
      await source.readWindow({ window: [0, 0, source.metadata.width, source.metadata.height] })
    ).bands[0];
    await checkRealProvider(provider, "PaleoDEM NC4 EPSG:4326", results, {
      ...source.metadata,
      values,
    });
  } finally {
    provider.destroy();
    dataset.close();
  }
  for (const [name, label, style] of [
    [
      "stripped-preview.tif",
      "Strip-based TIFF EPSG:4326",
      { kind: "single-band", band: 0, domain: [0, 65535] },
    ],
    [
      "rgb-mercator.tif",
      "RGB TIFF EPSG:3857 to geographic tiles",
      {
        kind: "rgb",
        bands: [0, 1, 2],
        domains: [
          [0, 255],
          [0, 255],
          [0, 255],
        ],
      },
    ],
  ]) {
    const raster = await RasterImageryProvider.fromFile(await file(name), { style });
    try {
      await checkRealProvider(raster, label, results);
    } finally {
      raster.destroy();
    }
  }
  return results;
};
