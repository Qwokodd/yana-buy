import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env";
import { HttpError } from "../lib/http";
import { PRIVATE_ROOT, publicBase, signedUrl, verifySignature } from "../lib/private-files";
import { requireAuth, requireRole } from "../middleware/auth";

export const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// Raster images only. SVG is refused because it can carry scripts.
const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

function imageUploader(destination: string, maxFiles: number) {
  return multer({
    storage: multer.diskStorage({
      destination,
      // The server picks the name, never the phone or browser.
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXT[file.mimetype]}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (!EXT[file.mimetype]) return cb(new HttpError(400, "Only photos (JPG, PNG, WebP, GIF or HEIC) can be uploaded"));
      cb(null, true);
    },
  });
}

/** Runs multer and turns its errors into plain-language messages. */
function receive(uploader: multer.Multer, maxFiles: number) {
  return (req: Request, res: Response, next: NextFunction) =>
    uploader.array("images", maxFiles)(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "Each photo must be under 8 MB"
            : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
              ? `You can upload up to ${maxFiles} photos at a time`
              : err.message;
        return next(new HttpError(400, message));
      }
      next(err);
    });
}

function received(req: Request) {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new HttpError(400, "Choose a photo to upload");
  return files;
}

export const uploadRouter = Router();

/** Public photos: profile pictures, shop logos, categories, banners. */
uploadRouter.post("/", requireAuth, receive(imageUploader(UPLOAD_ROOT, 5), 5), (req, res) => {
  const base = publicBase(req);
  res.status(201).json({ urls: received(req).map((f) => `${base}/uploads/${f.filename}`) });
});

// Short video ads / promos (admins only). The admin page checks they're 5–10 seconds long before uploading.
const VIDEO_EXT: Record<string, string> = { "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };
const videoUploader = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_ROOT,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${VIDEO_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!VIDEO_EXT[file.mimetype]) return cb(new HttpError(400, "Only MP4, WebM or MOV videos can be uploaded"));
    cb(null, true);
  },
});

/** A 5–10 second video for a banner or ad. Returns its public URL. */
uploadRouter.post(
  "/video",
  requireAuth,
  requireRole("admin"),
  (req: Request, res: Response, next: NextFunction) =>
    videoUploader.single("video")(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        return next(new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "The video must be under 30 MB — keep it to 5–10 seconds" : err.message));
      }
      next(err);
    }),
  (req, res) => {
    if (!req.file) throw new HttpError(400, "Choose a video to upload");
    res.status(201).json({ url: `${publicBase(req)}/uploads/${req.file.filename}` });
  }
);

/** Private photos: ID documents and selfies. Returns keys plus a preview link. */
uploadRouter.post("/private", requireAuth, receive(imageUploader(PRIVATE_ROOT, 3), 3), (req, res) => {
  res.status(201).json({ files: received(req).map((f) => ({ key: f.filename, url: signedUrl(req, f.filename) })) });
});

/** Serves a private file when the link's signature and expiry check out. */
export const privateFilesRouter = Router();
privateFilesRouter.get("/:key", (req, res) => {
  const { key } = req.params;
  const { exp, sig } = req.query as { exp?: string; sig?: string };
  if (!verifySignature(key, exp, sig)) {
    return res.status(403).json({ error: "This link has expired. Reload the page to see the photo." });
  }
  res.setHeader("Cache-Control", "private, max-age=600");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-Robots-Tag", "noindex");
  res.sendFile(key, { root: PRIVATE_ROOT }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Photo not found" });
  });
});
