// API Configuration
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

// Stream Worker URL (v2 - serverless with Android client)
const STREAM_BASE = import.meta.env.VITE_STREAM_WORKER_URL || 'http://localhost:8791';

// Use serverless mode (v2) by default, can be overridden
const USE_SERVERLESS = import.meta.env.VITE_USE_SERVERLESS !== 'false';

// Always log configuration for debugging
console.log('%c[API] Configuration:', 'color: #00ff00; font-weight: bold');
console.log(`  API Base: ${API_BASE}`);
console.log(`  Stream Base: ${STREAM_BASE}`);
console.log(`  Serverless Mode: ${USE_SERVERLESS}`);
console.log(`  Environment: ${import.meta.env.MODE}`);

export async function search(query) {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function getVideo(id) {
  const url = USE_SERVERLESS ? `${STREAM_BASE}/info/${id}` : `${STREAM_BASE}/api/video/${id}`;
  console.log(`%c[API] Fetching video metadata: ${url}`, 'color: #00bfff');

  try {
    const res = await fetch(url);
    console.log(`%c[API] Response status: ${res.status}`, res.ok ? 'color: #00ff00' : 'color: #ff0000');

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error('[API] Error response:', error);
      throw new Error(error.reason || error.error || 'Failed to load video');
    }

    const data = await res.json();
    console.log('%c[API] Video loaded:', 'color: #00ff00', data.title);
    return data;
  } catch (err) {
    console.error('%c[API] Fetch failed:', 'color: #ff0000', err.message);
    throw err;
  }
}

export async function getTrending() {
  const res = await fetch(`${API_BASE}/api/trending`);
  if (!res.ok) throw new Error('Failed to fetch trending');
  return res.json();
}

export function getThumbnailUrl(id) {
  return `${API_BASE}/api/thumbnail/${id}`;
}

export function getProxyImageUrl(url) {
  return `${API_BASE}/api/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * Get stream URL
 */
export function getStreamUrl(id) {
  if (USE_SERVERLESS) {
    return `${STREAM_BASE}/a/${id}`;
  } else {
    // Railway mode: stream directly from Railway stream service
    return `${STREAM_BASE}/stream/${id}`;
  }
}

/**
 * Get stream URL with client-generated token (legacy, kept for compatibility)
 */
export function getStreamUrlWithToken(id, poToken, visitorData) {
  return getStreamUrl(id);
}

/**
 * Check if serverless mode (v2) is enabled
 */
export function isServerlessMode() {
  return USE_SERVERLESS;
}

// Export for debugging/testing
export function getConfig() {
  return {
    apiBase: API_BASE,
    streamBase: STREAM_BASE,
    serverless: USE_SERVERLESS,
  };
}
