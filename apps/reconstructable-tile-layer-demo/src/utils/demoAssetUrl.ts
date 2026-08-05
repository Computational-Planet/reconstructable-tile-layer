const BUNDLED_ASSET_PATH = /^(?:features|geo|gplates_ref|icons|rotations|tiles)\//;

/** Resolves bundled demo assets without changing external or uploaded URLs. */
export function resolveDemoAssetUrl(url: string) {
  const path = url.startsWith("./") ? url.slice(2) : url.replace(/^\/+/, "");
  if (!BUNDLED_ASSET_PATH.test(path)) {
    return url;
  }

  return `${import.meta.env.BASE_URL}${path}`;
}
