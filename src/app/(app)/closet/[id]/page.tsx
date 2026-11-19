import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getCategories, getDuplicateSuggestions, getItem, listItemOptions } from "@/lib/queries";
import { CLASSIFICATION, VERIFICATION, itemTitle, regionImageUrl, type Classification, type VerificationStatus } from "@/lib/domain";
import { VerificationBadge } from "@/components/badge";
import { ItemEditForm } from "@/components/item-edit-form";
import { ItemActions, MakePrimary } from "@/components/item-actions";

const FIELD_LABELS: Record<string, string> = {
  verification_status: "status", primary_region_id: "main photo", wardrobe_item_id: "linked item",
  primary_color: "main color", secondary_colors: "other colors", warmth_level: "warmth", styling_notes: "styling notes",
  status_before_archive: "status before archive", deleted_at: "deleted", merged_into: "merged into",
  no_more_items_confirmed: "all items boxed", audit_status: "audit status",
};

function describe(e: { entity_type: string; action: string; old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null; note: string }) {
  const fmt = (v: unknown, k = "") => {
    if (v === null || v === "") return "empty";
    if (Array.isArray(v)) return v.join(", ") || "empty";
    if (k === "verification_status" || k === "status_before_archive") return VERIFICATION[v as VerificationStatus]?.label ?? String(v);
    if (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v)) return "set";
    if (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) return "yes";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  if (e.new_values && "primary_region_id" in e.new_values && Object.keys(e.new_values).length === 1)
    return e.new_values.primary_region_id ? "Main photo changed" : "Main photo removed";
  if (e.entity_type === "wardrobe_items" && e.action === "insert") return "Item created";
  if (e.entity_type === "regions") {
    if (e.action === "insert") return "Photo box drawn";
    if (e.action === "delete") return "Photo box deleted";
    const nv = e.new_values ?? {};
    if ("x" in nv || "y" in nv || "w" in nv || "h" in nv) return "Crop adjusted";
    if (nv.status === "linked") return "Photo linked to this item";
    if ("status" in nv) return `Photo box set to ${fmt(nv.status)}`;
  }
  const keys = Object.keys(e.new_values ?? {});
  return keys
    .map((k) => `${FIELD_LABELS[k] ?? k.replace(/_/g, " ")}: ${fmt(e.old_values?.[k], k)} → ${fmt(e.new_values?.[k], k)}`)
    .join("; ") + (e.note ? ` (${e.note})` : "");
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getItem(id);
  if (!data) notFound();
  const { item, photos, history } = data;
  const [categories, options, dupes] = await Promise.all([getCategories(), listItemOptions(), getDuplicateSuggestions(id)]);
  const primary = photos.find((p) => p.id === item.primary_region_id) ?? photos[0];
  const deleted = Boolean(item.deleted_at);

  return (
    <div className="space-y-8">
      <Link href="/closet" className="text-sm text-muted hover:text-ink">← Closet</Link>
      {deleted && (
        <div className="rounded-xl bg-stone-200 px-4 py-3 text-sm">
          {item.merged_into ? (
            <>This item was merged into <Link className="underline" href={`/closet/${item.merged_into}`}>{item.merged_into_display_id}</Link>. Its ID is retired.</>
          ) : (
            <>This item was deleted. Its ID {item.display_id} is retired and will never be reused.</>
          )}
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <div className="aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            {primary ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={regionImageUrl(primary.id, primary.version, 960)} alt={itemTitle(item)} className="h-full w-full object-contain p-4" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">No photo linked yet</div>
            )}
          </div>
          {photos.length > 0 && (
            <div>
              <p className="label">From your photos ({photos.length})</p>
              <ul className="grid grid-cols-3 gap-3">
                {photos.map((p) => (
                  <li key={p.id} className="space-y-1">
                    <Link href={`/import/${p.source_image_id}`} className="block aspect-square overflow-hidden rounded-lg bg-white ring-1 ring-line hover:ring-ink/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={regionImageUrl(p.id, p.version, 240)} alt="" className="h-full w-full object-contain p-1" />
                    </Link>
                    <p className="truncate text-[11px] text-muted">{p.original_filename} · {CLASSIFICATION[p.classification as Classification].label}</p>
                    {p.id !== primary?.id ? <MakePrimary itemId={item.id} regionId={p.id} /> : <p className="text-[11px] font-medium">Main photo</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <p className="font-mono text-sm">{item.display_id}</p>
            <h1 className="font-display mt-1 text-5xl leading-tight">{itemTitle(item)}</h1>
            <div className="mt-3"><VerificationBadge status={item.verification_status as VerificationStatus} /></div>
          </div>
          <ItemActions id={item.id} displayId={item.display_id} status={item.verification_status} photoCount={photos.length}
            deleted={deleted} items={options} categories={categories} />
          {dupes.length > 0 && !deleted && (
            <div className="card p-4">
              <p className="label">Possible duplicates to check</p>
              <p className="mb-3 text-xs text-muted">Same category and similar details. Nothing is merged unless you choose to.</p>
              <ul className="flex flex-wrap gap-3">
                {dupes.map((d) => (
                  <li key={d.id}>
                    <Link href={`/closet/${d.id}`} className="flex items-center gap-2 rounded-lg p-1 pr-3 ring-1 ring-line hover:ring-ink/40">
                      {d.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.thumb} alt="" className="h-10 w-10 rounded bg-stone-200 object-cover" />
                      ) : <span className="h-10 w-10 rounded bg-stone-200" />}
                      <span className="text-sm"><span className="font-mono text-xs">{d.display_id}</span> {itemTitle(d)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!deleted && (
            <div className="card p-5">
              <ItemEditForm itemId={item.id} initial={item} categories={categories} />
            </div>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-display text-2xl">History</h2>
        <ol className="card divide-y divide-line text-sm">
          {history.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:gap-4">
              <time className="shrink-0 text-xs text-muted sm:w-44">{new Date(e.occurred_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</time>
              <span>{describe(e as never)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
