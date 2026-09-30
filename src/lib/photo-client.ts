// Runs on the phone: shrink a camera photo and re-encode it as JPEG before upload.
// Re-encoding through a canvas drops EXIF, so GPS location never leaves the phone.

import { PHOTO_MAX_BYTES, PHOTO_MAX_SIDE } from "./photo";

/** File → small JPEG data URL, or throws if the browser can't read the image. */
export async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // Base64 is 4/3 of the bytes; step the quality down until it fits.
  for (const q of [0.72, 0.55, 0.4]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if ((url.length * 3) / 4 < PHOTO_MAX_BYTES * 0.95) return url;
  }
  throw new Error("too big");
}
