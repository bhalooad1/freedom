// InnerTube API types

export interface InnerTubeContext {
  client: {
    hl: string;
    gl: string;
    clientName: string;
    clientVersion: string;
    userAgent: string;
    visitorData?: string;
  };
}

export interface PlayerRequest {
  videoId: string;
  context: InnerTubeContext;
  playbackContext?: {
    contentPlaybackContext: {
      signatureTimestamp: number;
    };
  };
  serviceIntegrityDimensions?: {
    poToken: string;
  };
}

export interface PlayerResponse {
  playabilityStatus: {
    status: string;
    reason?: string;
    playableInEmbed?: boolean;
  };
  streamingData?: {
    formats?: VideoFormat[];
    adaptiveFormats?: VideoFormat[];
    expiresInSeconds?: string;
  };
  videoDetails?: {
    videoId: string;
    title: string;
    lengthSeconds: string;
    channelId: string;
    shortDescription: string;
    viewCount: string;
    author: string;
  };
}

export interface VideoFormat {
  itag: number;
  url?: string;
  signatureCipher?: string;
  mimeType: string;
  bitrate: number;
  width?: number;
  height?: number;
  contentLength?: string;
  quality: string;
  qualityLabel?: string;
  audioQuality?: string;
  audioSampleRate?: string;
  audioChannels?: number;
}

// Decipher types

export interface DecipherResult {
  signature: string;
  n: string;
}

export interface PlayerData {
  playerId: string;
  playerUrl: string;
  signatureTimestamp: number;
  // The extracted script with sig and n functions
  scriptData: {
    output: string;
    exported: string[];
    // deno-lint-ignore no-explicit-any
    exportedRawValues?: Record<string, any>;
  };
}

// PO Token types

export interface POTokenData {
  token: string;
  visitorData: string;
  expiresAt: number;
}

// API Response types

export interface VideoUrlRequest {
  videoId: string;
  timestamp: number;
  signature: string;
}

export interface VideoUrlResponse {
  success: boolean;
  data?: {
    url: string;
    pot: string;
    host: string;
    mimeType: string;
    qualityLabel: string;
    contentLength: number;
    expiresAt: number;
  };
  error?: string;
}
