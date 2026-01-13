# Freedom Deployment Guide

Deploy Freedom so anyone can access it via a public URL.

## Architecture

```
Users → Cloudflare Pages (Frontend)
         ├── API calls → Cloudflare Worker (Search, Trending, Metadata)
         └── Video playback → Deno Server (Streaming)
```

**Why separate servers?**
- YouTube validates that video requests come from the same IP that generated the token
- Cloudflare Workers have rotating IPs, so they can't handle video streaming
- The Deno server maintains a consistent IP for token generation + video fetching

---

## Step 1: Deploy Cloudflare Worker (API)

```bash
cd worker

# Install dependencies
npm install

# Login to Cloudflare (opens browser)
npx wrangler login

# Deploy
npm run deploy
```

**Your Worker URL:** `https://freedom-api.<your-subdomain>.workers.dev`

Save this URL - you'll need it for the frontend.

---

## Step 2: Deploy Deno Streaming Server

Choose ONE of these options:

### Option A: Fly.io (Recommended - has free tier)

```bash
cd stream

# Install Fly CLI (macOS)
brew install flyctl

# Login
fly auth login

# Create app (first time only)
fly launch --name freedom-stream --region sjc --no-deploy

# Deploy
fly deploy

# Get your URL
fly status
```

**Your Stream URL:** `https://freedom-stream.fly.dev`

### Option B: Railway ($5/month)

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Set root directory: `stream`
4. Add environment variable: `PORT=8080`
5. Deploy

**Your Stream URL:** `https://freedom-stream-xxx.up.railway.app`

### Option C: DigitalOcean/VPS ($4-6/month)

```bash
# On your VPS
git clone <your-repo>
cd freedom/stream

# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Run with systemd or pm2
deno run --allow-net --allow-env --allow-read src/main.ts
```

---

## Step 3: Deploy Frontend (Cloudflare Pages)

### Method A: Git Integration (Recommended)

1. Push your code to GitHub
2. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Pages
3. Create a project → Connect to Git
4. Select your repo
5. Configure build:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `frontend`
6. Add environment variables:
   - `VITE_API_URL` = `https://freedom-api.<your-subdomain>.workers.dev`
   - `VITE_STREAM_URL` = `https://freedom-stream.fly.dev` (your Deno server URL)
7. Deploy

### Method B: Direct Upload

```bash
cd frontend

# Build with production URLs
VITE_API_URL=https://freedom-api.xxx.workers.dev \
VITE_STREAM_URL=https://freedom-stream.fly.dev \
npm run build

# Install Wrangler if not already
npm install -g wrangler

# Deploy to Pages
npx wrangler pages deploy dist --project-name=freedom
```

---

## Step 4: Configure Custom Domain (Optional)

### For the Frontend (Cloudflare Pages):
1. Go to your Pages project → Custom domains
2. Add your domain (e.g., `freedom.yourdomain.com`)
3. Update DNS if prompted

### For the Worker:
1. Go to Workers & Pages → your worker → Triggers
2. Add Custom Domain

### For Fly.io:
```bash
fly certs create freedom-stream.yourdomain.com
```

---

## Environment Variables Summary

| Service | Variable | Example Value |
|---------|----------|---------------|
| Frontend | `VITE_API_URL` | `https://freedom-api.xxx.workers.dev` |
| Frontend | `VITE_STREAM_URL` | `https://freedom-stream.fly.dev` |
| Stream | `PORT` | `8080` |
| Stream | `HOST` | `0.0.0.0` |

---

## Testing Your Deployment

1. **Test Worker API:**
   ```bash
   curl https://freedom-api.xxx.workers.dev/api/health
   curl "https://freedom-api.xxx.workers.dev/api/search?q=test"
   ```

2. **Test Stream Server:**
   ```bash
   curl https://freedom-stream.fly.dev/health
   ```

3. **Test Frontend:**
   Visit your Pages URL and search for a video

---

## Troubleshooting

### Videos won't play
- Check that your Deno server is running and accessible
- Verify `VITE_STREAM_URL` points to your Deno server
- Check Deno server logs: `fly logs` (Fly.io) or Railway dashboard

### API returns errors
- Check Worker logs in Cloudflare dashboard
- Verify the Worker is deployed: `wrangler tail`

### CORS errors
- Both Worker and Deno server have CORS enabled
- Make sure URLs don't have trailing slashes

---

## Cost Estimate

| Service | Cost |
|---------|------|
| Cloudflare Pages | Free |
| Cloudflare Worker | Free (100k req/day) |
| Fly.io | Free tier (3 shared VMs) |
| **Total** | **$0/month** |

If you exceed free tiers:
- Cloudflare Workers: $5/month unlimited
- Fly.io: ~$3-5/month for always-on VM
