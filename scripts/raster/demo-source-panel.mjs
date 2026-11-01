/** Open controls through the same disclosure actions available in the Demo. */
export async function openDisclosure(page, label) {
  const summary = page.locator("summary").filter({ hasText: label }).first();
  if (!(await summary.evaluate((node) => node.parentElement.open))) await summary.click();
}

export async function showLocalRasterSettings(page, allDetails = false) {
  const kind = page.getByLabel("Imagery source type", { exact: true });
  if ((await kind.inputValue()) !== "local-raster") await kind.selectOption("local-raster");
  await openDisclosure(page, "Source settings");
  if (allDetails) {
    for (const label of [
      "Spatial metadata and file attributes",
      "Source and citation",
      "Display style",
      "Numeric COG export",
    ]) {
      if (await page.locator("summary").filter({ hasText: label }).count())
        await openDisclosure(page, label);
    }
  }
}

export async function applyRasterAndReopenSettings(page) {
  await page.getByRole("button", { name: "Apply source", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Imagery data source"]')?.getAttribute("aria-busy") ===
      "false",
  );
  await showLocalRasterSettings(page, true);
}
