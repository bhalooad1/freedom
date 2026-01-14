import { Env, TokenServiceResponse } from './types';

/**
 * Sign a request using HMAC-SHA256
 */
async function signRequest(
  videoId: string,
  timestamp: number,
  secret: string
): Promise<string> {
  const message = `${videoId}:${timestamp}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );

  // Convert to base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Call the Railway token service to get a video URL
 */
export async function getVideoUrl(
  env: Env,
  videoId: string
): Promise<TokenServiceResponse> {
  const tokenServiceUrl = env.TOKEN_SERVICE_URL;
  const secret = env.TOKEN_SERVICE_SECRET;

  if (!tokenServiceUrl || !secret) {
    console.error('[TOKEN] Missing TOKEN_SERVICE_URL or TOKEN_SERVICE_SECRET');
    return {
      success: false,
      error: 'Token service not configured',
    };
  }

  try {
    const timestamp = Date.now();
    const signature = await signRequest(videoId, timestamp, secret);

    console.log(`[TOKEN] Requesting URL for ${videoId}`);

    const response = await fetch(`${tokenServiceUrl}/token/video-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': secret,
        'X-Request-Timestamp': timestamp.toString(),
        'X-Request-Signature': signature,
      },
      body: JSON.stringify({
        videoId,
        timestamp,
        signature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TOKEN] Service error ${response.status}: ${errorText}`);
      return {
        success: false,
        error: `Token service error: ${response.status}`,
      };
    }

    const result = await response.json() as TokenServiceResponse;

    if (result.success && result.data) {
      console.log(`[TOKEN] Got URL for ${videoId} (${result.data.qualityLabel})`);
    } else {
      console.error(`[TOKEN] Failed for ${videoId}: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error(`[TOKEN] Request failed for ${videoId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
