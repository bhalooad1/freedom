import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, VideoUrlData } from './types';
import { getCachedVideo, cacheVideo, invalidateVideo } from './cache';
import { getVideoUrl } from './token-client';
import { proxyVideoStream, handleCors } from './proxy';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'HEAD', 'OPTIONS'],
  allowHeaders: ['Range'],
  exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'freedom-stream-worker',
    timestamp: new Date().toISOString(),
  });
});

// Video ID validation
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function isValidVideoId(id: string): boolean {
  return VIDEO_ID_REGEX.test(id);
}

// Main streaming endpoint
app.get('/stream/:id', async (c) => {
  const videoId = c.req.param('id');

  // Validate video ID
  if (!isValidVideoId(videoId)) {
    return c.json({ error: 'Invalid video ID' }, 400);
  }

  console.log(`[STREAM] Request for ${videoId}`);

  let videoData: VideoUrlData | null = null;

  // Step 1: Check cache
  const cached = await getCachedVideo(c.env, videoId);
  if (cached) {
    videoData = cached;
    console.log(`[STREAM] Using cached URL for ${videoId}`);
  }

  // Step 2: If not cached, call token service
  if (!videoData) {
    console.log(`[STREAM] Fetching from token service for ${videoId}`);
    const tokenResponse = await getVideoUrl(c.env, videoId);

    if (!tokenResponse.success || !tokenResponse.data) {
      return c.json(
        { error: tokenResponse.error || 'Failed to get video URL' },
        502
      );
    }

    videoData = tokenResponse.data;

    // Cache the result
    await cacheVideo(c.env, videoId, videoData);
  }

  // Step 3: Proxy the video stream
  const response = await proxyVideoStream(c.req.raw, videoData);

  // Handle errors - invalidate cache on certain status codes
  if (response.status === 403 || response.status === 410 || response.status === 416) {
    console.log(`[STREAM] Got ${response.status}, invalidating cache for ${videoId}`);
    await invalidateVideo(c.env, videoId);

    // Retry once with fresh URL
    if (cached) {
      console.log(`[STREAM] Retrying with fresh URL for ${videoId}`);
      const tokenResponse = await getVideoUrl(c.env, videoId);

      if (tokenResponse.success && tokenResponse.data) {
        await cacheVideo(c.env, videoId, tokenResponse.data);
        return proxyVideoStream(c.req.raw, tokenResponse.data);
      }
    }
  }

  return response;
});

// Handle OPTIONS preflight
app.options('/stream/:id', () => handleCors());

// 404 for everything else
app.all('*', (c) => {
  return c.json({ error: 'Not found' }, 404);
});

export default app;
