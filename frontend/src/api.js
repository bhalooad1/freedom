const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';
const STREAM_BASE = import.meta.env.VITE_STREAM_WORKER_URL || 'http://localhost:8791';
const USE_SERVERLESS = import.meta.env.VITE_USE_SERVERLESS !== 'false';

export async function search(query) {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function getVideo(id) {
  const url = USE_SERVERLESS ? `${STREAM_BASE}/info/${id}` : `${STREAM_BASE}/api/video/${id}`;
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.reason || error.error || 'Failed to load video');
  }
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
  return USE_SERVERLESS ? `${STREAM_BASE}/a/${id}` : `${STREAM_BASE}/stream/${id}`;
}

export function getStreamUrlWithToken(id) {
  return getStreamUrl(id);
}

export function isServerlessMode() {
  return USE_SERVERLESS;
}
