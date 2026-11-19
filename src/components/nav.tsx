"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/closet", label: "Closet" },
  { href: "/import", label: "Import & Audit" },
  { href: "/looks", label: "My Looks", soon: true },
  { href: "/stylist", label: "Stylist", soon: true },
  { href: "/profile", label: "Style Profile", soon: true },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto">
      {SECTIONS.map((s) => {
        const active = path === s.href || path.startsWith(s.href + "/");
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition ${
              active ? "bg-ink text-paper" : s.soon ? "text-muted/70 hover:text-ink" : "text-ink hover:bg-black/5"
            }`}
          >
            {s.label}
            {s.soon && <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-60">soon</span>}
          </Link>
        );
      })}
    </nav>
  );
}
