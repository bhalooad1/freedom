// Cloudflare Worker for search, metadata, thumbnails
const API_BASE = import.meta.env.VITE_API_URL || '';

// Deno service for video streaming (must be same IP as token generation)
const STREAM_BASE = import.meta.env.VITE_STREAM_URL || 'http://localhost:8788';

export async function search(query) {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function getVideo(id) {
  const res = await fetch(`${API_BASE}/api/video/${id}`);
  if (!res.ok) throw new Error('Failed to load video');
  return res.json();
}

export async function getTrending() {
  const res = await fetch(`${API_BASE}/api/trending`);
  if (!res.ok) throw new Error('Failed to fetch trending');
  return res.json();
}

// Stream directly from Deno service (same IP that generates tokens)
// This is required because YouTube validates IP addresses
export function getStreamUrl(id) {
  return `${STREAM_BASE}/stream/${id}`;
}

export function getThumbnailUrl(id) {
  return `${API_BASE}/api/thumbnail/${id}`;
}

export function getProxyImageUrl(url) {
  return `${API_BASE}/api/proxy-image?url=${encodeURIComponent(url)}`;
}
