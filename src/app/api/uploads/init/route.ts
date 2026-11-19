import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/api";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, incomingKey } from "@/lib/ingest";
import { storage } from "@/lib/storage";

const Body = z.object({
  files: z
    .array(z.object({ name: z.string().min(1).max(255), type: z.string().max(100), size: z.number().int().positive() }))
    .min(1)
    .max(200),
});

function normalizeType(name: string, type: string) {
  if (type) return type.toLowerCase();
  const n = name.toLowerCase();
  if (n.endsWith(".heic") || n.endsWith(".heif")) return "image/heic";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function POST(req: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const results = await Promise.all(
    parsed.data.files.map(async (f) => {
      const type = normalizeType(f.name, f.type);
      if (!ACCEPTED_TYPES.includes(type)) return { name: f.name, error: "Unsupported file type" };
      if (f.size > MAX_UPLOAD_BYTES) return { name: f.name, error: "File is larger than 50 MB" };
      const key = incomingKey(randomUUID(), f.name);
      const target = await storage().createUploadTarget(key, type);
      return { name: f.name, key, type, target };
    }),
  );
  return NextResponse.json({ results });
}
