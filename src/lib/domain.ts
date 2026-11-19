// Shared labels and types (safe for client and server).

export type Category = { key: string; label: string; id_prefix: string };

export type VerificationStatus =
  | "candidate"
  | "photo_verified"
  | "description_confirmed"
  | "needs_review"
  | "archived";

export const VERIFICATION: Record<VerificationStatus, { label: string; tone: string }> = {
  candidate: { label: "Candidate", tone: "bg-amber-100 text-amber-900 ring-amber-300" },
  photo_verified: { label: "Photo verified", tone: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
  description_confirmed: { label: "Description confirmed", tone: "bg-sky-100 text-sky-900 ring-sky-300" },
  needs_review: { label: "Needs review", tone: "bg-rose-100 text-rose-900 ring-rose-300" },
  archived: { label: "Archived", tone: "bg-stone-200 text-stone-700 ring-stone-300" },
};

export type Classification = "unclassified" | "garment" | "multi_item" | "try_on" | "unrelated" | "needs_review";

export const CLASSIFICATION: Record<Classification, { label: string; hint: string }> = {
  unclassified: { label: "Not classified", hint: "Choose what this photo shows" },
  garment: { label: "Single item", hint: "One garment or one pair of shoes" },
  multi_item: { label: "Multiple items", hint: "A shelf, rack, pile, or flat lay" },
  try_on: { label: "Try-on", hint: "You wearing an outfit" },
  unrelated: { label: "Unrelated", hint: "Not a wardrobe photo; never enters the closet" },
  needs_review: { label: "Needs review", hint: "Unsure; flag it and come back" },
};

export type AuditStatus = "not_started" | "in_progress" | "unresolved" | "audited";

export const AUDIT: Record<AuditStatus, { label: string; tone: string }> = {
  not_started: { label: "Not started", tone: "bg-stone-100 text-stone-700 ring-stone-300" },
  in_progress: { label: "In progress", tone: "bg-amber-100 text-amber-900 ring-amber-300" },
  unresolved: { label: "Unresolved", tone: "bg-rose-100 text-rose-900 ring-rose-300" },
  audited: { label: "Audited", tone: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
};

export type RegionStatus = "pending" | "linked" | "rejected" | "unresolved";

export const REGION: Record<RegionStatus, { label: string; stroke: string; tone: string }> = {
  pending: { label: "Needs a decision", stroke: "#d97706", tone: "bg-amber-100 text-amber-900" },
  linked: { label: "Linked", stroke: "#059669", tone: "bg-emerald-100 text-emerald-900" },
  rejected: { label: "Not wardrobe", stroke: "#78716c", tone: "bg-stone-200 text-stone-700" },
  unresolved: { label: "Unresolved", stroke: "#e11d48", tone: "bg-rose-100 text-rose-900" },
};

export type Box = { x: number; y: number; w: number; h: number };

export type RegionView = Box & {
  id: string;
  status: RegionStatus;
  label: string;
  notes: string;
  version: string;
  item: null | { id: string; display_id: string; name: string; brand: string; category: string; verification_status: VerificationStatus };
};

export type ItemOption = {
  id: string;
  display_id: string;
  name: string;
  brand: string;
  category: string;
  primary_color: string;
  verification_status: VerificationStatus;
  thumb: string | null;
};

export function regionImageUrl(id: string, version: string, size = 480) {
  return `/api/images/region/${id}?size=${size}&v=${encodeURIComponent(version)}`;
}

export function sourceImageUrl(id: string, variant: "thumb" | "display" | "original") {
  return `/api/images/source/${id}/${variant}`;
}

export function itemTitle(i: { name: string; brand: string; primary_color?: string }) {
  const parts = [i.brand, i.name].filter(Boolean).join(" ");
  return parts || "Untitled item";
}

export const COLOR_SUGGESTIONS = [
  "black", "white", "cream", "ivory", "gray", "charcoal", "navy", "blue", "light blue", "olive",
  "green", "brown", "tan", "cognac", "burgundy", "red", "orange", "yellow", "pink", "purple",
];

export const SEASONS = ["spring", "summer", "fall", "winter"];
