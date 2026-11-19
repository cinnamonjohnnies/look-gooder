"use client";
import { useMemo, useState } from "react";
import { itemTitle, type Category, type ItemOption } from "@/lib/domain";
import { VerificationBadge } from "./badge";

export function ItemPicker(props: {
  items: ItemOption[];
  categories: Category[];
  exclude?: string;
  onPick: (id: string) => void;
  onCancel: () => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return props.items.filter(
      (i) =>
        i.id !== props.exclude &&
        (!cat || i.category === cat) &&
        (!needle || `${i.display_id} ${i.name} ${i.brand} ${i.primary_color}`.toLowerCase().includes(needle)),
    );
  }, [props.items, props.exclude, q, cat]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{props.title ?? "Which item is this?"}</p>
      <div className="flex gap-2">
        <input className="field" placeholder="Search ID, name, brand, color" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <select className="field w-36" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All</option>
          {props.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {list.length === 0 && <li className="py-2 text-sm text-muted">No matching items.</li>}
        {list.map((i) => (
          <li key={i.id}>
            <button onClick={() => props.onPick(i.id)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-paper">
              {i.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.thumb} alt="" className="h-11 w-11 rounded-md bg-stone-200 object-cover" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-stone-200 text-[10px] text-muted">No photo</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm"><span className="font-mono text-xs">{i.display_id}</span> {itemTitle(i)}</span>
                <span className="text-xs text-muted">{i.primary_color}</span>
              </span>
              <VerificationBadge status={i.verification_status} />
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-sm text-muted hover:text-ink" onClick={props.onCancel}>Cancel</button>
    </div>
  );
}
