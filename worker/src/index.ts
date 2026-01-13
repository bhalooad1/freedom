import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  TOKEN_SERVICE_URL: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Range'],
  exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
}));

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_BASE = 'https://www.youtube.com/youtubei/v1';

const CLIENT_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20240101.00.00',
    hl: 'en',
    gl: 'US',
  },
};

async function innertubeRequest(endpoint: string, body: object) {
  const url = `${INNERTUBE_BASE}/${endpoint}?key=${INNERTUBE_API_KEY}`;
  console.log('[INNERTUBE] Request:', endpoint);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    },
    body: JSON.stringify({
      context: CLIENT_CONTEXT,
      ...body,
    }),
  });

  console.log('[INNERTUBE] Response status:', response.status);

  if (!response.ok) {
    const text = await response.text();
    console.error('[INNERTUBE] Error response:', text.substring(0, 500));
    throw new Error(`InnerTube error: ${response.status}`);
  }

  return response.json();
}

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.get('/api/search', async (c) => {
  const query = c.req.query('q');
  if (!query) {
    return c.json({ error: 'Missing query' }, 400);
  }

  try {
    const data = await innertubeRequest('search', { query });

    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

    const videos = contents
      .filter((item: any) => item.videoRenderer)
      .slice(0, 20)
      .map((item: any) => {
        const v = item.videoRenderer;
        return {
          id: v.videoId,
          title: v.title?.runs?.[0]?.text || '',
          thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
          duration: v.lengthText?.simpleText || '',
          views: v.viewCountText?.simpleText || '',
          channel: v.ownerText?.runs?.[0]?.text || '',
          channelId: v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
          uploaded: v.publishedTimeText?.simpleText || '',
        };
      });

    return c.json({ results: videos });
  } catch (error: any) {
    console.error('Search error:', error.message);
    return c.json({ error: 'Search failed' }, 500);
  }
});

app.get('/api/video/:id', async (c) => {
  const id = c.req.param('id');
  console.log('[VIDEO] Fetching video:', id);

  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    console.log('[VIDEO] Invalid ID');
    return c.json({ error: 'Invalid video ID' }, 400);
  }

  try {
    console.log('[VIDEO] Calling player endpoint...');
    const data = await innertubeRequest('player', { videoId: id });
    console.log('[VIDEO] Player response keys:', Object.keys(data));

    if (data.playabilityStatus?.status !== 'OK') {
      console.log('[VIDEO] Playability error:', data.playabilityStatus);
      return c.json({
        error: 'Video not playable',
        reason: data.playabilityStatus?.reason || 'Unknown'
      }, 403);
    }

    const details = data.videoDetails || {};
    console.log('[VIDEO] Got details for:', details.title);

    const microformat = data.microformat?.playerMicroformatRenderer || {};

    // Fetch related videos
    console.log('[VIDEO] Calling next endpoint for related...');
    let related: any[] = [];

    try {
      const relatedData = await innertubeRequest('next', { videoId: id });

      // Helper to extract video from compactVideoRenderer
      const extractRelated = (v: any) => ({
        id: v.videoId,
        title: v.title?.simpleText || v.title?.runs?.[0]?.text || '',
        thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
        duration: v.lengthText?.simpleText || '',
        views: v.viewCountText?.simpleText || v.shortViewCountText?.simpleText || '',
        channel: v.shortBylineText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || '',
        uploaded: v.publishedTimeText?.simpleText || '',
      });

      // Strategy 1: twoColumnWatchNextResults (desktop)
      const secondaryResults = relatedData.contents?.twoColumnWatchNextResults
        ?.secondaryResults?.secondaryResults?.results || [];

      for (const item of secondaryResults) {
        if (item.compactVideoRenderer) {
          related.push(extractRelated(item.compactVideoRenderer));
        }
        // Also check for itemSectionRenderer containing videos
        if (item.itemSectionRenderer?.contents) {
          for (const content of item.itemSectionRenderer.contents) {
            if (content.compactVideoRenderer) {
              related.push(extractRelated(content.compactVideoRenderer));
            }
          }
        }
      }

      // Strategy 2: singleColumnWatchNextResults (mobile)
      const singleResults = relatedData.contents?.singleColumnWatchNextResults
        ?.results?.results?.contents || [];

      for (const item of singleResults) {
        if (item.compactVideoRenderer) {
          related.push(extractRelated(item.compactVideoRenderer));
        }
        if (item.itemSectionRenderer?.contents) {
          for (const content of item.itemSectionRenderer.contents) {
            if (content.compactVideoRenderer) {
              related.push(extractRelated(content.compactVideoRenderer));
            }
          }
        }
      }

      console.log('[VIDEO] Found', related.length, 'related videos from next endpoint');

      // Fallback: If no related found, try search with video title
      if (related.length === 0 && details.title) {
        console.log('[VIDEO] No related from next, trying search fallback');
        const searchQuery = details.title.split(' ').slice(0, 3).join(' ');
        const searchData = await innertubeRequest('search', { query: searchQuery });

        const searchContents = searchData.contents?.twoColumnSearchResultsRenderer?.primaryContents
          ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

        related = searchContents
          .filter((item: any) => item.videoRenderer && item.videoRenderer.videoId !== id)
          .slice(0, 10)
          .map((item: any) => {
            const v = item.videoRenderer;
            return {
              id: v.videoId,
              title: v.title?.runs?.[0]?.text || '',
              thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
              duration: v.lengthText?.simpleText || '',
              views: v.viewCountText?.simpleText || '',
              channel: v.ownerText?.runs?.[0]?.text || '',
              uploaded: v.publishedTimeText?.simpleText || '',
            };
          });

        console.log('[VIDEO] Search fallback found', related.length, 'related videos');
      }
    } catch (relatedError: any) {
      console.error('[VIDEO] Failed to fetch related:', relatedError.message);
      // Continue without related videos
    }

    // Dedupe and limit related videos
    const seenIds = new Set<string>();
    related = related.filter(v => {
      if (!v.id || seenIds.has(v.id) || v.id === id) return false;
      seenIds.add(v.id);
      return true;
    }).slice(0, 10);

    return c.json({
      id,
      title: details.title || '',
      description: details.shortDescription || '',
      channel: details.author || '',
      channelId: details.channelId || '',
      views: parseInt(details.viewCount || '0').toLocaleString(),
      likes: '',
      uploaded: microformat.publishDate || '',
      thumbnail: details.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
      duration: details.lengthSeconds || '',
      related,
    });
  } catch (error: any) {
    console.error('[VIDEO] Error:', error.message);
    return c.json({ error: 'Failed to get video', details: error.message }, 500);
  }
});

// Cache for trending results (1 hour)
let trendingCache: { videos: any[]; expires: number } | null = null;

app.get('/api/trending', async (c) => {
  // Return cached results if still valid
  if (trendingCache && trendingCache.expires > Date.now()) {
    console.log('[TRENDING] Returning cached results');
    return c.json({ videos: trendingCache.videos });
  }

  try {
    console.log('[TRENDING] Fetching fresh trending...');
    const data = await innertubeRequest('browse', { browseId: 'FEtrending' });

    const videos: any[] = [];

    // Helper to extract video from videoRenderer
    const extractVideo = (v: any) => ({
      id: v.videoId,
      title: v.title?.runs?.[0]?.text || v.title?.simpleText || '',
      thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
      duration: v.lengthText?.simpleText || '',
      views: v.viewCountText?.simpleText || v.shortViewCountText?.simpleText || '',
      channel: v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || '',
      channelId: v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
      uploaded: v.publishedTimeText?.simpleText || '',
    });

    // Strategy 1: twoColumnBrowseResultsRenderer (desktop)
    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    for (const tab of tabs) {
      const contents = tab.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of contents) {
        // Try expandedShelfContentsRenderer
        const shelfItems = section.itemSectionRenderer?.contents?.[0]?.shelfRenderer
          ?.content?.expandedShelfContentsRenderer?.items || [];
        for (const item of shelfItems) {
          if (item.videoRenderer) videos.push(extractVideo(item.videoRenderer));
        }

        // Try richItemRenderer (grid layout)
        const richItems = section.itemSectionRenderer?.contents || [];
        for (const item of richItems) {
          if (item.videoRenderer) videos.push(extractVideo(item.videoRenderer));
          if (item.richItemRenderer?.content?.videoRenderer) {
            videos.push(extractVideo(item.richItemRenderer.content.videoRenderer));
          }
        }
      }
    }

    // Strategy 2: singleColumnBrowseResultsRenderer (mobile)
    const singleColumn = data.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
    for (const tab of singleColumn) {
      const contents = tab.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of contents) {
        const items = section.itemSectionRenderer?.contents || [];
        for (const item of items) {
          if (item.videoRenderer) videos.push(extractVideo(item.videoRenderer));
          if (item.compactVideoRenderer) {
            const v = item.compactVideoRenderer;
            videos.push({
              id: v.videoId,
              title: v.title?.simpleText || '',
              thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
              duration: v.lengthText?.simpleText || '',
              views: v.viewCountText?.simpleText || '',
              channel: v.shortBylineText?.runs?.[0]?.text || '',
              uploaded: '',
            });
          }
        }
      }
    }

    console.log('[TRENDING] Found', videos.length, 'videos from browse');

    // If browse worked, cache and return
    if (videos.length > 0) {
      trendingCache = { videos: videos.slice(0, 20), expires: Date.now() + 3600000 };
      return c.json({ videos: videos.slice(0, 20) });
    }

    // Fallback: Use search for popular content
    console.log('[TRENDING] Browse returned no videos, falling back to search');
    throw new Error('No videos found in browse response');

  } catch (error: any) {
    console.error('[TRENDING] Browse failed:', error.message, '- trying search fallback');

    // Fallback: Search for popular/trending content
    try {
      const searchQueries = ['music video 2024', 'trending', 'popular videos'];
      const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];

      const data = await innertubeRequest('search', { query });
      const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

      const videos = contents
        .filter((item: any) => item.videoRenderer)
        .slice(0, 20)
        .map((item: any) => {
          const v = item.videoRenderer;
          return {
            id: v.videoId,
            title: v.title?.runs?.[0]?.text || '',
            thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
            duration: v.lengthText?.simpleText || '',
            views: v.viewCountText?.simpleText || '',
            channel: v.ownerText?.runs?.[0]?.text || '',
            channelId: v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
            uploaded: v.publishedTimeText?.simpleText || '',
          };
        });

      console.log('[TRENDING] Search fallback found', videos.length, 'videos');

      // Cache the fallback results too
      if (videos.length > 0) {
        trendingCache = { videos, expires: Date.now() + 3600000 };
        return c.json({ videos });
      }

      return c.json({ error: 'No trending videos found' }, 500);
    } catch (searchError: any) {
      console.error('[TRENDING] Search fallback also failed:', searchError.message);
      return c.json({ error: 'Failed to get trending' }, 500);
    }
  }
});

app.get('/api/thumbnail/:id', async (c) => {
  const id = c.req.param('id');
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return c.json({ error: 'Invalid video ID' }, 400);
  }

  try {
    const response = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);

    if (!response.ok) {
      return c.json({ error: 'Thumbnail not found' }, 404);
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return c.json({ error: 'Failed to get thumbnail' }, 500);
  }
});

app.get('/api/proxy-image', async (c) => {
  const url = c.req.query('url');
  if (!url) {
    return c.json({ error: 'Missing URL' }, 400);
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return c.json({ error: 'Image not found' }, 404);
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return c.json({ error: 'Failed to proxy image' }, 500);
  }
});

// =================== VIDEO STREAMING PROXY ===================
// This calls the Deno token service to get video info + PO token,
// then proxies the video stream from YouTube

const WEB_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

app.get('/stream/:id', async (c) => {
  const id = c.req.param('id');
  console.log('[STREAM] Request for video:', id);

  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return c.json({ error: 'Invalid video ID' }, 400);
  }

  const tokenServiceUrl = c.env.TOKEN_SERVICE_URL || 'http://localhost:8788';

  try {
    // Step 1: Get video info from the Deno token service
    console.log('[STREAM] Fetching video info from token service...');
    const infoResponse = await fetch(`${tokenServiceUrl}/video-info/${id}`);

    if (!infoResponse.ok) {
      const errorData = await infoResponse.json().catch(() => ({}));
      console.error('[STREAM] Token service error:', errorData);
      return c.json({ error: 'Failed to get video info', details: errorData }, infoResponse.status as any);
    }

    const videoInfo = await infoResponse.json() as {
      url: string;
      host: string;
      pot: string | null;
      mimeType: string;
      qualityLabel: string;
      contentLength: number;
      client: string;
    };
    console.log('[STREAM] Got video info:', videoInfo.qualityLabel, videoInfo.mimeType);

    // Add pot to URL if not already present
    let videoUrl = videoInfo.url;
    if (videoInfo.pot) {
      const urlObj = new URL(videoUrl);
      if (!urlObj.searchParams.has('pot')) {
        urlObj.searchParams.set('pot', videoInfo.pot);
        videoUrl = urlObj.toString();
        console.log('[STREAM] Added pot to URL');
      } else {
        console.log('[STREAM] URL already has pot');
      }
    }

    // Step 2: Prepare headers for YouTube request
    const rangeHeader = c.req.header('Range');
    const headersToSend: HeadersInit = {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.5',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com',
      'User-Agent': WEB_USER_AGENT,
    };

    // Parse the URL
    const parsedUrl = new URL(videoUrl);
    const queryParams = new URLSearchParams(parsedUrl.search);

    // IMPORTANT: Remove IP parameter - YouTube ties URLs to specific IPs
    // The token was generated from Deno's IP, but Worker has a different IP
    // Removing 'ip' allows the request to work from any IP
    if (queryParams.has('ip')) {
      console.log('[STREAM] Removing ip parameter (was:', queryParams.get('ip')?.substring(0, 20) + '...)');
      queryParams.delete('ip');
    }

    // Add range to query params if present (for seeking)
    if (rangeHeader) {
      const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (rangeMatch) {
        queryParams.set('range', `${rangeMatch[1] || '0'}-${rangeMatch[2] || ''}`);
      }
    }

    // Log key params for debugging
    console.log('[STREAM] Key params - expire:', queryParams.get('expire'), 'itag:', queryParams.get('itag'), 'has pot:', queryParams.has('pot'));

    // Build the final URL
    const host = parsedUrl.host;
    const finalUrl = `https://${host}/videoplayback?${queryParams.toString()}`;

    // Step 4: Try fetching the video
    console.log('[STREAM] Final URL:', finalUrl.substring(0, 120) + '...');
    console.log('[STREAM] Has pot:', queryParams.has('pot'));

    let location = finalUrl;
    let response: Response | null = null;

    // First try GET to see if it works
    console.log('[STREAM] Trying GET request first...');
    response = await fetch(location, {
      method: 'GET',
      headers: headersToSend,
      redirect: 'manual',
    });
    console.log('[STREAM] GET response:', response.status);

    // If GET fails with 403, try POST with protobuf body
    if (response.status === 403) {
      console.log('[STREAM] GET failed, trying POST with protobuf...');

      // Follow redirects manually (up to 5)
      for (let i = 0; i < 5; i++) {
        console.log('[STREAM] POST attempt', i + 1);

        response = await fetch(location, {
          method: 'POST',
          body: new Uint8Array([0x78, 0]), // protobuf: { 15: 0 }
          headers: headersToSend,
          redirect: 'manual',
        });

        console.log('[STREAM] POST response:', response.status);

        if (response.status === 403) {
          const errorText = await response.text();
          console.error('[STREAM] 403 from YouTube. Response headers:', Object.fromEntries(response.headers.entries()));
          return c.json({ error: 'Access denied by YouTube', status: 403 }, 403);
        }

        // Follow redirects
        if (response.status >= 300 && response.status < 400) {
          const redirectLocation = response.headers.get('Location');
          if (redirectLocation) {
            console.log('[STREAM] Following redirect...');
            location = redirectLocation;
            continue;
          }
        }

        // Got a real response
        break;
      }
    }

    // Handle GET redirects
    if (response && response.status >= 300 && response.status < 400) {
      const redirectLocation = response.headers.get('Location');
      if (redirectLocation) {
        console.log('[STREAM] Following GET redirect...');
        response = await fetch(redirectLocation, {
          method: 'GET',
          headers: headersToSend,
        });
        console.log('[STREAM] Redirected GET response:', response.status);
      }
    }

    if (!response || (!response.ok && response.status !== 206)) {
      console.error('[STREAM] Failed to get video');
      return c.json({ error: 'Failed to fetch video from YouTube' }, 502);
    }

    console.log('[STREAM] Success! Streaming video...');

    const contentLength = response.headers.get('Content-Length');
    const contentType = response.headers.get('Content-Type') || videoInfo.mimeType;

    // Build response headers
    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    };

    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }

    const contentRange = response.headers.get('Content-Range');
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange;
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('[STREAM] Error:', error.message);
    return c.json({ error: 'Stream failed', details: error.message }, 500);
  }
});

export default app;
