import { Env, CachedVideoData, VideoUrlData } from './types';

const CACHE_TTL_SECONDS = 240; // 4 minutes

/**
 * Get cached video URL data from KV
 */
export async function getCachedVideo(
  env: Env,
  videoId: string
): Promise<CachedVideoData | null> {
  if (!env.VIDEO_CACHE) {
    console.log('[CACHE] KV not configured, skipping cache');
    return null;
  }

  try {
    const key = `video:${videoId}`;
    const cached = await env.VIDEO_CACHE.get(key, 'json') as CachedVideoData | null;

    if (!cached) {
      console.log(`[CACHE] Miss for ${videoId}`);
      return null;
    }

    // Check if URL has expired
    if (cached.expiresAt < Date.now()) {
      console.log(`[CACHE] Expired for ${videoId}`);
      await invalidateVideo(env, videoId);
      return null;
    }

    console.log(`[CACHE] Hit for ${videoId}`);
    return cached;
  } catch (error) {
    console.error(`[CACHE] Error reading ${videoId}:`, error);
    return null;
  }
}

/**
 * Cache video URL data in KV
 */
export async function cacheVideo(
  env: Env,
  videoId: string,
  data: VideoUrlData
): Promise<void> {
  if (!env.VIDEO_CACHE) {
    console.log('[CACHE] KV not configured, skipping cache write');
    return;
  }

  try {
    const key = `video:${videoId}`;
    const cachedData: CachedVideoData = {
      ...data,
      cachedAt: Date.now(),
    };

    await env.VIDEO_CACHE.put(key, JSON.stringify(cachedData), {
      expirationTtl: CACHE_TTL_SECONDS,
    });

    console.log(`[CACHE] Stored ${videoId} (TTL: ${CACHE_TTL_SECONDS}s)`);
  } catch (error) {
    console.error(`[CACHE] Error writing ${videoId}:`, error);
  }
}

/**
 * Invalidate cached video URL (on 403, 410, etc.)
 */
export async function invalidateVideo(
  env: Env,
  videoId: string
): Promise<void> {
  if (!env.VIDEO_CACHE) {
    return;
  }

  try {
    const key = `video:${videoId}`;
    await env.VIDEO_CACHE.delete(key);
    console.log(`[CACHE] Invalidated ${videoId}`);
  } catch (error) {
    console.error(`[CACHE] Error invalidating ${videoId}:`, error);
  }
}
