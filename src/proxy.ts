import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/tokens";

// Optimistic redirect only; every page, action and API route re-checks the session.
export async function proxy(req: NextRequest) {
  const token = req.cookies.get("lg_session")?.value;
  const ok = (await verifyToken<{ t: string }>(token))?.t === "session";
  if (!ok) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api|_next|favicon.ico).*)"],
};
