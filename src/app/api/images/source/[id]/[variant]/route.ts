import { NextResponse } from "next/server";
import { imageResponse, unauthorized } from "@/lib/api";
import { sql } from "@/lib/db";
import { storage } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/images/source/[id]/[variant]">) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { id, variant } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [img] = await sql`select display_path, thumb_path, original_path, mime_type, original_filename
    from source_images where id = ${id}`;
  if (!img) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (variant === "thumb") return imageResponse(await storage().get(img.thumb_path), "image/webp");
  if (variant === "display") return imageResponse(await storage().get(img.display_path), "image/jpeg");
  if (variant === "original") {
    const res = imageResponse(await storage().get(img.original_path), img.mime_type);
    res.headers.set("content-disposition", `attachment; filename="${img.original_filename.replace(/"/g, "")}"`);
    return res;
  }
  return NextResponse.json({ error: "unknown variant" }, { status: 404 });
}
