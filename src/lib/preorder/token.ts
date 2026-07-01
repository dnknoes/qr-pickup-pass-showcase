import { createHash, randomBytes } from "crypto";

/**
 * Pickup tokens are opaque, high-entropy secrets. We never store or transmit
 * the raw token after issuance — only a SHA-256 hash for lookup and (optionally)
 * an AES-256-GCM ciphertext for recovery. See SECURITY_NOTES.md.
 */
export function hashPickupToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function generatePickupToken() {
  const token = randomBytes(24).toString("base64url");

  return {
    token,
    tokenHash: hashPickupToken(token),
    tokenLast4: token.slice(-4),
  };
}
