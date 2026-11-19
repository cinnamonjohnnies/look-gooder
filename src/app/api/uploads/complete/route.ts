import { NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/api";
import { sql } from "@/lib/db";
import { ingestUploaded } from "@/lib/ingest";
import { storage } from "@/lib/storage";

export const maxDuration = 60;

const Body = z.object({
  key: z.string().regex(/^incoming\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/),
  name: z.string().min(1).max(255),
  type: z.string().max(100),
});

export async function POST(req: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  try {
    const result = await ingestUploaded(sql, storage(), {
      incoming: parsed.data.key,
      originalFilename: parsed.data.name,
      mimeType: parsed.data.type,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "processing failed" }, { status: 422 });
  }
}
