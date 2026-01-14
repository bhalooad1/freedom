// API Configuration
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

// Stream Worker URL
const STREAM_BASE = import.meta.env.VITE_STREAM_WORKER_URL || 'http://localhost:8789';

// Log configuration in development
if (import.meta.env.DEV) {
  console.log('[API] Configuration:');
  console.log(`  API Base: ${API_BASE}`);
  console.log(`  Stream Base: ${STREAM_BASE}`);
}

export async function search(query) {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function getVideo(id) {
  // Video metadata comes from the API worker
  const res = await fetch(`${API_BASE}/api/video/${id}`);
  if (!res.ok) throw new Error('Failed to load video');
  return res.json();
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

export function getStreamUrl(id) {
  return `${STREAM_BASE}/stream/${id}`;
}

// Export for debugging/testing
export function getConfig() {
  return {
    apiBase: API_BASE,
    streamBase: STREAM_BASE,
  };
}
