type TrendPoint = { minute: string; count: number };

const BUCKET_MINUTES = 5;
const BUCKET_COUNT = 12;

function buildBuckets(points: TrendPoint[], now = new Date()) {
  const bucketMs = BUCKET_MINUTES * 60 * 1000;
  const end = Math.floor(now.getTime() / bucketMs) * bucketMs;
  const start = end - (BUCKET_COUNT - 1) * bucketMs;
  const buckets = Array.from({ length: BUCKET_COUNT }, (_, index) => ({
    time: start + index * bucketMs,
    count: 0,
  }));

  for (const point of points) {
    const timestamp = new Date(point.minute).getTime();
    const index = Math.floor((timestamp - start) / bucketMs);
    if (index >= 0 && index < buckets.length) buckets[index].count += point.count;
  }

  return buckets;
}

export function RegistrationTrend({ points }: { points: TrendPoint[] }) {
  const buckets = buildBuckets(points);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <section className="dashboard-section registration-trend">
      <header>
        <div>
          <p className="admin-eyebrow">Registration</p>
          <h2>近 60 分钟登记</h2>
        </div>
        <span>新增 {total} 位</span>
      </header>
      <div className="trend-bars" aria-label={`近 60 分钟新增 ${total} 位宾客`}>
        {buckets.map((bucket, index) => (
          <div className="trend-column" key={bucket.time}>
            <span>{bucket.count || ""}</span>
            <i style={{ height: `${Math.max(4, (bucket.count / max) * 100)}%` }} />
            {(index === 0 || index === buckets.length - 1) && (
              <small>
                {new Date(bucket.time).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </small>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
