// Full portable backup: every table as JSON plus every original photo.
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { unauthorized } from "@/lib/api";
import { sql } from "@/lib/db";
import { storage } from "@/lib/storage";

export const maxDuration = 300;

const TABLES = [
  "categories", "id_sequences", "source_images", "wardrobe_items", "regions",
  "expected_items", "expected_item_links", "audit_events",
];

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;

  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await sql.unsafe(`select * from ${t} order by 1`);

  const archive = new ZipArchive({ zlib: { level: 1 } });
  archive.append(
    JSON.stringify({ exported_at: new Date().toISOString(), schema: "look-gooder/1", data }, null, 2),
    { name: "look-gooder.json" },
  );
  (async () => {
    try {
      for (const img of data.source_images as { original_path: string }[]) {
        archive.append(await storage().get(img.original_path), { name: img.original_path });
      }
      await archive.finalize();
    } catch (e) {
      archive.abort();
      console.error("export failed", e);
    }
  })();

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="look-gooder-backup-${stamp}.zip"`,
    },
  });
}
