import { useState } from "react";
import { uploadImages, imageUrl, MAX_IMAGES, MAX_IMAGE_BYTES } from "../utils/upload";

// Up to 5 real reference photos per listing (product, menu item, or a
// China-sourcing request). Files are uploaded to the server on selection
// and the resulting URLs are stored in `images` (an array of up to
// MAX_IMAGES relative paths like "/uploads/xyz.jpg").
export default function MultiImageUpload({ images = [], onChange, label = "Photos" }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setError("");

    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`You can add up to ${MAX_IMAGES} photos.`);
      return;
    }
    const chosen = files.slice(0, room);
    const tooBig = chosen.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) {
      setError("Each photo must be under 5MB.");
      return;
    }

    setUploading(true);
    try {
      const urls = await uploadImages(chosen);
      onChange([...images, ...urls]);
    } catch (err) {
      setError(err.message || "Upload failed. Is the server running?");
    } finally {
      setUploading(false);
    }
  }

  function removeAt(i) {
    onChange(images.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <label className="block text-xs font-medium text-ink/70 mb-2">
        {label} ({images.length}/{MAX_IMAGES})
      </label>
      <div className="flex flex-wrap gap-3">
        {images.map((src, i) => (
          <div key={src + i} className="relative w-20 h-20 rounded-md border border-ink/15 overflow-hidden group">
            <img src={imageUrl(src)} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-0.5 right-0.5 bg-ink/70 text-white rounded-full w-5 h-5 text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove photo"
            >
              ×
            </button>
          </div>
        ))}
        {images.length < MAX_IMAGES && (
          <label className="w-20 h-20 rounded-md border border-dashed border-ink/25 hover:border-teal flex flex-col items-center justify-center cursor-pointer text-ink/40 hover:text-teal-600 text-xs gap-1">
            {uploading ? (
              <span className="text-[11px]">Uploading…</span>
            ) : (
              <>
                <span className="text-lg leading-none">+</span>
                <span>Add photo</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={handleFiles}
            />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-coral-600 mt-2">{error}</p>}
      <p className="text-[11px] text-ink/40 mt-2">PNG or JPG, up to 5MB each, {MAX_IMAGES} photos max.</p>
    </div>
  );
}
