/**
 * URL Decipher Module
 * Takes YouTube video URLs and applies signature/n-transform functions
 * Works in Cloudflare Workers using new Function() instead of eval()
 */

import { PlayerData } from './player';

/**
 * Decipher a video URL by applying signature and n-transform functions
 */
export function decipherUrl(
  url: string,
  playerData: PlayerData,
  signatureCipher?: string
): string {
  let videoUrl: URL;
  let signature: string | null = null;
  let signatureParam: string = 'sig';

  // Handle signature cipher (encrypted signature in query params)
  if (signatureCipher) {
    const params = new URLSearchParams(signatureCipher);
    const urlStr = params.get('url');
    signature = params.get('s');
    signatureParam = params.get('sp') || 'sig';

    if (!urlStr) {
      throw new Error('No URL in signature cipher');
    }

    videoUrl = new URL(urlStr);
  } else {
    videoUrl = new URL(url);
  }

  // Apply signature decipher if we have an encrypted signature
  if (signature && playerData.sigFunction) {
    console.log('[DECIPHER] Deciphering signature...');
    const decipheredSig = runSigFunction(signature, playerData.sigFunction);
    if (decipheredSig) {
      videoUrl.searchParams.set(signatureParam, decipheredSig);
      console.log('[DECIPHER] Signature deciphered successfully');
    }
  }

  // Apply n-transform to bypass throttling
  const nParam = videoUrl.searchParams.get('n');
  if (nParam && playerData.nFunction) {
    console.log('[DECIPHER] Transforming n parameter...');
    const transformedN = runNFunction(nParam, playerData.nFunction);
    if (transformedN) {
      videoUrl.searchParams.set('n', transformedN);
      console.log('[DECIPHER] N parameter transformed successfully');
    }
  }

  return videoUrl.toString();
}

/**
 * Run the signature decipher function
 * The function takes encrypted sig and returns decrypted sig
 */
function runSigFunction(signature: string, sigFunctionCode: string): string | null {
  try {
    // The sigFunctionCode includes helper object and the function itself
    // It ends with: var sigFunction = funcName;
    // We need to call sigFunction(signature)

    const code = `
      ${sigFunctionCode}
      return sigFunction("${escapeString(signature)}");
    `;

    const fn = new Function(code);
    const result = fn();

    if (typeof result === 'string') {
      return result;
    }

    console.error('[DECIPHER] Sig function returned non-string:', typeof result);
    return null;
  } catch (error) {
    console.error('[DECIPHER] Error running sig function:', error);
    return null;
  }
}

/**
 * Run the n-transform function
 * This transforms the 'n' parameter to bypass throttling
 */
function runNFunction(nParam: string, nFunctionCode: string): string | null {
  try {
    // The nFunctionCode includes the function
    // It ends with: var nFunction = funcName;
    // We need to call nFunction(nParam)

    const code = `
      ${nFunctionCode}
      return nFunction("${escapeString(nParam)}");
    `;

    const fn = new Function(code);
    const result = fn();

    if (typeof result === 'string') {
      return result;
    }

    console.error('[DECIPHER] N function returned non-string:', typeof result);
    return null;
  } catch (error) {
    console.error('[DECIPHER] Error running n function:', error);
    return null;
  }
}

/**
 * Escape a string for use in JavaScript code
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}
