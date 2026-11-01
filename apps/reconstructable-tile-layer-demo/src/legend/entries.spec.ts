import { expect, it } from "vitest";
import { groupLegendEntries, parseLegend } from "./entries";

const archean = [
  [67681, "granodiorite gneiss; orthogneiss/paragneiss"],
  [67683, "medium-high grade orthogneiss"],
  [67684, "medium-high grade unclassified metamorphic rock"],
].map(([id, lith]) => ({
  legend_id: id,
  color: "#e20083",
  map_unit_name: "Archean crystalline metamorphic rocks",
  age: "Archean",
  source_id: 154,
  t_age: 2500,
  b_age: 4000,
  lith,
  descrip: `Description for ${id}`,
  comments: "Generalized Geology of the World",
}));

it("retains the three Archean records under one color without losing their attribute associations", () => {
  const entries = parseLegend([...archean, archean[0]]);
  const groups = groupLegendEntries(entries);
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({
    key: "#e20083",
    color: "#e20083",
    name: archean[0].map_unit_name,
    age: "Archean",
  });
  expect(groups[0].entries).toHaveLength(3);
  for (const row of archean)
    expect(groups[0].entries.find((entry) => entry.id === String(row.legend_id))).toMatchObject({
      lithology: row.lith,
      description: row.descrip,
      sourceId: "154",
      youngestAge: 2500,
      oldestAge: 4000,
    });
  expect(groupLegendEntries([...entries].reverse())).toEqual(groups);
});

it("normalizes hexadecimal colors and keeps differing units, ages and sources in the same color", () => {
  const entries = parseLegend([
    { ...archean[0], color: " #AABBCC " },
    {
      ...archean[1],
      color: "#abc",
      map_unit_name: "Another unit",
      age: "Quaternary",
      source_id: 999,
      t_age: 0,
      b_age: 2.588,
    },
  ]);
  const groups = groupLegendEntries(entries);
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ color: "#aabbcc", name: "2 map units", age: "Multiple ages" });
  expect(groups[0].entries.find((entry) => entry.id === "67683")).toMatchObject({
    name: "Another unit",
    age: "Quaternary",
    sourceId: "999",
    youngestAge: 0,
    oldestAge: 2.588,
  });
});

it("does not merge missing/invalid colors into a real gray map class", () => {
  const entries = parseLegend([
    { legend_id: 1, color: null },
    { legend_id: 2, color: "url(https://example.org)" },
    { legend_id: 3, color: "#9ba6b2" },
    { legend_id: 4, color: "#e20083" },
  ]);
  expect(entries.map((entry) => entry.color)).toEqual([null, null, "#9ba6b2", "#e20083"]);
  expect(groupLegendEntries(entries)).toHaveLength(4);
});

it("rejects malformed responses/IDs and preserves zero-valued ages and identifiers", () => {
  expect(() => parseLegend({ data: [] })).toThrow(/unsupported/);
  expect(() => parseLegend([{}])).toThrow(/legend_id/);
  expect(parseLegend([{ legend_id: 0, source_id: 0, t_age: 0, b_age: Infinity }])[0]).toMatchObject(
    { id: "0", sourceId: "0", youngestAge: 0, oldestAge: undefined },
  );
});
