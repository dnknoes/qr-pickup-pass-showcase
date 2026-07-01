import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const TOKEN_CIPHER_VERSION = "v1";
const TOKEN_CIPHER_ALGORITHM = "aes-256-gcm";

function getTokenEncryptionSecret() {
  const secret = process.env.PICKUP_TOKEN_ENCRYPTION_SECRET?.trim();
  return secret ? secret : null;
}

function deriveTokenEncryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function getMissingTokenRecoveryConfig(): string[] {
  return getTokenEncryptionSecret() ? [] : ["PICKUP_TOKEN_ENCRYPTION_SECRET"];
}

/**
 * Encrypts a raw token for recovery/audit storage. Returns null when the
 * encryption secret isn't configured, so recovery/reissue flows can degrade
 * gracefully instead of throwing in environments where recovery is unused.
 */
export function maybeEncryptPickupToken(token: string) {
  const secret = getTokenEncryptionSecret();

  if (!secret) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(
    TOKEN_CIPHER_ALGORITHM,
    deriveTokenEncryptionKey(secret),
    iv,
  );
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    TOKEN_CIPHER_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPickupToken(ciphertext: string) {
  const secret = getTokenEncryptionSecret();

  if (!secret) {
    throw new Error("Pickup pass recovery is unavailable until PICKUP_TOKEN_ENCRYPTION_SECRET is configured.");
  }

  const [version, ivValue, authTagValue, payloadValue] = ciphertext.trim().split(".");

  if (
    version !== TOKEN_CIPHER_VERSION ||
    !ivValue ||
    !authTagValue ||
    !payloadValue
  ) {
    throw new Error("Stored pickup pass token data is invalid.");
  }

  try {
    const decipher = createDecipheriv(
      TOKEN_CIPHER_ALGORITHM,
      deriveTokenEncryptionKey(secret),
      Buffer.from(ivValue, "base64url"),
    );

    decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(payloadValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Stored pickup pass token data could not be decrypted.");
  }
}
