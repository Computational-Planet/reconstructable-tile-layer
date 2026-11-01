const starts = [];
globalThis.Worker = class {
  constructor() {
    starts.push("Worker");
    throw new Error("Import must not start a Worker");
  }
};
globalThis.fetch = () => {
  throw new Error("Static import must not fetch engine assets");
};
for (const name of [
  "reconstructable-tile-layer/gplates",
  "reconstructable-tile-layer/rotation",
  "rtl-raster-source",
  "rtl-raster-source/netcdf",
  "rtl-raster-imagery-provider",
  "reconstructable-tile-layer",
])
  await import(name);
if (starts.length) throw new Error("An import initialized a Worker");
process.stdout.write("Published imports work without a DOM or engine initialization.\n");
