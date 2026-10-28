export interface LegendEntry {
  id: string;
  /** A missing/invalid API color stays unknown, rather than becoming a shared gray category. */
  color: string | null;
  name: string;
  age: string;
  lithology: string;
  description: string;
  citation: string;
  sourceId?: string;
  youngestAge?: number;
  oldestAge?: number;
}

export interface LegendGroup {
  key: string;
  color: string | null;
  name: string;
  age: string;
  entries: LegendEntry[];
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const identifier = (value: unknown) =>
  (typeof value === "number" || typeof value === "string") && /^\d+$/.test(String(value))
    ? String(value)
    : undefined;
const ageValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function normalizeColor(value: unknown): string | null {
  const color = text(value).toLowerCase();
  if (/^#[\da-f]{6}$/.test(color)) return color;
  if (/^#[\da-f]{3}$/.test(color))
    return `#${[...color.slice(1)].map((digit) => digit + digit).join("")}`;
  return null;
}

export function parseLegend(data: unknown): LegendEntry[] {
  if (!Array.isArray(data)) throw new Error("Macrostrat returned an unsupported legend response.");
  return data.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid Macrostrat legend entry.");
    const row = item as Record<string, unknown>;
    const id = identifier(row.legend_id);
    if (id === undefined) throw new Error("Macrostrat legend entry has no valid legend_id.");
    return {
      id,
      color: normalizeColor(row.color),
      name: text(row.map_unit_name) || `Unit ${id}`,
      age: text(row.age),
      lithology: text(row.lith),
      description: text(row.descrip),
      citation: text(row.comments),
      sourceId: identifier(row.source_id),
      youngestAge: ageValue(row.t_age),
      oldestAge: ageValue(row.b_age),
    };
  });
}

export const legendGroupKey = (entry: LegendEntry) => entry.color ?? `unknown:${entry.id}`;

/** Same PNG color means one display entry; original records remain associated with their IDs. */
export function groupLegendEntries(entries: Iterable<LegendEntry>): LegendGroup[] {
  const unique = new Map<string, LegendEntry>();
  for (const entry of entries) if (!unique.has(entry.id)) unique.set(entry.id, entry);
  const groups = new Map<string, LegendGroup>();
  for (const entry of unique.values()) {
    const key = legendGroupKey(entry);
    let group = groups.get(key);
    if (!group) {
      group = { key, color: entry.color, name: "", age: "", entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  for (const group of groups.values()) {
    group.entries.sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        a.age.localeCompare(b.age) ||
        a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
    const names = new Set(group.entries.map((entry) => entry.name));
    const ages = new Set(group.entries.map((entry) => entry.age));
    // 同色不等于同一地质分类；有不同名称/年代时使用集合标题，不取第一项冒充整组。
    group.name = names.size === 1 ? group.entries[0].name : `${names.size} map units`;
    group.age = ages.size === 1 ? group.entries[0].age : "Multiple ages";
  }
  return [...groups.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key),
  );
}
