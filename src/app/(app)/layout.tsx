import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { logout } from "@/app/actions";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
          <div className="flex items-center justify-between">
            <Link href="/closet" className="font-display text-2xl leading-none">Look Gooder</Link>
            <form action={logout} className="sm:hidden"><button className="text-xs text-muted">Sign out</button></form>
          </div>
          <Nav />
          <form action={logout} className="ml-auto hidden sm:block"><button className="text-xs text-muted hover:text-ink">Sign out</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
