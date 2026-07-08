<div align="center">

# Creed Status

**The public status page for [creed.md](https://creed.md).**

Live uptime and health for the Creed website, MCP server, database, and auth — tracked over a rolling 90-day window.

</div>

---

## Overview

Creed Status is a small, fast Next.js app that continuously probes Creed's
infrastructure and renders a clean, at-a-glance status page. Every few minutes
a probe pings `creed.md` and its health endpoint, records a snapshot, and rolls
the results up into per-component daily uptime bars.

It's designed to be honest about cold starts: a freshly deployed instance shows
"No data yet" bars until real probe history accumulates — no faked green.

## What it tracks

| Component | Source |
| --------- | ------ |
| **Website** | `HEAD https://creed.md/` |
| **MCP** | `creed.md/api/health` → `api` |
| **Database** | `creed.md/api/health` → `db` |
| **Auth** | `creed.md/api/health` → `auth` |

Each component reports one of `ok`, `degraded`, or `down`, aggregated into a
daily bucket with an uptime percentage.

## How it works

- **Probe** — [`lib/probe.ts`](lib/probe.ts) fetches the site and health
  endpoint in parallel with a timeout. It never throws; a failed fetch is
  recorded as `down`.
- **Store** — [`lib/store.ts`](lib/store.ts) persists snapshots newest-first.
  In production this is Vercel KV (Upstash Redis); in local dev it falls back to
  an in-memory ring buffer, so the full pipeline runs with zero external
  services.
- **Rollup** — [`lib/snapshots.ts`](lib/snapshots.ts) collapses raw snapshots
  into daily buckets and overall state.
- **Ingest** — [`app/api/probe/route.ts`](app/api/probe/route.ts) is the
  endpoint a cron/pinger calls every ~5 minutes to capture a new snapshot,
  gated by `STATUS_PROBE_SECRET`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). In dev, the store seeds 90
days of operational history and tops up today's bar with live probes of
`creed.md`.

## Configuration

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_CREED_ORIGIN` | Origin to probe (defaults to `https://creed.md`) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV credentials; when unset, an in-memory store is used |
| `STATUS_PROBE_SECRET` | Bearer secret required to hit `/api/probe`; open when unset |

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Motion · Vercel KV

---

<div align="center">

© Creed 2026

</div>
