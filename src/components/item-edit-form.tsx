"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createItemManually, updateItem, type ItemFields } from "@/app/actions";
import { COLOR_SUGGESTIONS, SEASONS, type Category } from "@/lib/domain";

type Initial = Partial<Record<keyof ItemFields, unknown>>;

export function ItemEditForm({ itemId, initial, categories }: { itemId?: string; initial?: Initial; categories: Category[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const s = (k: keyof ItemFields) => (initial?.[k] as string) ?? "";
  const [f, setF] = useState({
    category: s("category"), subcategory: s("subcategory"), brand: s("brand"), name: s("name"),
    primary_color: s("primary_color"), secondary_colors: ((initial?.secondary_colors as string[]) ?? []).join(", "),
    material: s("material"), texture: s("texture"), fit: s("fit"), silhouette: s("silhouette"),
    formality: initial?.formality ? String(initial.formality) : "", warmth_level: initial?.warmth_level ? String(initial.warmth_level) : "",
    season: (initial?.season as string[]) ?? [], description: s("description"), styling_notes: s("styling_notes"),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setMsg(null);
    setF((x) => ({ ...x, [k]: e.target.value }));
  };

  const submit = () =>
    start(async () => {
      const fields: ItemFields = {
        ...f,
        secondary_colors: f.secondary_colors.split(",").map((c) => c.trim()).filter(Boolean),
        formality: f.formality ? Number(f.formality) : null,
        warmth_level: f.warmth_level ? Number(f.warmth_level) : null,
        season: f.season as ItemFields["season"],
      };
      const res = itemId ? await updateItem(itemId, fields) : await createItemManually(fields);
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      if (!itemId && res.data) router.push(`/closet/${res.data}`);
      else setMsg({ ok: true, text: "Saved. Change recorded in history." });
    });

  const text = (k: keyof typeof f, label: string, ph = "") => (
    <div>
      <label className="label" htmlFor={`f-${k}`}>{label}</label>
      <input id={`f-${k}`} className="field" placeholder={ph} value={f[k] as string} onChange={set(k)} list={k.includes("color") ? "edit-colors" : undefined} />
    </div>
  );
  const scale = (k: "formality" | "warmth_level", label: string, lo: string, hi: string) => (
    <div>
      <label className="label" htmlFor={`f-${k}`}>{label}</label>
      <select id={`f-${k}`} className="field" value={f[k]} onChange={set(k)}>
        <option value="">Not set</option>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 1 ? ` (${lo})` : n === 5 ? ` (${hi})` : ""}</option>)}
      </select>
    </div>
  );

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="f-category">Category</label>
          <select id="f-category" className="field" value={f.category} onChange={set("category")} required>
            <option value="">Choose…</option>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {itemId && <p className="mt-1 text-[11px] text-muted">Changing category keeps the existing ID.</p>}
        </div>
        {text("subcategory", "Type", "e.g. Chelsea boot, Henley")}
        {text("name", "Name")}
        {text("brand", "Brand")}
        {text("primary_color", "Main color")}
        {text("secondary_colors", "Other colors", "comma separated")}
        {text("material", "Material / weight")}
        {text("texture", "Texture", "e.g. waffle, suede")}
        {text("fit", "Fit", "e.g. skinny, slim")}
        {text("silhouette", "Silhouette")}
        {scale("formality", "Formality", "very casual", "formal")}
        {scale("warmth_level", "Warmth", "lightest", "warmest")}
      </div>
      <div>
        <p className="label">Seasons</p>
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((x) => (
            <label key={x} className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-sm ring-1 ring-line">
              <input type="checkbox" className="accent-black" checked={f.season.includes(x)}
                onChange={(e) => setF((v) => ({ ...v, season: e.target.checked ? [...v.season, x] : v.season.filter((y) => y !== x) }))} />
              {x}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="f-description">Description</label>
        <textarea id="f-description" className="field min-h-20" value={f.description} onChange={set("description")} />
      </div>
      <div>
        <label className="label" htmlFor="f-styling">Styling notes</label>
        <textarea id="f-styling" className="field min-h-16" value={f.styling_notes} onChange={set("styling_notes")} />
      </div>
      <datalist id="edit-colors">{COLOR_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending || !f.category}>{pending ? "Saving…" : itemId ? "Save changes" : "Create item"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-800" : "text-rose-700"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
