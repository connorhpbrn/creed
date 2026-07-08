import type { Snapshot } from "./types";

// Snapshot store. Prefer Redis for cheap append/list operations. If a Redis
// resource is not attached yet, fall back to private Vercel Blob day files. In
// local dev with neither env present, use a module-level in-memory ring buffer.
const MAX = 26_000; // ~90 days at 5-min cadence + headroom
const SNAPSHOT_KEY = "status:snapshots";
const BLOB_PREFIX = "status/snapshots";

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

const dayKeyOf = (iso: string): string => iso.slice(0, 10);

const dayPath = (day: string): string => `${BLOB_PREFIX}/${day}.json`;

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

async function readBlobDay(day: string): Promise<Snapshot[]> {
  const { get } = await import("@vercel/blob");
  const result = await get(dayPath(day), {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200) return [];
  return JSON.parse(await streamToText(result.stream)) as Snapshot[];
}

async function writeBlobDay(day: string, snapshots: Snapshot[]): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(dayPath(day), JSON.stringify(snapshots), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
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
    const day = dayKeyOf(s.t);
    const snapshots = await readBlobDay(day);
    snapshots.unshift(s);
    await writeBlobDay(day, snapshots);
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
    const byDay = await Promise.all(dayKeys().map(readBlobDay));
    return byDay.flat().sort((a, b) => b.t.localeCompare(a.t));
  }
  return mem.map(deserializeSnapshot);
}

export async function snapshotCount(): Promise<number> {
  if (hasRedis) {
    const redis = await getRedis();
    return redis.llen(SNAPSHOT_KEY);
  }
  if (hasBlob) {
    const counts = await Promise.all(dayKeys().map(async (day) => {
      const snapshots = await readBlobDay(day);
      return snapshots.length;
    }));
    return counts.reduce((total, count) => total + count, 0);
  }
  return mem.length;
}
