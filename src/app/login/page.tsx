import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await isAuthed()) redirect("/import");
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="eyebrow">Personal wardrobe</p>
        <h1 className="font-display mt-2 text-6xl">Look Gooder</h1>
        <p className="mt-3 text-sm text-muted">Everything you own, verified from your own photos.</p>
        <LoginForm />
      </div>
    </main>
  );
}
