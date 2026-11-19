"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

type Job = {
  id: string;
  name: string;
  state: "queued" | "uploading" | "processing" | "done" | "duplicate" | "error";
  message?: string;
  imageId?: string;
};

const CONCURRENCY = 3;

export function Uploader() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const start = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const batch = files.map((f, i) => ({ file: f, id: `${Date.now()}-${i}-${f.name}` }));
      setJobs((js) => [...batch.map((b) => ({ id: b.id, name: b.file.name, state: "queued" as const })), ...js]);

      const res = await fetch("/api/uploads/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: batch.map((b) => ({ name: b.file.name, type: b.file.type, size: b.file.size })) }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        const message = `Could not start upload${detail?.error ? `: ${detail.error}` : ""}`;
        batch.forEach((b) => patch(b.id, { state: "error", message }));
        return;
      }
      const { results } = (await res.json()) as {
        results: { name: string; key?: string; type?: string; error?: string; target?: { url: string; method: string; headers: Record<string, string> } }[];
      };

      let cursor = 0;
      const worker = async () => {
        while (cursor < batch.length) {
          const i = cursor++;
          const { file, id } = batch[i];
          const r = results[i];
          if (r.error || !r.target || !r.key) {
            patch(id, { state: "error", message: r.error ?? "Upload refused" });
            continue;
          }
          try {
            patch(id, { state: "uploading" });
            const put = await fetch(r.target.url, { method: r.target.method, headers: r.target.headers, body: file });
            if (!put.ok) throw new Error(`Upload failed (${put.status})`);
            patch(id, { state: "processing" });
            const done = await fetch("/api/uploads/complete", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ key: r.key, name: file.name, type: r.type }),
            });
            const body = await done.json();
            if (!done.ok) throw new Error(body.error ?? "Processing failed");
            if (body.status === "duplicate") {
              patch(id, { state: "duplicate", imageId: body.imageId, message: `Already uploaded as ${body.originalFilename}` });
            } else {
              patch(id, { state: "done", imageId: body.imageId });
            }
          } catch (e) {
            patch(id, { state: "error", message: e instanceof Error ? e.message : "Failed" });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));
      router.refresh();
    },
    [router],
  );

  const active = jobs.filter((j) => ["queued", "uploading", "processing"].includes(j.state)).length;
  const done = jobs.filter((j) => j.state === "done").length;

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); start(Array.from(e.dataTransfer.files)); }}
        onClick={() => input.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          over ? "border-ink bg-white" : "border-line bg-card hover:border-ink/40"
        }`}
      >
        <p className="font-display text-3xl">Add wardrobe photos</p>
        <p className="mt-2 text-sm text-muted">Drop photos here or tap to choose. JPG, PNG, WebP or HEIC. Originals are kept untouched.</p>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => { start(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
      </div>
      {jobs.length > 0 && (
        <div className="mt-3 card divide-y divide-line text-sm">
          <div className="flex items-center justify-between px-4 py-2 text-xs text-muted">
            <span>{active > 0 ? `${active} in progress` : "Uploads finished"} · {done} new</span>
            {active === 0 && <button className="hover:text-ink" onClick={() => setJobs([])}>Clear</button>}
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="truncate">{j.name}</span>
                <span className={`shrink-0 text-xs ${j.state === "error" ? "text-rose-700" : j.state === "duplicate" ? "text-amber-800" : "text-muted"}`}>
                  {j.state === "duplicate" && j.imageId ? (
                    <Link className="underline" href={`/import/${j.imageId}`}>{j.message}</Link>
                  ) : j.state === "done" && j.imageId ? (
                    <Link className="underline" href={`/import/${j.imageId}`}>Ready to review</Link>
                  ) : (
                    j.message ?? { queued: "Waiting", uploading: "Uploading…", processing: "Processing…" }[j.state as "queued"]
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
