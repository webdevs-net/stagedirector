// Conditional GitHub requests. Every GET remembers the ETag GitHub sent; the
// next identical GET sends If-None-Match. When nothing changed GitHub answers
// 304 Not Modified, which does not count against the rate limit, and we hand
// back the remembered response. This is what makes polling every ~15s cheap.

type Resp = { status: number; url: string; headers: Record<string, string | number | undefined>; data: unknown };
type Options = { method?: string; headers?: Record<string, string | undefined>; [k: string]: unknown };
type RequestFn = (options: Options) => Promise<Resp>;

interface Entry { etag: string; response: Resp }

export class EtagCache {
  private map = new Map<string, Entry>();
  hits = 0;
  constructor(private max = 1000) {}

  /** Wrap a request function (octokit.hook.wrap("request", cache.wrap)). `key` turns options into a stable id. */
  wrap = async (request: RequestFn, options: Options, key: string): Promise<Resp> => {
    if ((options.method ?? "GET").toUpperCase() !== "GET") return request(options);
    const hit = this.map.get(key);
    const opts = hit ? { ...options, headers: { ...options.headers, "if-none-match": hit.etag } } : options;
    try {
      const res = await request(opts);
      const etag = res.headers?.etag;
      if (typeof etag === "string" && res.status === 200) this.set(key, { etag, response: res });
      return res;
    } catch (e) {
      if (hit && (e as { status?: number }).status === 304) {
        this.hits++;
        this.set(key, hit); // keep recently used entries
        return hit.response;
      }
      throw e;
    }
  };

  private set(key: string, entry: Entry) {
    this.map.delete(key);
    this.map.set(key, entry);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }

  get size() {
    return this.map.size;
  }
}
