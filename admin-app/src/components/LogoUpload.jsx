import { useState } from "react";
import { uploadImages, imageUrl, MAX_IMAGE_BYTES } from "../utils/upload";

// Single-photo uploader for a store/restaurant logo or profile picture.
// Distinct from MultiImageUpload (which handles up to 5 product/menu
// photos) -- this always holds exactly one image, shown as a round
// preview, and can be replaced or removed.
export default function LogoUpload({ image, onChange, emoji, color, label = "Logo / profile picture" }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");

    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be under 5MB.");
      return;
    }

    setUploading(true);
    try {
      const [url] = await uploadImages([file]);
      onChange(url);
    } catch (err) {
      setError(err.message || "Upload failed. Is the server running?");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-ink/70 mb-2">{label}</label>
      <div className="flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl overflow-hidden shrink-0 border border-ink/10"
          style={!image ? { background: `${color || "#334"}1a` } : undefined}
        >
          {image ? (
            <img src={imageUrl(image)} alt="" className="w-full h-full object-cover" />
          ) : (
            emoji || "🏪"
          )}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="inline-flex items-center bg-white border border-ink/15 hover:border-teal rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer">
              {uploading ? "Uploading…" : image ? "Replace photo" : "Upload photo"}
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleFile} />
            </label>
            {image && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-xs text-coral-600 font-medium px-2"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-ink/40">PNG or JPG, up to 5MB. Falls back to your emoji if none is set.</p>
          {error && <p className="text-xs text-coral-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
