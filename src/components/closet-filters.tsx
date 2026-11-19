"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { VERIFICATION, type Category, type VerificationStatus } from "@/lib/domain";

export function ClosetFilters({ categories, colors, brands }: { categories: Category[]; colors: string[]; brands: string[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.replace(`${path}?${p.toString()}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update("q", q);
    }, 250);
    return () => clearTimeout(t);
  });

  const sel = (key: string, label: string, opts: [string, string][]) => (
    <select className="field w-auto" aria-label={label} value={params.get(key) ?? ""} onChange={(e) => update(key, e.target.value)}>
      <option value="">{label}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <div className="flex flex-wrap gap-2">
      <input className="field max-w-xs" placeholder="Search ID, name, brand, material…" value={q} onChange={(e) => setQ(e.target.value)} />
      {sel("category", "All categories", categories.map((c) => [c.key, c.label]))}
      {sel("status", "Active items", (Object.keys(VERIFICATION) as VerificationStatus[]).map((s) => [s, VERIFICATION[s].label]))}
      {sel("color", "Any color", colors.map((c) => [c, c]))}
      {sel("brand", "Any brand", brands.map((b) => [b, b]))}
    </div>
  );
}
