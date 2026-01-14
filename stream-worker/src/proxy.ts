import { VideoUrlData } from './types';

// User agent to use when fetching from YouTube
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Build the final YouTube URL with PO token
 */
function buildVideoUrl(data: VideoUrlData): string {
  const url = new URL(data.url);

  // Add PO token if present
  if (data.pot) {
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
 */
export async function proxyVideoStream(
  request: Request,
  videoData: VideoUrlData
): Promise<Response> {
  const videoUrl = buildVideoUrl(videoData);
  const rangeHeader = request.headers.get('Range');

  console.log(`[PROXY] Video URL: ${videoUrl.substring(0, 200)}...`);
  console.log(`[PROXY] Fetching from YouTube, Range: ${rangeHeader || 'none'}`);

  // Build headers for YouTube request
  const headers: HeadersInit = {
    'User-Agent': USER_AGENT,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.youtube.com',
    'Referer': 'https://www.youtube.com/',
  };

  // Forward Range header if present
  if (rangeHeader) {
    headers['Range'] = rangeHeader;
  }

  try {
    const response = await fetch(videoUrl, {
      method: 'GET',
      headers,
    });

    console.log(`[PROXY] YouTube responded with ${response.status}`);

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
