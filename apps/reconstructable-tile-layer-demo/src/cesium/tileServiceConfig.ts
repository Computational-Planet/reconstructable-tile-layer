/** 可导出的连接表单；示例只负责填值，Provider 仅由这些显式字段构造。 */
export type TileServiceProtocol = "url-template" | "wms" | "wmts";
export type UrlTemplateTilingSchemeKey = "geographic" | "web-mercator";
export type UrlTemplateProviderConfig = {
  url: string;
  tilingSchemeKey: UrlTemplateTilingSchemeKey;
  minimumLevel: number;
  maximumLevel: number;
};
export interface TileServiceConfig {
  protocol: TileServiceProtocol;
  name: string;
  url: string;
  tilingSchemeKey: UrlTemplateTilingSchemeKey;
  minimumLevel: number;
  maximumLevel: number | null;
  tileWidth: number;
  tileHeight: number;
  levelZeroTilesX: number;
  levelZeroTilesY: number;
  bounds: [number, number, number, number] | null;
  subdomains: string;
  credit: string;
  parameters: string;
  wms: {
    layers: string;
    styles: string;
    version: "1.1.1" | "1.3.0";
    crs: "EPSG:4326" | "CRS:84" | "EPSG:3857";
    format: string;
    transparent: boolean;
  };
  wmts: {
    layer: string;
    style: string;
    format: string;
    tileMatrixSetID: string;
    tileMatrixLabels: string;
    dimensions: string;
  };
}

export function emptyTileServiceConfig(): TileServiceConfig {
  return {
    protocol: "url-template",
    name: "",
    url: "",
    tilingSchemeKey: "web-mercator",
    minimumLevel: 0,
    maximumLevel: 18,
    tileWidth: 256,
    tileHeight: 256,
    levelZeroTilesX: 1,
    levelZeroTilesY: 1,
    bounds: null,
    subdomains: "a,b,c",
    credit: "",
    parameters: "",
    wms: {
      layers: "",
      styles: "",
      version: "1.3.0",
      crs: "EPSG:3857",
      format: "image/png",
      transparent: true,
    },
    wmts: {
      layer: "",
      style: "default",
      format: "image/png",
      tileMatrixSetID: "",
      tileMatrixLabels: "",
      dimensions: "",
    },
  };
}

export function migrateUrlTemplateConfig(value: UrlTemplateProviderConfig): TileServiceConfig {
  return {
    ...emptyTileServiceConfig(),
    ...value,
    levelZeroTilesX: value.tilingSchemeKey === "geographic" ? 2 : 1,
    wms: {
      ...emptyTileServiceConfig().wms,
      crs: value.tilingSchemeKey === "geographic" ? "EPSG:4326" : "EPSG:3857",
    },
  };
}

export function splitMatrixLabels(text: string) {
  return text.trim() ? text.split(/\r?\n/).map((line) => line.trim()) : [];
}

/** 附加参数用逐行 key=value，保留值中的等号与时间文本，不把模型日期解释为地质年龄。 */
export function parseServiceParameters(text: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    if (separator < 1 || !/^[A-Za-z_][\w.:-]*$/.test(key))
      throw new Error("Additional parameters must use one name=value pair per line.");
    if (seen.has(key.toLowerCase())) throw new Error(`Duplicate parameter: ${key}.`);
    if (["__proto__", "constructor", "prototype", "hasownproperty"].includes(key.toLowerCase()))
      throw new Error(`Unsupported parameter name: ${key}.`);
    seen.add(key.toLowerCase());
    result[key] = line.slice(separator + 1).trim();
  }
  return result;
}

// 表单字段和 Cesium 自动计算的请求参数不能被 URL 查询串或高级参数悄悄覆盖。
export const MANAGED_SERVICE_PARAMETERS = {
  "url-template": [],
  wms: [
    "service",
    "request",
    "version",
    "layers",
    "styles",
    "crs",
    "srs",
    "bbox",
    "width",
    "height",
    "format",
    "transparent",
  ],
  wmts: [
    "service",
    "request",
    "version",
    "layer",
    "style",
    "format",
    "tilematrixset",
    "tilematrix",
    "tilerow",
    "tilecol",
  ],
} satisfies Record<TileServiceProtocol, string[]>;

export function validateTileServiceConfig(config: TileServiceConfig): string[] {
  const errors: string[] = [];
  const url = config.url.trim();
  const protocol = config.protocol;
  if (!["url-template", "wms", "wmts"].includes(protocol))
    return ["Choose URL template, WMS or WMTS."];
  if (!url) errors.push("Enter a service URL, or choose an example to fill the form.");
  else if (/^(?!https?:)[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("//"))
    errors.push("Use an HTTP(S) service URL or a relative URL served by this app.");
  if (url) {
    try {
      const parsed = new URL(url, "https://demo.invalid/");
      if (parsed.hash)
        errors.push("Remove the URL fragment (#...); it is not sent to the tile service.");
    } catch {
      errors.push("The service URL is malformed.");
    }
  }
  if (!url.includes(":") && !/^[./]/.test(url) && url && !url.includes("{"))
    errors.push("Use an explicit https:// URL or a relative path starting with ./ or /.");
  if (!["geographic", "web-mercator"].includes(config.tilingSchemeKey))
    errors.push("Choose a supported tiling scheme.");
  for (const [label, value] of [
    ["Minimum level", config.minimumLevel],
    ["Maximum level", config.maximumLevel],
  ] as const) {
    if (value === null && label === "Maximum level") continue;
    if (value === null || !Number.isInteger(value) || value < 0 || value > 24)
      errors.push(`${label} must be an integer from 0 to 24.`);
  }
  if (config.maximumLevel !== null && config.maximumLevel < config.minimumLevel)
    errors.push("Maximum level must be at least the minimum level.");
  for (const [label, value, limit] of [
    ["Tile width", config.tileWidth, 4096],
    ["Tile height", config.tileHeight, 4096],
    ["L0 columns", config.levelZeroTilesX, 64],
    ["L0 rows", config.levelZeroTilesY, 64],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > limit)
      errors.push(`${label} must be an integer from 1 to ${limit}.`);
  }
  if (config.bounds) {
    const [west, south, east, north] = config.bounds;
    if (
      !config.bounds.every(Number.isFinite) ||
      west < -180 ||
      east > 180 ||
      west >= east ||
      south < -90 ||
      north > 90 ||
      south >= north
    )
      errors.push("Coverage needs -180 ≤ west < east ≤ 180 and -90 ≤ south < north ≤ 90.");
    if (config.tilingSchemeKey === "web-mercator" && (south < -85.05112878 || north > 85.05112878))
      errors.push("Web Mercator coverage must stay within ±85.05112878° latitude.");
  }
  const tokens = [...url.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
  if (protocol === "url-template" && url) {
    if (!tokens.includes("z") && !tokens.includes("reverseZ"))
      errors.push("URL template needs {z} or {reverseZ}.");
    if (!tokens.includes("x") && !tokens.includes("reverseX"))
      errors.push("URL template needs {x} or {reverseX}.");
    if (!tokens.includes("y") && !tokens.includes("reverseY"))
      errors.push("URL template needs {y} (XYZ) or {reverseY} (TMS).");
    if (tokens.includes("reverseZ") && config.maximumLevel === null)
      errors.push("{reverseZ} requires an explicit maximum level.");
    const allowed = [
      "x",
      "y",
      "z",
      "s",
      "reverseX",
      "reverseY",
      "reverseZ",
      "westDegrees",
      "southDegrees",
      "eastDegrees",
      "northDegrees",
      "westProjected",
      "southProjected",
      "eastProjected",
      "northProjected",
      "width",
      "height",
    ];
    for (const token of tokens)
      if (!allowed.includes(token))
        errors.push(`Unknown URL placeholder: {${token}}. Enter a literal value instead.`);
  }
  if (tokens.includes("s") && !config.subdomains.split(",").some((part) => part.trim()))
    errors.push("{s} requires at least one subdomain.");
  if (protocol === "wms") {
    if (!config.wms.layers.trim()) errors.push("WMS layers are required.");
    if (!["1.1.1", "1.3.0"].includes(config.wms.version))
      errors.push("Choose WMS version 1.1.1 or 1.3.0.");
    const crs = config.wms.crs;
    if (
      config.tilingSchemeKey === "geographic"
        ? !["EPSG:4326", "CRS:84"].includes(crs)
        : crs !== "EPSG:3857"
    )
      errors.push("WMS CRS must match the selected geographic or Web Mercator tiling scheme.");
    if (config.wms.version === "1.1.1" && crs === "CRS:84")
      errors.push("Use EPSG:4326 with WMS 1.1.1, or select WMS 1.3.0 for CRS:84.");
    if (!/^image\//.test(config.wms.format))
      errors.push("WMS format must be an image MIME type, such as image/png.");
    if (tokens.some((token) => token !== "s"))
      errors.push(
        "WMS needs a service endpoint; tile bounds are generated from the tiling scheme.",
      );
  }
  if (protocol === "wmts") {
    if (!config.wmts.layer.trim()) errors.push("WMTS layer is required.");
    if (!config.wmts.style.trim()) errors.push("WMTS style is required (often default).");
    if (!config.wmts.tileMatrixSetID.trim()) errors.push("WMTS tile matrix set is required.");
    if (!/^image\//.test(config.wmts.format))
      errors.push("WMTS format must be an image MIME type, such as image/png.");
    if (
      tokens.some((token) => token !== "s") &&
      !["TileMatrix", "TileRow", "TileCol"].every((token) => tokens.includes(token))
    )
      errors.push(
        "WMTS REST URLs need {TileMatrix}, {TileRow} and {TileCol}; KVP uses the base endpoint.",
      );
    const labels = splitMatrixLabels(config.wmts.tileMatrixLabels);
    if (
      labels.length &&
      (labels.some((label) => !label) ||
        config.maximumLevel === null ||
        labels.length <= config.maximumLevel)
    )
      errors.push(
        "Supply one non-empty matrix label for each level from L0 through the explicit maximum level.",
      );
  }
  try {
    const parameters = parseServiceParameters(config.parameters);
    const dimensions = protocol === "wmts" ? parseServiceParameters(config.wmts.dimensions) : {};
    const reserved = MANAGED_SERVICE_PARAMETERS[protocol] as string[];
    for (const key of [...Object.keys(parameters), ...Object.keys(dimensions)]) {
      if (reserved.includes(key.toLowerCase()))
        errors.push(
          `${key} is controlled by the form or tiling scheme; remove it from additional parameters.`,
        );
    }
    if (protocol === "wmts") {
      const allowed = [
        "Layer",
        "layer",
        "TileMatrix",
        "TileRow",
        "TileCol",
        "TileMatrixSet",
        "style",
        "Style",
        "s",
        ...Object.keys(dimensions),
      ];
      for (const token of tokens)
        if (!allowed.includes(token))
          errors.push(
            `Set WMTS dimension ${token}=value, or replace {${token}} with a literal value.`,
          );
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

/** 从 JSON 恢复时拒绝错型/缺项，而不是静默丢失地址或投影设置后加载另一份数据。 */
export function parseTileServiceConfig(value: unknown): TileServiceConfig {
  const record = value as Partial<TileServiceConfig> | null;
  const defaults = emptyTileServiceConfig();
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error("Invalid tile service configuration.");
  for (const key of [
    "protocol",
    "name",
    "url",
    "tilingSchemeKey",
    "subdomains",
    "credit",
    "parameters",
  ] as const)
    if (typeof record[key] !== "string") throw new Error(`Invalid service field: ${key}.`);
  for (const key of [
    "minimumLevel",
    "tileWidth",
    "tileHeight",
    "levelZeroTilesX",
    "levelZeroTilesY",
  ] as const)
    if (typeof record[key] !== "number" || !Number.isFinite(record[key]))
      throw new Error(`Invalid service field: ${key}.`);
  if (
    record.maximumLevel !== null &&
    (typeof record.maximumLevel !== "number" || !Number.isFinite(record.maximumLevel))
  )
    throw new Error("Invalid service maximum level.");
  if (
    record.bounds !== null &&
    (!Array.isArray(record.bounds) ||
      record.bounds.length !== 4 ||
      !record.bounds.every((item) => typeof item === "number" && Number.isFinite(item)))
  )
    throw new Error("Invalid service coverage.");
  for (const group of ["wms", "wmts"] as const) {
    if (!record[group] || typeof record[group] !== "object")
      throw new Error(`Invalid ${group} settings.`);
    for (const [key, item] of Object.entries(defaults[group])) {
      if (typeof (record[group] as unknown as Record<string, unknown>)[key] !== typeof item)
        throw new Error(`Invalid ${group} field: ${key}.`);
    }
  }
  // 仅复制已知字段，确保导入对象不会夹带构造函数或外部实现参数。
  const config = Object.fromEntries(
    Object.keys(defaults).map((key) => [
      key,
      key === "wms" || key === "wmts"
        ? Object.fromEntries(
            Object.keys(defaults[key]).map((field) => [
              field,
              (record[key] as unknown as Record<string, unknown>)[field],
            ]),
          )
        : record[key as keyof TileServiceConfig],
    ]),
  ) as unknown as TileServiceConfig;
  const errors = validateTileServiceConfig(config);
  if (errors.length) throw new Error(`Invalid tile service configuration: ${errors[0]}`);
  return structuredClone(config);
}
