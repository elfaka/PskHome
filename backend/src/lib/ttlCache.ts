/**
 * 만료 시간이 있는 메모리 캐시 + 같은 키 동시 요청 합치기(single-flight).
 *
 * 외부 API(토스·DART)에 rate limit 이 있어서, 여러 사용자가 같은 종목을 동시에 열어도
 * 실제 호출은 한 번만 나가게 하려는 용도다. 실패한 결과는 캐시하지 않는다.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; at: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(private readonly ttlMs: number) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;

    let pending = this.inflight.get(key);
    if (!pending) {
      pending = load()
        .then((value) => {
          this.entries.set(key, { value, at: Date.now() });
          return value;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }

    return pending;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }
}
