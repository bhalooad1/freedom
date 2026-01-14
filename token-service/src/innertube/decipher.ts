import { PlayerData, DecipherResult, VideoFormat } from '../types.ts';
import { getPlayerData } from './player.ts';

/**
 * Execute a decipher function with the given input
 */
function executeDecipherFunction(functionCode: string, functionName: string, input: string): string {
  try {
    // Wrap the function code in an IIFE that returns the result
    const wrappedCode = `
      ${functionCode}
      return ${functionName}("${input}");
    `;

    const fn = new Function(wrappedCode);
    return fn();
  } catch (e) {
    console.error(`[DECIPHER] Failed to execute ${functionName}:`, e);
    throw new Error(`Failed to execute decipher function: ${e}`);
  }
}

/**
 * Decipher a signature using the extracted function
 */
function decipherSignature(playerData: PlayerData, encryptedSig: string): string {
  if (!playerData.signatureFunction) {
    throw new Error('No signature function available');
  }

  // Find the function name from the code
  const funcNameMatch = playerData.signatureFunction.match(/(?:var\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function/);
  if (!funcNameMatch) {
    throw new Error('Could not find signature function name in code');
  }

  const funcName = funcNameMatch[1];
  console.log(`[DECIPHER] Deciphering signature using ${funcName}`);

  return executeDecipherFunction(playerData.signatureFunction, funcName, encryptedSig);
}

/**
 * Transform the n parameter to prevent throttling
 */
function transformN(playerData: PlayerData, n: string): string {
  if (!playerData.nFunction) {
    console.warn('[DECIPHER] No n-function available, returning original n');
    return n;
  }

  // Find the function name from the code
  const funcNameMatch = playerData.nFunction.match(/(?:var\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function/);
  if (!funcNameMatch) {
    console.warn('[DECIPHER] Could not find n-function name in code');
    return n;
  }

  const funcName = funcNameMatch[1];
  console.log(`[DECIPHER] Transforming n using ${funcName}`);

  try {
    const result = executeDecipherFunction(playerData.nFunction, funcName, n);

    // Check for error response
    if (result.startsWith('enhanced_except_')) {
      console.warn(`[DECIPHER] n-function returned error: ${result}`);
      return n;
    }

    return result;
  } catch (e) {
    console.warn(`[DECIPHER] Failed to transform n:`, e);
    return n;
  }
}

/**
 * Decipher a video format URL
 */
export async function decipherFormatUrl(
  format: VideoFormat,
  poToken?: string
): Promise<string> {
  const playerData = await getPlayerData();

  let url: string;

  // Check if URL is already available (not encrypted)
  if (format.url) {
    url = format.url;
    console.log('[DECIPHER] URL already deciphered');
  } else if (format.signatureCipher) {
    // Parse the signature cipher
    const params = new URLSearchParams(format.signatureCipher);
    const encryptedUrl = params.get('url');
    const encryptedSig = params.get('s');
    const sigParam = params.get('sp') || 'signature';

    if (!encryptedUrl || !encryptedSig) {
      throw new Error('Invalid signature cipher format');
    }

    // Decipher the signature
    const decipheredSig = decipherSignature(playerData, decodeURIComponent(encryptedSig));

    // Build the URL
    const urlObj = new URL(decodeURIComponent(encryptedUrl));
    urlObj.searchParams.set(sigParam, decipheredSig);
    url = urlObj.toString();

    console.log('[DECIPHER] URL deciphered from signature cipher');
  } else {
    throw new Error('No URL or signature cipher available');
  }

  // Transform the n parameter
  const urlObj = new URL(url);
  const n = urlObj.searchParams.get('n');
  if (n) {
    const transformedN = transformN(playerData, n);
    urlObj.searchParams.set('n', transformedN);
    console.log(`[DECIPHER] Transformed n: ${n.substring(0, 10)}... -> ${transformedN.substring(0, 10)}...`);
  }

  // Add PO token if provided
  if (poToken) {
    urlObj.searchParams.set('pot', poToken);
    console.log('[DECIPHER] Added PO token to URL');
  }

  return urlObj.toString();
}

/**
 * Decipher result helper - for when you have just sig and n
 */
export async function decipherParams(sig?: string, n?: string): Promise<DecipherResult> {
  const playerData = await getPlayerData();

  const result: DecipherResult = {
    signature: '',
    n: '',
  };

  if (sig) {
    result.signature = decipherSignature(playerData, sig);
  }

  if (n) {
    result.n = transformN(playerData, n);
  }

  return result;
}
