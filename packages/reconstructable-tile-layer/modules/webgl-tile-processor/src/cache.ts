export class CachedPromise<T> {
  private cacheMap = new Map<string, Promise<T>>();

  has(key: string): boolean {
    return this.cacheMap.has(key);
  }

  getOrCreate(key: string, promiseFn: () => Promise<T>): Promise<T> {
    if (!this.cacheMap.has(key)) {
      const promise = promiseFn().catch((error) => {
        this.delete(key, promise);
        throw error;
      });
      this.cacheMap.set(key, promise);
    }
    return this.cacheMap.get(key)!;
  }

  delete(key: string, expected?: Promise<T>): void {
    // 换源后同名键可能已指向新请求；旧任务只能删除自己的缓存项。
    if (!expected || this.cacheMap.get(key) === expected) {
      this.cacheMap.delete(key);
    }
  }

  clear(): void {
    this.cacheMap.clear();
  }

  deleteWhere(matches: (key: string) => boolean): void {
    for (const key of this.cacheMap.keys()) if (matches(key)) this.cacheMap.delete(key);
  }

  get size() {
    return this.cacheMap.size;
  }
}

export class LRUCache<T> {
  private cache = new Map<string, T>();

  constructor(
    private maxSize: number,
    private onEvict?: (value: T, reason: "capacity" | "replace" | "clear") => void,
  ) {}

  get(key: string) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: T) {
    if (this.maxSize <= 0) {
      this.onEvict?.(value, "capacity");
      return;
    }
    const previousValue = this.cache.get(key);
    if (previousValue !== undefined) {
      this.cache.delete(key);
      this.onEvict?.(previousValue, "replace");
    }
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      const oldestValue = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      if (oldestValue !== undefined) {
        this.onEvict?.(oldestValue, "capacity");
      }
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.forEach((value) => this.onEvict?.(value, "clear"));
    this.cache.clear();
  }

  deleteWhere(matches: (key: string) => boolean) {
    for (const [key, value] of this.cache) {
      if (matches(key)) {
        this.cache.delete(key);
        this.onEvict?.(value, "clear");
      }
    }
  }

  get size() {
    return this.cache.size;
  }
}
