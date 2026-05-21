import type {
  CoordinateOrder,
  ParsedGpmlFeature,
  ParsedGpmlGeometry,
  ParsedGpmlPolygon,
  PolygonRenderIntentMode,
  Position,
  RenderIntent,
} from "./types";

const DISTANT_FUTURE_TIME = -999;
const DISTANT_PAST_TIME = 999999;
const GEOMETRY_PROPERTY_NAMES = new Set([
  "boundary",
  "centerLineOf",
  "outlineOf",
  "position",
  "unclassifiedGeometry",
]);
const PLATE_ATTRIBUTE_KEYS = ["PLATEID", "PLATEID1", "RECON_PLATE_ID"];
const AREA_FEATURE_TYPES = new Set([
  "Basin",
  "ClosedContinentalBoundary",
  "ContinentalFragment",
  "Craton",
  "IslandArc",
]);
const LINE_LIKE_FEATURE_TYPES = new Set([
  "Coastline",
  "TerraneBoundary",
  "InferredPaleoBoundary",
  "PassiveContinentalBoundary",
]);

export interface GpmlParserOptions {
  coordinateOrder?: CoordinateOrder;
  polygonRenderIntent?: PolygonRenderIntentMode;
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function childElements(node: Node) {
  return Array.from(node.childNodes).filter(isElement);
}

function descendantsByLocalName(node: Element | Document, localName: string) {
  return Array.from(node.getElementsByTagName("*")).filter(
    (element) => element.localName === localName,
  );
}

function firstDescendantByLocalName(
  node: Element | Document,
  localName: string,
) {
  return descendantsByLocalName(node, localName)[0];
}

function directChildByLocalName(node: Element, localName: string) {
  return childElements(node).find((element) => element.localName === localName);
}

function directChildText(node: Element, localName: string) {
  const text = directChildByLocalName(node, localName)?.textContent?.trim();
  return text ? text : undefined;
}

function parseNumber(text?: string | number) {
  if (typeof text === "number") {
    return Number.isFinite(text) ? text : undefined;
  }
  if (!text) {
    return undefined;
  }
  const match = text.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function parseGeoTime(text?: string) {
  if (!text) {
    return undefined;
  }
  if (text.includes("distantFuture")) {
    return DISTANT_FUTURE_TIME;
  }
  if (text.includes("distantPast")) {
    return DISTANT_PAST_TIME;
  }
  return parseNumber(text);
}

function parseAttributeValue(text: string) {
  const value = text.trim();
  if (/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function parseShapefileAttributes(featureElement: Element) {
  const attributes: Record<string, string | number> = {};
  descendantsByLocalName(featureElement, "KeyValueDictionaryElement").forEach(
    (element) => {
      const key = directChildText(element, "key");
      const value = directChildText(element, "value");
      if (key && value !== undefined) {
        attributes[key] = parseAttributeValue(value);
      }
    },
  );
  return attributes;
}

function getAttributeNumber(
  attributes: Record<string, string | number>,
  keys: string[],
) {
  const normalizedEntries: Array<[string, string | number]> = Object.entries(
    attributes,
  ).map(([key, value]) => [key.toUpperCase(), value]);
  const normalized = new Map<string, string | number>(normalizedEntries);

  for (const key of keys) {
    const value = normalized.get(key);
    if (typeof value === "number") {
      return value;
    }
    const parsed = parseNumber(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function parseNumberFromElement(element?: Element) {
  return parseNumber(element?.textContent?.trim());
}

function parseValidTime(featureElement: Element) {
  const validTimeElement = firstDescendantByLocalName(featureElement, "validTime");
  if (!validTimeElement) {
    return undefined;
  }

  const beginElement = firstDescendantByLocalName(validTimeElement, "begin");
  const endElement = firstDescendantByLocalName(validTimeElement, "end");

  return {
    begin: parseGeoTime(beginElement?.textContent?.trim()),
    end: parseGeoTime(endElement?.textContent?.trim()),
  };
}

function getDimension(posListElement: Element) {
  const dimension = Array.from(posListElement.attributes).find(
    (attribute) => attribute.localName === "dimension",
  )?.value;
  return Number(dimension) || 2;
}

function detectCoordinateOrder(
  values: number[],
  dimension: number,
): Exclude<CoordinateOrder, "auto"> {
  let latLonScore = 0;
  let lonLatScore = 0;

  for (let index = 0; index + 1 < values.length; index += dimension) {
    const first = values[index];
    const second = values[index + 1];

    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
      latLonScore += Math.abs(second) > 90 ? 2 : 1;
    }
    if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
      lonLatScore += Math.abs(first) > 90 ? 2 : 1;
    }
  }

  // GPlates GPML commonly stores coordinates as latitude/longitude.
  return lonLatScore > latLonScore ? "lon-lat" : "lat-lon";
}

function convertPairsToPositions(
  values: number[],
  dimension: number,
  coordinateOrder: CoordinateOrder,
) {
  const detectedOrder =
    coordinateOrder === "auto"
      ? detectCoordinateOrder(values, dimension)
      : coordinateOrder;
  const positions: Position[] = [];

  for (let index = 0; index + 1 < values.length; index += dimension) {
    const first = values[index];
    const second = values[index + 1];
    const position: Position =
      detectedOrder === "lat-lon" ? [second, first] : [first, second];
    positions.push(position);
  }

  return closePolygonRing(positions);
}

function closePolygonRing(positions: Position[]) {
  if (positions.length === 0) {
    return positions;
  }

  const first = positions[0];
  const last = positions[positions.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...positions, [first[0], first[1]] as Position];
  }
  return positions;
}

function parsePosList(posListElement: Element, coordinateOrder: CoordinateOrder) {
  const values =
    posListElement.textContent
      ?.trim()
      .split(/\s+/)
      .map(Number)
      .filter((value) => Number.isFinite(value)) ?? [];

  return convertPairsToPositions(
    values,
    getDimension(posListElement),
    coordinateOrder,
  );
}

function firstPosListUnder(node?: Element) {
  return node ? firstDescendantByLocalName(node, "posList") : undefined;
}

function parsePolygonGeometry(
  polygonElement: Element,
  coordinateOrder: CoordinateOrder,
): ParsedGpmlPolygon | undefined {
  const exteriorElement = firstDescendantByLocalName(polygonElement, "exterior");
  const exteriorPosList = firstPosListUnder(exteriorElement);
  if (!exteriorPosList) {
    return undefined;
  }

  const exterior = parsePosList(exteriorPosList, coordinateOrder);
  if (exterior.length < 4) {
    return undefined;
  }

  const interiors = descendantsByLocalName(polygonElement, "interior")
    .map((interiorElement) => firstPosListUnder(interiorElement))
    .filter((posList): posList is Element => Boolean(posList))
    .map((posList) => parsePosList(posList, coordinateOrder))
    .filter((ring) => ring.length >= 4);

  return { exterior, interiors };
}

function getGeometryPropertyName(polygonElement: Element, featureElement: Element) {
  let parent = polygonElement.parentElement;
  while (parent && parent !== featureElement) {
    if (GEOMETRY_PROPERTY_NAMES.has(parent.localName)) {
      return parent.localName;
    }
    parent = parent.parentElement;
  }
  return "geometry";
}

function parseGeometries(
  featureElement: Element,
  coordinateOrder: CoordinateOrder,
) {
  const geometries: ParsedGpmlGeometry[] = [];
  descendantsByLocalName(featureElement, "Polygon").forEach((polygonElement) => {
    const polygon = parsePolygonGeometry(polygonElement, coordinateOrder);
    if (!polygon) {
      return;
    }

    geometries.push({
      propertyName: getGeometryPropertyName(polygonElement, featureElement),
      geometryType: "Polygon",
      polygon,
    });
  });
  return geometries;
}

function stripNamespace(value: string | number | undefined) {
  if (value === undefined) {
    return "";
  }
  const text = String(value);
  return text.includes(":") ? text.slice(text.lastIndexOf(":") + 1) : text;
}

function getAttributeText(
  attributes: Record<string, string | number>,
  key: string,
) {
  const targetKey = key.toUpperCase();
  const entry = Object.entries(attributes).find(
    ([attributeKey]) => attributeKey.toUpperCase() === targetKey,
  );
  return entry ? String(entry[1]) : undefined;
}

function classifyRenderIntent(
  featureType: string,
  geometries: ParsedGpmlGeometry[],
  attributes: Record<string, string | number>,
  polygonRenderIntent: PolygonRenderIntentMode,
): { renderIntent: RenderIntent; renderIntentOverride?: PolygonRenderIntentMode } {
  const gpgimType = stripNamespace(getAttributeText(attributes, "GPGIM_TYPE"));
  const classificationType = gpgimType || featureType;
  const hasPolygon = geometries.some(
    (geometry) => geometry.geometryType === "Polygon",
  );
  let classifiedIntent: RenderIntent = "unknown";

  if (geometries.some((geometry) => geometry.propertyName === "centerLineOf")) {
    classifiedIntent = "line-like";
  } else if (AREA_FEATURE_TYPES.has(classificationType)) {
    classifiedIntent = "area";
  } else if (
    LINE_LIKE_FEATURE_TYPES.has(classificationType) ||
    (classificationType.includes("Boundary") &&
      !AREA_FEATURE_TYPES.has(classificationType))
  ) {
    classifiedIntent = "line-like";
  } else if (classificationType.includes("Coastline")) {
    classifiedIntent = "line-like";
  } else if (hasPolygon) {
    classifiedIntent = "area";
  }

  if (polygonRenderIntent === "all-polygons-area" && hasPolygon) {
    const result: {
      renderIntent: RenderIntent;
      renderIntentOverride?: PolygonRenderIntentMode;
    } = { renderIntent: "area" };
    if (classifiedIntent !== "area") {
      result.renderIntentOverride = "all-polygons-area";
    }
    return result;
  }
  return { renderIntent: classifiedIntent };
}

function parseFeatureMember(
  featureMemberElement: Element,
  index: number,
  coordinateOrder: CoordinateOrder,
  polygonRenderIntent: PolygonRenderIntentMode,
): ParsedGpmlFeature | undefined {
  const featureElement = childElements(featureMemberElement)[0];
  if (!featureElement) {
    return undefined;
  }

  const attributes = parseShapefileAttributes(featureElement);
  const id =
    firstDescendantByLocalName(featureElement, "identity")?.textContent?.trim() ||
    featureElement.getAttribute("gml:id") ||
    featureElement.getAttribute("id") ||
    `gpml-feature-${index}`;
  const name =
    firstDescendantByLocalName(featureElement, "name")?.textContent?.trim() ||
    String(attributes.NAME ?? "");
  const reconstructionPlateId =
    parseNumberFromElement(
      firstDescendantByLocalName(featureElement, "reconstructionPlateId"),
    ) ?? getAttributeNumber(attributes, PLATE_ATTRIBUTE_KEYS);
  const geometries = parseGeometries(featureElement, coordinateOrder);
  const intent = classifyRenderIntent(
    featureElement.localName,
    geometries,
    attributes,
    polygonRenderIntent,
  );

  const feature: ParsedGpmlFeature = {
    id,
    featureMemberIndex: index,
    featureType: featureElement.localName,
    reconstructionPlateId,
    conjugatePlateId: parseNumberFromElement(
      firstDescendantByLocalName(featureElement, "conjugatePlateId"),
    ),
    validTime: parseValidTime(featureElement),
    geometries,
    attributes,
    renderIntent: intent.renderIntent,
  };
  if (intent.renderIntentOverride) {
    feature.renderIntentOverride = intent.renderIntentOverride;
  }

  if (name) {
    feature.name = name;
  }

  return feature;
}

export function parseGpmlText(text: string, options: GpmlParserOptions = {}) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parserError = firstDescendantByLocalName(doc, "parsererror");
  if (parserError) {
    throw new Error(`Failed to parse GPML XML: ${parserError.textContent ?? ""}`);
  }

  const coordinateOrder = options.coordinateOrder ?? "auto";
  const polygonRenderIntent = options.polygonRenderIntent ?? "classified";
  return descendantsByLocalName(doc, "featureMember")
    .map((featureMemberElement, index) =>
      parseFeatureMember(
        featureMemberElement,
        index,
        coordinateOrder,
        polygonRenderIntent,
      ),
    )
    .filter((feature): feature is ParsedGpmlFeature => Boolean(feature));
}
