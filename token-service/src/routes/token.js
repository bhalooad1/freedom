import { Hono } from 'hono';
import { getVideoPoToken, getVisitorData, isInitialized, refreshPoToken } from '../potoken/generator.js';
import { getPlayerData, decipherUrl } from '../innertube/player.js';

const app = new Hono();

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CLIENT_VERSION = '2.20241210.00.00';

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

  try {
    // Get PO token and visitor data
    const poToken = await getVideoPoToken(videoId);
    const visitorData = await getVisitorData();
    console.log(`[TOKEN] Got PO token for ${videoId}`);

    // Get player data (for signature deciphering)
    const playerData = await getPlayerData();
    console.log(`[TOKEN] Got player data (timestamp: ${playerData.signatureTimestamp})`);

    // Fetch video info from InnerTube API
    console.log(`[TOKEN] Fetching video info for ${videoId}`);
    const playerResponse = await fetchPlayerResponse(videoId, visitorData, poToken, playerData.signatureTimestamp);

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
    const format = selectBestFormat(playerResponse.streamingData);

    if (!format) {
      return c.json(
        {
          success: false,
          error: 'No suitable format found',
        },
        404
      );
    }

    console.log(`[TOKEN] Selected format: ${format.qualityLabel || format.quality} (${format.mimeType})`);

    // Get the URL (may need deciphering)
    let url;

    if (format.url) {
      // URL is already available, just need to transform n parameter
      url = await decipherUrl(playerData, format.url);
    } else if (format.signatureCipher) {
      // Need to decipher the signature
      url = await decipherUrl(playerData, '', format.signatureCipher);
    } else {
      return c.json(
        {
          success: false,
          error: 'Could not get video URL',
        },
        500
      );
    }

    // Add PO token and alr=no to URL
    // alr=no prevents YouTube from auto-redirecting to different CDN servers
    // which would have a new untransformed n parameter
    const urlObj = new URL(url);
    urlObj.searchParams.set('pot', poToken);
    urlObj.searchParams.set('alr', 'no');
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
        mimeType: format.mimeType || 'video/mp4',
        qualityLabel: format.qualityLabel || format.quality || '720p',
        contentLength: parseInt(format.contentLength || '0', 10),
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
    timestamp: new Date().toISOString(),
  });
});

export default app;
