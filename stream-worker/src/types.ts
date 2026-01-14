// Environment bindings for the Worker
export interface Env {
  // KV namespace for caching video URLs
  VIDEO_CACHE?: KVNamespace;

  // Token service configuration
  TOKEN_SERVICE_URL: string;
  TOKEN_SERVICE_SECRET: string;

  // Environment
  ENVIRONMENT: string;
}

// Response from token service
export interface TokenServiceResponse {
  success: boolean;
  data?: VideoUrlData;
  error?: string;
}

export interface VideoUrlData {
  url: string;           // Ready-to-use YouTube URL with deciphered signature
  pot: string;           // PO token for this video
  host: string;          // googlevideo.com host
  mimeType: string;      // e.g., "video/mp4; codecs=\"avc1.4d401f\""
  qualityLabel: string;  // e.g., "720p"
  contentLength: number; // Total bytes
  expiresAt: number;     // Unix timestamp when URL expires
}

// Cached video data in KV
export interface CachedVideoData extends VideoUrlData {
  cachedAt: number;
}
