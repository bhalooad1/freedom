import { JsAnalyzer, type ExtractionConfig } from '../js/analyzer.ts';
import { JsExtractor } from '../js/extractor.ts';
import { sigMatcher, nMatcher, timestampMatcher } from '../js/matchers.ts';
import { PlayerData } from '../types.ts';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Cache for player data
let cachedPlayer: PlayerData | null = null;
let cacheExpiry = 0;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Function names for extraction
const SIG_FUNCTION_NAME = 'sigFunction';
const N_FUNCTION_NAME = 'nFunction';
const TIMESTAMP_VAR_NAME = 'signatureTimestampVar';

/**
 * Get the current player ID from YouTube
 */
async function fetchPlayerId(): Promise<string> {
  console.log('[PLAYER] Fetching player ID from YouTube');

  const response = await fetch('https://www.youtube.com/iframe_api', {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch iframe_api: ${response.status}`);
  }

  const js = await response.text();

  // Extract player ID from: player\/PLAYER_ID\/
  const match = js.match(/player\\?\/([a-zA-Z0-9_-]+)\\?\//);
  if (!match) {
    throw new Error('Failed to extract player ID');
  }

  console.log(`[PLAYER] Found player ID: ${match[1]}`);
  return match[1];
}

/**
 * Download the player.js file
 */
async function fetchPlayerJs(playerId: string): Promise<string> {
  const url = `https://www.youtube.com/s/player/${playerId}/player_ias.vflset/en_US/base.js`;
  console.log(`[PLAYER] Downloading player.js from ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch player.js: ${response.status}`);
  }

  return response.text();
}

/**
 * Get player data using our custom analyzer/extractor
 */
export async function getPlayerData(): Promise<PlayerData> {
  // Check cache
  if (cachedPlayer && Date.now() < cacheExpiry) {
    console.log('[PLAYER] Using cached player data');
    return cachedPlayer;
  }

  console.log('[PLAYER] Fetching fresh player data');

  const playerId = await fetchPlayerId();
  const playerJs = await fetchPlayerJs(playerId);

  console.log(`[PLAYER] Analyzing player.js (${(playerJs.length / 1024).toFixed(0)} KB)`);

  // Define extraction configurations
  const extractions: ExtractionConfig[] = [
    { friendlyName: SIG_FUNCTION_NAME, match: sigMatcher },
    { friendlyName: N_FUNCTION_NAME, match: nMatcher },
    { friendlyName: TIMESTAMP_VAR_NAME, match: timestampMatcher, collectDependencies: false },
  ];

  // Analyze the player.js
  const analyzer = new JsAnalyzer(playerJs, { extractions });
  const extractor = new JsExtractor(analyzer);

  // Build the extraction script
  const result = extractor.buildScript({
    disallowSideEffectInitializers: true,
    exportRawValues: true,
    rawValueOnly: [TIMESTAMP_VAR_NAME],
  });

  // Log extraction results
  if (result.exportedRawValues && !(TIMESTAMP_VAR_NAME in result.exportedRawValues)) {
    console.warn('[PLAYER] Failed to extract signature timestamp');
  }

  if (!result.exported.includes(SIG_FUNCTION_NAME)) {
    console.warn('[PLAYER] Failed to extract signature decipher function');
  }

  if (!result.exported.includes(N_FUNCTION_NAME)) {
    console.warn('[PLAYER] Failed to extract n decipher function');
  }

  // Get signature timestamp
  const signatureTimestamp = parseInt(result.exportedRawValues?.[TIMESTAMP_VAR_NAME]) || 0;

  console.log(`[PLAYER] Signature timestamp: ${signatureTimestamp}`);
  console.log(`[PLAYER] Exported functions: ${result.exported.join(', ')}`);
  console.log(`[PLAYER] Script size: ${(result.output.length / 1024).toFixed(1)} KB`);

  const playerData: PlayerData = {
    playerId,
    playerUrl: `https://www.youtube.com/s/player/${playerId}/player_ias.vflset/en_US/base.js`,
    signatureTimestamp,
    scriptData: result,
  };

  // Cache the result
  cachedPlayer = playerData;
  cacheExpiry = Date.now() + CACHE_DURATION_MS;

  return playerData;
}

/**
 * Clear the player cache (for testing or forced refresh)
 */
export function clearPlayerCache(): void {
  cachedPlayer = null;
  cacheExpiry = 0;
}

/**
 * Execute the decipher script to transform signature and n values
 */
export async function decipherUrl(
  playerData: PlayerData,
  url: string,
  signatureCipher?: string
): Promise<string> {
  const urlToDecipher = url || signatureCipher;

  if (!urlToDecipher) {
    throw new Error('No valid URL to decipher');
  }

  const args = new URLSearchParams(urlToDecipher);
  const urlComponents = new URL(args.get('url') || urlToDecipher);

  const n = urlComponents.searchParams.get('n');
  const s = args.get('s');
  const sp = args.get('sp');

  if (!playerData.scriptData) {
    throw new Error('No script data available');
  }

  const evalArgs: { sig?: string | null; n?: string | null } = {};

  if (signatureCipher || s) {
    evalArgs.sig = s;
  }

  if (n) {
    evalArgs.n = n;
  }

  if (Object.keys(evalArgs).length > 0) {
    // Build the evaluation code
    const properties = [];

    if (evalArgs.n) {
      properties.push(`n: exportedVars.nFunction("${evalArgs.n}")`);
    }

    if (evalArgs.sig) {
      properties.push(`sig: exportedVars.sigFunction("${evalArgs.sig}")`);
    }

    const code = `${playerData.scriptData.output}\nreturn { ${properties.join(', ')} }`;

    // Execute the code
    const result = new Function(code)() as Record<string, unknown>;

    if (typeof result !== 'object' || result === null) {
      throw new Error('Got invalid result from player script evaluation');
    }

    // Apply signature
    if (evalArgs.sig && typeof result.sig === 'string') {
      console.log(`[PLAYER] Deciphered signature: ${s?.substring(0, 20)}... -> ${result.sig.substring(0, 20)}...`);
      if (sp) {
        urlComponents.searchParams.set(sp, result.sig);
      } else {
        urlComponents.searchParams.set('signature', result.sig);
      }
    }

    // Apply n transform
    if (evalArgs.n && typeof result.n === 'string') {
      console.log(`[PLAYER] Transformed n: ${n} -> ${result.n}`);

      if (result.n.startsWith('enhanced_except_')) {
        console.warn(`[PLAYER] N-transform returned error: ${result.n}`);
      }

      urlComponents.searchParams.set('n', result.n);
    }
  }

  return urlComponents.toString();
}
