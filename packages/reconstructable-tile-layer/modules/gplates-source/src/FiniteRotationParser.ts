import {
  readGplatesText,
  type GplatesReadOptions,
  type GplatesSource,
} from "./GplatesFileReader.js";

/** One finite Euler rotation, independent of the interpolation/rendering engine. */
export interface FiniteRotationRecord {
  /** Moving plate identifier. */
  plateId: string;
  /** Geological age in millions of years ago (Ma). */
  age: number;
  rotation: {
    /** Euler-pole latitude in degrees. */
    latitude: number;
    /** Euler-pole longitude in degrees. */
    longitude: number;
    /** Right-handed rotation angle in degrees. */
    angle: number;
  };
  /** Fixed plate identifier for this finite rotation. */
  relatedId: string;
}

/** Parsed rotations grouped by moving plate ID, in source order. */
export type FiniteRotationRecords = Record<string, FiniteRotationRecord[]>;

/**
 * Parses ROT text, ignoring blank lines, `!` comments and malformed records.
 * Retains the legacy duplicate-age normalization used by the interpolator.
 */
export function parseFiniteRotationText(content: string): FiniteRotationRecords {
  const res: FiniteRotationRecords = {};
  content
    .trim()
    .split("\n")
    .forEach((line) => {
      const dataLine = line.split("!")[0]?.trim();
      if (!dataLine) return;

      const [plateId, age, rotationLat, rotationLon, rotationAngle, relatedId] =
        dataLine.split(/\s+/);
      const parsedAge = Number(age);
      const parsedLatitude = Number(rotationLat);
      const parsedLongitude = Number(rotationLon);
      const parsedAngle = Number(rotationAngle);
      if (
        !plateId ||
        !relatedId ||
        !Number.isFinite(parsedAge) ||
        !Number.isFinite(parsedLatitude) ||
        !Number.isFinite(parsedLongitude) ||
        !Number.isFinite(parsedAngle)
      ) {
        return;
      }

      if (!Object.hasOwn(res, plateId)) {
        Object.defineProperty(res, plateId, {
          value: [],
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      const data: FiniteRotationRecord = {
        plateId,
        age: parsedAge,
        rotation: { latitude: parsedLatitude, longitude: parsedLongitude, angle: parsedAngle },
        relatedId,
      };
      const lastItem = res[plateId][res[plateId].length - 1];
      if (lastItem && data.age === lastItem.age && data.relatedId === lastItem.relatedId) return;
      // 保留既有参考板块切换语义：同龄异参考记录把前一条时间提前 0.01 Ma。
      // 本次仅移动读取职责，不改变旋转插值算法。
      if (lastItem?.age === data.age) lastItem.age -= 0.01;
      res[plateId].push(data);
    });
  return res;
}

/** Reads ROT sources in the supplied order and parses their combined text. */
export async function loadFiniteRotationRecords(
  sources: readonly GplatesSource[],
  options: GplatesReadOptions = {},
): Promise<FiniteRotationRecords> {
  options.signal?.throwIfAborted();
  const contents = await Promise.all(sources.map((source) => readGplatesText(source, options)));
  options.signal?.throwIfAborted();
  return parseFiniteRotationText(contents.join("\n"));
}
