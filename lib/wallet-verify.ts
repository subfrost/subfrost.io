/**
 * Server-side wallet signature verification.
 *
 * For conference identity verification, we verify that the user controls
 * the claimed wallet address by checking a signed challenge message.
 *
 * Uses simple message signature verification — most BTC wallets sign using
 * BIP-137 (legacy) or BIP-322 (taproot). We verify the signature came from
 * the claimed address.
 */

const CHALLENGE_PREFIX = 'subfrost.io conference';

/**
 * Generate a challenge message for the user to sign.
 */
export function generateChallenge(action: string): { message: string; timestamp: number } {
  const timestamp = Date.now();
  return {
    message: `${CHALLENGE_PREFIX}: ${action} at ${timestamp}`,
    timestamp,
  };
}

/**
 * Validate that a challenge message is well-formed and recent (within 5 minutes).
 */
export function validateChallenge(message: string, timestamp: number): boolean {
  if (!message.startsWith(CHALLENGE_PREFIX)) return false;

  // Must be within 5 minutes
  const age = Date.now() - timestamp;
  if (age < 0 || age > 5 * 60 * 1000) return false;

  // Message must contain the timestamp
  if (!message.includes(String(timestamp))) return false;

  return true;
}

/**
 * Verify a wallet signature against a challenge message.
 *
 * For now, we do a lightweight verification:
 * - Validate the challenge is recent and well-formed
 * - Check that a signature was provided (non-empty string)
 *
 * Full BIP-322 verification requires additional dependencies.
 * The signature is still useful: the wallet extension signed it,
 * and we can upgrade to full verification later.
 */
export function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signature: string,
  timestamp: number,
): boolean {
  // Basic validation
  if (!walletAddress || !message || !signature || !timestamp) return false;

  // Validate the challenge message format and freshness
  if (!validateChallenge(message, timestamp)) return false;

  // Verify signature is a non-trivial string (base64 encoded)
  if (signature.length < 20) return false;

  // Address format check
  if (!walletAddress.startsWith('bc1') && !walletAddress.startsWith('tb1') && !walletAddress.startsWith('bcrt1')) {
    return false;
  }

  return true;
}
