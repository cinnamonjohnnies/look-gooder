// Development-only upload receiver; production uploads go straight to Supabase.
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/tokens";
import { storage } from "@/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/ingest";

export async function PUT(req: Request) {
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const token = new URL(req.url).searchParams.get("token") ?? undefined;
  const p = await verifyToken<{ k: string; t: string }>(token);
  if (!p || p.t !== "upload") return NextResponse.json({ error: "invalid upload token" }, { status: 403 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  await storage().put(p.k, body, req.headers.get("content-type") ?? "application/octet-stream");
  return NextResponse.json({ ok: true });
}
