import { useState } from "react";
import type { LegendEntry, LegendGroup } from "../../legend/entries";

const fields = [
  ["name", "Map unit"],
  ["age", "Age"],
  ["sourceId", "Source ID"],
  ["ageRange", "Age range"],
  ["lithology", "Lithology"],
  ["description", "Description"],
  ["citation", "Source notes"],
] as const;
type Field = (typeof fields)[number][0];

function attributes(entry: LegendEntry): Record<Field, string> {
  return {
    name: entry.name,
    age: entry.age,
    sourceId: entry.sourceId ?? "",
    ageRange:
      entry.youngestAge === undefined && entry.oldestAge === undefined
        ? ""
        : `${entry.youngestAge ?? "?"}–${entry.oldestAge ?? "?"} Ma`,
    lithology: entry.lithology,
    description: entry.description,
    citation: entry.citation,
  };
}

function LegendGroupDetails({ group }: { group: LegendGroup }) {
  const records = group.entries.map((entry) => ({ id: entry.id, values: attributes(entry) }));
  const first = records[0].values;
  const shared = new Set(
    fields
      .filter(([key]) => first[key] && records.every((record) => record.values[key] === first[key]))
      .map(([key]) => key),
  );
  const variants = new Map<string, { ids: string[]; values: Record<Field, string> }>();
  // 共同属性只展示一次；不同属性组合分别保留 ID，避免将岩性与名称、来源的对应关系打散。
  for (const record of records) {
    const key = JSON.stringify(record.values);
    const variant = variants.get(key);
    if (variant) variant.ids.push(record.id);
    else variants.set(key, { ids: [record.id], values: record.values });
  }
  return (
    <div className="legend-entry-detail">
      <p>{group.color ? `Color: ${group.color}` : "Color unavailable"}</p>
      <dl className="legend-attributes">
        {fields
          .filter(([key]) => shared.has(key) && key !== "name" && key !== "age")
          .map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{first[key]}</dd>
            </div>
          ))}
      </dl>
      <ul className="legend-records">
        {[...variants.values()].map(({ ids, values }) => (
          <li key={ids[0]}>
            <p>
              Legend {ids.length === 1 ? "ID" : "IDs"}: {ids.join(", ")}
            </p>
            <dl className="legend-attributes">
              {fields
                .filter(([key]) => values[key] && !shared.has(key))
                .map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{values[key]}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LegendGroupItem({ group }: { group: LegendGroup }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li>
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
          <span
            className={`legend-swatch${group.color ? "" : " is-unknown"}`}
            style={group.color ? { backgroundColor: group.color } : undefined}
            aria-hidden="true"
          />
          <span>
            <strong>{group.name}</strong>
            <small>
              {[
                group.age,
                `${group.entries.length} ${group.entries.length === 1 ? "record" : "records"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
          <span className="legend-detail-indicator" aria-hidden="true">
            ▸
          </span>
        </summary>
        {/* 原始记录可能有数千条；仅在展开色块后创建详细 DOM。 */}
        {expanded && <LegendGroupDetails group={group} />}
      </details>
    </li>
  );
}
