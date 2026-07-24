// Uploads image files to the shared server (see /server) and returns back
// the public URLs to store on the record (product, menu item, sourcing
// request, etc). Real files on disk, not base64 blobs in the JSON db.

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Turns the relative "/uploads/xyz.jpg" the server returns into a full URL
// the <img> tag can load, regardless of which port the app itself runs on.
export function imageUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  return `${SERVER_URL}${path}`;
}

export async function uploadImages(files) {
  const form = new FormData();
  for (const file of files) form.append("images", file);
  const res = await fetch(`${SERVER_URL}/api/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Upload failed");
  }
  const data = await res.json();
  return data.urls; // relative paths like "/uploads/xyz.jpg"
}
