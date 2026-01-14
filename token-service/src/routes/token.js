import { Hono } from 'hono';
import { getVideoPoToken, getVisitorData, isInitialized, refreshPoToken } from '../potoken/generator.js';

const app = new Hono();

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CLIENT_VERSION = '2.20241210.00.00';

// Store the Innertube client
let innertubeClient = null;

/**
 * Set the Innertube client from main.js
 */
export function setInnertubeClient(client) {
  innertubeClient = client;
  console.log('[TOKEN] Innertube client set');
}

/**
 * Make InnerTube player API request
 */
async function fetchPlayerResponse(videoId, visitorData, poToken, signatureTimestamp) {
  const url = 'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'X-Goog-Visitor-Id': visitorData,
    },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          hl: 'en',
          gl: 'US',
          clientName: 'WEB',
          clientVersion: CLIENT_VERSION,
          userAgent: USER_AGENT,
          visitorData,
        },
      },
      playbackContext: {
        contentPlaybackContext: {
          signatureTimestamp,
        },
      },
      serviceIntegrityDimensions: {
        poToken,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`InnerTube API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Select the best format from available formats
 * Prefers combined formats (video+audio) in mp4
 */
function selectBestFormat(streamingData) {
  if (!streamingData) return null;

  const formats = streamingData.formats || [];
  const adaptiveFormats = streamingData.adaptiveFormats || [];

  // Find combined mp4 format up to 720p
  const combinedFormats = formats
    .filter((f) => f.mimeType?.includes('video/mp4'))
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  if (combinedFormats.length > 0) {
    const format = combinedFormats.find((f) => (f.height || 0) <= 720) || combinedFormats[combinedFormats.length - 1];
    return format;
  }

  // Fallback to adaptive video format
  const videoFormats = adaptiveFormats
    .filter((f) => f.mimeType?.includes('video/mp4') && !f.mimeType?.includes('audio'))
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  if (videoFormats.length > 0) {
    const format = videoFormats.find((f) => (f.height || 0) <= 720) || videoFormats[videoFormats.length - 1];
    return format;
  }

  return null;
}

/**
 * POST /token/video-url
 * Get a ready-to-use video URL with deciphered signature and PO token
 */
app.post('/video-url', async (c) => {
  const startTime = Date.now();

  // Get parsed body from auth middleware
  const body = c.get('parsedBody') || (await c.req.json());
  const videoId = body.videoId;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return c.json(
      {
        success: false,
        error: 'Invalid video ID',
      },
      400
    );
  }

  console.log(`[TOKEN] Processing request for ${videoId}`);

  if (!innertubeClient) {
    return c.json(
      {
        success: false,
        error: 'Service initializing - Innertube client not ready',
      },
      503
    );
  }

  try {
    // Get PO token and visitor data
    const poToken = await getVideoPoToken(videoId);
    const visitorData = await getVisitorData();
    console.log(`[TOKEN] Got PO token for ${videoId}`);

    // Get signature timestamp from Innertube client's player
    const signatureTimestamp = innertubeClient.session.player?.signature_timestamp || 0;
    console.log(`[TOKEN] Using signature timestamp: ${signatureTimestamp}`);

    // Fetch video info from InnerTube API
    console.log(`[TOKEN] Fetching video info for ${videoId}`);
    const playerResponse = await fetchPlayerResponse(videoId, visitorData, poToken, signatureTimestamp);

    // Check playability
    if (playerResponse.playabilityStatus?.status !== 'OK') {
      console.error(`[TOKEN] Video not playable: ${playerResponse.playabilityStatus?.status}`);
      return c.json(
        {
          success: false,
          error: playerResponse.playabilityStatus?.reason || 'Video not playable',
        },
        403
      );
    }

    // Select best format
    const rawFormat = selectBestFormat(playerResponse.streamingData);

    if (!rawFormat) {
      return c.json(
        {
          success: false,
          error: 'No suitable format found',
        },
        404
      );
    }

    console.log(`[TOKEN] Selected format: ${rawFormat.qualityLabel || rawFormat.quality} (${rawFormat.mimeType})`);

    // Use the player's decipher method directly
    const player = innertubeClient.session.player;
    let url;

    if (rawFormat.url) {
      // URL exists but may need n-transform
      url = await player.decipher(rawFormat.url);
    } else if (rawFormat.signatureCipher) {
      // Need to decipher the signature
      url = await player.decipher(undefined, rawFormat.signatureCipher);
    } else if (rawFormat.cipher) {
      // Old cipher format
      url = await player.decipher(undefined, undefined, rawFormat.cipher);
    } else {
      return c.json(
        {
          success: false,
          error: 'No URL or cipher in format',
        },
        500
      );
    }

    if (!url) {
      return c.json(
        {
          success: false,
          error: 'Could not decipher video URL',
        },
        500
      );
    }

    console.log(`[TOKEN] Deciphered URL successfully`);

    // Add PO token and alr=no to URL
    // alr=no prevents YouTube from auto-redirecting to different CDN servers
    const urlObj = new URL(url);
    urlObj.searchParams.set('pot', poToken);

    // Replace alr=yes with alr=no if present, or add it
    if (urlObj.searchParams.get('alr') === 'yes') {
      urlObj.searchParams.set('alr', 'no');
    } else if (!urlObj.searchParams.has('alr')) {
      urlObj.searchParams.set('alr', 'no');
    }

    url = urlObj.toString();

    // Extract host
    const host = urlObj.hostname;

    // Calculate expiry
    const expiresInSeconds = parseInt(playerResponse.streamingData?.expiresInSeconds || '21600', 10);
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    const duration = Date.now() - startTime;
    console.log(`[TOKEN] Request completed in ${duration}ms`);

    return c.json({
      success: true,
      data: {
        url,
        pot: poToken,
        host,
        mimeType: rawFormat.mimeType || 'video/mp4',
        qualityLabel: rawFormat.qualityLabel || rawFormat.quality || '720p',
        contentLength: parseInt(rawFormat.contentLength || '0', 10),
        expiresAt,
      },
    });
  } catch (error) {
    console.error(`[TOKEN] Error processing ${videoId}:`, error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /token/refresh
 * Force refresh the PO token
 */
app.post('/refresh', async (c) => {
  console.log('[TOKEN] Force refreshing PO token');

  try {
    await refreshPoToken();
    return c.json({ success: true, message: 'Token refreshed' });
  } catch (error) {
    console.error('[TOKEN] Failed to refresh token:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /token/status
 * Check token service status
 */
app.get('/status', (c) => {
  return c.json({
    initialized: isInitialized(),
    innertubeReady: !!innertubeClient,
    playerReady: !!innertubeClient?.session?.player,
    signatureTimestamp: innertubeClient?.session?.player?.signature_timestamp || null,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /token/video-info
 * Get video metadata using PO token authentication
 */
app.post('/video-info', async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());
  const videoId = body.videoId;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return c.json({ success: false, error: 'Invalid video ID' }, 400);
  }

  console.log(`[TOKEN] Getting video info for ${videoId}`);

  if (!innertubeClient) {
    return c.json({ success: false, error: 'Service initializing' }, 503);
  }

  try {
    const poToken = await getVideoPoToken(videoId);
    const visitorData = await getVisitorData();
    const signatureTimestamp = innertubeClient.session.player?.signature_timestamp || 0;

    const playerResponse = await fetchPlayerResponse(videoId, visitorData, poToken, signatureTimestamp);

    if (playerResponse.playabilityStatus?.status !== 'OK') {
      return c.json({
        success: false,
        error: playerResponse.playabilityStatus?.reason || 'Video not playable',
      }, 403);
    }

    const details = playerResponse.videoDetails || {};
    const microformat = playerResponse.microformat?.playerMicroformatRenderer || {};

    // Get related videos via next endpoint
    let related = [];
    try {
      const nextResponse = await fetch('https://www.youtube.com/youtubei/v1/next?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'X-Goog-Visitor-Id': visitorData,
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              hl: 'en',
              gl: 'US',
              clientName: 'WEB',
              clientVersion: CLIENT_VERSION,
              visitorData,
            },
          },
        }),
      });

      if (nextResponse.ok) {
        const nextData = await nextResponse.json();

        const extractRelated = (v) => ({
          id: v.videoId,
          title: v.title?.simpleText || v.title?.runs?.[0]?.text || '',
          thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
          duration: v.lengthText?.simpleText || '',
          views: v.viewCountText?.simpleText || v.shortViewCountText?.simpleText || '',
          channel: v.shortBylineText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || '',
          uploaded: v.publishedTimeText?.simpleText || '',
        });

        const secondaryResults = nextData.contents?.twoColumnWatchNextResults
          ?.secondaryResults?.secondaryResults?.results || [];

        for (const item of secondaryResults) {
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
      }
    } catch (e) {
      console.error('[TOKEN] Failed to get related videos:', e);
    }

    // Dedupe related
    const seenIds = new Set();
    related = related.filter(v => {
      if (!v.id || seenIds.has(v.id) || v.id === videoId) return false;
      seenIds.add(v.id);
      return true;
    }).slice(0, 10);

    return c.json({
      success: true,
      data: {
        id: videoId,
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
      },
    });
  } catch (error) {
    console.error(`[TOKEN] Error getting video info for ${videoId}:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default app;
