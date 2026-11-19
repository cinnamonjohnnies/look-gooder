import { AUDIT, VERIFICATION, type AuditStatus, type VerificationStatus, verificationOf, auditOf } from "@/lib/domain";

export function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}>
      {children}
    </span>
  );
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const v = verificationOf(status);
  return <Pill tone={v.tone}>{v.label}</Pill>;
}

export function AuditBadge({ status }: { status: AuditStatus }) {
  const v = auditOf(status);
  return <Pill tone={v.tone}>{v.label}</Pill>;
}
