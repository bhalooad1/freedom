/**
 * Freedom Stream Worker v2
 * Serverless YouTube streaming using Android client
 *
 * The Android client returns pre-deciphered URLs, so no signature
 * decryption is needed. YouTube randomly blocks ~70% of datacenter
 * requests, so we race multiple parallel requests.
 */

// ============== Types ==============

interface Env {
  VISITOR_CACHE: KVNamespace;
}

interface VisitorCache {
  visitorData: string;
  timestamp: number;
}

interface RelatedVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  views: string;
  channel: string;
  uploaded: string;
}

interface VideoMetadata {
  id: string;
  title: string;
  description: string;
  channel: string;
  channelId: string;
  duration: string;
  views: string;
  thumbnail: string;
  uploadDate: string;
  related?: RelatedVideo[];
}

interface VideoFormat {
  url: string;
  mimeType: string;
  qualityLabel: string;
}

interface VideoData {
  metadata: VideoMetadata;
  format: VideoFormat;
}

// ============== Constants ==============

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

const ANDROID_CLIENT = {
  apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
  version: '19.09.37',
  userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip',
};

const VISITOR_CACHE_KEY = 'visitor_data';
const VISITOR_CACHE_TTL = 600; // 10 minutes

// ============== Visitor Data ==============

async function getVisitorData(env: Env): Promise<string> {
  // Try cache first
  if (env.VISITOR_CACHE) {
    try {
      const cached = await env.VISITOR_CACHE.get(VISITOR_CACHE_KEY, 'json') as VisitorCache | null;
      if (cached && Date.now() - cached.timestamp < VISITOR_CACHE_TTL * 1000) {
        return cached.visitorData;
      }
    } catch (e) {
      console.error('[VISITOR] Cache read error:', e);
    }
  }

  // Bootstrap from YouTube
  const response = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${ANDROID_CLIENT.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_CLIENT.userAgent,
      },
      body: JSON.stringify({
        videoId: 'dQw4w9WgXcQ',
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: ANDROID_CLIENT.version,
            androidSdkVersion: 30,
          },
        },
      }),
    }
  );

  const data = await response.json() as any;
  const visitorData = data.responseContext?.visitorData;

  if (!visitorData) {
    throw new Error('Failed to get visitorData');
  }

  // Cache it
  if (env.VISITOR_CACHE) {
    try {
      await env.VISITOR_CACHE.put(
        VISITOR_CACHE_KEY,
        JSON.stringify({ visitorData, timestamp: Date.now() }),
        { expirationTtl: VISITOR_CACHE_TTL }
      );
    } catch (e) {
      console.error('[VISITOR] Cache write error:', e);
    }
  }

  return visitorData;
}

// ============== Related Videos ==============

async function fetchRelatedVideos(videoId: string, visitorData: string): Promise<RelatedVideo[]> {
  try {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/next?key=${ANDROID_CLIENT.apiKey}&prettyPrint=false`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': ANDROID_CLIENT.userAgent,
          'X-Goog-Visitor-Id': visitorData,
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20240101.00.00',
              hl: 'en',
              gl: 'US',
            },
          },
        }),
      }
    );

    const data = await response.json() as any;

    // Extract related videos from secondaryResults
    const results = data.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || [];
    const related: RelatedVideo[] = [];

    for (const item of results) {
      // Try new lockupViewModel format first (YouTube's current format)
      const lockup = item.lockupViewModel;
      if (lockup?.contentId) {
        const meta = lockup.metadata?.lockupMetadataViewModel;
        const titleObj = meta?.title;
        const metaObj = meta?.metadata?.contentMetadataViewModel;

        // Extract duration from overlays
        let duration = '';
        const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
        for (const overlay of overlays) {
          const badge = overlay.thumbnailOverlayBadgeViewModel?.thumbnailBadges?.[0]?.thumbnailBadgeViewModel;
          if (badge?.text) {
            duration = badge.text;
            break;
          }
        }

        // Extract views and channel from metadata rows
        let views = '';
        let channel = '';
        const rows = metaObj?.metadataRows || [];
        for (const row of rows) {
          for (const part of row.metadataParts || []) {
            const text = part.text?.content || '';
            if (text.includes('views')) {
              views = text;
            } else if (!channel && text && !text.includes('ago')) {
              channel = text;
            }
          }
        }

        related.push({
          id: lockup.contentId,
          title: titleObj?.content || '',
          thumbnail: `https://i.ytimg.com/vi/${lockup.contentId}/hqdefault.jpg`,
          duration,
          views,
          channel,
          uploaded: '',
        });

        if (related.length >= 10) break;
        continue;
      }

      // Fallback: try old compactVideoRenderer format
      const renderer = item.compactVideoRenderer;
      if (!renderer?.videoId) continue;

      // Parse duration
      let duration = '';
      if (renderer.lengthText?.simpleText) {
        duration = renderer.lengthText.simpleText;
      }

      // Parse views
      let views = '';
      if (renderer.viewCountText?.simpleText) {
        views = renderer.viewCountText.simpleText;
      } else if (renderer.viewCountText?.runs) {
        views = renderer.viewCountText.runs.map((r: any) => r.text).join('');
      }

      related.push({
        id: renderer.videoId,
        title: renderer.title?.simpleText || renderer.title?.runs?.[0]?.text || '',
        thumbnail: renderer.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${renderer.videoId}/hqdefault.jpg`,
        duration,
        views,
        channel: renderer.shortBylineText?.runs?.[0]?.text || '',
        uploaded: renderer.publishedTimeText?.simpleText || '',
      });

      if (related.length >= 10) break;
    }

    return related;
  } catch (e) {
    console.error('[RELATED] Error fetching related videos:', e);
    return [];
  }
}

// ============== YouTube API ==============

async function fetchVideoData(
  videoId: string,
  visitorData: string
): Promise<{ success: true; data: VideoData } | { success: false; error: string }> {
  try {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${ANDROID_CLIENT.apiKey}&prettyPrint=false`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': ANDROID_CLIENT.userAgent,
          'X-Youtube-Client-Name': '3',
          'X-Youtube-Client-Version': ANDROID_CLIENT.version,
          'X-Goog-Visitor-Id': visitorData,
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              hl: 'en',
              gl: 'US',
              clientName: 'ANDROID',
              clientVersion: ANDROID_CLIENT.version,
              androidSdkVersion: 30,
              osName: 'Android',
              osVersion: '14',
              visitorData,
            },
          },
          playbackContext: {
            contentPlaybackContext: {
              html5Preference: 'HTML5_PREF_WANTS',
            },
          },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      }
    );

    const data = await response.json() as any;

    if (data.playabilityStatus?.status !== 'OK') {
      const reason = data.playabilityStatus?.reason || data.playabilityStatus?.status || 'Unknown';
      return { success: false, error: reason };
    }

    // Extract metadata from videoDetails
    const details = data.videoDetails || {};
    const metadata: VideoMetadata = {
      id: details.videoId || videoId,
      title: details.title || '',
      description: details.shortDescription || '',
      channel: details.author || '',
      channelId: details.channelId || '',
      duration: details.lengthSeconds || '',
      views: details.viewCount || '',
      thumbnail: details.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      uploadDate: data.microformat?.playerMicroformatRenderer?.publishDate || '',
    };

    // Find format with direct URL (prefer 720p > 360p > any)
    const formats = data.streamingData?.formats || [];
    let format = formats.find((f: any) => f.qualityLabel === '720p' && f.url);
    if (!format) format = formats.find((f: any) => f.qualityLabel === '360p' && f.url);
    if (!format) format = formats.find((f: any) => f.url);

    if (!format?.url) {
      return { success: false, error: 'No direct URL in response' };
    }

    return {
      success: true,
      data: {
        metadata,
        format: {
          url: format.url,
          mimeType: format.mimeType || 'video/mp4',
          qualityLabel: format.qualityLabel || 'unknown',
        },
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ============== Info Handler ==============

async function handleInfo(videoId: string, env: Env): Promise<Response> {
  console.log(`[INFO] ${videoId}`);

  // Get visitor data
  let visitorData: string;
  try {
    visitorData = await getVisitorData(env);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to initialize' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Race parallel requests (YouTube blocks ~70% randomly)
  const PARALLEL = 5;
  const attempts = Array.from({ length: PARALLEL }, () => fetchVideoData(videoId, visitorData));
  const results = await Promise.all(attempts);

  // Find first success
  const success = results.find((r): r is { success: true; data: VideoData } => r.success);

  if (!success) {
    const firstError = results.find(r => !r.success);
    return new Response(JSON.stringify({
      error: 'Video not found',
      reason: firstError && !firstError.success ? firstError.error : 'Unknown',
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  console.log(`[INFO] Success: ${success.data.metadata.title}`);

  // Fetch related videos in parallel (don't block on failure)
  const related = await fetchRelatedVideos(videoId, visitorData);
  console.log(`[INFO] Found ${related.length} related videos`);

  // Return metadata with related videos
  return new Response(JSON.stringify({
    ...success.data.metadata,
    related,
  }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ============== Stream Handler ==============

async function handleStream(request: Request, videoId: string, env: Env): Promise<Response> {
  console.log(`[STREAM] ${videoId}`);

  // Get visitor data
  let visitorData: string;
  try {
    visitorData = await getVisitorData(env);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to initialize' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Race parallel requests (YouTube blocks ~70% randomly)
  const PARALLEL = 10;
  const attempts = Array.from({ length: PARALLEL }, () => fetchVideoData(videoId, visitorData));
  const results = await Promise.all(attempts);

  // Find first success
  const success = results.find((r): r is { success: true; data: VideoData } => r.success);

  if (!success) {
    const errors = results.map((r, i) => `${i + 1}: ${r.success ? 'OK' : r.error}`);
    console.log(`[STREAM] All ${PARALLEL} attempts failed`);
    return new Response(JSON.stringify({
      error: 'Video not playable',
      attempts: errors,
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`[STREAM] ${successCount}/${PARALLEL} succeeded, using ${success.data.format.qualityLabel}`);

  // Fetch from YouTube CDN
  const videoUrl = new URL(success.data.format.url);
  videoUrl.searchParams.set('alr', 'no');

  const headers: Record<string, string> = {
    'User-Agent': ANDROID_CLIENT.userAgent,
    'Accept': '*/*',
  };

  // Forward range header for seeking
  const range = request.headers.get('Range');
  if (range) {
    headers['Range'] = range;
  }

  const cdnResponse = await fetch(videoUrl.toString(), { headers });

  if (!cdnResponse.ok && cdnResponse.status !== 206) {
    console.log(`[STREAM] CDN error: ${cdnResponse.status}`);
    return new Response(JSON.stringify({ error: 'CDN fetch failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Build response
  const responseHeaders = new Headers(CORS_HEADERS);
  responseHeaders.set('Content-Type', success.data.format.mimeType);
  responseHeaders.set('Accept-Ranges', 'bytes');
  responseHeaders.set('Cache-Control', 'public, max-age=3600');

  const contentLength = cdnResponse.headers.get('Content-Length');
  const contentRange = cdnResponse.headers.get('Content-Range');
  if (contentLength) responseHeaders.set('Content-Length', contentLength);
  if (contentRange) responseHeaders.set('Content-Range', contentRange);

  console.log(`[STREAM] Success: ${success.data.format.qualityLabel}`);

  return new Response(cdnResponse.body, {
    status: cdnResponse.status,
    headers: responseHeaders,
  });
}

// ============== Main Handler ==============

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check
    if (path === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'freedom-stream-v2',
      }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Info: /info/{videoId} - returns metadata
    const infoMatch = path.match(/^\/info\/([a-zA-Z0-9_-]{11})$/);
    if (infoMatch) {
      return handleInfo(infoMatch[1], env);
    }

    // Stream: /a/{videoId} - returns video stream
    const streamMatch = path.match(/^\/a\/([a-zA-Z0-9_-]{11})$/);
    if (streamMatch) {
      return handleStream(request, streamMatch[1], env);
    }

    // 404
    return new Response(JSON.stringify({
      error: 'Not found',
      usage: {
        info: 'GET /info/{videoId}',
        stream: 'GET /a/{videoId}',
      },
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  },
};
