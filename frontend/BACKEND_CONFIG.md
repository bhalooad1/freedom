# Backend Configuration Guide

Freedom supports two streaming backends. Configure via `.env` file.

## Serverless Mode (Default)

Uses `stream-worker-v2` on Cloudflare Workers with Android YouTube client.

```env
VITE_STREAM_WORKER_URL=https://freedom-stream-v2.bhalooad.workers.dev
VITE_USE_SERVERLESS=true
```

**Pros:** Fully serverless, auto-scaling, no server to maintain
**Cons:** ~30% of requests may need retry (YouTube datacenter blocking)

---

## Railway Mode

Uses the `/stream` Deno service on Railway with PO token generation.

```env
VITE_STREAM_WORKER_URL=https://freedom-production-7b00.up.railway.app
VITE_USE_SERVERLESS=false
```

**Pros:** More reliable per-request, full PO token support
**Cons:** Requires Railway deployment, has cold starts

---

## Quick Reference

| Setting | Serverless | Railway |
|---------|------------|---------|
| `VITE_STREAM_WORKER_URL` | `https://freedom-stream-v2.bhalooad.workers.dev` | `https://freedom-production-7b00.up.railway.app` |
| `VITE_USE_SERVERLESS` | `true` | `false` |

---

## What Each Mode Does

**Serverless (`true`):**
- Metadata: `GET /info/{id}` on stream-worker-v2
- Stream: `GET /a/{id}` on stream-worker-v2

**Railway (`false`):**
- Metadata: `GET /api/video/{id}` on Railway
- Stream: `GET /stream/{id}` on Railway

---

## After Changing `.env`

Restart the dev server for changes to take effect:

```bash
# Kill existing server (Ctrl+C) then:
npm run dev
```

Check console for active configuration:
```
[API] Configuration:
  Stream Base: https://...
  Serverless Mode: true/false
```
