import "server-only";
import { NextResponse } from "next/server";
import { isAuthed } from "./auth";

export async function unauthorized() {
  if (await isAuthed()) return null;
  return NextResponse.json({ error: "not signed in" }, { status: 401 });
}

export function imageResponse(body: Buffer, contentType: string, immutable = true) {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": contentType,
      "cache-control": immutable ? "private, max-age=31536000, immutable" : "private, no-cache",
    },
  });
}
