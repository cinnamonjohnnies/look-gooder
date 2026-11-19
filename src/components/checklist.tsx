"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { addExpected, deleteExpected, linkExpected, loadStarterChecklist, unlinkExpected, updateExpectedCount } from "@/app/actions";
import { itemTitle, type Category, type ItemOption, type VerificationStatus } from "@/lib/domain";
import { VerificationBadge } from "./badge";
import { ItemPicker } from "./item-picker";

type Entry = {
  id: string; category: string; category_label: string; description: string; expected_count: number; notes: string;
  items: { id: string; display_id: string; name: string; brand: string; verification_status: VerificationStatus }[];
};

export function Checklist({ entries, categories, items }: { entries: Entry[]; categories: Category[]; items: ItemOption[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [draft, setDraft] = useState({ category: "", description: "", count: "1" });
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => { setErr(null); const r = await fn(); if (!r.ok) setErr(r.error ?? "Failed"); else after?.(); });

  const expected = entries.reduce((n, e) => n + e.expected_count, 0);
  const found = entries.reduce((n, e) => n + Math.min(e.items.length, e.expected_count), 0);

  if (entries.length === 0) {
    return (
      <div className="card px-6 py-10 text-center">
        <p className="font-display text-3xl">No expectations yet</p>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
          Load the starter list from your project brief (blazers, the cream waffle shirts, about 20 Adidas pairs, and so on).
          It never adds anything to your closet. It only shows what you have and have not found yet.
        </p>
        <button className="btn-primary mt-5" disabled={pending} onClick={() => act(loadStarterChecklist)}>Load starter checklist</button>
        {err && <p className="mt-3 text-sm text-rose-700">{err}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-6 px-5 py-4">
        <div><p className="eyebrow">Found</p><p className="font-display text-4xl leading-none">{found} <span className="text-xl text-muted">of ~{expected}</span></p></div>
        <p className="max-w-xl text-sm text-muted">Link items as you audit. Gaps here usually mean a photo has not been uploaded or boxed yet. Counts are your estimates, so edit them when you know better.</p>
      </div>
      {err && <p className="text-sm text-rose-700">{err}</p>}
      <ul className="card divide-y divide-line">
        {entries.map((e) => {
          const short = e.items.length < e.expected_count;
          return (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${short ? "bg-amber-500" : "bg-emerald-600"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{e.description}</p>
                  <p className="text-xs text-muted">{e.category_label}{e.notes ? ` · ${e.notes}` : ""}</p>
                </div>
                <span className="text-sm tabular-nums">{e.items.length} /</span>
                <input type="number" min={1} defaultValue={e.expected_count} aria-label="Expected count" className="field w-16 py-1"
                  onBlur={(ev) => Number(ev.target.value) !== e.expected_count && act(() => updateExpectedCount(e.id, Number(ev.target.value)))} />
                <button className="btn-ghost btn-sm" onClick={() => setPicking(picking === e.id ? null : e.id)}>Link item</button>
                <button className="text-xs text-muted hover:text-rose-700" onClick={() => act(() => deleteExpected(e.id))}>Remove</button>
              </div>
              {e.items.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2 pl-6">
                  {e.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 rounded-full bg-paper py-1 pl-3 pr-1 text-xs ring-1 ring-line">
                      <Link href={`/closet/${i.id}`} className="hover:underline"><span className="font-mono">{i.display_id}</span> {itemTitle(i)}</Link>
                      <VerificationBadge status={i.verification_status} />
                      <button aria-label="Unlink" className="px-1 text-muted hover:text-ink" onClick={() => act(() => unlinkExpected(e.id, i.id))}>×</button>
                    </li>
                  ))}
                </ul>
              )}
              {picking === e.id && (
                <div className="mt-3 pl-6">
                  <ItemPicker items={[...items].sort((a, b) => Number(b.category === e.category) - Number(a.category === e.category))} categories={categories}
                    onCancel={() => setPicking(null)}
                    onPick={(id) => act(() => linkExpected(e.id, id))} title={`Link an item to “${e.description}”`} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <form className="card flex flex-wrap items-end gap-2 p-4" onSubmit={(ev) => {
        ev.preventDefault();
        act(() => addExpected(draft.category, draft.description, Number(draft.count)), () => setDraft({ category: "", description: "", count: "1" }));
      }}>
        <div><label className="label">Category</label>
          <select className="field" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} required>
            <option value="">Choose…</option>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select></div>
        <div className="min-w-60 flex-1"><label className="label">Expected item</label>
          <input className="field" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} required /></div>
        <div><label className="label">Count</label>
          <input type="number" min={1} className="field w-20" value={draft.count} onChange={(e) => setDraft({ ...draft, count: e.target.value })} /></div>
        <button className="btn-ghost" disabled={pending}>Add</button>
      </form>
    </div>
  );
}
