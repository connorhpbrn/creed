import type { Snapshot } from "./types";

// Snapshot store. Prefer Redis for cheap append/list operations. If a Redis
// resource is not attached yet, fall back to one private Vercel Blob snapshot
// document. In local dev with neither env present, use a module-level in-memory
// ring buffer.
const MAX = 26_000; // ~90 days at 5-min cadence + headroom
const SNAPSHOT_KEY = "status:snapshots";
const SNAPSHOT_BLOB_PATH = "status/snapshots.json";
const LEGACY_BLOB_PREFIX = "status/snapshots";

const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const hasRedis = Boolean(redisUrl && redisToken);
const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function getRedis() {
  const { Redis } = await import("@upstash/redis");
  return new Redis({
    url: redisUrl!,
    token: redisToken!,
  });
}

const parseSnapshot = (value: unknown): Snapshot =>
  typeof value === "string" ? JSON.parse(value) : (value as Snapshot);

const serializeSnapshot = (snapshot: Snapshot): string =>
  JSON.stringify(snapshot);

const deserializeSnapshot = (json: string): Snapshot =>
  JSON.parse(json) as Snapshot;

const legacyDayPath = (day: string): string => `${LEGACY_BLOB_PREFIX}/${day}.json`;

function dayKeys(): string[] {
  const keys: string[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

async function readBlob(
  pathname: string,
  useCache: boolean
): Promise<{ snapshots: Snapshot[]; etag: string } | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(pathname, {
    access: "private",
    useCache,
  });
  if (!result || result.statusCode !== 200) return null;
  return {
    snapshots: JSON.parse(await streamToText(result.stream)) as Snapshot[],
    // Blob GET responses expose a weak HTTP ETag (`W/"..."`), while the
    // conditional PUT endpoint expects the equivalent strong validator.
    etag: result.blob.etag.replace(/^W\//, ""),
  };
}

async function readLegacyBlobSnapshots(): Promise<Snapshot[]> {
  const byDay = await Promise.all(
    dayKeys().map(
      async (day) =>
        (await readBlob(legacyDayPath(day), true))?.snapshots ?? []
    )
  );
  return byDay.flat().sort((a, b) => b.t.localeCompare(a.t)).slice(0, MAX);
}

async function readBlobDocument(
  useCache = true
): Promise<{ snapshots: Snapshot[]; etag: string | null }> {
  const document = await readBlob(SNAPSHOT_BLOB_PATH, useCache);
  if (document !== null) return document;

  // One-time compatibility path for the first probe after this deploy. The
  // next write promotes the historical day files into the single document.
  return { snapshots: await readLegacyBlobSnapshots(), etag: null };
}

async function readBlobSnapshots(useCache = true): Promise<Snapshot[]> {
  return (await readBlobDocument(useCache)).snapshots;
}

async function writeBlobSnapshots(
  snapshots: Snapshot[],
  ifMatch: string | null
): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(SNAPSHOT_BLOB_PATH, JSON.stringify(snapshots), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
    ...(ifMatch ? { ifMatch } : {}),
  });
}

const g = globalThis as unknown as {
  __statusMem?: string[];
  __seeded?: boolean;
};
g.__statusMem ??= [];
const mem = g.__statusMem;

// DEV ONLY (no persistent store): seed 90 days of all-operational history once, so the page
// renders a full green chart immediately. Today's bar is then topped up by real
// live probes of creed.md. Production never seeds — it shows true cold-start
// "No data yet" bars until the cron fills them.
if (!hasRedis && !hasBlob && !g.__seeded) {
  g.__seeded = true;
  const ok = { ok: true, latencyMs: 0 };
  for (let i = 89; i >= 1; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(12, 0, 0, 0);
    mem.unshift(
      serializeSnapshot({
        t: d.toISOString(),
        reachable: "ok",
        components: { site: ok, api: ok, db: ok, auth: ok },
      } satisfies Snapshot)
    );
  }
}

export async function pushSnapshot(s: Snapshot): Promise<void> {
  const json = serializeSnapshot(s);
  if (hasRedis) {
    const redis = await getRedis();
    await redis.lpush(SNAPSHOT_KEY, json);
    await redis.ltrim(SNAPSHOT_KEY, 0, MAX - 1);
    return;
  }
  if (hasBlob) {
    const { BlobPreconditionFailedError } = await import("@vercel/blob");

    // Optimistic concurrency prevents overlapping cron/manual probes from
    // silently overwriting one another's snapshots.
    for (let attempt = 0; attempt < 5; attempt++) {
      const document = await readBlobDocument(false);
      const snapshots = document.snapshots;
      snapshots.unshift(s);
      if (snapshots.length > MAX) snapshots.length = MAX;

      try {
        await writeBlobSnapshots(snapshots, document.etag);
        return;
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError) || attempt === 4) {
          throw error;
        }
      }
    }
    return;
  }
  mem.unshift(json);
  if (mem.length > MAX) mem.length = MAX;
}

export async function readSnapshots(): Promise<Snapshot[]> {
  if (hasRedis) {
    const redis = await getRedis();
    const raw = await redis.lrange<unknown>(SNAPSHOT_KEY, 0, -1);
    return raw.map(parseSnapshot);
  }
  if (hasBlob) {
    return readBlobSnapshots();
  }
  return mem.map(deserializeSnapshot);
}

export async function snapshotCount(): Promise<number> {
  if (hasRedis) {
    const redis = await getRedis();
    return redis.llen(SNAPSHOT_KEY);
  }
  if (hasBlob) {
    return (await readBlobSnapshots()).length;
  }
  return mem.length;
}
