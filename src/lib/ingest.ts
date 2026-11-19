// Photo ingestion: fingerprint, convert, derive display + thumbnail, record.
// Kept free of Next.js imports so it can be tested directly.
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import type postgres from "postgres";
import type { Storage } from "./storage";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DISPLAY_MAX = 2400;
const THUMB_MAX = 480;

export type IngestResult =
  | { status: "created"; imageId: string }
  | { status: "duplicate"; imageId: string; originalFilename: string };

export function isHeic(buf: Buffer) {
  if (buf.length < 12 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12);
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
}

async function toDecodable(buf: Buffer): Promise<Buffer> {
  if (!isHeic(buf)) return buf;
  // libvips builds shipped with sharp do not decode HEVC, so convert in JS.
  const { default: convert } = await import("heic-convert");
  const out = await convert({ buffer: buf, format: "JPEG", quality: 0.95 });
  return Buffer.from(out);
}

function extFor(mime: string, filename: string) {
  const fromName = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (fromName) return fromName;
  return { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic" }[mime] ?? ".bin";
}

export function incomingKey(uploadId: string, filename: string) {
  const clean = filename.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "photo";
  return `incoming/${uploadId}/${clean}`;
}

/** Ingests an original file already sitting in storage at `incoming`. */
export async function ingestUploaded(
  sql: postgres.Sql,
  store: Storage,
  opts: { incoming: string; originalFilename: string; mimeType: string },
): Promise<IngestResult> {
  const original = await store.get(opts.incoming);
  const result = await ingestBuffer(sql, store, {
    buffer: original,
    originalFilename: opts.originalFilename,
    mimeType: opts.mimeType,
  });
  await store.remove(opts.incoming);
  return result;
}

export async function ingestBuffer(
  sql: postgres.Sql,
  store: Storage,
  opts: { buffer: Buffer; originalFilename: string; mimeType: string },
): Promise<IngestResult> {
  const { buffer, originalFilename } = opts;
  if (buffer.length === 0) throw new Error("empty file");
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("file is too large");

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const [existing] = await sql<{ id: string; original_filename: string }[]>`
    select id, original_filename from source_images where sha256 = ${sha256}`;
  if (existing) return { status: "duplicate", imageId: existing.id, originalFilename: existing.original_filename };

  const mimeType = isHeic(buffer) ? "image/heic" : opts.mimeType || "application/octet-stream";
  const decodable = await toDecodable(buffer);

  // .rotate() applies EXIF orientation so box coordinates match what you see.
  let display: Buffer;
  let info: { width: number; height: number };
  try {
    ({ data: display, info } = await sharp(decodable)
      .rotate()
      .resize({ width: DISPLAY_MAX, height: DISPLAY_MAX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new Error("this file could not be read as an image");
  }
  const thumb = await sharp(display)
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside" })
    .webp({ quality: 78 })
    .toBuffer();

  const originalPath = `originals/${sha256}${extFor(mimeType, originalFilename)}`;
  const displayPath = `display/${sha256}.jpg`;
  const thumbPath = `thumbs/${sha256}.webp`;
  await store.put(originalPath, buffer, mimeType);
  await store.put(displayPath, display, "image/jpeg");
  await store.put(thumbPath, thumb, "image/webp");

  const rows = await sql<{ id: string }[]>`
    insert into source_images (sha256, original_filename, original_path, display_path, thumb_path,
                               mime_type, bytes, width, height)
    values (${sha256}, ${originalFilename.slice(0, 255)}, ${originalPath}, ${displayPath}, ${thumbPath},
            ${mimeType}, ${buffer.length}, ${info.width}, ${info.height})
    on conflict (sha256) do nothing
    returning id`;
  if (rows.length === 0) {
    const [dup] = await sql<{ id: string; original_filename: string }[]>`
      select id, original_filename from source_images where sha256 = ${sha256}`;
    return { status: "duplicate", imageId: dup.id, originalFilename: dup.original_filename };
  }
  return { status: "created", imageId: rows[0].id };
}

export type Box = { x: number; y: number; w: number; h: number };

export function cropKey(regionId: string, box: Box, size: number) {
  const h = createHash("sha1").update(`${box.x},${box.y},${box.w},${box.h}`).digest("hex").slice(0, 10);
  return `crops/${regionId}-${h}-${size}.webp`;
}

/** Renders (and caches) a crop of the display image for one region. */
export async function renderCrop(
  store: Storage,
  img: { display_path: string; width: number; height: number },
  regionId: string,
  box: Box,
  size: number,
) {
  const key = cropKey(regionId, box, size);
  if (await store.exists(key)) return store.get(key);
  const display = await store.get(img.display_path);
  const left = Math.max(0, Math.floor(box.x * img.width));
  const top = Math.max(0, Math.floor(box.y * img.height));
  const width = Math.max(1, Math.min(img.width - left, Math.round(box.w * img.width)));
  const height = Math.max(1, Math.min(img.height - top, Math.round(box.h * img.height)));
  const out = await sharp(display)
    .extract({ left, top, width, height })
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();
  await store.put(key, out, "image/webp");
  return out;
}
