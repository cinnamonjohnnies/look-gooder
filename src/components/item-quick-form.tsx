"use client";
import { useState } from "react";
import { COLOR_SUGGESTIONS, type Category } from "@/lib/domain";
import type { ItemFields } from "@/app/actions";

export function ItemQuickForm(props: {
  categories: Category[];
  pending: boolean;
  onSubmit: (fields: ItemFields, verify: boolean) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({ category: "", name: "", brand: "", primary_color: "", subcategory: "", material: "", description: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const ready = f.category !== "";

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const verify = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "verify";
        if (ready) props.onSubmit(f, verify);
      }}
    >
      <div>
        <label className="label" htmlFor="qf-category">Category</label>
        <select id="qf-category" className="field" value={f.category} onChange={set("category")} required autoFocus>
          <option value="">Choose…</option>
          {props.categories.map((c) => (
            <option key={c.key} value={c.key}>{c.label} ({c.id_prefix})</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="qf-name">Name</label>
          <input id="qf-name" className="field" placeholder="Waffle long-sleeve" value={f.name} onChange={set("name")} />
        </div>
        <div>
          <label className="label" htmlFor="qf-brand">Brand</label>
          <input id="qf-brand" className="field" placeholder="Unknown" value={f.brand} onChange={set("brand")} />
        </div>
        <div>
          <label className="label" htmlFor="qf-color">Main color</label>
          <input id="qf-color" className="field" list="color-suggestions" value={f.primary_color} onChange={set("primary_color")} />
        </div>
        <div>
          <label className="label" htmlFor="qf-sub">Type</label>
          <input id="qf-sub" className="field" placeholder="e.g. Henley, Chelsea boot" value={f.subcategory} onChange={set("subcategory")} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="qf-material">Material / weight</label>
        <input id="qf-material" className="field" placeholder="e.g. thicker cotton waffle" value={f.material} onChange={set("material")} />
      </div>
      <datalist id="color-suggestions">{COLOR_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" value="verify" className="btn-primary btn-sm" disabled={!ready || props.pending}>
          Create & verify from photo
        </button>
        <button type="submit" value="candidate" className="btn-ghost btn-sm" disabled={!ready || props.pending}>
          Create as candidate
        </button>
        <button type="button" className="btn-sm text-muted hover:text-ink" onClick={props.onCancel}>Cancel</button>
      </div>
      <p className="text-xs text-muted">Verify only if you are sure this exact item is yours. You can fill in more details later.</p>
    </form>
  );
}
