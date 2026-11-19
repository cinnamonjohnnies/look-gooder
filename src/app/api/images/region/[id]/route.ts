import { NextResponse } from "next/server";
import { imageResponse, unauthorized } from "@/lib/api";
import { sql } from "@/lib/db";
import { storage } from "@/lib/storage";
import { renderCrop } from "@/lib/ingest";

const SIZES = [240, 480, 960];

export async function GET(req: Request, ctx: RouteContext<"/api/images/region/[id]">) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const requested = Number(new URL(req.url).searchParams.get("size") ?? 480);
  const size = SIZES.find((s) => s >= requested) ?? 960;
  const [row] = await sql`select r.x, r.y, r.w, r.h, s.display_path, s.width, s.height
    from regions r join source_images s on s.id = r.source_image_id where r.id = ${id}`;
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await renderCrop(storage(), row as never, id, { x: row.x, y: row.y, w: row.w, h: row.h }, size);
  return imageResponse(body, "image/webp");
}
