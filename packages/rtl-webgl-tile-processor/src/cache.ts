export class CachedPromise<T> {
  private cacheMap = new Map<string, Promise<T>>();

  has(key: string): boolean {
    return this.cacheMap.has(key);
  }

  getOrCreate(key: string, promiseFn: () => Promise<T>): Promise<T> {
    if (!this.cacheMap.has(key)) {
      const promise = promiseFn().catch((error) => {
        this.cacheMap.delete(key);
        throw error;
      });
      this.cacheMap.set(key, promise);
    }
    return this.cacheMap.get(key)!;
  }

  delete(key: string): void {
    this.cacheMap.delete(key);
  }

  clear(): void {
    this.cacheMap.clear();
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

  get size() {
    return this.cache.size;
  }
}
