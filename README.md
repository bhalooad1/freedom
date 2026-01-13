# Freedom

Privacy-focused YouTube frontend with video streaming.

## Architecture

- **frontend/** - React web app (Vite + Tailwind)
- **worker/** - Cloudflare Worker for search & metadata
- **stream/** - Deno service for video streaming

## Setup

### 1. Stream Service (Deno)
```bash
cd stream
# Edit config/config.toml - set secret_key to any 16 alphanumeric chars
deno task dev
```

### 2. Worker (Cloudflare)
```bash
cd worker
npm install
npx wrangler dev
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

## Ports
- Frontend: 5173
- Worker: 8787
- Stream: 8788
