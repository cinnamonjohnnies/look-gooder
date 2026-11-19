import "server-only";
import { timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signToken, verifyToken } from "./tokens";

export const SESSION_COOKIE = "lg_session";

export function passwordMatches(input: string) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("APP_PASSWORD is not set");
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function startSession() {
  const token = await signToken({ t: "session" }, "30d");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function isAuthed() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const p = await verifyToken<{ t: string }>(token);
  return p?.t === "session";
}

/** Call at the top of every page, server action, and route handler. */
export async function requireAuth() {
  if (!(await isAuthed())) redirect("/login");
}

export async function assertAuthed() {
  if (!(await isAuthed())) throw new Error("not signed in");
}
