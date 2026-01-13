const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';
const STREAM_BASE = import.meta.env.VITE_STREAM_URL || 'http://localhost:8788';

export async function search(query) {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function getVideo(id) {
  const res = await fetch(`${STREAM_BASE}/api/video/${id}`);
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
