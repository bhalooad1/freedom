/**
 * YouTube Player Parser
 * Downloads YouTube's player.js and extracts signature/n-transform functions
 * Based on youtubei.js approach but simplified for Cloudflare Workers
 */

const YT_BASE = 'https://www.youtube.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Cache for player data (in-memory, reset on worker restart)
let cachedPlayerData: PlayerData | null = null;
let cacheExpiry = 0;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

export interface PlayerData {
  playerId: string;
  signatureTimestamp: number;
  sigFunction: string | null;
  nFunction: string | null;
}

/**
 * Get or fetch player data with caching
 */
export async function getPlayerData(): Promise<PlayerData> {
  const now = Date.now();

  if (cachedPlayerData && now < cacheExpiry) {
    console.log('[PLAYER] Using cached player data');
    return cachedPlayerData;
  }

  console.log('[PLAYER] Fetching fresh player data...');
  cachedPlayerData = await fetchAndParsePlayer();
  cacheExpiry = now + CACHE_DURATION;

  return cachedPlayerData;
}

/**
 * Fetch player.js and extract the decipher functions
 */
async function fetchAndParsePlayer(): Promise<PlayerData> {
  // Step 1: Get player ID from iframe_api
  const iframeRes = await fetch(`${YT_BASE}/iframe_api`, {
    headers: { 'User-Agent': USER_AGENT }
  });

  if (!iframeRes.ok) {
    throw new Error(`Failed to fetch iframe_api: ${iframeRes.status}`);
  }

  const iframeJs = await iframeRes.text();
  const playerIdMatch = iframeJs.match(/player\/([a-zA-Z0-9_-]+)\//);

  if (!playerIdMatch) {
    throw new Error('Could not find player ID in iframe_api');
  }

  const playerId = playerIdMatch[1];
  console.log(`[PLAYER] Found player ID: ${playerId}`);

  // Step 2: Fetch the player.js
  const playerUrl = `${YT_BASE}/s/player/${playerId}/player_ias.vflset/en_US/base.js`;
  const playerRes = await fetch(playerUrl, {
    headers: { 'User-Agent': USER_AGENT }
  });

  if (!playerRes.ok) {
    throw new Error(`Failed to fetch player.js: ${playerRes.status}`);
  }

  const playerJs = await playerRes.text();
  console.log(`[PLAYER] Downloaded player.js (${playerJs.length} bytes)`);

  // Step 3: Extract signature timestamp
  const signatureTimestamp = extractSignatureTimestamp(playerJs);
  console.log(`[PLAYER] Signature timestamp: ${signatureTimestamp}`);

  // Step 4: Extract decipher functions
  const sigFunction = extractSigFunction(playerJs);
  const nFunction = extractNFunction(playerJs);

  console.log(`[PLAYER] Sig function extracted: ${!!sigFunction}`);
  console.log(`[PLAYER] N function extracted: ${!!nFunction}`);

  return {
    playerId,
    signatureTimestamp,
    sigFunction,
    nFunction
  };
}

/**
 * Extract signature timestamp from player.js
 */
function extractSignatureTimestamp(playerJs: string): number {
  // Look for signatureTimestamp in the player
  const patterns = [
    /signatureTimestamp[:\s]*(\d+)/,
    /sts[:\s]*(\d+)/,
    /"signatureTimestamp"[:\s]*(\d+)/
  ];

  for (const pattern of patterns) {
    const match = playerJs.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return 0;
}

/**
 * Extract the signature decipher function
 * YouTube uses a function that takes encrypted sig and returns decrypted sig
 * Pattern: function(a){a=a.split("");XX.YY(a,N);...;return a.join("")}
 */
function extractSigFunction(playerJs: string): string | null {
  try {
    // Method 1: Find function that does a.split("") and returns a.join("")
    // This is the signature decipher function pattern
    const funcPattern = /\b([a-zA-Z0-9$]{2,})\s*=\s*function\s*\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\s*\(\s*""\s*\)([^}]+)return\s+a\.join\s*\(\s*""\s*\)\s*\}/;
    const funcMatch = playerJs.match(funcPattern);

    if (!funcMatch) {
      console.log('[PLAYER] Could not find sig function pattern');
      return null;
    }

    const funcName = funcMatch[1];
    const funcBody = funcMatch[0];
    console.log(`[PLAYER] Found sig function: ${funcName}`);

    // Extract the helper object that the function calls
    // Look for patterns like XX.YY(a, N) in the function body
    const helperMatch = funcBody.match(/([a-zA-Z0-9$]{2,})\.[a-zA-Z0-9$]+\s*\(/);
    if (!helperMatch) {
      console.log('[PLAYER] No helper object found in sig function');
      return `var ${funcName}=${funcBody.substring(funcBody.indexOf('=') + 1)}\nvar sigFunction = ${funcName};`;
    }

    const helperName = helperMatch[1];
    console.log(`[PLAYER] Found helper object: ${helperName}`);

    // Extract the helper object definition
    // Pattern: var XX={...methods...}
    const helperPattern = new RegExp(
      `var\\s+${escapeRegex(helperName)}\\s*=\\s*\\{[\\s\\S]*?\\}\\s*;`,
      'm'
    );
    const helperObjMatch = playerJs.match(helperPattern);

    let helperObj = '';
    if (helperObjMatch) {
      helperObj = helperObjMatch[0];
      console.log(`[PLAYER] Extracted helper object (${helperObj.length} chars)`);
    }

    // Build the complete code
    const code = `${helperObj}\nvar ${funcName}=${funcBody.substring(funcBody.indexOf('=') + 1)}\nvar sigFunction = ${funcName};`;
    return code;
  } catch (error) {
    console.error('[PLAYER] Error extracting sig function:', error);
    return null;
  }
}

/**
 * Extract the n-transform function
 * This is used for throttling bypass
 * Pattern: var b=[funcName] where funcName does complex string manipulation
 */
function extractNFunction(playerJs: string): string | null {
  try {
    // Method 1: Find the n-transform by looking for the enhanced_except pattern
    // YouTube uses: a.set("n", b[0](a.get("n")))
    const nSetPattern = /\.set\s*\(\s*"n"\s*,\s*([a-zA-Z0-9$]+)\s*\[\s*0\s*\]\s*\(\s*([a-zA-Z0-9$]+)\.get\s*\(\s*"n"\s*\)\s*\)\s*\)/;
    const nSetMatch = playerJs.match(nSetPattern);

    let funcArrayName: string | null = null;

    if (nSetMatch) {
      funcArrayName = nSetMatch[1];
      console.log(`[PLAYER] Found n array from set pattern: ${funcArrayName}`);
    } else {
      // Method 2: Alternative pattern - look for array assignment containing a function reference
      // Pattern: var XX=[YY] where YY is a function
      const arrayPattern = /var\s+([a-zA-Z0-9$]+)\s*=\s*\[\s*([a-zA-Z0-9$]+)\s*\]/g;
      let match;
      while ((match = arrayPattern.exec(playerJs)) !== null) {
        const arrayName = match[1];
        const funcRef = match[2];

        // Check if this array is used in n.set context
        if (playerJs.includes(`${arrayName}[0](`)) {
          funcArrayName = arrayName;
          console.log(`[PLAYER] Found potential n array: ${arrayName}`);
          break;
        }
      }
    }

    if (!funcArrayName) {
      console.log('[PLAYER] Could not find n function array');
      return null;
    }

    // Find what function is in the array
    const arrayDefPattern = new RegExp(
      `var\\s+${escapeRegex(funcArrayName)}\\s*=\\s*\\[\\s*([a-zA-Z0-9$]+)\\s*\\]`
    );
    const arrayDefMatch = playerJs.match(arrayDefPattern);

    if (!arrayDefMatch) {
      console.log('[PLAYER] Could not find array definition');
      return null;
    }

    const nFuncName = arrayDefMatch[1];
    console.log(`[PLAYER] N function name: ${nFuncName}`);

    // Extract the actual function
    // Could be: var XX=function(a){...} or function XX(a){...}
    const nFunc = extractFunctionByName(playerJs, nFuncName, 'nFunction');
    return nFunc;
  } catch (error) {
    console.error('[PLAYER] Error extracting n function:', error);
    return null;
  }
}

/**
 * Extract a function and its dependencies by name
 */
function extractFunctionByName(playerJs: string, funcName: string, exportName: string): string | null {
  // Try to find function declaration
  const patterns = [
    new RegExp(`var\\s+${escapeRegex(funcName)}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{`, 's'),
    new RegExp(`function\\s+${escapeRegex(funcName)}\\s*\\([^)]*\\)\\s*\\{`, 's'),
    new RegExp(`${escapeRegex(funcName)}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{`, 's')
  ];

  for (const pattern of patterns) {
    const match = playerJs.match(pattern);
    if (match) {
      // Found the function start, now find the matching closing brace
      const startIndex = match.index!;
      const funcBody = extractFunctionBody(playerJs, startIndex);

      if (funcBody) {
        return funcBody + `\nvar ${exportName} = ${funcName};`;
      }
    }
  }

  return null;
}

/**
 * Extract full function body including nested braces
 */
function extractFunctionBody(code: string, startIndex: number): string | null {
  let braceCount = 0;
  let started = false;
  let endIndex = startIndex;

  for (let i = startIndex; i < code.length && i < startIndex + 100000; i++) {
    const char = code[i];

    if (char === '{') {
      braceCount++;
      started = true;
    } else if (char === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }

  if (endIndex > startIndex) {
    // Also extract the var declaration before the function if present
    let funcStart = startIndex;
    const beforeFunc = code.substring(Math.max(0, startIndex - 100), startIndex);
    const varMatch = beforeFunc.match(/var\s+[a-zA-Z0-9$]+\s*=\s*$/);
    if (varMatch) {
      funcStart = startIndex - varMatch[0].length;
    }

    return code.substring(funcStart, endIndex);
  }

  return null;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
