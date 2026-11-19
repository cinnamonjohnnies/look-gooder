"use client";
import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-8 space-y-3">
      <label className="label" htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" className="field" autoFocus required />
      {state?.error && <p className="text-sm text-rose-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
