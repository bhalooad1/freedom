// Cloudflare Worker for search, metadata, thumbnails
// In dev: run `npm run dev` in /worker folder (port 8787)
// In prod: set VITE_API_URL to your deployed worker URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

// Deno service for video streaming (must be same IP as token generation)
// This CANNOT go through Cloudflare Workers due to YouTube IP validation
const STREAM_BASE = import.meta.env.VITE_STREAM_URL || 'http://localhost:8788';

// Debug: Log URLs on load (check browser console if issues occur)
console.log('[Freedom] API:', API_BASE, '| Stream:', STREAM_BASE);

// ========== Cloudflare Worker APIs ==========

export async function search(query) {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

// Video metadata now comes from Deno (more reliable - has PO token auth)
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

// ========== Deno Server APIs (Video Streaming) ==========

// Stream directly from Deno service (same IP that generates tokens)
// This is required because YouTube validates IP addresses
export function getStreamUrl(id) {
  return `${STREAM_BASE}/stream/${id}`;
}
