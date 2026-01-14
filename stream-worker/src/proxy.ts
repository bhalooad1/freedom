import { VideoUrlData } from './types';

// User agent to use when fetching from YouTube
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Build the final YouTube URL with PO token
 */
function buildVideoUrl(data: VideoUrlData): string {
  const url = new URL(data.url);

  // IMPORTANT: Remove IP-related parameters - YouTube ties URLs to specific IPs
  // The URL was generated from Railway's IP, but we're fetching from Cloudflare's IP
  const ipParams = ['ip', 'ipbits', 'source'];
  for (const param of ipParams) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
    }
  }

  // Add PO token if present (should already be in URL from token service, but ensure it's there)
  if (data.pot && !url.searchParams.has('pot')) {
    url.searchParams.set('pot', data.pot);
  }

  return url.toString();
}

/**
 * Parse Range header to extract start and end bytes
 */
function parseRangeHeader(
  rangeHeader: string | null,
  contentLength: number
): { start: number; end: number } | null {
  if (!rangeHeader) {
    return null;
  }

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    return null;
  }

  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end = match[2] ? parseInt(match[2], 10) : contentLength - 1;

  return { start, end };
}

/**
 * Proxy video stream from YouTube to client
 * Uses HEAD-then-POST pattern like the working stream service
 */
export async function proxyVideoStream(
  request: Request,
  videoData: VideoUrlData
): Promise<Response> {
  const baseUrl = buildVideoUrl(videoData);
  const rangeHeader = request.headers.get('Range');

  // Parse range for query parameter
  let rangeStart = 0;
  let rangeEnd: number | undefined;
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      rangeStart = match[1] ? parseInt(match[1], 10) : 0;
      rangeEnd = match[2] ? parseInt(match[2], 10) : undefined;
    }
  }

  // Add range as query parameter (like the working stream service does)
  const url = new URL(baseUrl);
  if (rangeHeader) {
    url.searchParams.set('range', `${rangeStart}-${rangeEnd || ''}`);
  }
  const videoUrl = url.toString();

  console.log(`[PROXY] Video URL: ${videoUrl.substring(0, 200)}...`);
  console.log(`[PROXY] Range: ${rangeHeader || 'none'}`);

  // Build headers for YouTube request
  const headers: HeadersInit = {
    'User-Agent': USER_AGENT,
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.youtube.com',
    'Referer': 'https://www.youtube.com/',
  };

  try {
    // Step 1: HEAD request to follow redirects (like working stream service)
    let finalUrl = videoUrl;
    for (let i = 0; i < 5; i++) {
      const headResponse = await fetch(finalUrl, {
        method: 'HEAD',
        headers,
        redirect: 'manual',
      });

      console.log(`[PROXY] HEAD ${i + 1}: ${headResponse.status}`);

      if (headResponse.status === 403) {
        const errorBody = await headResponse.text();
        console.error(`[PROXY] HEAD 403 error`);
        return new Response(`YouTube error: 403`, { status: 403 });
      }

      const location = headResponse.headers.get('Location');
      if (location) {
        console.log(`[PROXY] Redirect to: ${location.substring(0, 100)}...`);
        finalUrl = location;
        continue;
      }

      // No redirect, we have the final URL
      break;
    }

    console.log(`[PROXY] Final URL resolved, fetching with POST...`);

    // Step 2: POST request with protobuf body (like working stream service)
    const response = await fetch(finalUrl, {
      method: 'POST',
      headers,
      body: new Uint8Array([0x78, 0]), // protobuf: { 15: 0 }
    });

    console.log(`[PROXY] POST response: ${response.status}`);

    // Handle error responses
    if (!response.ok && response.status !== 206) {
      const errorBody = await response.text();
      console.error(`[PROXY] YouTube error: ${response.status}`);
      console.error(`[PROXY] Error body: ${errorBody.substring(0, 500)}`);
      return new Response(`YouTube error: ${response.status}`, {
        status: response.status,
      });
    }

    // Build response headers
    const responseHeaders = new Headers();

    // Copy relevant headers from YouTube response
    const headersToForward = [
      'Content-Type',
      'Content-Length',
      'Content-Range',
      'Accept-Ranges',
    ];

    for (const header of headersToForward) {
      const value = response.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    }

    // Set CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    // Handle 206 Partial Content
    if (response.status === 206) {
      return new Response(response.body, {
        status: 206,
        headers: responseHeaders,
      });
    }

    // Handle full content with Range request
    // YouTube sometimes returns 200 even with Range header
    if (rangeHeader && response.status === 200) {
      const range = parseRangeHeader(rangeHeader, videoData.contentLength);

      if (range) {
        const contentLength = range.end - range.start + 1;
        responseHeaders.set('Content-Length', contentLength.toString());
        responseHeaders.set(
          'Content-Range',
          `bytes ${range.start}-${range.end}/${videoData.contentLength}`
        );
        responseHeaders.set('Accept-Ranges', 'bytes');

        return new Response(response.body, {
          status: 206,
          headers: responseHeaders,
        });
      }
    }

    // Return full response
    return new Response(response.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[PROXY] Fetch error:', error);
    return new Response('Failed to fetch video', { status: 502 });
  }
}

/**
 * Handle preflight OPTIONS request
 */
export function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Max-Age': '86400',
    },
  });
}
