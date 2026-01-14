/**
 * InnerTube API Module
 * Calls YouTube's internal API to get video formats
 * PO token comes from Railway token service, deciphering happens locally
 */

import { getPlayerData, PlayerData } from './player';
import { decipherUrl } from './decipher';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const CLIENT_VERSION = '2.20241210.00.00';
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

export interface VideoFormat {
  url: string;
  mimeType: string;
  qualityLabel: string;
  contentLength: number;
  itag: number;
}

export interface VideoData {
  url: string;
  pot: string;
  mimeType: string;
  qualityLabel: string;
  contentLength: number;
}

interface TokenServiceResponse {
  success: boolean;
  data?: {
    poToken: string;
    visitorData: string;
  };
  error?: string;
}

/**
 * Get PO token and visitor data from Railway token service
 */
async function getPOToken(
  videoId: string,
  tokenServiceUrl: string,
  secretKey: string
): Promise<{ poToken: string; visitorData: string }> {
  console.log(`[INNERTUBE] Getting PO token for ${videoId}`);

  // Generate request signature
  const timestamp = Date.now().toString();
  const body = JSON.stringify({ videoId });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureData = `${timestamp}:${body}`;
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signatureData)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  const response = await fetch(`${tokenServiceUrl}/token/po-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Timestamp': timestamp,
      'X-Request-Signature': signature,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token service error: ${response.status}`);
  }

  const data = await response.json() as TokenServiceResponse;
  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to get PO token');
  }

  return data.data;
}

/**
 * Call YouTube InnerTube player API
 */
async function fetchPlayerResponse(
  videoId: string,
  visitorData: string,
  poToken: string,
  signatureTimestamp: number
): Promise<any> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'X-Goog-Visitor-Id': visitorData,
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
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
 * Prefers combined formats (video+audio) in mp4 up to 720p
 */
function selectBestFormat(streamingData: any): any | null {
  if (!streamingData) return null;

  const formats = streamingData.formats || [];
  const adaptiveFormats = streamingData.adaptiveFormats || [];

  // Find combined mp4 format up to 720p
  const combinedFormats = formats
    .filter((f: any) => f.mimeType?.includes('video/mp4'))
    .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

  if (combinedFormats.length > 0) {
    const format = combinedFormats.find((f: any) => (f.height || 0) <= 720) || combinedFormats[combinedFormats.length - 1];
    return format;
  }

  // Fallback to adaptive video format
  const videoFormats = adaptiveFormats
    .filter((f: any) => f.mimeType?.includes('video/mp4') && !f.mimeType?.includes('audio'))
    .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

  if (videoFormats.length > 0) {
    const format = videoFormats.find((f: any) => (f.height || 0) <= 720) || videoFormats[videoFormats.length - 1];
    return format;
  }

  return null;
}

/**
 * Get video data with deciphered URL
 * This is the main entry point - gets PO token from Railway, calls YouTube API,
 * deciphers URL locally (on same IP that will fetch)
 */
export async function getVideoData(
  videoId: string,
  tokenServiceUrl: string,
  secretKey: string
): Promise<VideoData> {
  console.log(`[INNERTUBE] Getting video data for ${videoId}`);

  // Step 1: Get player data (sig/n functions, signature timestamp)
  const playerData = await getPlayerData();
  console.log(`[INNERTUBE] Player ID: ${playerData.playerId}`);
  console.log(`[INNERTUBE] Signature timestamp: ${playerData.signatureTimestamp}`);
  console.log(`[INNERTUBE] Has sig function: ${!!playerData.sigFunction}`);
  console.log(`[INNERTUBE] Has n function: ${!!playerData.nFunction}`);

  // Step 2: Get PO token from Railway token service
  const { poToken, visitorData } = await getPOToken(videoId, tokenServiceUrl, secretKey);
  console.log(`[INNERTUBE] Got PO token`);

  // Step 3: Call YouTube InnerTube API
  const playerResponse = await fetchPlayerResponse(
    videoId,
    visitorData,
    poToken,
    playerData.signatureTimestamp
  );

  // Check playability
  if (playerResponse.playabilityStatus?.status !== 'OK') {
    throw new Error(playerResponse.playabilityStatus?.reason || 'Video not playable');
  }

  // Step 4: Select best format
  const format = selectBestFormat(playerResponse.streamingData);
  if (!format) {
    throw new Error('No suitable format found');
  }

  console.log(`[INNERTUBE] Selected format: ${format.qualityLabel || format.quality}`);

  // Step 5: Decipher URL locally (same IP as where we'll proxy from)
  let url: string;

  if (format.url) {
    // URL exists but may need n-transform
    console.log(`[INNERTUBE] Deciphering URL (has direct url)`);
    url = decipherUrl(format.url, playerData);
  } else if (format.signatureCipher) {
    // Need to decipher signature
    console.log(`[INNERTUBE] Deciphering signatureCipher`);
    url = decipherUrl('', playerData, format.signatureCipher);
  } else if (format.cipher) {
    // Old cipher format
    console.log(`[INNERTUBE] Deciphering cipher`);
    url = decipherUrl('', playerData, format.cipher);
  } else {
    throw new Error('No URL or cipher in format');
  }

  // Step 6: Add PO token and alr=no to URL
  const urlObj = new URL(url);
  urlObj.searchParams.set('pot', poToken);
  urlObj.searchParams.set('alr', 'no'); // Prevent redirect to different CDN

  return {
    url: urlObj.toString(),
    pot: poToken,
    mimeType: format.mimeType || 'video/mp4',
    qualityLabel: format.qualityLabel || format.quality || '720p',
    contentLength: parseInt(format.contentLength || '0', 10),
  };
}
