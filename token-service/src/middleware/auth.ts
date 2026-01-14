import { Context, Next } from '@hono/hono';

const MAX_TIMESTAMP_DRIFT_MS = 60000; // 60 seconds

/**
 * Compute HMAC-SHA256 signature
 */
async function computeHmac(message: string, secret: string): Promise<string> {
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
 * Verify request signature
 */
export async function verifyRequest(
  videoId: string,
  timestamp: number,
  signature: string,
  secret: string
): Promise<boolean> {
  // Check timestamp drift
  const drift = Math.abs(Date.now() - timestamp);
  if (drift > MAX_TIMESTAMP_DRIFT_MS) {
    console.warn(`[AUTH] Request timestamp too old: ${drift}ms drift`);
    return false;
  }

  // Compute expected signature
  const message = `${videoId}:${timestamp}`;
  const expected = await computeHmac(message, secret);

  // Compare signatures (constant-time comparison)
  if (signature.length !== expected.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Auth middleware for Hono
 */
export function authMiddleware(secret: string) {
  return async (c: Context, next: Next) => {
    // Skip auth for health checks
    if (c.req.path === '/health' || c.req.path === '/healthz') {
      return next();
    }

    const serviceKey = c.req.header('X-Service-Key');
    const timestamp = c.req.header('X-Request-Timestamp');
    const signature = c.req.header('X-Request-Signature');

    // Check service key
    if (serviceKey !== secret) {
      console.warn('[AUTH] Invalid service key');
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    // For POST requests, also verify signature
    if (c.req.method === 'POST') {
      if (!timestamp || !signature) {
        console.warn('[AUTH] Missing timestamp or signature');
        return c.json({ success: false, error: 'Unauthorized' }, 401);
      }

      // Get video ID from body
      try {
        const body = await c.req.json();
        const videoId = body.videoId;

        if (!videoId) {
          return c.json({ success: false, error: 'Missing videoId' }, 400);
        }

        const isValid = await verifyRequest(
          videoId,
          parseInt(timestamp, 10),
          signature,
          secret
        );

        if (!isValid) {
          console.warn('[AUTH] Invalid signature');
          return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        // Store parsed body for later use
        c.set('parsedBody', body);
      } catch (e) {
        console.error('[AUTH] Failed to parse body:', e);
        return c.json({ success: false, error: 'Invalid request body' }, 400);
      }
    }

    return next();
  };
}
