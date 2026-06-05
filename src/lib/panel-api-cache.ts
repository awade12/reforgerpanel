const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

function cacheKey(path: string) {
  return path.split("?")[0];
}

function ttlForPath(path: string) {
  if (path === "instances") return 10_000;
  if (path === "missions") return 20_000;
  if (/^instances\/[^/]+$/.test(path)) return 6_000;
  if (path.startsWith("host/")) return 12_000;
  if (path === "settings") return 20_000;
  if (path.startsWith("game/")) return 15_000;
  return 8_000;
}

export function peekApiCache<T>(path: string): T | undefined {
  const key = cacheKey(path);
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at >= ttlForPath(key)) return undefined;
  return hit.data as T;
}

export function invalidateApiCache(pathPrefix?: string) {
  for (const key of cache.keys()) {
    if (!pathPrefix || key === pathPrefix || key.startsWith(`${pathPrefix}/`) || key.startsWith(pathPrefix)) {
      cache.delete(key);
      inflight.delete(key);
    }
  }
}

export async function withApiCache<T>(path: string, fetcher: () => Promise<T>): Promise<T> {
  const key = cacheKey(path);
  const ttl = ttlForPath(key);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;

  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = fetcher()
      .then((data) => {
        cache.set(key, { at: Date.now(), data });
        inflight.delete(key);
        return data;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });
    inflight.set(key, pending);
  }
  return pending;
}

export function prefetchApi(path: string, fetcher: () => Promise<unknown>) {
  const key = cacheKey(path);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlForPath(key)) return;
  void withApiCache(path, fetcher).catch(() => undefined);
}
