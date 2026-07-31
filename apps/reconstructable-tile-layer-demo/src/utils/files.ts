/** Provides small file and object URL helpers for uploaded data sources. */
export function revokeObjectUrl(url: string | null) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export function revokeObjectUrls(urls: string[]) {
  urls.forEach((url) => URL.revokeObjectURL(url));
}
