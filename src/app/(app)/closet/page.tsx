import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getCategories, getClosetFacets, listCloset } from "@/lib/queries";
import { itemTitle, type VerificationStatus } from "@/lib/domain";
import { VerificationBadge } from "@/components/badge";
import { ClosetFilters } from "@/components/closet-filters";

type SP = { q?: string; category?: string; status?: string; color?: string; brand?: string };

export default async function ClosetPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAuth();
  const sp = await searchParams;
  const [items, categories, facets] = await Promise.all([listCloset(sp), getCategories(), getClosetFacets()]);
  const label = Object.fromEntries(categories.map((c) => [c.key, c.label]));
  const groups = categories.map((c) => ({ ...c, items: items.filter((i) => i.category === c.key) })).filter((g) => g.items.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Closet</p>
          <h1 className="font-display mt-1 text-5xl">What you own</h1>
          <p className="mt-1 text-sm text-muted">{items.length} item{items.length === 1 ? "" : "s"} shown</p>
        </div>
        <Link href="/closet/new" className="btn-ghost">Add item without a photo</Link>
      </div>
      <Suspense>
        <ClosetFilters categories={categories} colors={facets.colors} brands={facets.brands} />
      </Suspense>

      {items.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="font-display text-3xl">Nothing here yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Items appear here once you box them on your own photos in Import & Audit. Nothing is pre-filled.
          </p>
          <Link href="/import" className="btn-primary mt-5">Go to Import & Audit</Link>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <h2 className="mb-3 flex items-baseline gap-2 border-b border-line pb-2">
              <span className="font-display text-2xl">{label[g.key]}</span>
              <span className="text-xs text-muted">{g.items.length}</span>
            </h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {g.items.map((i) => (
                <li key={i.id}>
                  <Link href={`/closet/${i.id}`} className="group block">
                    <div className="relative aspect-square overflow-hidden rounded-xl bg-white ring-1 ring-line">
                      {i.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.thumb} alt={itemTitle(i)} loading="lazy" className="h-full w-full object-contain p-2 transition group-hover:scale-[1.03]" />
                      ) : (
                        <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">No photo linked</div>
                      )}
                      <span className="absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-line">{i.display_id}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{itemTitle(i)}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted">{[i.primary_color, i.material].filter(Boolean).join(" · ")}</span>
                      <VerificationBadge status={i.verification_status as VerificationStatus} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
