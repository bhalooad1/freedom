import { InnerTubeContext, PlayerRequest, PlayerResponse } from '../types.ts';

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_BASE = 'https://www.youtube.com/youtubei/v1';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Client version - should be updated periodically
const CLIENT_VERSION = '2.20240101.00.00';

export class InnerTubeClient {
  private visitorData: string | undefined;
  private signatureTimestamp: number = 0;

  constructor() {}

  /**
   * Set visitor data for authentication
   */
  setVisitorData(visitorData: string) {
    this.visitorData = visitorData;
  }

  /**
   * Set signature timestamp from player.js
   */
  setSignatureTimestamp(timestamp: number) {
    this.signatureTimestamp = timestamp;
  }

  /**
   * Build the client context for requests
   */
  private buildContext(): InnerTubeContext {
    return {
      client: {
        hl: 'en',
        gl: 'US',
        clientName: 'WEB',
        clientVersion: CLIENT_VERSION,
        userAgent: USER_AGENT,
        visitorData: this.visitorData,
      },
    };
  }

  /**
   * Make a request to InnerTube API
   */
  private async request<T>(endpoint: string, body: object): Promise<T> {
    const url = `${INNERTUBE_BASE}/${endpoint}?key=${INNERTUBE_API_KEY}`;

    console.log(`[INNERTUBE] Request to ${endpoint}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Goog-Visitor-Id': this.visitorData || '',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[INNERTUBE] Error ${response.status}: ${text.substring(0, 500)}`);
      throw new Error(`InnerTube error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get player data for a video
   */
  async getPlayer(videoId: string, poToken?: string): Promise<PlayerResponse> {
    const body: PlayerRequest = {
      videoId,
      context: this.buildContext(),
    };

    // Add signature timestamp if available
    if (this.signatureTimestamp > 0) {
      body.playbackContext = {
        contentPlaybackContext: {
          signatureTimestamp: this.signatureTimestamp,
        },
      };
    }

    // Add PO token if available
    if (poToken) {
      body.serviceIntegrityDimensions = {
        poToken,
      };
    }

    return this.request<PlayerResponse>('player', body);
  }

  /**
   * Extract visitor data from YouTube page
   */
  async fetchVisitorData(): Promise<string> {
    console.log('[INNERTUBE] Fetching visitor data');

    const response = await fetch('https://www.youtube.com/', {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const html = await response.text();

    // Extract visitor data from ytcfg
    const visitorDataMatch = html.match(/"VISITOR_DATA":"([^"]+)"/);
    if (visitorDataMatch) {
      this.visitorData = visitorDataMatch[1];
      console.log(`[INNERTUBE] Got visitor data: ${this.visitorData.substring(0, 20)}...`);
      return this.visitorData;
    }

    throw new Error('Failed to extract visitor data');
  }
}

// Singleton instance
let clientInstance: InnerTubeClient | null = null;

export function getInnerTubeClient(): InnerTubeClient {
  if (!clientInstance) {
    clientInstance = new InnerTubeClient();
  }
  return clientInstance;
}
