import { JSDOM } from 'jsdom';
import { BG, buildURL, GOOG_API_KEY, USER_AGENT } from 'bgutils-js';
import { Innertube } from 'youtubei.js';

// Token cache
let cachedToken = null;
let tokenMinter = null;
let innertubeClient = null;

// Refresh interval (5 minutes)
const TOKEN_REFRESH_MS = 5 * 60 * 1000;

/**
 * Setup JSDOM environment for BotGuard
 */
function setupJsdomEnvironment() {
  console.log('[POTOKEN] Setting up JSDOM environment');

  const dom = new JSDOM(
    '<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',
    {
      url: 'https://www.youtube.com/',
      referrer: 'https://www.youtube.com/',
      userAgent: USER_AGENT,
    }
  );

  // Assign to global
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    origin: dom.window.origin,
  });

  if (!Reflect.has(globalThis, 'navigator')) {
    Object.defineProperty(globalThis, 'navigator', {
      value: dom.window.navigator,
    });
  }
}

/**
 * Initialize the PO token generator using YouTubei.js for attestation challenge
 */
export async function initializePOToken() {
  console.log('[POTOKEN] Initializing PO token generator');

  // Setup JSDOM first
  setupJsdomEnvironment();

  // Create minimal Innertube client (no player needed - we have our own)
  console.log('[POTOKEN] Creating Innertube client for attestation');
  innertubeClient = await Innertube.create({
    enable_session_cache: false,
    retrieve_player: false, // We use our own player/decipher logic
    generate_session_locally: true,
  });

  const visitorData = innertubeClient.session.context.client.visitorData;
  if (!visitorData) {
    throw new Error('Could not get visitor data from Innertube');
  }
  console.log(`[POTOKEN] Got visitor data: ${visitorData.substring(0, 20)}...`);

  // Get attestation challenge using YouTubei.js
  console.log('[POTOKEN] Getting attestation challenge via Innertube');
  const challengeResponse = await innertubeClient.getAttestationChallenge('ENGAGEMENT_TYPE_UNBOUND');

  if (!challengeResponse.bg_challenge) {
    throw new Error('Could not get BotGuard challenge');
  }

  const bgChallenge = challengeResponse.bg_challenge;
  console.log('[POTOKEN] Got BotGuard challenge');

  // Load the BotGuard interpreter script
  const interpreterUrl = bgChallenge.interpreter_url.private_do_not_access_or_else_trusted_resource_url_wrapped_value;
  console.log('[POTOKEN] Loading BotGuard interpreter');

  const bgScriptResponse = await fetch(`https:${interpreterUrl}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  const interpreterJavascript = await bgScriptResponse.text();

  if (!interpreterJavascript) {
    throw new Error('Could not load BotGuard interpreter');
  }

  new Function(interpreterJavascript)();
  console.log('[POTOKEN] BotGuard interpreter loaded');

  // Create BotGuard client
  console.log('[POTOKEN] Creating BotGuard client');
  console.log('[POTOKEN] Note: "Not implemented: HTMLCanvasElement.prototype.getContext" is expected and can be ignored');

  const botguard = await BG.BotGuardClient.create({
    program: bgChallenge.program,
    globalName: bgChallenge.global_name,
    globalObj: globalThis,
  });

  // Get snapshot
  const webPoSignalOutput = [];
  const botguardResponse = await botguard.snapshot({ webPoSignalOutput });

  console.log('[POTOKEN] Got BotGuard snapshot');
  console.log('[POTOKEN] Snapshot response length:', botguardResponse?.length || 0);
  console.log('[POTOKEN] webPoSignalOutput length:', webPoSignalOutput?.length || 0);

  if (!botguardResponse) {
    throw new Error('BotGuard snapshot returned empty response');
  }

  // Generate integrity token
  console.log('[POTOKEN] Generating integrity token...');
  const requestKey = 'O43z0dpjhgX20SCx4KAo';

  const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
    method: 'POST',
    headers: {
      'content-type': 'application/json+protobuf',
      'x-goog-api-key': GOOG_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify([requestKey, botguardResponse]),
  });

  if (!integrityTokenResponse.ok) {
    const errorText = await integrityTokenResponse.text();
    console.error('[POTOKEN] Integrity token error:', integrityTokenResponse.status, errorText.substring(0, 500));
    throw new Error(`Failed to generate integrity token: ${integrityTokenResponse.status}`);
  }

  const integrityTokenBody = await integrityTokenResponse.json();
  console.log('[POTOKEN] Integrity token response:', JSON.stringify(integrityTokenBody).substring(0, 200));

  // Find the token string in the response array
  let integrityToken = null;
  if (Array.isArray(integrityTokenBody)) {
    for (const item of integrityTokenBody) {
      if (typeof item === 'string' && item.length > 20) {
        integrityToken = item;
        break;
      }
    }
  }

  if (!integrityToken) {
    console.error('[POTOKEN] Could not find integrity token in response:', integrityTokenBody);
    throw new Error('Invalid integrity token response');
  }

  console.log('[POTOKEN] Got integrity token:', integrityToken.substring(0, 50) + '...');

  // Create minter using bgutils
  tokenMinter = await BG.WebPoMinter.create(
    { integrityToken },
    webPoSignalOutput
  );

  // Mint session token
  const sessionToken = await tokenMinter.mintAsWebsafeString(visitorData);

  const tokenData = {
    token: sessionToken,
    visitorData,
    expiresAt: Date.now() + TOKEN_REFRESH_MS,
  };

  cachedToken = tokenData;

  console.log('[POTOKEN] PO token generated successfully');
  return tokenData;
}

/**
 * Get a content-specific PO token for a video
 */
export async function getVideoPoToken(videoId) {
  if (!tokenMinter) {
    console.log('[POTOKEN] Minter not initialized, initializing now');
    await initializePOToken();
  }

  if (!tokenMinter) {
    throw new Error('Failed to initialize token minter');
  }

  const token = await tokenMinter.mintAsWebsafeString(videoId);
  console.log(`[POTOKEN] Generated content token for ${videoId}`);

  return token;
}

/**
 * Get the session PO token
 */
export async function getSessionPoToken() {
  if (!cachedToken || Date.now() >= cachedToken.expiresAt) {
    console.log('[POTOKEN] Token expired or missing, refreshing');
    return initializePOToken();
  }
  return cachedToken;
}

/**
 * Get visitor data (for InnerTube client)
 */
export async function getVisitorData() {
  if (cachedToken) {
    return cachedToken.visitorData;
  }
  const tokenData = await getSessionPoToken();
  return tokenData.visitorData;
}

/**
 * Check if PO token is initialized
 */
export function isInitialized() {
  return tokenMinter !== null;
}

/**
 * Force refresh the PO token
 */
export async function refreshPoToken() {
  console.log('[POTOKEN] Force refreshing PO token');
  cachedToken = null;
  tokenMinter = null;
  return initializePOToken();
}
