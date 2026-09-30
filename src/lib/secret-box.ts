// Encrypt small secrets (e.g. an API key saved from the admin) before they go in the database.
// AES-256-GCM with a key derived from SESSION_SECRET: a leaked database copy alone doesn't reveal them.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const keyFrom = (secret: string) => createHash("sha256").update(`secret-box:${secret}`).digest();

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** The plain text, or null if the box is malformed or was sealed with a different secret (e.g. after rotating it). */
export function unseal(box: string, secret: string): string | null {
  const [v, iv, tag, data] = box.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
