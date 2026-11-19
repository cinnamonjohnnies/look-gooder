// Pipeline tests. Images are plain generated shapes, never garment photos.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import type postgres from "postgres";
import { resetDb } from "./helpers";
import { ingestBuffer, ingestUploaded, incomingKey, renderCrop, isHeic } from "@/lib/ingest";
import { storage, useLocalStorageRoot } from "@/lib/storage";

let sql: postgres.Sql;
let root: string;

async function shape(color: string, w = 1200, h = 900, format: "jpeg" | "png" | "webp" = "jpeg") {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } })[format]().toBuffer();
}

beforeAll(async () => {
  sql = await resetDb();
  root = await mkdtemp(path.join(tmpdir(), "lg-store-"));
  useLocalStorageRoot(root);
});
afterAll(async () => {
  await sql.end();
  await rm(root, { recursive: true, force: true });
});

describe("ingest", () => {
  it("stores the untouched original plus display and thumbnail copies", async () => {
    const buf = await shape("#336699");
    const res = await ingestBuffer(sql, storage(), { buffer: buf, originalFilename: "IMG_0001.jpg", mimeType: "image/jpeg" });
    expect(res.status).toBe("created");
    const [img] = await sql`select * from source_images where id = ${res.imageId}`;
    expect(img.width).toBe(1200);
    expect(img.audit_status).toBe("not_started");
    const original = await storage().get(img.original_path);
    expect(original.equals(buf)).toBe(true);
    const thumbMeta = await sharp(await storage().get(img.thumb_path)).metadata();
    expect(Math.max(thumbMeta.width!, thumbMeta.height!)).toBeLessThanOrEqual(480);
  });

  it("detects the same photo uploaded twice without creating a second record", async () => {
    const buf = await shape("#aa5500");
    const a = await ingestBuffer(sql, storage(), { buffer: buf, originalFilename: "a.jpg", mimeType: "image/jpeg" });
    const b = await ingestBuffer(sql, storage(), { buffer: buf, originalFilename: "a-copy.jpg", mimeType: "image/jpeg" });
    expect(b.status).toBe("duplicate");
    expect(b.imageId).toBe(a.imageId);
    const [{ count }] = await sql`select count(*)::int from source_images where original_filename in ('a.jpg','a-copy.jpg')`;
    expect(count).toBe(1);
  });

  it("accepts PNG and WebP and applies EXIF orientation", async () => {
    for (const format of ["png", "webp"] as const) {
      const res = await ingestBuffer(sql, storage(), {
        buffer: await shape(format === "png" ? "#123456" : "#654321", 400, 300, format),
        originalFilename: `x.${format}`,
        mimeType: `image/${format}`,
      });
      expect(res.status).toBe("created");
    }
    // orientation 6 = rotate 90°, so a 400x300 photo displays as 300x400
    const rotated = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#777777" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const res = await ingestBuffer(sql, storage(), { buffer: rotated, originalFilename: "r.jpg", mimeType: "image/jpeg" });
    const [img] = await sql`select width, height from source_images where id = ${res.imageId}`;
    expect([img.width, img.height]).toEqual([300, 400]);
  });

  it("ingests from the incoming upload area and cleans it up", async () => {
    const key = incomingKey("u1", "My Photo (1).jpg");
    expect(key).toBe("incoming/u1/My_Photo_1_.jpg");
    await storage().put(key, await shape("#0f0f0f"), "image/jpeg");
    const res = await ingestUploaded(sql, storage(), { incoming: key, originalFilename: "My Photo (1).jpg", mimeType: "image/jpeg" });
    expect(res.status).toBe("created");
    expect(await storage().exists(key)).toBe(false);
  });

  it("rejects files that are not images", async () => {
    await expect(
      ingestBuffer(sql, storage(), { buffer: Buffer.from("not an image"), originalFilename: "n.jpg", mimeType: "image/jpeg" }),
    ).rejects.toThrow(/could not be read/);
    const [{ count }] = await sql`select count(*)::int from source_images where original_filename = 'n.jpg'`;
    expect(count).toBe(0);
  });

  it("recognizes HEIC files by their header", () => {
    const fake = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)]);
    expect(isHeic(fake)).toBe(true);
    expect(isHeic(Buffer.from("plain jpeg bytes"))).toBe(false);
  });

  it("renders crops from box coordinates and re-renders when the box changes", async () => {
    const res = await ingestBuffer(sql, storage(), { buffer: await shape("#ffffff", 1000, 1000), originalFilename: "c.jpg", mimeType: "image/jpeg" });
    const [img] = await sql<{ display_path: string; width: number; height: number }[]>`select * from source_images where id = ${res.imageId}`;
    const a = await renderCrop(storage(), img, "r1", { x: 0.1, y: 0.1, w: 0.5, h: 0.25 }, 800);
    const ma = await sharp(a).metadata();
    expect([ma.width, ma.height]).toEqual([500, 250]);
    const b = await renderCrop(storage(), img, "r1", { x: 0.1, y: 0.1, w: 0.25, h: 0.5 }, 800);
    const mb = await sharp(b).metadata();
    expect([mb.width, mb.height]).toEqual([250, 500]);
  });
});
