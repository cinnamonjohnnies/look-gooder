import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getAuditSummary, listSourceImages } from "@/lib/queries";
import { AUDIT, CLASSIFICATION, sourceImageUrl, type AuditStatus, type Classification, classificationOf } from "@/lib/domain";
import { AuditBadge } from "@/components/badge";
import { Uploader } from "@/components/uploader";

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "not_started", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "unresolved", label: "Unresolved" },
  { key: "audited", label: "Audited" },
];

function Stat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 font-display text-4xl leading-none ${tone}`}>{value}</p>
    </div>
  );
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAuth();
  const { status } = await searchParams;
  const valid = status && status in AUDIT ? status : undefined;
  const [summary, images] = await Promise.all([getAuditSummary(), listSourceImages(valid)]);
  const { images: im, items, regions } = summary;
  const awaiting = items.candidates + items.needs_review;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Import & audit</p>
          <h1 className="font-display mt-1 text-5xl">Every photo, accounted for</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/import/checklist" className="btn-ghost">Expected-items checklist</Link>
          <a href="/api/export" className="btn-ghost">Download backup</a>
        </div>
      </div>

      <div
        className={`rounded-2xl px-5 py-4 text-sm ${summary.complete ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : "bg-accent-soft text-ink ring-1 ring-accent/20"}`}
        data-testid="audit-banner"
      >
        {im.total === 0 ? (
          <>No photos imported yet. The audit is <strong>not started</strong>.</>
        ) : summary.complete ? (
          <><strong>Audit complete.</strong> All {im.total} photos are audited and every item has been reviewed.</>
        ) : (
          <>
            <strong>Audit not complete.</strong> {im.total - im.audited} of {im.total} photos still need work
            {regions.pending > 0 && <>, {regions.pending} boxes need a decision</>}
            {regions.unresolved > 0 && <>, {regions.unresolved} boxes are unresolved</>}
            {awaiting > 0 && <>, {awaiting} items await review</>}.
          </>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Photos" value={im.total} />
        <Stat label="Audited" value={im.audited} tone="text-emerald-800" />
        <Stat label="Unrelated" value={im.unrelated} />
        <Stat label="Unresolved" value={im.unresolved} tone={im.unresolved ? "text-rose-700" : ""} />
        <Stat label="Items" value={items.total} />
        <Stat label="Photo verified" value={items.verified} tone="text-emerald-800" />
        <Stat label="Candidates" value={items.candidates} tone={items.candidates ? "text-amber-800" : ""} />
        <Stat label="Needs review" value={items.needs_review} tone={items.needs_review ? "text-rose-700" : ""} />
      </section>

      <Uploader />

      <section>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/import?status=${f.key}` : "/import"}
              className={`rounded-full px-3 py-1 text-sm ${(valid ?? "") === f.key ? "bg-ink text-paper" : "bg-card ring-1 ring-line hover:ring-ink/30"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        {images.length === 0 ? (
          <p className="text-sm text-muted">{im.total === 0 ? "Upload photos above to begin." : "No photos with this status."}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {images.map((img) => (
              <li key={img.id}>
                <Link href={`/import/${img.id}`} className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-stone-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sourceImageUrl(img.id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                    <div className="absolute left-2 top-2"><AuditBadge status={img.audit_status as AuditStatus} /></div>
                  </div>
                  <p className="mt-2 truncate text-sm">{img.original_filename}</p>
                  <p className="text-xs text-muted">
                    {classificationOf(img.classification as Classification).label} · {img.linked_count} linked
                    {img.open_count > 0 && <span className="text-amber-800"> · {img.open_count} open</span>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
