export const TIFF_ONLY_MESSAGE =
  "This demo supports TIFF / GeoTIFF raster files only. Convert NetCDF data to GeoTIFF before importing.";

/** 扩展名只用于文件选择提示；经典 TIFF 和 BigTIFF 均按字节序及文件签名识别。 */
export function assertTiffSignature(bytes: Uint8Array) {
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  const big = bytes[0] === 0x4d && bytes[1] === 0x4d;
  const version = little ? bytes[2] : bytes[3];
  const zero = little ? bytes[3] : bytes[2];
  if ((!little && !big) || zero !== 0 || (version !== 42 && version !== 43))
    throw new Error(TIFF_ONLY_MESSAGE);
}
