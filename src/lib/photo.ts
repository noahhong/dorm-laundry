// Load photos: the phone downscales and re-encodes to JPEG (which also drops EXIF, including GPS) before sending.
// The server only accepts what that produces. Pure: no DB.

/** Longest side, in px, the phone scales a photo down to. */
export const PHOTO_MAX_SIDE = 1024;
/** Hard cap on the decoded JPEG. A 1024px JPEG at the phone's quality is usually 80–200 KB. */
export const PHOTO_MAX_BYTES = 400_000;
/** Cap on the base64 data URL sent to the server (4/3 of the byte cap, plus the prefix). */
export const PHOTO_MAX_DATA_URL = Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 64;

const PREFIX = "data:image/jpeg;base64,";

/** Validate a data URL from the report sheet. Returns the JPEG bytes, or null if it isn't a small JPEG. */
export function decodePhoto(dataUrl: string): Buffer | null {
  if (!dataUrl.startsWith(PREFIX) || dataUrl.length > PHOTO_MAX_DATA_URL) return null;
  const b64 = dataUrl.slice(PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 4 || bytes.length > PHOTO_MAX_BYTES) return null;
  // JPEG files start with FF D8 FF.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return bytes;
}
