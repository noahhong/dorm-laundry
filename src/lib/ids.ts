import { randomBytes } from "node:crypto";

// No 0/o/1/l/i to keep printed codes unambiguous.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomId(len = 16): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Short public machine code used in QR URLs, e.g. "k7p2xq". */
export const machineCode = () => randomId(6);

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || randomId(6)
  );
}
